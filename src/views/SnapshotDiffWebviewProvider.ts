import * as vscode from 'vscode';
import * as path from 'path';

interface DiffFile {
    relativePath: string;
    originalContent: string;
    modifiedContent: string;
}

export class SnapshotDiffWebviewProvider {
    private _panel?: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _snapshotName: string = '';
    private _timestamp: number = 0;

    constructor(
        extensionUri: vscode.Uri,
        private readonly onRestoreFile: (filePath: string) => Promise<void>
    ) {
        this._extensionUri = extensionUri;
    }

    public get snapshotName(): string {
        return this._snapshotName;
    }

    public get timestamp(): number {
        return this._timestamp;
    }

    public async showDiff(files: DiffFile[], snapshotName: string, timestamp: number) {
        this._snapshotName = snapshotName;
        this._timestamp = timestamp;

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
            });

            // Handle messages from the webview
            this._panel.webview.onDidReceiveMessage(async message => {
                switch (message.command) {
                    case 'restoreFile':
                        try {
                            await this.onRestoreFile(message.filePath);
                            // Notify webview that file was restored
                            await this._panel?.webview.postMessage({
                                type: 'fileRestored',
                                filePath: message.filePath
                            });
                        } catch (error) {
                            vscode.window.showErrorMessage(`Failed to restore file: ${message.filePath}`);
                        }
                        break;
                }
            });

            this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
        }

        // Convert the files to a format suitable for the webview
        const diffData = files.map(file => ({
            path: file.relativePath,
            original: file.originalContent,
            modified: file.modifiedContent
        }));

        // Send the diff data to the webview
        await this._panel.webview.postMessage({
            type: 'showDiff',
            snapshotName,
            files: diffData
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'diffView.js')
        );

        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'diffView.css')
        );

        const codiconsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css')
        );

        const nonce = getNonce();

        return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
        <link href="${styleUri}" rel="stylesheet">
        <link href="${codiconsUri}" rel="stylesheet">
        <title>Snapshot Diff</title>
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
                <div class="controls-right">
                    <button class="global-control restore-all" title="Restore All Files">
                        <span class="codicon codicon-debug-restart"></span>
                        <span>Restore All</span>
                    </button>
                </div>
            </div>
            <div id="files-list" class="files-list"></div>
            
            <template id="file-template">
                <div class="file-group">
                    <div class="file-header" title="Click anywhere to expand/collapse">
                        <div class="file-path">
                            <span class="codicon codicon-file"></span>
                            <span class="path"></span>
                        </div>
                        <div class="actions">
                            <div class="restored-indicator">
                                <span class="codicon codicon-check"></span>
                                <span>Restored</span>
                            </div>
                            <button class="restore-button" title="Restore this file">
                                <span class="codicon codicon-debug-restart"></span>
                                <span>Restore</span>
                            </button>
                            <div class="collapse-indicator" data-tooltip="Click to collapse">
                                <span class="codicon codicon-chevron-down collapse-icon"></span>
                            </div>
                        </div>
                    </div>
                    <div class="diff-content expanded"></div>
                </div>
            </template>
        </div>
        <script nonce="${nonce}" src="${scriptUri}"></script>
    </body>
    </html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
} 