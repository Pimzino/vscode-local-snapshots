import * as vscode from 'vscode';
import { Snapshot } from '../types/interfaces';

export class SnapshotWebviewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'local-snapshots-list';
	private _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _onTakeSnapshot: () => Promise<void>,
		private readonly _onRestoreSnapshot: (name: string, timestamp: number, selectedFiles?: string[]) => Promise<void>,
		private readonly _onDeleteSnapshot: (name: string, timestamp: number) => Promise<void>,
		private readonly _getSnapshots: () => Promise<Snapshot[]>,
		private readonly _getSnapshotFiles: (name: string, timestamp: number) => Promise<string[]>,
		private readonly _showDiff: (name: string, timestamp: number) => Promise<void>
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
				case 'deleteSnapshot':
					await this._onDeleteSnapshot(data.name, data.timestamp);
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
				:root {
					--container-padding: 16px;
					--input-padding-vertical: 6px;
					--input-padding-horizontal: 8px;
					--input-margin-vertical: 4px;
					--input-margin-horizontal: 0;
				}

				body {
					padding: var(--container-padding);
					color: var(--vscode-foreground);
					font-size: 13px;
					line-height: 1.4;
				}

				.snapshot-item {
					padding: 12px;
					margin-bottom: 12px;
					background-color: var(--vscode-editor-background);
					border: 1px solid var(--vscode-widget-border);
					border-radius: 6px;
					box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
					transition: all 0.2s ease;
				}

				.snapshot-item:hover {
					border-color: var(--vscode-focusBorder);
					box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
				}

				.snapshot-header {
					display: flex;
					justify-content: space-between;
					align-items: center;
					margin-bottom: 8px;
					flex-wrap: wrap;
					gap: 8px;
				}

				.snapshot-name {
					font-weight: 600;
					margin: 0;
					color: var(--vscode-foreground);
					font-size: 14px;
					white-space: nowrap;
					overflow: hidden;
					text-overflow: ellipsis;
					max-width: 100%;
				}

				.snapshot-info {
					color: var(--vscode-descriptionForeground);
					font-size: 12px;
					margin: 4px 0 0 0;
					display: flex;
					align-items: center;
					gap: 8px;
				}

				.snapshot-info::before {
					content: '';
					display: inline-block;
					width: 8px;
					height: 8px;
					border-radius: 50%;
					background-color: var(--vscode-charts-blue);
				}

				.snapshot-actions {
					display: flex;
					gap: 8px;
					flex-wrap: wrap;
				}

				button {
					display: inline-flex;
					align-items: center;
					justify-content: center;
					padding: 6px 12px;
					background-color: var(--vscode-button-background);
					color: var(--vscode-button-foreground);
					border: none;
					border-radius: 4px;
					cursor: pointer;
					font-size: 12px;
					font-weight: 500;
					min-width: 70px;
					transition: all 0.2s ease;
					text-transform: uppercase;
					letter-spacing: 0.5px;
				}

				button:hover {
					background-color: var(--vscode-button-hoverBackground);
					transform: translateY(-1px);
				}

				button:active {
					transform: translateY(0);
				}

				.delete-btn {
					background-color: var(--vscode-errorForeground);
					opacity: 0.8;
				}

				.delete-btn:hover {
					opacity: 1;
				}

				.empty-state {
					text-align: center;
					color: var(--vscode-descriptionForeground);
					padding: 40px 20px;
					border: 2px dashed var(--vscode-widget-border);
					border-radius: 8px;
					margin: 20px 0;
				}

				.empty-state-icon {
					font-size: 24px;
					margin-bottom: 12px;
					color: var(--vscode-descriptionForeground);
				}

				@media (max-width: 400px) {
					.snapshot-header {
						flex-direction: column;
						align-items: flex-start;
					}

					.snapshot-actions {
						width: 100%;
						justify-content: flex-start;
					}

					button {
						flex: 1;
					}
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
						container.innerHTML = \`
							<div class="empty-state">
								<div class="empty-state-icon">📸</div>
								<div>No snapshots available</div>
							</div>
						\`;
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
											<button onclick="showDiff('\${snapshot.name}', \${snapshot.timestamp})">Compare</button>
											<button onclick="restoreSnapshot('\${snapshot.name}', \${snapshot.timestamp})">Restore</button>
											<button class="delete-btn" onclick="deleteSnapshot('\${snapshot.name}', \${snapshot.timestamp})">Delete</button>
										</div>
									</div>
									<p class="snapshot-info">\${date} • \${snapshot.fileCount} file\${snapshot.fileCount !== 1 ? 's' : ''}</p>
								</div>
							\`;
						})
						.join('');
				}

				function showDiff(name, timestamp) {
					vscode.postMessage({ type: 'showDiff', name, timestamp });
				}

				function restoreSnapshot(name, timestamp) {
					vscode.postMessage({ type: 'restoreSnapshot', name, timestamp });
				}

				function deleteSnapshot(name, timestamp) {
					vscode.postMessage({ type: 'deleteSnapshot', name, timestamp });
				}

				// Initial refresh request
				vscode.postMessage({ type: 'refresh' });
			</script>
		</body>
		</html>`;
	}
} 