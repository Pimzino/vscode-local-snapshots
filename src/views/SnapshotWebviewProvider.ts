import * as vscode from 'vscode';
import { Snapshot } from '../types/interfaces';

export class SnapshotWebviewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'local-snapshots-list';
	private _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _onTakeSnapshot: () => Promise<void>,
		private readonly _onRestoreSnapshot: (name: string, selectedFiles?: string[]) => Promise<void>,
		private readonly _onDeleteSnapshot: (name: string) => Promise<void>,
		private readonly _getSnapshots: () => Promise<Snapshot[]>,
		private readonly _getSnapshotFiles: (name: string) => Promise<string[]>
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
						await this._onRestoreSnapshot(data.name);
					} else {
						const files = await this._getSnapshotFiles(data.name);
						const selectedFiles = await vscode.window.showQuickPick(files, {
							canPickMany: true,
							placeHolder: 'Select files to restore'
						});
						if (selectedFiles) {
							await this._onRestoreSnapshot(data.name, selectedFiles);
						}
					}
					break;
				case 'deleteSnapshot':
					await this._onDeleteSnapshot(data.name);
					break;
				case 'refresh':
					await this.refreshList();
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
		return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Local Snapshots</title>
			<style>
				body {
					padding: 10px;
				}
				.snapshot-item {
					padding: 8px;
					margin-bottom: 8px;
					background-color: var(--vscode-editor-background);
					border: 1px solid var(--vscode-widget-border);
					border-radius: 4px;
				}
				.snapshot-header {
					display: flex;
					justify-content: space-between;
					align-items: center;
					margin-bottom: 4px;
				}
				.snapshot-name {
					font-weight: bold;
					margin: 0;
				}
				.snapshot-info {
					color: var(--vscode-descriptionForeground);
					font-size: 0.9em;
					margin: 0;
				}
				.snapshot-actions {
					display: flex;
					gap: 8px;
				}
				button {
					padding: 4px 8px;
					background-color: var(--vscode-button-background);
					color: var(--vscode-button-foreground);
					border: none;
					border-radius: 2px;
					cursor: pointer;
				}
				button:hover {
					background-color: var(--vscode-button-hoverBackground);
				}
				.delete-btn {
					background-color: var(--vscode-errorForeground);
				}
				.delete-btn:hover {
					opacity: 0.8;
				}
				.empty-state {
					text-align: center;
					color: var(--vscode-descriptionForeground);
					padding: 20px;
				}
			</style>
		</head>
		<body>
			<div id="snapshots-list"></div>
			<script>
				const vscode = acquireVsCodeApi();
				
				window.addEventListener('message', event => {
					const message = event.data;
					switch (message.type) {
						case 'refreshList':
							refreshSnapshotsList(message.snapshots);
							break;
					}
				});

				function refreshSnapshotsList(snapshots) {
					const container = document.getElementById('snapshots-list');
					if (!snapshots || snapshots.length === 0) {
						container.innerHTML = '<div class="empty-state">No snapshots available</div>';
						return;
					}

					container.innerHTML = snapshots
						.sort((a, b) => b.timestamp - a.timestamp)
						.map(snapshot => {
							const date = new Date(snapshot.timestamp).toLocaleString();
							return \`
								<div class="snapshot-item">
									<div class="snapshot-header">
										<h3 class="snapshot-name">\${snapshot.name}</h3>
										<div class="snapshot-actions">
											<button onclick="restoreSnapshot('\${snapshot.name}')">Restore</button>
											<button class="delete-btn" onclick="deleteSnapshot('\${snapshot.name}')">Delete</button>
										</div>
									</div>
									<p class="snapshot-info">\${date} • \${snapshot.fileCount} files</p>
								</div>
							\`;
						})
						.join('');
				}

				function restoreSnapshot(name) {
					vscode.postMessage({ type: 'restoreSnapshot', name });
				}

				function deleteSnapshot(name) {
					vscode.postMessage({ type: 'deleteSnapshot', name });
				}

				// Initial refresh request
				vscode.postMessage({ type: 'refresh' });
			</script>
		</body>
		</html>`;
	}
} 