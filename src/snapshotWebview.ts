import * as vscode from 'vscode';

export class SnapshotWebviewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'local-snapshots-list';
	private _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly onTakeSnapshot: () => Promise<void>,
		private readonly onRestoreSnapshot: (snapshotName: string) => Promise<void>,
		private readonly onDeleteSnapshot: (snapshotName: string) => Promise<void>,
		public readonly getSnapshots: () => Promise<any[]>
	) {
		console.log('SnapshotWebviewProvider initialized');
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		console.log('Resolving webview view');
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		// Set the webview's initial html content
		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		// Handle visibility changes
		webviewView.onDidChangeVisibility(() => {
			console.log('Webview visibility changed:', webviewView.visible);
			if (webviewView.visible) {
				this.refreshList();
			}
		});

		// Handle messages from the webview
		webviewView.webview.onDidReceiveMessage(async (data) => {
			console.log('Received message from webview:', data.type);
			switch (data.type) {
				case 'takeSnapshot':
					await this.onTakeSnapshot();
					this.refreshList();
					break;
				case 'restoreSnapshot':
					await this.onRestoreSnapshot(data.value);
					break;
				case 'deleteSnapshot':
					await this.onDeleteSnapshot(data.value);
					this.refreshList();
					break;
			}
		});

		// Initial load of snapshots
		this.refreshList();
	}

	public show() {
		if (this._view) {
			console.log('Showing webview');
			this._view.show(true);
		}
	}

	public async refreshList() {
		if (this._view) {
			const snapshots = await this.getSnapshots();
			this._view.webview.postMessage({
				type: 'refreshList',
				snapshots: snapshots.map(s => ({
					name: s.name,
					timestamp: new Date(s.timestamp).toLocaleString(),
					files: s.files.length
				}))
			});
		}
	}

	private _getHtmlForWebview(webview: vscode.Webview): string {
    const html = `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Local Snapshots</title>
            <style>
                :root {
                    --animation-duration: 0.2s;
                }
                body {
                    padding: 20px;
                    color: var(--vscode-foreground);
                    font-family: var(--vscode-font-family);
                    background-color: var(--vscode-editor-background);
                }
                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .snapshot-list {
                    margin-top: 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .snapshot-item {
                    padding: 16px;
                    background: var(--vscode-sideBar-background);
                    border: 1px solid var(--vscode-widget-border);
                    border-radius: 8px;
                    transition: all var(--animation-duration) ease;
                    animation: slideIn var(--animation-duration) ease;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                }
                .snapshot-item:hover {
                    background: var(--vscode-list-hoverBackground);
                    transform: translateY(-2px);
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
                }
                .snapshot-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                }
                .snapshot-name {
                    font-weight: 600;
                    color: var(--vscode-foreground);
                    font-size: 14px;
                }
                .snapshot-meta {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                    margin: 4px 0;
                    display: flex;
                    align-items: center;
                }
                .snapshot-meta::before {
                    content: '';
                    display: inline-block;
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    margin-right: 8px;
                    background-color: var(--vscode-charts-blue);
                }
                .snapshot-actions {
                    margin-top: 12px;
                    display: flex;
                    gap: 8px;
                    opacity: 0.8;
                    transition: opacity var(--animation-duration) ease;
                }
                .snapshot-item:hover .snapshot-actions {
                    opacity: 1;
                }
                button {
                    padding: 6px 12px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    transition: all var(--animation-duration) ease;
                    min-width: 80px;
                }
                .take-snapshot-btn {
                    width: 100%;
                    margin-bottom: 20px;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    padding: 12px;
                    font-size: 14px;
                    font-weight: 500;
                    border-radius: 6px;
                }
                .take-snapshot-btn:hover {
                    background: var(--vscode-button-hoverBackground);
                    transform: translateY(-1px);
                }
                .restore-btn {
                    background: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                }
                .restore-btn:hover {
                    background: var(--vscode-button-secondaryHoverBackground);
                    transform: translateY(-1px);
                }
                .delete-btn {
                    background: var(--vscode-errorForeground);
                    color: white;
                    opacity: 0.8;
                }
                .delete-btn:hover {
                    opacity: 1;
                    transform: translateY(-1px);
                }
                .empty-state {
                    text-align: center;
                    color: var(--vscode-descriptionForeground);
                    margin-top: 40px;
                    padding: 20px;
                    border: 1px dashed var(--vscode-widget-border);
                    border-radius: 8px;
                    animation: slideIn var(--animation-duration) ease;
                }
            </style>
        </head>
        <body>
            <button class="take-snapshot-btn" onclick="takeSnapshot()">+ Take New Snapshot</button>
            <div class="snapshot-list" id="snapshotList"></div>

            <script>
                const vscode = acquireVsCodeApi();

                function takeSnapshot() {
                    vscode.postMessage({ type: 'takeSnapshot' });
                }

                function restoreSnapshot(name) {
                    vscode.postMessage({ type: 'restoreSnapshot', value: name });
                }

                function deleteSnapshot(name) {
                    if (confirm('Are you sure you want to delete this snapshot?')) {
                        vscode.postMessage({ type: 'deleteSnapshot', value: name });
                    }
                }

                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'refreshList':
                            const list = document.getElementById('snapshotList');
                            if (message.snapshots.length === 0) {
                                list.innerHTML = '<div class="empty-state">No snapshots yet. Take your first snapshot to get started!</div>';
                                return;
                            }
                            list.innerHTML = message.snapshots.map(snapshot => \`
                                <div class="snapshot-item">
                                    <div class="snapshot-header">
                                        <div class="snapshot-name">\${snapshot.name}</div>
                                    </div>
                                    <div class="snapshot-meta">Created: \${snapshot.timestamp}</div>
                                    <div class="snapshot-meta">Files: \${snapshot.files}</div>
                                    <div class="snapshot-actions">
                                        <button class="restore-btn" onclick="restoreSnapshot('\${snapshot.name}')">Restore</button>
                                        <button class="delete-btn" onclick="deleteSnapshot('\${snapshot.name}')">Delete</button>
                                    </div>
                                </div>\`
                            ).join('');
                            break;
                    }
                });
            </script>
        </body>
        </html>`;
    return html;

	}
}