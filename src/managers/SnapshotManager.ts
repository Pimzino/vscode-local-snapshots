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
      this.pendingChanges.add(key);
      console.log(`Change detected in ${event.document.fileName}`);
    });

    // Listen for the will save event
    const willSaveListener = vscode.workspace.onWillSaveTextDocument(async event => {
      const document = event.document;
      const key = document.uri.toString();

      console.log(`Will save triggered for ${document.fileName}`);
      console.log(`Has pending changes: ${this.pendingChanges.has(key)}`);

      if (this.pendingChanges.has(key)) {
        const currentState = this.documentStates.get(key);
        if (currentState) {
          console.log('Creating snapshot before save');
          await this.handlePreSaveSnapshot(document, currentState.content);
        }
        this.pendingChanges.delete(key);
      } else {
        console.log('No snapshot needed - no pending changes');
      }

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

      const workspaceFolder = workspaceFolders[0];
      if (!document.uri.fsPath.startsWith(workspaceFolder.uri.fsPath)) {
        console.log('File not in workspace');
        return;
      }

      const relativePath = path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath);

      if (this.shouldSkipFile(relativePath)) {
        console.log(`Skipping file: ${relativePath}`);
        return;
      }

      console.log(`Creating snapshot for ${relativePath}`);

      const snapshotName = path.basename(document.fileName);
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
      return path.basename(workspaceFile.fsPath, path.extname(workspaceFile.fsPath));
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      return workspaceFolders[0].name;
    }

    return 'Untitled';
  }

  private formatTimestamp(): string {
    const date = new Date();
    const locale = vscode.env.language || Intl.DateTimeFormat().resolvedOptions().locale;
    const dateStr = date.toLocaleDateString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const timeStr = date.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
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
      : `Quick Snapshot - ${timestamp}`;

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

  async deleteSnapshot(snapshotName: string, timestamp: number): Promise<void> {
    const snapshots = this.getSnapshots();
    const updatedSnapshots = snapshots.filter(s => !(s.name === snapshotName && s.timestamp === timestamp));
    await this.saveSnapshots(updatedSnapshots);
  }

  async restoreSnapshot(snapshotName: string, timestamp: number, selectedFiles?: string[]): Promise<void> {
    const snapshots = this.getSnapshots();
    const snapshot = snapshots.find(s => s.name === snapshotName && s.timestamp === timestamp);

    if (!snapshot) {
      throw new Error('Snapshot not found');
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      throw new Error('No workspace folder is open');
    }

    const filesToRestore = selectedFiles 
      ? snapshot.files.filter(f => selectedFiles.includes(f.relativePath))
      : snapshot.files;

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

  async getSnapshotFiles(snapshotName: string, timestamp: number): Promise<string[]> {
    const snapshots = this.getSnapshots();
    const snapshot = snapshots.find(s => s.name === snapshotName && s.timestamp === timestamp);
    if (!snapshot) {
      throw new Error('Snapshot not found');
    }
    return snapshot.files.map(f => f.relativePath);
  }

  async showDiff(snapshotName: string, timestamp: number): Promise<void> {
    const snapshots = this.getSnapshots();
    const snapshot = snapshots.find(s => s.name === snapshotName && s.timestamp === timestamp);

    if (!snapshot || !snapshot.files.length) {
      throw new Error('Snapshot not found or empty');
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      throw new Error('No workspace folder is open');
    }

    try {
      const selectedFiles = await vscode.window.showQuickPick(
        snapshot.files.map(f => ({
          label: f.relativePath,
          file: f
        })),
        {
          canPickMany: true,
          placeHolder: 'Select files to compare'
        }
      );

      if (!selectedFiles) {
        return;
      }

      const filesToDiff = selectedFiles.length === 0
        ? snapshot.files
        : selectedFiles.map(s => s.file);

      const consolidatedCurrentContent = await Promise.all(
        filesToDiff.map(async (file: FileSnapshot) => {
          try {
            const currentUri = vscode.Uri.file(path.join(workspaceFolders[0].uri.fsPath, file.relativePath));
            const currentDocument = await vscode.workspace.openTextDocument(currentUri);
            return {
              content: currentDocument.getText(),
              relativePath: file.relativePath
            };
          } catch (error) {
            console.error(`Failed to read current file: ${file.relativePath}`, error);
            return {
              content: '',
              relativePath: file.relativePath
            };
          }
        })
      );

      const provider = vscode.workspace.registerTextDocumentContentProvider('local-snapshots', {
        provideTextDocumentContent: (uri: vscode.Uri): string => {
          if (uri.path.endsWith('consolidated.snapshot')) {
            return filesToDiff.map((file: FileSnapshot) => {
              const separator = '='.repeat(40);
              return `${separator}\n${file.relativePath}\n${separator}\n\n${file.content}\n`;
            }).join('\n\n');
          } else if (uri.path.endsWith('consolidated.current')) {
            return consolidatedCurrentContent.map(file => {
              const separator = '='.repeat(40);
              return `${separator}\n${file.relativePath}\n${separator}\n\n${file.content}\n`;
            }).join('\n\n');
          }
          return '';
        }
      });

      try {
        const snapshotUri = vscode.Uri.parse('local-snapshots:consolidated.snapshot');
        const currentUri = vscode.Uri.parse('local-snapshots:consolidated.current');
        const title = `${snapshotName} - ${filesToDiff.length} files`;
        await vscode.commands.executeCommand('vscode.diff', snapshotUri, currentUri, title);
      } finally {
        provider.dispose();
      }
    } catch (error) {
      console.error('Failed to show diff:', error);
      vscode.window.showErrorMessage('Failed to show diff view');
    }
  }

  dispose() {
    this.disposables.forEach(d => d.dispose());
  }
}