import * as vscode from 'vscode';
import * as path from 'path';
import { FileSnapshot } from '../types/interfaces';

export class SnapshotTreeWebviewProvider {
	private panel: vscode.WebviewPanel | undefined;
	private snapshotName: string | undefined;
	private timestamp: number | undefined;

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly restoreFileCallback: (filePath: string) => Promise<void>
	) {}

	public get currentSnapshotName(): string | undefined {
		return this.snapshotName;
	}

	public get currentTimestamp(): number | undefined {
		return this.timestamp;
	}

	public async showTree(files: FileSnapshot[], snapshotName: string, timestamp: number): Promise<void> {
		this.snapshotName = snapshotName;
		this.timestamp = timestamp;

		if (this.panel) {
			this.panel.reveal();
			await this.updateTreeContent(files);
			return;
		}

		this.panel = vscode.window.createWebviewPanel(
			'snapshotTree',
			`Tree View - ${snapshotName}`,
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				localResourceRoots: [
					vscode.Uri.joinPath(this.extensionUri, 'media'),
					vscode.Uri.joinPath(this.extensionUri, 'media/codicons')
				]
			}
		);

		this.panel.onDidDispose(() => {
			this.panel = undefined;
		});

		this.panel.webview.onDidReceiveMessage(async message => {
			switch (message.command) {
				case 'restoreFile':
					try {
						await this.restoreFileCallback(message.filePath);
						this.panel?.webview.postMessage({ 
							command: 'fileRestored', 
							filePath: message.filePath 
						});
						vscode.window.showInformationMessage(`Restored file: ${message.filePath}`);
					} catch (error) {
						vscode.window.showErrorMessage(`Failed to restore file: ${message.filePath}`);
					}
					break;
			}
		});

		await this.updateTreeContent(files);
	}

	private async updateTreeContent(files: FileSnapshot[]): Promise<void> {
		if (!this.panel) return;

		const codiconUri = this.panel.webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'media/codicons/codicon.css')
		);

		const treeViewJs = this.panel.webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'media/treeView.js')
		);

		const treeViewCss = this.panel.webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'media/treeView.css')
		);

		const codiconsFontUri = this.panel.webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'media/codicons/codicon.ttf')
		);

		const treeData = this.buildTreeData(files);
		const nonce = this.getNonce();

		this.panel.webview.html = `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource}; font-src ${this.panel.webview.cspSource}; script-src 'nonce-${nonce}';">
			<style>
				@font-face {
					font-family: "codicon";
					src: url("${codiconsFontUri}") format("truetype");
				}
			</style>
			<link href="${codiconUri}" rel="stylesheet">
			<link href="${treeViewCss}" rel="stylesheet">
			<title>Tree View</title>
		</head>
		<body>
			<div class="tree-container">
				<div class="global-controls">
					<h2>
						<span class="codicon codicon-list-tree"></span>
						Project Structure - ${this.snapshotName}
					</h2>
					<div class="controls-right">
						<button class="global-control" id="expandAll" title="Expand All">
							<span class="codicon codicon-expand-all"></span>
							<span>Expand All</span>
						</button>
						<button class="global-control" id="collapseAll" title="Collapse All">
							<span class="codicon codicon-collapse-all"></span>
							<span>Collapse All</span>
						</button>
					</div>
				</div>
				<div id="tree" class="tree-view"></div>
			</div>
			<script nonce="${nonce}">
				const treeData = ${JSON.stringify(treeData)};
			</script>
			<script nonce="${nonce}" src="${treeViewJs}"></script>
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

	private buildTreeData(files: FileSnapshot[]): any {
		const root: any = { name: 'root', children: {}, type: 'directory' };

		// Sort files by path to ensure consistent ordering
		const sortedFiles = [...files].sort((a, b) => a.relativePath.localeCompare(b.relativePath));

		for (const file of sortedFiles) {
			// Normalize path separators and split path
			const parts = file.relativePath.split(/[/\\]/).filter(p => p.length > 0);
			let current = root;

			// Build directory structure
			for (let i = 0; i < parts.length - 1; i++) {
				const part = parts[i];
				if (!current.children[part]) {
					current.children[part] = {
						name: part,
						children: {},
						type: 'directory'
					};
				}
				current = current.children[part];
			}

			// Add file
			const fileName = parts[parts.length - 1];
			current.children[fileName] = {
				name: fileName,
				path: file.relativePath,
				type: 'file'
			};
		}

		return this.transformTreeData(root);
	}

	private transformTreeData(node: any): any {
		if (node.type === 'file') {
			return {
				name: node.name,
				path: node.path,
				type: 'file'
			};
		}

		const children = Object.entries(node.children)
			.map(([_, child]: [string, any]) => this.transformTreeData(child))
			.sort((a, b) => {
				// Sort directories first, then files
				if (a.type !== b.type) {
					return a.type === 'directory' ? -1 : 1;
				}
				// Within same type, sort alphabetically
				return a.name.localeCompare(b.name);
			});

		return {
			name: node.name === 'root' ? '/' : node.name,
			children,
			type: 'directory'
		};
	}
}