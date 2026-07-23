import * as vscode from 'vscode';
import { DiffFile } from '../types/interfaces';
import { NotificationManager } from '../utils/NotificationManager';
import { sortDiffFilesByPath } from '../utils/diffFileUtils';

interface ShowDiffMessage {
    type: 'showDiff';
    snapshotName: string;
    timestamp: number;
    files: Array<{
        path: string;
        original: string;
        modified: string;
        status: string;
    }>;
    diffViewStyle: string;
    enableTextWrapping: boolean;
    enableLineLevelDiff: boolean;
    enableCharacterLevelDiff: boolean;
    characterDiffHighlightColor: string;
}

export class SnapshotDiffWebviewProvider {
    private _panel?: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _snapshotName: string = '';
    private _timestamp: number = 0;
    private notificationManager: NotificationManager = NotificationManager.getInstance();
    private _configChangeListener: vscode.Disposable | undefined;
    private _webviewReady = false;
    private _pendingShowDiffMessage?: ShowDiffMessage;

    constructor(
        extensionUri: vscode.Uri,
        private readonly onRestoreFile: (filePath: string) => Promise<void>
    ) {
        this._extensionUri = extensionUri;

        // Add configuration change listener to detect changes to the character diff highlight color
        this._configChangeListener = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('localSnapshots.characterDiffHighlightColor') && this._panel) {
                const config = vscode.workspace.getConfiguration('localSnapshots');
                const characterDiffHighlightColor = config.get('characterDiffHighlightColor', '#FFD700');

                // Send the updated color to the webview
                this._panel.webview.postMessage({
                    type: 'updateHighlightColor',
                    color: characterDiffHighlightColor
                });
            }
        });
    }

    public get snapshotName(): string {
        return this._snapshotName;
    }

    public get timestamp(): number {
        return this._timestamp;
    }

    public isShowingSnapshot(snapshotName: string, timestamp: number): boolean {
        return this._panel !== undefined
            && this._snapshotName === snapshotName
            && this._timestamp === timestamp;
    }

    public reveal(): void {
        this._panel?.reveal(vscode.ViewColumn.One);
    }

    public async showDiff(files: DiffFile[], snapshotName: string, timestamp: number) {
        this._snapshotName = snapshotName;
        this._timestamp = timestamp;

        // Get user's diff view style and text wrapping preferences
        const config = vscode.workspace.getConfiguration('localSnapshots');
        const diffViewStyle = config.get('diffViewStyle', 'side-by-side');
        const enableTextWrapping = config.get('enableTextWrapping', false);
        const enableLineLevelDiff = config.get('enableLineLevelDiff', true);
        const enableCharacterLevelDiff = config.get('enableCharacterLevelDiff', true);

        // If we already have a panel, show it
        if (this._panel) {
            this._panel.reveal(vscode.ViewColumn.One);
        } else {
            // Otherwise, create a new panel
            this._panel = vscode.window.createWebviewPanel(
                'snapshotDiff',
                `Diff: ${snapshotName}`,
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    localResourceRoots: [this._extensionUri],
                    retainContextWhenHidden: true
                }
            );

            this._panel.onDidDispose(() => {
                this._panel = undefined;
                this._webviewReady = false;
                this._pendingShowDiffMessage = undefined;
            });

            // Handle messages from the webview
            this._panel.webview.onDidReceiveMessage(async message => {
                switch (message.command) {
                    case 'ready':
                        this._webviewReady = true;
                        if (this._pendingShowDiffMessage) {
                            await this._panel?.webview.postMessage(this._pendingShowDiffMessage);
                            this._pendingShowDiffMessage = undefined;
                        }
                        break;
                    case 'restoreFile':
                        try {
                            await this.onRestoreFile(message.filePath);
                            // Notify webview that file was restored
                            await this._panel?.webview.postMessage({
                                type: 'fileRestored',
                                filePath: message.filePath
                            });
                        } catch (error) {
                            await this.notificationManager.showErrorMessage(`Failed to restore file: ${message.filePath}`);
                        }
                        break;
                    case 'diffWithGit':
                        try {
                            await vscode.commands.executeCommand('local-snapshots.diffWithGit', message.snapshotName, message.timestamp, message.filePath);
                        } catch (error) {
                            await this.notificationManager.showErrorMessage(`Failed to open Git Diff: ${error}`);
                        }
                        break;
                    case 'toggleTextWrapping':
                        try {
                            // Update the user setting
                            await vscode.workspace.getConfiguration('localSnapshots').update(
                                'enableTextWrapping',
                                message.enabled,
                                vscode.ConfigurationTarget.Global
                            );
                        } catch (error) {
                            await this.notificationManager.showErrorMessage(`Failed to update text wrapping setting: ${error}`);
                        }
                        break;
                    case 'toggleLineLevelDiff':
                        try {
                            // Update the user setting
                            await vscode.workspace.getConfiguration('localSnapshots').update(
                                'enableLineLevelDiff',
                                message.enabled,
                                vscode.ConfigurationTarget.Global
                            );
                        } catch (error) {
                            await this.notificationManager.showErrorMessage(`Failed to update line-level diff setting: ${error}`);
                        }
                        break;
                    case 'updateCharacterDiffHighlightColor':
                        try {
                            // Update the user's color setting
                            await vscode.workspace.getConfiguration('localSnapshots').update(
                                'characterDiffHighlightColor',
                                message.color,
                                vscode.ConfigurationTarget.Global
                            );
                        } catch (error) {
                            await this.notificationManager.showErrorMessage(`Failed to update highlight color setting: ${error}`);
                        }
                        break;
                    case 'copyFilePath':
                        try {
                            await vscode.env.clipboard.writeText(message.filePath);
                        } catch (error) {
                            await this.notificationManager.showErrorMessage(`Failed to copy file path: ${error}`);
                        }
                        break;
                }
            });

            const initialCharacterDiffHighlightColor = config.get('characterDiffHighlightColor', '#FFD700');
            this._panel.webview.html = this._getHtmlForWebview(
                this._panel.webview,
                initialCharacterDiffHighlightColor
            );
            this._webviewReady = false;
        }

        const sortedFiles = sortDiffFilesByPath(files);

        // Convert the files to a format suitable for the webview
        const diffData = sortedFiles.map(file => ({
            path: file.relativePath,
            original: file.original || '',
            modified: file.modified || '',
            status: file.status
        }));


        // Make sure we're sending the character diff highlight color
        // This ensures the diff view always has the current color from settings
        const currentCharacterDiffHighlightColor = config.get('characterDiffHighlightColor', '#FFD700');

        // Send the diff data to the webview
        await this._postShowDiffMessage({
            type: 'showDiff',
            snapshotName,
            timestamp,
            files: diffData,
            diffViewStyle,
            enableTextWrapping,
            enableLineLevelDiff,
            enableCharacterLevelDiff,
            characterDiffHighlightColor: currentCharacterDiffHighlightColor
        });
    }

    private async _postShowDiffMessage(message: ShowDiffMessage): Promise<void> {
        if (!this._panel) {
            return;
        }

        if (this._webviewReady) {
            await this._panel.webview.postMessage(message);
            return;
        }

        this._pendingShowDiffMessage = message;
    }

    private _getHtmlForWebview(webview: vscode.Webview, characterDiffHighlightColor: string): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'diffView.js')
        );

        const colorPickerScriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'colorPicker.js')
        );

        const toggleUtilsScriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'diffViewToggleUtils.js')
        );

        const overviewRulerUtilsScriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'diffViewOverviewRulerUtils.js')
        );

        const highlightUtilsScriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'diffViewHighlightUtils.js')
        );

        const clipboardUtilsScriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'diffViewClipboardUtils.js')
        );

        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'diffView.css')
        );

        const codiconsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'codicons', 'codicon.css')
        );

        const codiconsFontUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'codicons', 'codicon.ttf')
        );

        // Get URIs for SVG icons
        const iconUris = {
            arrowUp: webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'icons', 'arrow-up.svg')),
            arrowDown: webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'icons', 'arrow-down.svg')),
            close: webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'icons', 'close.svg'))
        };

        const nonce = this.getNonce();

        return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; img-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
        <style>
            @font-face {
                font-family: "codicon";
                src: url("${codiconsFontUri}") format("truetype");
            }
        </style>
        <link href="${styleUri}" rel="stylesheet">
        <link href="${codiconsUri}" rel="stylesheet">
        <title>Snapshot Diff</title>
        <style nonce="${nonce}">
            #prev-match::before { -webkit-mask-image: url('${iconUris.arrowUp}'); mask-image: url('${iconUris.arrowUp}'); }
            #next-match::before { -webkit-mask-image: url('${iconUris.arrowDown}'); mask-image: url('${iconUris.arrowDown}'); }
            #clear-search::before { -webkit-mask-image: url('${iconUris.close}'); mask-image: url('${iconUris.close}'); }
        </style>
    </head>
    <body>
        <div id="diff-container">
            <div class="global-controls">
                <div class="controls-left">
                    <button class="global-control expand-all" title="Expand All Files">
                        <span class="codicon codicon-expand-all"></span>
                        <span>Expand All</span>
                    </button>
                    <button class="global-control collapse-all" title="Collapse All Files">
                        <span class="codicon codicon-collapse-all"></span>
                        <span>Collapse All</span>
                    </button>
                </div>
                <div class="search-container">
                    <div class="search-input-container">
                        <span class="codicon codicon-search"></span>
                        <input type="text" id="search-input" placeholder="Search in diff (Ctrl+F)" />
                        <span class="search-count" id="search-count"></span>
                    </div>
                    <div class="search-controls">
                        <button class="search-nav-button" id="prev-match" title="Previous match (Shift+Enter)"></button>
                        <button class="search-nav-button" id="next-match" title="Next match (Enter)"></button>
                        <button class="search-nav-button" id="clear-search" title="Clear search"></button>
                    </div>
                </div>
                <div class="controls-right action-group">
                    <button class="global-control restore-all" title="Restore All Files">
                        <span class="codicon codicon-debug-restart"></span>
                        <span>Restore<br>All</span>
                    </button>
                </div>
            </div>
            <div class="diff-view-content">
                <div id="files-list" class="files-list"></div>
                <div id="diff-overview-ruler" class="diff-overview-ruler"></div>
            </div>

            <template id="file-template">
                <div class="file-group">
                    <div class="file-header collapsed" title="Click anywhere to expand/collapse">
                        <div class="file-path">
                            <span class="codicon codicon-file"></span>
                            <span class="path"></span>
                        </div>
                        <div class="actions">
                            <div class="file-status"></div>
                            <div class="restored-indicator">
                                <span class="codicon codicon-check"></span>
                                <span>Restored</span>
                            </div>
                            <button class="restore-button" title="Restore this file">
                                <span class="codicon codicon-debug-restart"></span>
                                <span>Restore</span>
                            </button>
                            <button class="git-diff-button" title="Open in external Git Diff tool">
                                <span class="codicon codicon-git-compare"></span>
                                <span>Git Diff</span>
                            </button>
                            <div class="collapse-indicator" data-tooltip="Click to collapse">
                                <span class="codicon codicon-chevron-down collapse-icon"></span>
                            </div>
                        </div>
                    </div>
                    <div class="diff-content"></div>
                </div>
            </template>
        </div>
        <script nonce="${nonce}">
            window.__INITIAL_CHARACTER_DIFF_HIGHLIGHT_COLOR__ = ${JSON.stringify(characterDiffHighlightColor)};
        </script>
        <script nonce="${nonce}" src="${colorPickerScriptUri}"></script>
        <script nonce="${nonce}" src="${toggleUtilsScriptUri}"></script>
        <script nonce="${nonce}" src="${highlightUtilsScriptUri}"></script>
        <script nonce="${nonce}" src="${overviewRulerUtilsScriptUri}"></script>
        <script nonce="${nonce}" src="${clipboardUtilsScriptUri}"></script>
        <script nonce="${nonce}" src="${scriptUri}"></script>
    </body>
    </html>`;
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    /**
     * Dispose of the webview panel and clean up resources
     */
    public dispose() {
        if (this._panel) {
            this._panel.dispose();
            this._panel = undefined;
        }

        // Clean up the configuration change listener
        if (this._configChangeListener) {
            this._configChangeListener.dispose();
            this._configChangeListener = undefined;
        }
    }
}