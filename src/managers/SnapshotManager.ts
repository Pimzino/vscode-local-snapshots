import * as vscode from 'vscode';
import * as path from 'path';
import { FileSnapshot, Snapshot } from '../types/interfaces';
import { SnapshotWebviewProvider } from '../views/SnapshotWebviewProvider';

export class SnapshotManager {
	private context: vscode.ExtensionContext;
	private readonly SNAPSHOTS_KEY = 'snapshots';
	private webviewProvider?: SnapshotWebviewProvider;
	private disposables: vscode.Disposable[] = [];
	private documentStates: Map<string, { content: string, version: number }> = new Map();
	private pendingChanges: Set<string> = new Set();

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
		this.setupPreSaveListener();
	}

	private setupPreSaveListener() {
		// Track document changes
		const changeListener = vscode.workspace.onDidChangeTextDocument(event => {
			const key = event.document.uri.toString();
			
			// Mark this document as having pending changes
			this.pendingChanges.add(key);
			
			console.log(`Change detected in ${event.document.fileName}`);
		});

		// Listen for the will save event
		const willSaveListener = vscode.workspace.onWillSaveTextDocument(async event => {
			const document = event.document;
			const key = document.uri.toString();

			console.log(`Will save triggered for ${document.fileName}`);
			console.log(`Has pending changes: ${this.pendingChanges.has(key)}`);

			// Only create snapshot if we have pending changes
			if (this.pendingChanges.has(key)) {
				const currentState = this.documentStates.get(key);
				if (currentState) {
					console.log('Creating snapshot before save');
					await this.handlePreSaveSnapshot(document, currentState.content);
				}
				// Clear the pending changes flag
				this.pendingChanges.delete(key);
			} else {
				console.log('No snapshot needed - no pending changes');
			}

			// Update the stored state with current content
			this.documentStates.set(key, {
				content: document.getText(),
				version: document.version
			});
		});

		// Initial state for all open documents
		vscode.workspace.textDocuments.forEach(doc => {
			console.log(`Initializing state for ${doc.fileName}`);
			this.documentStates.set(doc.uri.toString(), {
				content: doc.getText(),
				version: doc.version
			});
		});

		// Track newly opened documents
		const openListener = vscode.workspace.onDidOpenTextDocument(doc => {
			console.log(`Document opened: ${doc.fileName}`);
			this.documentStates.set(doc.uri.toString(), {
				content: doc.getText(),
				version: doc.version
			});
		});

		// Clean up closed documents
		const closeListener = vscode.workspace.onDidCloseTextDocument(doc => {
			console.log(`Document closed: ${doc.fileName}`);
			this.documentStates.delete(doc.uri.toString());
			this.pendingChanges.delete(doc.uri.toString());
		});

		this.disposables.push(willSaveListener, changeListener, openListener, closeListener);
	}

	private async handlePreSaveSnapshot(document: vscode.TextDocument, previousContent: string): Promise<void> {
		try {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders) {
				console.log('No workspace folders found');
				return;
			}

			// Only take snapshots of files in the workspace
			const workspaceFolder = workspaceFolders[0];
			if (!document.uri.fsPath.startsWith(workspaceFolder.uri.fsPath)) {
				console.log('File not in workspace');
				return;
			}

			const relativePath = path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath);
			
			// Skip files we don't want to snapshot
			if (this.shouldSkipFile(relativePath)) {
				console.log(`Skipping file: ${relativePath}`);
				return;
			}

			console.log(`Creating snapshot for ${relativePath}`);

			const projectName = this.getProjectName();
			const timestamp = this.formatTimestamp();
			const snapshotName = `${projectName} - Pre-save ${timestamp}`;

			// Create a snapshot with the previous content
			const snapshot: Snapshot = {
				name: snapshotName,
				timestamp: Date.now(),
				files: [{
					content: previousContent,
					relativePath
				}]
			};

			const snapshots = this.getSnapshots();
			snapshots.push(snapshot);
			await this.saveSnapshots(snapshots);

			console.log('Snapshot created successfully');

			if (this.webviewProvider) {
				this.webviewProvider.refreshList();
			}
		} catch (error) {
			console.error('Failed to create pre-save snapshot:', error);
		}
	}

	private shouldSkipFile(relativePath: string): boolean {
		const skipPatterns = [
			/node_modules/,
			/\.git/,
			/dist/,
			/out/,
			/\.vs/,
			/\.vscode/,
			/\.DS_Store/,
			/Thumbs\.db/,
			/\.log$/,
			/package-lock\.json$/
		];

		return skipPatterns.some(pattern => pattern.test(relativePath));
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
			: `${projectName} - Manual ${timestamp}`;

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
					if (!this.shouldSkipFile(relativePath)) {
						files.push({
							content: document.getText(),
							relativePath
						});
					}
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

	dispose() {
		this.disposables.forEach(d => d.dispose());
	}
} 