import * as vscode from 'vscode';
import * as path from 'path';
import { FileSnapshot, Snapshot } from '../types/interfaces';
import { SnapshotWebviewProvider } from '../views/SnapshotWebviewProvider';

export class SnapshotManager {
	private context: vscode.ExtensionContext;
	private readonly SNAPSHOTS_KEY = 'snapshots';
	private webviewProvider?: SnapshotWebviewProvider;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	setWebviewProvider(provider: SnapshotWebviewProvider) {
		this.webviewProvider = provider;
	}

	public getSnapshots(): Snapshot[] {
		return this.context.globalState.get<Snapshot[]>(this.SNAPSHOTS_KEY, []);
	}

	private async saveSnapshots(snapshots: Snapshot[]): Promise<void> {
		await this.context.globalState.update(this.SNAPSHOTS_KEY, snapshots);
	}

	private getProjectName(): string {
		const workspaceFile = vscode.workspace.workspaceFile;
		if (workspaceFile) {
			// If it's a workspace, use the workspace name without extension
			return path.basename(workspaceFile.fsPath, path.extname(workspaceFile.fsPath));
		}

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (workspaceFolders && workspaceFolders.length > 0) {
			// Use the name of the first workspace folder
			return workspaceFolders[0].name;
		}

		return 'Untitled';
	}

	private formatTimestamp(): string {
		const date = new Date();
		
		// Get the user's locale from VS Code or fall back to system locale
		const locale = vscode.env.language || Intl.DateTimeFormat().resolvedOptions().locale;
		
		// Format date according to locale
		const dateStr = date.toLocaleDateString(locale, {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		});

		// Format time with proper separators
		const timeStr = date.toLocaleTimeString(locale, {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false
		});

		// Replace any potential problematic characters in the date format
		// but preserve the time separators
		return `${dateStr.replace(/[/:]/g, '-')} ${timeStr}`;
	}

	async takeSnapshot(name?: string): Promise<void> {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			throw new Error('No workspace folder is open');
		}

		const projectName = this.getProjectName();
		const timestamp = this.formatTimestamp();

		const snapshotName = name 
			? `${projectName} - ${name}`
			: `${projectName} - ${timestamp}`;

		const files: FileSnapshot[] = [];

		for (const folder of workspaceFolders) {
			const pattern = new vscode.RelativePattern(folder, '**/*');
			const uris = await vscode.workspace.findFiles(
				pattern,
				'{**/node_modules/**,**/dist/**,**/.git/**,**/out/**}'
			);

			for (const uri of uris) {
				try {
					const document = await vscode.workspace.openTextDocument(uri);
					const relativePath = path.relative(folder.uri.fsPath, uri.fsPath);
					files.push({
						content: document.getText(),
						relativePath
					});
				} catch (error) {
					console.error(`Failed to read file: ${uri.fsPath}`, error);
				}
			}
		}

		const snapshot: Snapshot = {
			name: snapshotName,
			timestamp: Date.now(),
			files
		};

		const snapshots = this.getSnapshots();
		snapshots.push(snapshot);
		await this.saveSnapshots(snapshots);
	}

	async restoreSnapshot(snapshotName: string, selectedFiles?: string[]): Promise<void> {
		const snapshots = this.getSnapshots();
		const snapshot = snapshots.find(s => s.name === snapshotName);
		
		if (!snapshot) {
			throw new Error('Snapshot not found');
		}

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			throw new Error('No workspace folder is open');
		}

		// Filter files if selection provided
		const filesToRestore = selectedFiles 
			? snapshot.files.filter(f => selectedFiles.includes(f.relativePath))
			: snapshot.files;

		// Use workspace.fs API directly instead of WorkspaceEdit to avoid opening files
		for (const file of filesToRestore) {
			for (const folder of workspaceFolders) {
				const fullPath = path.join(folder.uri.fsPath, file.relativePath);
				try {
					const uri = vscode.Uri.file(fullPath);
					await vscode.workspace.fs.writeFile(
						uri,
						Buffer.from(file.content, 'utf8')
					);
				} catch (error) {
					console.error(`Failed to restore file: ${fullPath}`, error);
					vscode.window.showErrorMessage(`Failed to restore file: ${file.relativePath}`);
				}
			}
		}
	}

	async getSnapshotFiles(snapshotName: string): Promise<string[]> {
		const snapshots = this.getSnapshots();
		const snapshot = snapshots.find(s => s.name === snapshotName);
		if (!snapshot) {
			throw new Error('Snapshot not found');
		}
		return snapshot.files.map(f => f.relativePath);
	}

	async deleteSnapshot(snapshotName: string): Promise<void> {
		const snapshots = this.getSnapshots();
		const updatedSnapshots = snapshots.filter(s => s.name !== snapshotName);
		await this.saveSnapshots(updatedSnapshots);
	}

	async restoreFile(filePath: string): Promise<void> {
		const snapshots = this.getSnapshots();
		if (snapshots.length === 0) {
			throw new Error('No snapshots available');
		}

		const items = snapshots.map(s => ({
			label: s.name,
			description: new Date(s.timestamp).toLocaleString(),
			snapshot: s
		}));

		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: 'Select a snapshot to restore from'
		});

		if (!selected) {
			return;
		}

		const relativePath = filePath;
		const fileSnapshot = selected.snapshot.files.find(f => f.relativePath === relativePath);
		
		if (!fileSnapshot) {
			throw new Error('File not found in snapshot');
		}

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			throw new Error('No workspace folder is open');
		}

		// Use workspace.fs API directly instead of WorkspaceEdit
		for (const folder of workspaceFolders) {
			const fullPath = path.join(folder.uri.fsPath, relativePath);
			const uri = vscode.Uri.file(fullPath);
			await vscode.workspace.fs.writeFile(
				uri,
				Buffer.from(fileSnapshot.content, 'utf8')
			);
		}
	}
} 