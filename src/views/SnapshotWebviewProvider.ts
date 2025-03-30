import * as vscode from 'vscode';
import { Snapshot } from '../types/interfaces';

export class SnapshotWebviewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'local-snapshots-list';
	private _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _onTakeSnapshot: () => Promise<void>,
		private readonly _onRestoreSnapshot: (name: string, timestamp: number, selectedFiles?: string[]) => Promise<void>,
		private readonly _onDeleteSnapshot: (name: string, timestamp: number) => Promise<boolean>,
		private readonly _onRenameSnapshot: (name: string, timestamp: number) => Promise<void>,
		private readonly _getSnapshots: () => Promise<Snapshot[]>,
		private readonly _getSnapshotFiles: (name: string, timestamp: number) => Promise<string[]>,
		private readonly _showDiff: (name: string, timestamp: number) => Promise<void>,
		private readonly _showTree: (name: string, timestamp: number) => Promise<void>
	) {}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(async (data) => {
			switch (data.type) {
				case 'takeSnapshot':
					await this._onTakeSnapshot();
					break;
				case 'restoreSnapshot':
					const choice = await vscode.window.showQuickPick(
						[
							{ label: 'Restore All Files', value: 'all' },
							{ label: 'Select Files to Restore', value: 'select' }
						],
						{
							placeHolder: 'How would you like to restore the snapshot?'
						}
					);

					if (!choice) {
						return;
					}

					if (choice.value === 'all') {
						await this._onRestoreSnapshot(data.name, data.timestamp);
					} else {
						const files = await this._getSnapshotFiles(data.name, data.timestamp);
						const selectedFiles = await vscode.window.showQuickPick(files, {
							canPickMany: true,
							placeHolder: 'Select files to restore'
						});
						if (selectedFiles) {
							await this._onRestoreSnapshot(data.name, data.timestamp, selectedFiles);
						}
					}
					break;
				case 'showDiff':
					await this._showDiff(data.name, data.timestamp);
					break;
				case 'showTree':
					await this._showTree(data.name, data.timestamp);
					break;
				case 'deleteSnapshot':
					const wasDeleted = await this._onDeleteSnapshot(data.name, data.timestamp);
					if (wasDeleted) {
						await this.refreshList();
					}
					break;
				case 'renameSnapshot':
					await this._onRenameSnapshot(data.name, data.timestamp);
					break;
				case 'refresh':
					await this.refreshList();
					break;
				case 'openSettings':
					await vscode.commands.executeCommand('local-snapshots.openSettings');
					break;
			}
		});

		// Initial refresh
		this.refreshList();
	}

	public async refreshList() {
		if (this._view) {
			const snapshots = await this._getSnapshots();
			this._view.webview.postMessage({
				type: 'refreshList',
				snapshots: snapshots.map(s => ({
					name: s.name,
					timestamp: s.timestamp,
					fileCount: s.files.length
				}))
			});
		}
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'media', 'snapshotList.js')
		);

		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'media', 'snapshotList.css')
		);

		const codiconsUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'media', 'codicons', 'codicon.css')
		);

		const codiconsFontUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'media', 'codicons', 'codicon.ttf')
		);

		const nonce = this.getNonce();

		return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
        <style>
            @font-face {
                font-family: "codicon";
                src: url("${codiconsFontUri}") format("truetype");
            }
        </style>
        <link href="${styleUri}" rel="stylesheet">
        <link href="${codiconsUri}" rel="stylesheet">
        <title>Local Snapshots</title>
    </head>
    <body>
        <div class="container">

            <div class="filter-section">
                <div class="filter-header">
                    <button class="filter-toggle" title="Toggle Filters">
                        <span class="codicon codicon-filter"></span>
                        <span>Filters</span>
                    </button>
                    <button class="clear-filters" title="Clear All Filters">
                        <span class="codicon codicon-clear-all"></span>
                        <span>Clear</span>
                    </button>
                </div>
                <div class="filter-panel">
                    <div class="filter-group">
                        <label class="filter-label">Search Snapshots</label>
                        <div class="filter-input-container">
                            <span class="codicon codicon-search"></span>
                            <input type="text" id="name-filter" class="filter-input" placeholder="Type to search...">
                        </div>
                    </div>
                    <div class="filter-group">
                        <label class="filter-label">Date Range</label>
                        <div class="date-range">
                            <div class="filter-input-container">
                                <span class="codicon codicon-calendar"></span>
                                <input type="datetime-local" id="date-from" class="filter-input">
                            </div>
                            <span class="date-separator">to</span>
                            <div class="filter-input-container">
                                <span class="codicon codicon-calendar"></span>
                                <input type="datetime-local" id="date-to" class="filter-input">
                            </div>
                        </div>
                    </div>
                    <div class="filter-group">
                        <label class="filter-label">File Count</label>
                        <div class="file-count-range">
                            <div class="filter-input-container">
                                <span class="codicon codicon-file"></span>
                                <input type="number" id="files-from" class="filter-input" min="0" placeholder="Min files">
                            </div>
                            <span class="date-separator">to</span>
                            <div class="filter-input-container">
                                <span class="codicon codicon-file"></span>
                                <input type="number" id="files-to" class="filter-input" min="0" placeholder="Max files">
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div id="snapshot-list" class="snapshot-list"></div>
        </div>

<template id="snapshot-template">
	<div class="snapshot-card">
		<div class="snapshot-header">
			<div>
				<div class="snapshot-title">
					<span class="codicon codicon-history"></span>
					<span class="name"></span>
				</div>
				<div class="snapshot-meta">
					<span class="timestamp">
						<span class="codicon codicon-calendar"></span>
						<span class="time"></span>
					</span>
					<span class="file-count">
						<span class="codicon codicon-file"></span>
						<span class="count"></span>
					</span>
				</div>
			</div>
		</div>
		<div class="snapshot-actions">
			<button class="action-button-round restore-button" title="Restore Snapshot">
				<span class="codicon codicon-debug-restart"></span>
			</button>
			<button class="action-button-round diff-button" title="View Changes">
				<span class="codicon codicon-diff"></span>
			</button>
			<button class="action-button-round rename-button" title="Rename Snapshot">
				<span class="codicon codicon-edit"></span>
			</button>
			<button class="action-button-round tree-button" title="View Tree">
				<span class="codicon codicon-list-tree"></span>
			</button>
			<button class="action-button-round delete-button" title="Delete Snapshot">
				<span class="codicon codicon-trash"></span>
			</button>
		</div>

	</div>
</template>

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
}