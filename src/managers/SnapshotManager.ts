import * as vscode from 'vscode';
import * as path from 'path';
import { FileSnapshot, Snapshot, DiffFile } from '../types/interfaces';
import { SnapshotWebviewProvider } from '../views/SnapshotWebviewProvider';
import { SnapshotDiffWebviewProvider } from '../views/SnapshotDiffWebviewProvider';

// Constants for file processing
const BATCH_SIZE = 10; // Process files in batches of 10


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
      if (e.affectsConfiguration('localSnapshots.enableTimedSnapshots') ||
        e.affectsConfiguration('localSnapshots.timedSnapshotInterval')) {
        this.setupTimedSnapshots();
      }
      if (e.affectsConfiguration('localSnapshots.limitSnapshotCount')) {
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
            await vscode.workspace.getConfiguration().update(
            'localSnapshots.limitSnapshotCount',
            false,
            vscode.ConfigurationTarget.Global
            );
        }
        }
      }
      if (e.affectsConfiguration('localSnapshots.maxSnapshotCount')) {
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

  private async readFileContent(uri: vscode.Uri): Promise<string> {
    try {
        const document = await vscode.workspace.openTextDocument(uri);
        return document.getText();
    } catch (error) {
        console.error(`Failed to read file: ${uri.fsPath}`, error);
        throw error;
    }
  }



  private isPreSaveSnapshotsEnabled(): boolean {
    return vscode.workspace.getConfiguration().get('localSnapshots.enablePreSaveSnapshots', false);
  }

  private isTimedSnapshotsEnabled(): boolean {
    return vscode.workspace.getConfiguration().get('localSnapshots.enableTimedSnapshots', false);
  }

  private getTimedSnapshotInterval(): number {
    return vscode.workspace.getConfiguration().get('localSnapshots.timedSnapshotInterval', 300);
  }

  private shouldShowTimedSnapshotNotifications(): boolean {
    return vscode.workspace.getConfiguration().get('localSnapshots.showTimedSnapshotNotifications', true);
  }

  private shouldSkipUnchangedSnapshots(): boolean {
    return vscode.workspace.getConfiguration().get('localSnapshots.skipUnchangedSnapshots', false);
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

        for (let i = 0; i < uris.length; i += BATCH_SIZE) {
            const batch = uris.slice(i, i + BATCH_SIZE);
            
            for (const uri of batch) {
                try {
                    const relativePath = path.relative(folder.uri.fsPath, uri.fsPath);
                    if (this.shouldSkipFile(relativePath)) {
                        continue;
                    }

                    const lastFile = lastSnapshot.files.find(f => f.relativePath === relativePath);
                    if (!lastFile) {
                        return true; // New file found
                    }

                    try {
                        const content = await this.readFileContent(uri);
                        if (content !== lastFile.content) {
                            return true; // Content changed
                        }
                    } catch (error) {
                        console.error(`Failed to compare file: ${uri.fsPath}`, error);
                        continue;
                    }
                } catch (error) {
                    console.error(`Failed to process file: ${uri.fsPath}`, error);
                    return true; // Consider changed if we can't read the file
                }
            }

            // Add a small delay between batches to allow garbage collection
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Check for deleted files
        for (const lastFile of lastSnapshot.files) {
            const fullPath = path.join(folder.uri.fsPath, lastFile.relativePath);
            try {
                await vscode.workspace.fs.stat(vscode.Uri.file(fullPath));
            } catch {
                return true; // File doesn't exist anymore
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
        // System files
        /\.DS_Store/,
        /Thumbs\.db/,
        /desktop\.ini/,

        // Binary and non-text files
        /\.(jpg|jpeg|png|gif|ico|webp|bmp)$/i,
        /\.(mp4|webm|ogg|mp3|wav|flac|aac)$/i,
        /\.(pdf|doc|docx|ppt|pptx|xls|xlsx)$/i,
        /\.(zip|rar|7z|tar|gz)$/i,
        /\.(exe|dll|so|dylib)$/i,
        /\.(ttf|otf|eot|woff|woff2)$/i,
        /\.(pyc|pyo|pyd)$/i,
        /\.(class|jar)$/i,
        /\.(db|sqlite|mdb)$/i,
        /\.(bin|dat|bak)$/i
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
    return vscode.workspace.getConfiguration().get('localSnapshots.limitSnapshotCount', false);
  }

  private getMaxSnapshotCount(): number {
    return vscode.workspace.getConfiguration().get('localSnapshots.maxSnapshotCount', 10);
  }

  private async enforceSnapshotLimit(): Promise<void> {
    if (!this.isSnapshotLimitEnabled()) {
        return;
    }

    const maxCount = this.getMaxSnapshotCount();
    const snapshots = this.getSnapshots();

    if (snapshots.length > maxCount) {
        const deletedCount = snapshots.length - maxCount;
        const result = await vscode.window.showWarningMessage(
            `Enforcing snapshot limit will delete ${deletedCount} older snapshot(s). Do you want to continue?`,
            { modal: true },
            'Yes',
            'No'
        );

        if (result === 'Yes') {
            // Sort snapshots by timestamp (newest first)
            const sortedSnapshots = snapshots.sort((a, b) => b.timestamp - a.timestamp);
            // Keep only the newest maxCount snapshots
            const updatedSnapshots = sortedSnapshots.slice(0, maxCount);
            await this.saveSnapshots(updatedSnapshots);
            
            // Refresh the webview to show the updated list
            this.webviewProvider?.refreshList();

            vscode.window.showInformationMessage(
                `Deleted ${deletedCount} old snapshot${deletedCount === 1 ? '' : 's'} to maintain the configured limit of ${maxCount}.`
            );
        } else {
            // If user cancels, disable the snapshot limit
            await vscode.workspace.getConfiguration().update(
                'localSnapshots.limitSnapshotCount',
                false,
                vscode.ConfigurationTarget.Global
            );
            vscode.window.showInformationMessage('Snapshot limit has been disabled to prevent data loss.');
        }
    }
  }

  private async addSnapshot(snapshot: Snapshot): Promise<void> {
    const snapshots = this.getSnapshots();
    snapshots.push(snapshot);

    if (this.isSnapshotLimitEnabled()) {
        const maxCount = this.getMaxSnapshotCount();
        if (snapshots.length > maxCount) {
            // Ask for confirmation before deleting snapshots
            const result = await vscode.window.showWarningMessage(
                `Adding this snapshot will exceed your snapshot limit (${maxCount}). ${snapshots.length - maxCount} older snapshot(s) will be deleted. Do you want to continue?`,
                { modal: true },
                'Yes',
                'No'
            );

            if (result === 'Yes') {
                // Sort by timestamp (newest first) and keep only maxCount snapshots
                const sortedSnapshots = snapshots.sort((a, b) => b.timestamp - a.timestamp);
                await this.saveSnapshots(sortedSnapshots.slice(0, maxCount));
            } else {
                // If user cancels, disable the snapshot limit and save all snapshots
                await vscode.workspace.getConfiguration().update(
                    'localSnapshots.limitSnapshotCount',
                    false,
                    vscode.ConfigurationTarget.Global
                );
                await this.saveSnapshots(snapshots);
                vscode.window.showInformationMessage('Snapshot limit has been disabled to prevent data loss.');
            }
        } else {
            await this.saveSnapshots(snapshots);
        }
    } else {
        await this.saveSnapshots(snapshots);
    }
  }

  private async processFilesInBatches(files: vscode.Uri[], workspaceFolder: vscode.WorkspaceFolder, progress: vscode.Progress<{ message?: string; increment?: number }>, totalFiles: number): Promise<FileSnapshot[]> {
    const results: FileSnapshot[] = [];
    let processedFiles = 0;
    let skippedFiles = 0;

    // Process files in batches
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
            batch.map(async (uri) => {
                try {
                    const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
                    if (this.shouldSkipFile(relativePath)) {
                        skippedFiles++;
                        return null;
                    }

                    const content = await this.readFileContent(uri);
                    processedFiles++;
                    progress.report({
                        message: `Processing files (${processedFiles}/${totalFiles - skippedFiles})`,
                        increment: (100 / (totalFiles - skippedFiles))
                    });

                    return {
                        content,
                        relativePath
                    };
                } catch (error) {
                    console.error(`Failed to process file: ${uri.fsPath}`, error);
                    skippedFiles++;
                    return null;
                }
            })
        );

        results.push(...batchResults.filter((result): result is FileSnapshot => result !== null));

        // Add a small delay between batches to allow garbage collection
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (skippedFiles > 0) {
        vscode.window.showInformationMessage(`Snapshot completed. Skipped ${skippedFiles} non-text file(s).`);
    }

    return results;

  }

  async takeSnapshot(name?: string): Promise<void> {
    return vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Taking Snapshot...',
      cancellable: false
    }, async (progress) => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        throw new Error('No workspace folder is open');
      }

      progress.report({ message: 'Checking for changes...' });
      
      if (this.shouldSkipUnchangedSnapshots()) {
        const hasChanges = await this.hasChangedFiles();
        if (!hasChanges) {
          vscode.window.showInformationMessage('Snapshot skipped - no changes detected');
          return;
        }
      }

      progress.report({ message: 'Scanning workspace files...' });
      const projectName = this.getProjectName();
      const timestamp = this.formatTimestamp();

      const snapshotName = name 
        ? `${projectName} - ${name}`
        : `Quick Snapshot - ${timestamp}`;

      let totalFiles = 0;
      const allUris: vscode.Uri[] = [];

      // First collect all URIs
      for (const folder of workspaceFolders) {
        const pattern = new vscode.RelativePattern(folder, '**/*');
        const uris = await vscode.workspace.findFiles(
          pattern,
          '{**/node_modules/**,**/dist/**,**/.git/**,**/out/**}'
        );
        allUris.push(...uris);
        totalFiles += uris.length;
      }

      // Process files in batches for each workspace folder
      const files: FileSnapshot[] = [];
      for (const folder of workspaceFolders) {
        const folderUris = allUris.filter(uri => uri.fsPath.startsWith(folder.uri.fsPath));
        const folderFiles = await this.processFilesInBatches(folderUris, folder, progress, totalFiles);
        files.push(...folderFiles);
      }

      if (files.length > 0) {
        progress.report({ message: 'Saving snapshot...' });
        const snapshot: Snapshot = {
          name: snapshotName,
          timestamp: Date.now(),
          files
        };

        await this.addSnapshot(snapshot);
        this.webviewProvider?.refreshList();
      } else {
        throw new Error('No files found to snapshot');
      }
    });

  }

  async deleteSnapshot(snapshotName: string, timestamp: number): Promise<void> {
    const snapshots = this.getSnapshots();
    const updatedSnapshots = snapshots.filter(s => !(s.name === snapshotName && s.timestamp === timestamp));
    await this.saveSnapshots(updatedSnapshots);
  }

  async restoreSnapshot(snapshotName: string, timestamp: number, selectedFiles?: string[]): Promise<void> {
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Restoring Snapshot...',
        cancellable: false
    }, async (progress) => {
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

        let processedFiles = 0;
        const totalFiles = filesToRestore.length;

        progress.report({ message: 'Preparing to restore files...' });

        for (const file of filesToRestore) {
            for (const folder of workspaceFolders) {
                const fullPath = path.join(folder.uri.fsPath, file.relativePath);
                try {
                    const uri = vscode.Uri.file(fullPath);
                    await vscode.workspace.fs.writeFile(
                      uri,
                      Buffer.from(file.content, 'utf8')

                    );
                    processedFiles++;
                    progress.report({ 
                        message: `Restoring files (${processedFiles}/${totalFiles})`,
                        increment: (100 / totalFiles)
                    });
                } catch (error) {
                    console.error(`Failed to restore file: ${fullPath}`, error);
                    vscode.window.showErrorMessage(`Failed to restore file: ${file.relativePath}`);
                }
            }
        }
    });
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
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Preparing Diff View...',
        cancellable: false
    }, async (progress) => {
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
            progress.report({ message: 'Analyzing files...' });
            let processedFiles = 0;
            const totalFiles = snapshot.files.length;

            const changedFiles = await Promise.all(
              snapshot.files.map(async (file: FileSnapshot) => {
                try {
                    processedFiles++;
                    progress.report({ 
                        message: `Comparing files (${processedFiles}/${totalFiles})`,
                        increment: (100 / totalFiles)
                    });

                    const currentUri = vscode.Uri.file(path.join(workspaceFolders[0].uri.fsPath, file.relativePath));
                    
                    try {
                        await vscode.workspace.fs.stat(currentUri);
                        const currentContent = await this.readFileContent(currentUri);

                        if (currentContent !== file.content) {
                            return {
                                relativePath: file.relativePath,
                                status: 'modified',
                                original: file.content,
                                modified: currentContent
                            } as DiffFile;
                        }
                        return null;
                    } catch {
                        // File doesn't exist anymore
                        return {
                            relativePath: file.relativePath,
                            status: 'deleted',
                            original: file.content
                        } as DiffFile;
                    }
                } catch (error) {
                    console.error(`Failed to compare file: ${file.relativePath}`, error);
                    return null;
                }
              })
            );

            // Filter out null entries (unchanged files)
            const filesToDiff = changedFiles.filter((file): file is DiffFile => file !== null);

            if (filesToDiff.length === 0) {
                vscode.window.showInformationMessage('No differences found in any files.');
                return;
            }

            progress.report({ message: 'Opening diff view...' });
            if (this.diffProvider) {
                await this.diffProvider.showDiff(filesToDiff, snapshotName, timestamp);
            }
        } catch (error) {
            console.error('Failed to show diff:', error);
            vscode.window.showErrorMessage('Failed to show diff view');
        }
    });
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
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Taking File Snapshot...',
        cancellable: false
    }, async (progress) => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace folder is open');
        }

        progress.report({ message: 'Analyzing file...' });

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

        if (this.shouldSkipUnchangedSnapshots()) {
            progress.report({ message: 'Checking for changes...' });
            const document = await vscode.workspace.openTextDocument(uri);
            const content = document.getText();
            
            // Check if this file exists in the last snapshot
            const snapshots = this.getSnapshots();
            const lastSnapshot = snapshots.sort((a, b) => b.timestamp - a.timestamp)[0];
            
            if (lastSnapshot) {
                const lastFile = lastSnapshot.files.find(f => f.relativePath === relativePath);
                if (lastFile && lastFile.content === content) {
                    vscode.window.showInformationMessage('File snapshot skipped - no changes detected');
                    return;
                }
            }
        }

        try {
            progress.report({ message: 'Reading file content...' });
            const content = await this.readFileContent(uri);
            const fileName = path.basename(uri.fsPath);
            const timestamp = this.formatTimestamp();

            const snapshot: Snapshot = {
              name: `File Snapshot - ${fileName} - ${timestamp}`,
              timestamp: Date.now(),
              files: [{
              content,
              relativePath
              }]
            };


            progress.report({ message: 'Saving snapshot...' });
            await this.addSnapshot(snapshot);
            this.webviewProvider?.refreshList();

        } catch (error) {
            console.error('Failed to take file snapshot:', error);
            throw new Error('Failed to read file contents');
        }
    });
}


  async takeDirectorySnapshot(uri: vscode.Uri): Promise<void> {
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Taking Directory Snapshot...',
        cancellable: false
    }, async (progress) => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace folder is open');
        }

        progress.report({ message: 'Analyzing directory...' });

        if (this.shouldSkipUnchangedSnapshots()) {
            progress.report({ message: 'Checking for changes...' });
            const hasChanges = await this.hasChangedFiles();
            if (!hasChanges) {
                vscode.window.showInformationMessage('Directory snapshot skipped - no changes detected');
                return;
            }
        }

        const workspaceFolder = workspaceFolders.find(folder => 
            uri.fsPath.startsWith(folder.uri.fsPath)
        );

        if (!workspaceFolder) {
            throw new Error('Directory is not in the current workspace');
        }

        const pattern = new vscode.RelativePattern(uri, '**/*');
        const uris = await vscode.workspace.findFiles(pattern);
        const totalFiles = uris.length;

        progress.report({ message: 'Scanning files...' });

        // Process files in batches
        const files = await this.processFilesInBatches(uris, workspaceFolder, progress, totalFiles);

        if (files.length === 0) {
            throw new Error('No files found to snapshot in this directory');
        }

        progress.report({ message: 'Saving snapshot...' });
        const dirName = path.basename(uri.fsPath);
        const timestamp = this.formatTimestamp();
        
        const snapshot: Snapshot = {
            name: `Directory Snapshot - ${dirName} - ${timestamp}`,
            timestamp: Date.now(),
            files
        };

        await this.addSnapshot(snapshot);
        this.webviewProvider?.refreshList();
    });
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