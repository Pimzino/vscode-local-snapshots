import * as vscode from 'vscode';
import * as path from 'path';
import { FileSnapshot, Snapshot } from '../types/interfaces';
import { SnapshotWebviewProvider } from '../views/SnapshotWebviewProvider';
import { SnapshotDiffWebviewProvider } from '../views/SnapshotDiffWebviewProvider';

export class SnapshotManager {
  private context: vscode.ExtensionContext;
  private readonly SNAPSHOTS_KEY = 'snapshots';
  private webviewProvider?: SnapshotWebviewProvider;
  private disposables: vscode.Disposable[] = [];
  private documentStates: Map<string, { content: string, version: number }> = new Map();
  private pendingChanges: Set<string> = new Set();
  private diffProvider?: SnapshotDiffWebviewProvider;
  private timedSnapshotInterval?: NodeJS.Timeout;
  private statusBarItem: vscode.StatusBarItem;
  private countdownInterval?: NodeJS.Timeout;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    
    // Create status bar item
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'local-snapshots.openSettings';
    this.disposables.push(this.statusBarItem);

    this.setupPreSaveListener();
    this.setupTimedSnapshots();

    // Register commands for file/directory snapshots
    this.disposables.push(
      vscode.commands.registerCommand('local-snapshots.snapshotFile', async (uri: vscode.Uri) => {
        try {
          await this.takeFileSnapshot(uri);
          vscode.window.showInformationMessage(`Snapshot taken of file: ${path.basename(uri.fsPath)}`);
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to take snapshot: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }),
      vscode.commands.registerCommand('local-snapshots.snapshotDirectory', async (uri: vscode.Uri) => {
        try {
          await this.takeDirectorySnapshot(uri);
          vscode.window.showInformationMessage(`Snapshot taken of directory: ${path.basename(uri.fsPath)}`);
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to take snapshot: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      })
    );

    // Listen for configuration changes
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration(async e => {
        if (e.affectsConfiguration('local-snapshots.enableTimedSnapshots') ||
            e.affectsConfiguration('local-snapshots.timedSnapshotInterval')) {
          this.setupTimedSnapshots();
        }
        if (e.affectsConfiguration('local-snapshots.limitSnapshotCount')) {
          const isLimitEnabled = this.isSnapshotLimitEnabled();
          if (isLimitEnabled) {
            const result = await vscode.window.showWarningMessage(
              'Enabling snapshot limit will automatically delete older snapshots when the limit is reached. Are you sure you want to continue?',
              { modal: true },
              'Yes',
              'No'
            );
            if (result === 'Yes') {
              await this.enforceSnapshotLimit();
            } else {
              // Revert the setting if user cancels
              await vscode.workspace.getConfiguration('local-snapshots').update(
                'limitSnapshotCount',
                false,
                vscode.ConfigurationTarget.Global
              );
            }
          }
        }
        if (e.affectsConfiguration('local-snapshots.maxSnapshotCount')) {
          if (this.isSnapshotLimitEnabled()) {
            await this.enforceSnapshotLimit();
          }
        }
      })
    );

    this.diffProvider = new SnapshotDiffWebviewProvider(
      context.extensionUri,
      async (filePath: string) => {
        // Get the current snapshot being viewed
        const snapshots = this.getSnapshots();
        const snapshot = snapshots.find(s => 
          s.name === this.diffProvider?.snapshotName && 
          s.timestamp === this.diffProvider?.timestamp
        );
        
        if (snapshot) {
          const fileToRestore = snapshot.files.find(f => f.relativePath === filePath);
          if (fileToRestore) {
            await this.restoreFile(fileToRestore);
          }
        }
      }
    );
  }

  private isPreSaveSnapshotsEnabled(): boolean {
    return vscode.workspace.getConfiguration('local-snapshots').get('enablePreSaveSnapshots', false);
  }

  private isTimedSnapshotsEnabled(): boolean {
    return vscode.workspace.getConfiguration('local-snapshots').get('enableTimedSnapshots', false);
  }

  private getTimedSnapshotInterval(): number {
    return vscode.workspace.getConfiguration('local-snapshots').get('timedSnapshotInterval', 300);
  }

  private shouldShowTimedSnapshotNotifications(): boolean {
    return vscode.workspace.getConfiguration('local-snapshots').get('showTimedSnapshotNotifications', true);
  }

  private shouldSkipUnchangedSnapshots(): boolean {
    return vscode.workspace.getConfiguration('local-snapshots').get('skipUnchangedSnapshots', false);
  }

  private async hasChangedFiles(): Promise<boolean> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return false;
    }

    const lastSnapshot = this.getSnapshots().sort((a, b) => b.timestamp - a.timestamp)[0];
    if (!lastSnapshot) {
      return true; // If no previous snapshot exists, consider it as changed
    }

    for (const folder of workspaceFolders) {
      const pattern = new vscode.RelativePattern(folder, '**/*');
      const uris = await vscode.workspace.findFiles(
        pattern,
        '{**/node_modules/**,**/dist/**,**/.git/**,**/out/**}'
      );

      for (const uri of uris) {
        try {
          const relativePath = path.relative(folder.uri.fsPath, uri.fsPath);
          if (this.shouldSkipFile(relativePath)) {
            continue;
          }

          const document = await vscode.workspace.openTextDocument(uri);
          const currentContent = document.getText();
          
          // Find the corresponding file in the last snapshot
          const lastFile = lastSnapshot.files.find(f => f.relativePath === relativePath);
          
          // If file is new or content has changed, return true
          if (!lastFile || lastFile.content !== currentContent) {
            return true;
          }
        } catch (error) {
          console.error(`Failed to read file: ${uri.fsPath}`, error);
        }
      }

      // Check for deleted files
      for (const lastFile of lastSnapshot.files) {
        const fullPath = path.join(folder.uri.fsPath, lastFile.relativePath);
        try {
          await vscode.workspace.fs.stat(vscode.Uri.file(fullPath));
        } catch {
          // File doesn't exist anymore, consider it as a change
          return true;
        }
      }
    }

    return false;
  }

  private setupTimedSnapshots() {
    // Clear any existing intervals
    if (this.timedSnapshotInterval) {
      clearInterval(this.timedSnapshotInterval);
      this.timedSnapshotInterval = undefined;
    }
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = undefined;
    }

    // Hide status bar item if timed snapshots are disabled
    if (!this.isTimedSnapshotsEnabled()) {
      this.statusBarItem.hide();
      return;
    }

    const intervalSeconds = Math.max(30, this.getTimedSnapshotInterval());
    let nextSnapshot = Date.now() + (intervalSeconds * 1000);

    // Update status bar immediately
    this.updateStatusBar(nextSnapshot);
    this.statusBarItem.show();

    // Set up countdown interval
    this.countdownInterval = setInterval(() => {
      this.updateStatusBar(nextSnapshot);
    }, 1000);

    // Set up snapshot interval
    this.timedSnapshotInterval = setInterval(async () => {
      try {
        if (this.shouldSkipUnchangedSnapshots()) {
          const hasChanges = await this.hasChangedFiles();
          if (!hasChanges) {
            // Update next snapshot time without creating a snapshot
            nextSnapshot = Date.now() + (intervalSeconds * 1000);
            this.updateStatusBar(nextSnapshot);
            
            if (this.shouldShowTimedSnapshotNotifications()) {
              vscode.window.showInformationMessage('Skipped timed snapshot - no changes detected');
            }
            return;
          }
        }

        const timestamp = this.formatTimestamp();
        await this.takeSnapshot(`Timed Snapshot - ${timestamp}`);
        
        if (this.shouldShowTimedSnapshotNotifications()) {
          vscode.window.showInformationMessage(
            `Created timed snapshot at ${timestamp}`,
            { modal: false }
          );
        }

        // Update next snapshot time
        nextSnapshot = Date.now() + (intervalSeconds * 1000);
        this.updateStatusBar(nextSnapshot);

        // Refresh the webview to show the new snapshot
        this.webviewProvider?.refreshList();
      } catch (error) {
        console.error('Failed to create timed snapshot:', error);
        vscode.window.showErrorMessage('Failed to create timed snapshot');
      }
    }, intervalSeconds * 1000);

    // Add the intervals to disposables
    this.disposables.push(
      { dispose: () => {
        if (this.timedSnapshotInterval) {
          clearInterval(this.timedSnapshotInterval);
        }
        if (this.countdownInterval) {
          clearInterval(this.countdownInterval);
        }
      }}
    );
  }

  private updateStatusBar(nextSnapshotTime: number) {
    const timeLeft = Math.max(0, nextSnapshotTime - Date.now());
    const hours = Math.floor(timeLeft / 3600000);
    const minutes = Math.floor((timeLeft % 3600000) / 60000);
    const seconds = Math.floor((timeLeft % 60000) / 1000);
    
    const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    this.statusBarItem.text = `$(history) Next snapshot in ${timeString}`;
    this.statusBarItem.tooltip = 'Click to open Local Snapshots settings';
  }

  private setupPreSaveListener() {
    // Track document changes
    const changeListener = vscode.workspace.onDidChangeTextDocument(event => {
      if (!this.isPreSaveSnapshotsEnabled()) {
        return;
      }
      const key = event.document.uri.toString();
      this.pendingChanges.add(key);
      console.log(`Change detected in ${event.document.fileName}`);
    });

    // Listen for the will save event
    const willSaveListener = vscode.workspace.onWillSaveTextDocument(async event => {
      if (!this.isPreSaveSnapshotsEnabled()) {
        return;
      }
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

  private isSnapshotLimitEnabled(): boolean {
    return vscode.workspace.getConfiguration('local-snapshots').get('limitSnapshotCount', false);
  }

  private getMaxSnapshotCount(): number {
    return vscode.workspace.getConfiguration('local-snapshots').get('maxSnapshotCount', 10);
  }

  private async enforceSnapshotLimit(): Promise<void> {
    if (!this.isSnapshotLimitEnabled()) {
      return;
    }

    const maxCount = this.getMaxSnapshotCount();
    const snapshots = this.getSnapshots();

    if (snapshots.length > maxCount) {
      // Sort snapshots by timestamp (newest first)
      const sortedSnapshots = snapshots.sort((a, b) => b.timestamp - a.timestamp);
      // Keep only the newest maxCount snapshots
      const updatedSnapshots = sortedSnapshots.slice(0, maxCount);
      await this.saveSnapshots(updatedSnapshots);
      
      // Refresh the webview to show the updated list
      this.webviewProvider?.refreshList();

      const deletedCount = snapshots.length - maxCount;
      vscode.window.showInformationMessage(
        `Deleted ${deletedCount} old snapshot${deletedCount === 1 ? '' : 's'} to maintain the configured limit of ${maxCount}.`
      );
    }
  }

  private async addSnapshot(snapshot: Snapshot): Promise<void> {
    const snapshots = this.getSnapshots();
    snapshots.push(snapshot);

    if (this.isSnapshotLimitEnabled()) {
      const maxCount = this.getMaxSnapshotCount();
      if (snapshots.length > maxCount) {
        // Sort by timestamp (newest first) and keep only maxCount snapshots
        const sortedSnapshots = snapshots.sort((a, b) => b.timestamp - a.timestamp);
        await this.saveSnapshots(sortedSnapshots.slice(0, maxCount));
      } else {
        await this.saveSnapshots(snapshots);
      }
    } else {
      await this.saveSnapshots(snapshots);
    }
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

    // Only create snapshot if there are files to snapshot
    if (files.length > 0) {
      const snapshot: Snapshot = {
        name: snapshotName,
        timestamp: Date.now(),
        files
      };

      await this.addSnapshot(snapshot);

      // Refresh the webview after saving
      this.webviewProvider?.refreshList();
    } else {
      throw new Error('No files found to snapshot');
    }
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
      // Get current content for all files and identify which ones have changes
      const changedFiles = await Promise.all(
        snapshot.files.map(async (file: FileSnapshot) => {
          try {
            const currentUri = vscode.Uri.file(path.join(workspaceFolders[0].uri.fsPath, file.relativePath));
            const currentDocument = await vscode.workspace.openTextDocument(currentUri);
            const currentContent = currentDocument.getText();
            
            // Only include files that have differences
            if (currentContent !== file.content) {
              return {
                relativePath: file.relativePath,
                originalContent: file.content,
                modifiedContent: currentContent
              };
            }
            return null;
          } catch (error) {
            console.error(`Failed to read current file: ${file.relativePath}`, error);
            return null;
          }
        })
      );

      // Filter out null entries (unchanged files)
      const filesToDiff = changedFiles.filter(file => file !== null);

      if (filesToDiff.length === 0) {
        vscode.window.showInformationMessage('No differences found in any files.');
        return;
      }

      // Show the diffs in our custom webview
      if (this.diffProvider) {
        await this.diffProvider.showDiff(filesToDiff, snapshotName, timestamp);
      }
    } catch (error) {
      console.error('Failed to show diff:', error);
      vscode.window.showErrorMessage('Failed to show diff view');
    }
  }

  private async restoreFile(file: FileSnapshot): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      throw new Error('No workspace folder is open');
    }

    const fullPath = path.join(workspaceFolders[0].uri.fsPath, file.relativePath);
    try {
      await vscode.workspace.fs.writeFile(
        vscode.Uri.file(fullPath),
        Buffer.from(file.content, 'utf8')
      );
    } catch (error) {
      console.error(`Failed to restore file: ${file.relativePath}`, error);
      throw new Error(`Failed to restore file: ${file.relativePath}`);
    }
  }

  async takeFileSnapshot(uri: vscode.Uri): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      throw new Error('No workspace folder is open');
    }

    const workspaceFolder = workspaceFolders.find(folder => 
      uri.fsPath.startsWith(folder.uri.fsPath)
    );

    if (!workspaceFolder) {
      throw new Error('File is not in the current workspace');
    }

    const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
    if (this.shouldSkipFile(relativePath)) {
      throw new Error('This file type is excluded from snapshots');
    }

    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const fileName = path.basename(uri.fsPath);
      const timestamp = this.formatTimestamp();
      
      const snapshot: Snapshot = {
        name: `File Snapshot - ${fileName} - ${timestamp}`,
        timestamp: Date.now(),
        files: [{
          content: document.getText(),
          relativePath
        }]
      };

      await this.addSnapshot(snapshot);
      this.webviewProvider?.refreshList();

    } catch (error) {
      console.error('Failed to take file snapshot:', error);
      throw new Error('Failed to read file contents');
    }
  }

  async takeDirectorySnapshot(uri: vscode.Uri): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      throw new Error('No workspace folder is open');
    }

    const workspaceFolder = workspaceFolders.find(folder => 
      uri.fsPath.startsWith(folder.uri.fsPath)
    );

    if (!workspaceFolder) {
      throw new Error('Directory is not in the current workspace');
    }

    const files: FileSnapshot[] = [];
    const pattern = new vscode.RelativePattern(uri, '**/*');
    const uris = await vscode.workspace.findFiles(pattern);

    for (const fileUri of uris) {
      try {
        const relativePath = path.relative(workspaceFolder.uri.fsPath, fileUri.fsPath);
        if (!this.shouldSkipFile(relativePath)) {
          const document = await vscode.workspace.openTextDocument(fileUri);
          files.push({
            content: document.getText(),
            relativePath
          });
        }
      } catch (error) {
        console.error(`Failed to read file: ${fileUri.fsPath}`, error);
      }
    }

    if (files.length === 0) {
      throw new Error('No files found to snapshot in this directory');
    }

    const dirName = path.basename(uri.fsPath);
    const timestamp = this.formatTimestamp();
    
    const snapshot: Snapshot = {
      name: `Directory Snapshot - ${dirName} - ${timestamp}`,
      timestamp: Date.now(),
      files
    };

    await this.addSnapshot(snapshot);
    this.webviewProvider?.refreshList();
  }

  dispose() {
    if (this.timedSnapshotInterval) {
      clearInterval(this.timedSnapshotInterval);
    }
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
    this.statusBarItem.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}