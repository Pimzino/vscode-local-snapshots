import * as vscode from 'vscode';
import * as path from 'path';
import { FileSnapshot, Snapshot, DiffFile } from '../types/interfaces';
import { SnapshotWebviewProvider } from '../views/SnapshotWebviewProvider';
import { SnapshotDiffWebviewProvider } from '../views/SnapshotDiffWebviewProvider';
import { SnapshotTreeWebviewProvider } from '../views/SnapshotTreeWebviewProvider';
import { NotificationManager } from '../utils/NotificationManager';
import ignore from 'ignore';

// Constants for file processing
const DEFAULT_EXCLUDE_PATTERN = '{**/node_modules/**,**/dist/**,**/.git/**,**/out/**,**/.next/**,**/build/**,**/.cache/**,**/coverage/**}';

export class SnapshotManager {
  private context: vscode.ExtensionContext;
  private readonly SNAPSHOTS_KEY = 'snapshots';
  private readonly WORKSPACE_SNAPSHOTS_KEY = 'workspaceSnapshots';
  private readonly MIGRATION_DONE_KEY = 'snapshotsMigrated';
  private webviewProvider?: SnapshotWebviewProvider;
  private disposables: vscode.Disposable[] = [];
  private documentStates: Map<string, { content: string, version: number }> = new Map();
  private pendingChanges: Set<string> = new Set();
  private diffProvider?: SnapshotDiffWebviewProvider;
  private treeProvider?: SnapshotTreeWebviewProvider;
  private timedSnapshotInterval?: NodeJS.Timeout;
  private statusBarItem: vscode.StatusBarItem;
  private countdownInterval?: NodeJS.Timeout;
  private gitignoreCache: Map<string, ReturnType<typeof ignore>> = new Map();

  private getBatchSize(): number {
    return vscode.workspace.getConfiguration('localSnapshots').get('batchSize', 50);
  }

  private getBatchDelay(): number {
    return vscode.workspace.getConfiguration('localSnapshots').get('batchDelay', 10);
  }

  private getMaxParallelBatches(): number {
    return vscode.workspace.getConfiguration('localSnapshots').get('maxParallelBatches', 1);
  }

  private notificationManager: NotificationManager;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.notificationManager = NotificationManager.getInstance();
    this.migrateSnapshots();

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
          await this.notificationManager.showInformationMessage(`Snapshot taken of file: ${path.basename(uri.fsPath)}`);
        } catch (error) {
          await this.notificationManager.showErrorMessage(`Failed to take snapshot: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }),
      vscode.commands.registerCommand('local-snapshots.snapshotDirectory', async (uri: vscode.Uri) => {
        try {
          await this.takeDirectorySnapshot(uri);
          await this.notificationManager.showInformationMessage(`Snapshot taken of directory: ${path.basename(uri.fsPath)}`);
        } catch (error) {
          await this.notificationManager.showErrorMessage(`Failed to take snapshot: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
        const result = await this.notificationManager.showWarningMessage(
          'Enabling snapshot limit will automatically delete older snapshots when the limit is reached. Are you sure you want to continue?',
          ['Yes', 'No'],
          true // modal
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

    this.treeProvider = new SnapshotTreeWebviewProvider(
      context.extensionUri,
      async (filePath: string) => {
        const snapshots = this.getSnapshots();
        const snapshot = snapshots.find(s =>
        s.name === this.treeProvider?.currentSnapshotName &&
        s.timestamp === this.treeProvider?.currentTimestamp
        );

      if (snapshot) {
        const fileToRestore = snapshot.files.find(f => f.relativePath === filePath);
        if (fileToRestore) {
        await this.restoreFile(fileToRestore);
        }
      }
      }
    );

    // Initialize gitignore for all workspace folders
    if (vscode.workspace.workspaceFolders) {
      for (const folder of vscode.workspace.workspaceFolders) {
        this.loadGitignore(folder.uri.fsPath).catch(error => {
          console.error('Error loading .gitignore for workspace:', error);
        });
      }
    }

    // Watch for workspace folder changes
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(async event => {
        // Load gitignore for added folders
        for (const folder of event.added) {
          await this.loadGitignore(folder.uri.fsPath);
        }
        // Remove cached gitignore for removed folders
        for (const folder of event.removed) {
          this.gitignoreCache.delete(folder.uri.fsPath);
        }
      })
    );

    // Watch for .gitignore changes
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(event => {
        const document = event.document;
        if (path.basename(document.uri.fsPath) === '.gitignore') {
          const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
          if (workspaceFolder) {
            this.loadGitignore(workspaceFolder.uri.fsPath).catch(error => {
              console.error('Error reloading .gitignore:', error);
            });
          }
        }
      })
    );
  }

  private async migrateSnapshots(): Promise<void> {
    // Check if migration has already been done
    if (this.context.globalState.get(this.MIGRATION_DONE_KEY)) {
      return;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }

    try {
      // Get all existing snapshots
      const existingSnapshots = this.context.globalState.get<Snapshot[]>(this.SNAPSHOTS_KEY, []);
      if (existingSnapshots.length === 0) {
        // No snapshots to migrate
        await this.context.globalState.update(this.MIGRATION_DONE_KEY, true);
        return;
      }

      // Group snapshots by workspace folder
      const workspaceSnapshots = new Map<string, Snapshot[]>();

      for (const snapshot of existingSnapshots) {
        // Try to determine which workspace the snapshot belongs to
        let workspaceFolder: string | undefined;
        let matchedFiles = 0;
        let bestMatchWorkspace: string | undefined;
        let bestMatchCount = 0;

        // First try to match files against each workspace
        for (const folder of workspaceFolders) {
          matchedFiles = 0;
          for (const file of snapshot.files) {
            try {
              // Check if the file exists in this workspace
              const fullPath = path.join(folder.uri.fsPath, file.relativePath);
              try {
                await vscode.workspace.fs.stat(vscode.Uri.file(fullPath));
                matchedFiles++;
              } catch {
                // File doesn't exist in this workspace
                continue;
              }
            } catch {
              continue;
            }
          }

          // If we found matches in this workspace and it's the best match so far
          if (matchedFiles > bestMatchCount) {
            bestMatchCount = matchedFiles;
            bestMatchWorkspace = folder.uri.fsPath;
          }

          // If we matched all files, no need to check other workspaces
          if (matchedFiles === snapshot.files.length) {
            break;
          }
        }

        // Use the workspace with the most matched files
        workspaceFolder = bestMatchWorkspace;

        // If we still couldn't determine the workspace, try to infer from the first file path
        if (!workspaceFolder && snapshot.files.length > 0) {
          const firstFilePath = snapshot.files[0].relativePath;
          // Split the path and try to match the top-level directory
          const topLevelDir = firstFilePath.split(path.sep)[0];

          for (const folder of workspaceFolders) {
            const folderName = path.basename(folder.uri.fsPath);
            if (folderName === topLevelDir) {
              workspaceFolder = folder.uri.fsPath;
              break;
            }
          }
        }

        // If we still can't determine the workspace, log a warning and use the first workspace
        if (!workspaceFolder) {
          console.warn(`Could not determine workspace for snapshot "${snapshot.name}" with ${snapshot.files.length} files. Using first workspace as fallback.`);
          workspaceFolder = workspaceFolders[0].uri.fsPath;
        }

        // Add workspace info to the snapshot
        const snapshotWithWorkspace = {
          ...snapshot,
          workspaceFolder
        };

        // Add to the workspace group
        const snapshots = workspaceSnapshots.get(workspaceFolder) || [];
        snapshots.push(snapshotWithWorkspace);
        workspaceSnapshots.set(workspaceFolder, snapshots);
      }

      // Save workspace-specific snapshots
      for (const [workspaceFolder, snapshots] of workspaceSnapshots) {
        const key = `${this.WORKSPACE_SNAPSHOTS_KEY}-${workspaceFolder}`;
        await this.context.globalState.update(key, snapshots);
      }

      // Clear the old global snapshots
      await this.context.globalState.update(this.SNAPSHOTS_KEY, undefined);

      // Mark migration as complete
      await this.context.globalState.update(this.MIGRATION_DONE_KEY, true);

      console.log('Snapshot migration completed successfully');
    } catch (error) {
      console.error('Failed to migrate snapshots:', error);
      // Don't mark migration as done if it failed
    }
  }

  public getSnapshots(): Snapshot[] {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return [];
    }

    // Get snapshots for the current workspace
    const workspaceFolder = workspaceFolders[0].uri.fsPath;
    const key = `${this.WORKSPACE_SNAPSHOTS_KEY}-${workspaceFolder}`;
    return this.context.globalState.get<Snapshot[]>(key, []);
  }

  private async saveSnapshots(snapshots: Snapshot[]): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return;
    }

    // Save snapshots for the current workspace
    const workspaceFolder = workspaceFolders[0].uri.fsPath;
    const key = `${this.WORKSPACE_SNAPSHOTS_KEY}-${workspaceFolder}`;
    await this.context.globalState.update(key, snapshots);
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

  private isUntitledFile(uri: vscode.Uri): boolean {
    return uri.scheme === 'untitled';
  }

  private getUntitledFilePath(document: vscode.TextDocument): string {
    // Create a special path for untitled files that includes the filename
    return `_untitled/${path.basename(document.fileName)}`;
  }

  private async findUntitledFileContent(relativePath: string): Promise<string | null> {
    // Extract the filename from the _untitled/ path
    const filename = relativePath.replace('_untitled/', '');

    // Check all open text documents for matching untitled files
    for (const document of vscode.workspace.textDocuments) {
      if (document.uri.scheme === 'untitled') {
        // Try to match by filename or path
        if (document.uri.path === filename ||
            document.fileName === filename ||
            path.basename(document.fileName) === filename) {
          return document.getText();
        }
      }
    }

    return null; // Not found
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

        for (let i = 0; i < uris.length; i += this.getBatchSize()) {
            const batch = uris.slice(i, i + this.getBatchSize());

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
              await this.notificationManager.showInformationMessage('Skipped timed snapshot - no changes detected');
            }
            return;
          }
        }

        const timestamp = this.formatTimestamp();
        await this.takeSnapshot(`Timed Snapshot - ${timestamp}`);

        if (this.shouldShowTimedSnapshotNotifications()) {
          await this.notificationManager.showInformationMessage(
            `Created timed snapshot at ${timestamp}`
          );
        }

        // Update next snapshot time
        nextSnapshot = Date.now() + (intervalSeconds * 1000);
        this.updateStatusBar(nextSnapshot);

        // Refresh the webview to show the new snapshot
        this.webviewProvider?.refreshList();
      } catch (error) {
        console.error('Failed to create timed snapshot:', error);
        await this.notificationManager.showErrorMessage('Failed to create timed snapshot');
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
      let relativePath: string;

      // Check if this is an untitled file
      if (this.isUntitledFile(document.uri)) {
        // For untitled files, use a special path format
        relativePath = this.getUntitledFilePath(document);
        console.log(`Creating snapshot for untitled file: ${relativePath}`);
        console.log(`Untitled file content length: ${previousContent ? previousContent.length : 0}`);
        console.log(`Untitled file content preview: ${previousContent ? previousContent.substring(0, 50) : 'EMPTY'}`);

        // Double-check that we have content
        if (!previousContent || previousContent.length === 0) {
          // If previousContent is empty, get the current content
          previousContent = document.getText();
          console.log(`Updated untitled file content length: ${previousContent.length}`);
        }
      } else {
        // For regular files, use the standard relative path
        if (!document.uri.fsPath.startsWith(workspaceFolder.uri.fsPath)) {
          console.log('File not in workspace');
          return;
        }

        relativePath = path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath);

        if (this.shouldSkipFile(relativePath)) {
          console.log(`Skipping file: ${relativePath}`);
          return;
        }
      }

      console.log(`Creating snapshot for ${relativePath}`);

      const snapshotName = `${path.basename(document.fileName)} - ${this.formatTimestamp()}`;
      const snapshot: Snapshot = {
        name: snapshotName,
        timestamp: Date.now(),
        files: [{
          content: previousContent,
          relativePath
        }],
        // Add a snapshotScope to indicate this is a single file snapshot
        snapshotScope: {
          type: 'file',
          uri: document.uri.toString() // Use toString() to preserve the scheme
        }
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

  private shouldSkipFile(relativePath: string, workspaceFolder?: string): boolean {
    // Quick check for common binary and large files first
    const quickSkipPatterns = [
        /\.(jpg|jpeg|png|gif|ico|webp|bmp)$/i,
        /\.(mp4|webm|ogg|mp3|wav|flac|aac)$/i,
        /\.(pdf|doc|docx|ppt|pptx|xls|xlsx)$/i,
        /\.(zip|rar|7z|tar|gz)$/i,
        /\.(exe|dll|so|dylib)$/i,
        /\.(ttf|otf|eot|woff|woff2)$/i,
        /\.(pyc|pyo|pyd)$/i,
        /\.(class|jar)$/i,
        /\.(db|sqlite|mdb)$/i,
        /\.(bin|dat|bak)$/i,
        /^node_modules\//,
        /^\.git\//,
        /^dist\//,
        /^build\//,
        /^\.next\//,
        /^coverage\//,
        /^\.cache\//
    ];

    // Quick check first
    if (quickSkipPatterns.some(pattern => pattern.test(relativePath))) {
        return true;
    }

    // Check custom ignore patterns
    const customPatterns = this.getCustomIgnorePatterns();
    if (customPatterns.length > 0) {
        const ig = ignore().add(customPatterns);
        if (ig.ignores(relativePath)) {
            return true;
        }
    }

    // Check .gitignore if enabled and we have a workspace folder
    if (this.shouldRespectGitignore() && workspaceFolder) {
        const gitignore = this.gitignoreCache.get(workspaceFolder);
        if (gitignore && gitignore.ignores(relativePath)) {
            return true;
        }
    }

    return false;
  }

  setWebviewProvider(provider: SnapshotWebviewProvider) {
    this.webviewProvider = provider;
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

  private isDeleteProtectionEnabled(): boolean {
    return vscode.workspace.getConfiguration().get('localSnapshots.enableDeleteProtection', true);
  }

  private async showDeleteConfirmation(snapshotName: string, isAllSnapshots: boolean = false): Promise<boolean> {
    if (!this.isDeleteProtectionEnabled()) {
      return true;
    }

    const message = isAllSnapshots
      ? 'Are you sure you want to delete all snapshots? This action cannot be undone.'
      : `Are you sure you want to delete snapshot "${snapshotName}"? This action cannot be undone.`;

    const items = ['Yes', 'No', "Yes, don't ask again"];
    const selection = await this.notificationManager.showInformationMessage(
      message,
      items,
      true // modal
    );

    if (selection === "Yes, don't ask again") {
      await vscode.workspace.getConfiguration().update(
        'localSnapshots.enableDeleteProtection',
        false,
        vscode.ConfigurationTarget.Global
      );
      return true;
    }

    return selection === 'Yes';
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
        const result = await this.notificationManager.showWarningMessage(
            `Enforcing snapshot limit will delete ${deletedCount} older snapshot(s). Do you want to continue?`,
            ['Yes', 'No'],
            true // modal
        );

        if (result === 'Yes') {
            // Sort snapshots by timestamp (newest first)
            const sortedSnapshots = snapshots.sort((a, b) => b.timestamp - a.timestamp);
            // Keep only the newest maxCount snapshots
            const updatedSnapshots = sortedSnapshots.slice(0, maxCount);
            await this.saveSnapshots(updatedSnapshots);

            // Refresh the webview to show the updated list
            this.webviewProvider?.refreshList();

            await this.notificationManager.showInformationMessage(
                `Deleted ${deletedCount} old snapshot${deletedCount === 1 ? '' : 's'} to maintain the configured limit of ${maxCount}.`
            );
        } else {
            // If user cancels, disable the snapshot limit
            await vscode.workspace.getConfiguration().update(
                'localSnapshots.limitSnapshotCount',
                false,
                vscode.ConfigurationTarget.Global
            );
            await this.notificationManager.showInformationMessage('Snapshot limit has been disabled to prevent data loss.');
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
            const result = await this.notificationManager.showWarningMessage(
                `Adding this snapshot will exceed your snapshot limit (${maxCount}). ${snapshots.length - maxCount} older snapshot(s) will be deleted. Do you want to continue?`,
                ['Yes', 'No'],
                true // modal
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
                await this.notificationManager.showInformationMessage('Snapshot limit has been disabled to prevent data loss.');
            }
        } else {
            await this.saveSnapshots(snapshots);
        }
    } else {
        await this.saveSnapshots(snapshots);
    }
  }

  private async processFilesInBatches(
    files: vscode.Uri[],
    workspaceFolder: vscode.WorkspaceFolder,
    progress?: vscode.Progress<{ message?: string; increment?: number }>,
    totalFiles?: number,
    snapshotRoot?: string
  ): Promise<FileSnapshot[]> {
    const results: FileSnapshot[] = [];
    let processedFiles = 0;
    let skippedFiles = 0;
    const startTime = Date.now();
    const batchSize = this.getBatchSize();
    const maxParallelBatches = this.getMaxParallelBatches();
    const batchDelay = this.getBatchDelay();

    // Create a Map to cache file stats
    const fileStatsCache = new Map<string, { mtime: number, size: number }>();

    // Process files in parallel batches
    for (let i = 0; i < files.length; i += batchSize * maxParallelBatches) {
      const parallelBatches = [];

      // Create multiple batches to process in parallel
      for (let j = 0; j < maxParallelBatches && i + j * batchSize < files.length; j++) {
        const batchStart = i + j * batchSize;
        const batch = files.slice(batchStart, batchStart + batchSize);

        parallelBatches.push(Promise.all(batch.map(async (uri) => {
          try {
            const baseDir = snapshotRoot || workspaceFolder.uri.fsPath;
            const relativePath = path.relative(baseDir, uri.fsPath);

            if (this.shouldSkipFile(relativePath, workspaceFolder.uri.fsPath)) {
              skippedFiles++;
              return null;
            }

            let stats;
            if (fileStatsCache.has(uri.fsPath)) {
              stats = fileStatsCache.get(uri.fsPath)!;
            } else {
              const fileStat = await vscode.workspace.fs.stat(uri);
              stats = { mtime: fileStat.mtime, size: fileStat.size };
              fileStatsCache.set(uri.fsPath, stats);
            }

            const content = await this.readFileContent(uri);
            processedFiles++;

            if (progress && totalFiles) {
              const elapsed = Date.now() - startTime;
              const rate = processedFiles / (elapsed / 1000);
              progress.report({
                message: `Processing files (${processedFiles}/${totalFiles - skippedFiles}) - ${rate.toFixed(1)} files/sec`,
                increment: (100 / (totalFiles - skippedFiles))
              });
            }

            const snapshot: FileSnapshot = {
              content,
              relativePath,
              mtime: stats.mtime,
              size: stats.size
            };
            return snapshot;
          } catch (error) {
            console.error(`Failed to process file: ${uri.fsPath}`, error);
            skippedFiles++;
            return null;
          }
        })));
      }

      // Wait for all parallel batches to complete
      const batchResults = await Promise.all(parallelBatches);
      const validResults = batchResults.flat().filter((result): result is FileSnapshot => result !== null);
      results.push(...validResults);

      // Small delay between batch groups
      if (i + batchSize * maxParallelBatches < files.length) {
        await new Promise(resolve => setTimeout(resolve, batchDelay));
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    if (skippedFiles > 0) {
      await this.notificationManager.showInformationMessage(
        `Snapshot created in ${elapsed}s (${skippedFiles} files skipped)`
      );
    } else {
      await this.notificationManager.showInformationMessage(
        `Snapshot created in ${elapsed}s`
      );
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
          await this.notificationManager.showInformationMessage('Snapshot skipped - no changes detected');
          return;
        }
      }

      progress.report({ message: 'Scanning workspace files...' });
      const timestamp = this.formatTimestamp();

      // For named snapshots, check for duplicates
      if (name) {
        const snapshots = this.getSnapshots();
        if (snapshots.some(s => s.name === name)) {
          throw new Error('A snapshot with this name already exists');
        }
      }

      const snapshotName = name || `Quick Snapshot - ${timestamp}`;

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
        const folderFiles = await this.processFilesInBatches(
          folderUris,
          folder,
          progress,
          totalFiles
        );
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

  async deleteSnapshot(snapshotName: string, timestamp: number): Promise<boolean> {
    const confirmed = await this.showDeleteConfirmation(snapshotName);
    if (!confirmed) {
      return false;
    }

    const snapshots = this.getSnapshots();
    const updatedSnapshots = snapshots.filter(s => !(s.name === snapshotName && s.timestamp === timestamp));
    await this.saveSnapshots(updatedSnapshots);
    await this.notificationManager.showInformationMessage(`Deleted snapshot: ${snapshotName}`);
    return true;
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

        // If restoring specific files, just restore those without deleting anything
        if (selectedFiles) {
            const filesToRestore = snapshot.files.filter(f => selectedFiles.includes(f.relativePath));
            await this.restoreFiles(filesToRestore, progress);
            return;
        }

        // Check if this is a pre-save snapshot (single file)
        const isSingleFileSnapshot = snapshot.files.length === 1 &&
                                    (snapshot.snapshotScope?.type === 'file' ||
                                     snapshot.files[0].relativePath.startsWith('_untitled/'));

        // For single-file snapshots, just restore the file without deleting anything else
        if (isSingleFileSnapshot) {
            progress.report({ message: 'Restoring single file...' });
            await this.restoreFiles(snapshot.files, progress);
            return;
        }

        // For full workspace/directory snapshots, we need to handle deletions as well
        progress.report({ message: 'Analyzing workspace changes...' });

        // Determine the scope of files to consider for deletion
        let scanPattern: vscode.RelativePattern;
        let scanRoot: vscode.Uri;

        if (snapshot.snapshotScope) {
            switch (snapshot.snapshotScope.type) {
                case 'directory':
                    // For directory snapshots, only consider files in that directory
                    scanRoot = vscode.Uri.file(snapshot.snapshotScope.uri);
                    scanPattern = new vscode.RelativePattern(scanRoot.fsPath, '**/*');
                    break;
                default:
                    // For workspace snapshots, consider all files
                    scanRoot = workspaceFolders[0].uri;
                    scanPattern = new vscode.RelativePattern(scanRoot.fsPath, '**/*');
            }
        } else {
            // Default to workspace scope for backward compatibility
            scanRoot = workspaceFolders[0].uri;
            scanPattern = new vscode.RelativePattern(scanRoot.fsPath, '**/*');
        }

        // Get all current files within the scope
        const currentFiles = new Set<string>();
        const uris = await vscode.workspace.findFiles(
            scanPattern,
            '{**/node_modules/**,**/dist/**,**/.git/**,**/out/**}'
        );

        for (const uri of uris) {
            const relativePath = path.relative(scanRoot.fsPath, uri.fsPath);
            if (!this.shouldSkipFile(relativePath)) {
                // For directory snapshots, adjust the path to be relative to the snapshot directory
                const adjustedPath = snapshot.snapshotScope?.type === 'directory'
                    ? path.relative(snapshot.snapshotScope.uri, uri.fsPath)
                    : relativePath;
                currentFiles.add(adjustedPath);
            }
        }

        // Get all snapshot files
        const snapshotFiles = new Set(snapshot.files.map(f => f.relativePath));

        // Find files to delete (exist in workspace but not in snapshot)
        const filesToDelete = Array.from(currentFiles).filter(file => !snapshotFiles.has(file));

        const totalOperations = snapshot.files.length + filesToDelete.length;
        let completedOperations = 0;

        // First restore all files from the snapshot
        await this.restoreFiles(snapshot.files, progress, totalOperations, completedOperations);
        completedOperations += snapshot.files.length;

        // Then delete files that shouldn't exist
        if (filesToDelete.length > 0) {
            progress.report({
                message: `Removing ${filesToDelete.length} files that don't exist in the snapshot...`,
                increment: 0
            });

            for (const fileToDelete of filesToDelete) {
                // For directory snapshots, adjust the path
                const fullPath = snapshot.snapshotScope?.type === 'directory'
                    ? path.join(snapshot.snapshotScope.uri, fileToDelete)
                    : path.join(scanRoot.fsPath, fileToDelete);

                try {
                    await vscode.workspace.fs.delete(vscode.Uri.file(fullPath));
                    completedOperations++;
                    progress.report({
                        increment: (100 / totalOperations)
                    });
                } catch (error) {
                    console.error(`Failed to delete file: ${fullPath}`, error);
                    await this.notificationManager.showErrorMessage(`Failed to delete file: ${fileToDelete}`);
                }
            }
        }
    });
  }

  private async restoreFiles(
    files: FileSnapshot[],
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    totalOperations?: number,
    startingProgress: number = 0
  ): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        throw new Error('No workspace folder is open');
    }

    const total = totalOperations || files.length;
    let processed = startingProgress;

    for (const file of files) {
        // Handle untitled files specially
        if (file.relativePath.startsWith('_untitled/')) {
            try {
                // For untitled files, we need to create a new untitled document
                const fileName = file.relativePath.replace('_untitled/', '');

                console.log(`Restoring untitled file in batch: ${fileName}`);
                console.log(`Content length: ${file.content ? file.content.length : 0}`);
                console.log(`Content preview: ${file.content ? file.content.substring(0, 50) : 'EMPTY'}`);

                // Ensure we have content
                if (!file.content || file.content.length === 0) {
                    console.log(`Warning: Empty content for untitled file: ${fileName}`);
                    await this.notificationManager.showWarningMessage(`Empty content for untitled file: ${fileName}`);
                }

                // Check if there's already an open untitled document with this name
                let existingDocument: vscode.TextDocument | undefined;
                for (const doc of vscode.workspace.textDocuments) {
                    if (doc.uri.scheme === 'untitled' && path.basename(doc.fileName) === fileName) {
                        existingDocument = doc;
                        console.log(`Found existing untitled document: ${doc.fileName}`);
                        break;
                    }
                }

                if (existingDocument) {
                    // If the document exists, edit it
                    console.log(`Editing existing untitled document with content length: ${file.content.length}`);
                    const edit = new vscode.WorkspaceEdit();
                    const fullRange = new vscode.Range(
                        existingDocument.lineAt(0).range.start,
                        existingDocument.lineAt(existingDocument.lineCount - 1).range.end
                    );
                    edit.replace(existingDocument.uri, fullRange, file.content);
                    const success = await vscode.workspace.applyEdit(edit);
                    console.log(`Edit applied successfully: ${success}`);
                } else {
                    // Otherwise create a new untitled document
                    console.log(`Creating new untitled document with content length: ${file.content.length}`);
                    const untitledDoc = await vscode.workspace.openTextDocument({ content: file.content });
                    await vscode.window.showTextDocument(untitledDoc);
                    console.log(`New untitled document created: ${untitledDoc.fileName}, content length: ${untitledDoc.getText().length}`);
                }

                processed++;
                progress.report({
                    message: `Restoring files (${processed}/${total})`,
                    increment: (100 / total)
                });
            } catch (error) {
                console.error(`Failed to restore untitled file: ${file.relativePath}`, error);
                await this.notificationManager.showErrorMessage(`Failed to restore untitled file: ${file.relativePath}`);
            }
            continue;
        }

        // Handle regular files
        for (const folder of workspaceFolders) {
            const fullPath = path.join(folder.uri.fsPath, file.relativePath);
            try {
                // Ensure the directory exists
                const dirPath = path.dirname(fullPath);
                await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath));

                // Write the file
                await vscode.workspace.fs.writeFile(
                    vscode.Uri.file(fullPath),
                    Buffer.from(file.content, 'utf8')
                );
                processed++;
                progress.report({
                    message: `Restoring files (${processed}/${total})`,
                    increment: (100 / total)
                });
            } catch (error) {
                console.error(`Failed to restore file: ${fullPath}`, error);
                await this.notificationManager.showErrorMessage(`Failed to restore file: ${file.relativePath}`);
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

        // Check if this is a pre-save snapshot (single file)
        const isSingleFileSnapshot = snapshot.files.length === 1 &&
                                    (snapshot.snapshotScope?.type === 'file' ||
                                     snapshot.files[0].relativePath.startsWith('_untitled/'));

        // Create maps for snapshot files and current files
        const currentFiles = new Map<string, string>();
        const changedFiles: DiffFile[] = [];

        if (isSingleFileSnapshot) {
          // For pre-save snapshots, only compare the specific file
          const file = snapshot.files[0];
          const relativePath = file.relativePath;

          progress.report({ message: 'Comparing file...' });

          // Handle untitled files
          if (relativePath.startsWith('_untitled/')) {
            // Try to find the file if it's been saved
            const fileName = relativePath.replace('_untitled/', '');
            let found = false;

            // Look through all open documents to find a matching file
            for (const document of vscode.workspace.textDocuments) {
              if (path.basename(document.fileName) === fileName) {
                // Found a matching file, compare it
                const content = document.getText();

                if (content !== file.content) {
                  changedFiles.push({
                    relativePath,
                    path: relativePath,
                    status: 'modified',
                    original: file.content,
                    modified: content
                  });
                }

                found = true;
                break;
              }
            }

            if (!found) {
              // File was closed/deleted
              changedFiles.push({
                relativePath,
                path: relativePath,
                status: 'deleted',
                original: file.content
              });
            }
          } else {
            // Regular file - find it in the workspace
            let fileUri: vscode.Uri | undefined;

            // If we have a snapshot scope with a URI, use that
            if (snapshot.snapshotScope?.uri) {
              try {
                // Try to use the exact URI from the snapshot scope
                fileUri = vscode.Uri.parse(snapshot.snapshotScope.uri);

                // If it's not an untitled file, make sure it exists
                if (fileUri.scheme === 'file') {
                  try {
                    await vscode.workspace.fs.stat(fileUri);
                  } catch {
                    // File doesn't exist at that location, try to find it by name
                    fileUri = undefined;
                  }
                }
              } catch {
                // Invalid URI, ignore
                fileUri = undefined;
              }
            }

            // If we couldn't get a URI from the snapshot scope, try to find the file
            if (!fileUri) {
              for (const folder of workspaceFolders) {
                const fullPath = path.join(folder.uri.fsPath, relativePath);
                const uri = vscode.Uri.file(fullPath);

                try {
                  await vscode.workspace.fs.stat(uri);
                  fileUri = uri;
                  break;
                } catch {
                  // File doesn't exist in this folder
                  continue;
                }
              }
            }

            if (fileUri) {
              // File exists, compare it
              try {
                const content = await this.readFileContent(fileUri);

                if (content !== file.content) {
                  changedFiles.push({
                    relativePath,
                    path: relativePath,
                    status: 'modified',
                    original: file.content,
                    modified: content
                  });
                }
              } catch (error) {
                console.log(`Error reading file content: ${relativePath}`, error);
              }
            } else {
              // File was deleted
              changedFiles.push({
                relativePath,
                path: relativePath,
                status: 'deleted',
                original: file.content
              });
            }
          }
        } else {
          // For regular snapshots, use the existing logic to scan all files
          let scanPattern: vscode.RelativePattern;
          let scanRoot: vscode.Uri;

          if (snapshot.snapshotScope) {
            switch (snapshot.snapshotScope.type) {
              case 'file':
                scanRoot = vscode.Uri.file(path.dirname(snapshot.snapshotScope.uri));
                scanPattern = new vscode.RelativePattern(
                  scanRoot.fsPath,
                  path.basename(snapshot.snapshotScope.uri)
                );
                break;
              case 'directory':
                scanRoot = vscode.Uri.file(snapshot.snapshotScope.uri);
                scanPattern = new vscode.RelativePattern(scanRoot.fsPath, '**/*');
                break;
              default:
                scanRoot = workspaceFolders[0].uri;
                scanPattern = new vscode.RelativePattern(scanRoot.fsPath, '**/*');
            }
          } else {
            scanRoot = workspaceFolders[0].uri;
            scanPattern = new vscode.RelativePattern(scanRoot.fsPath, '**/*');
          }

          const currentUris = await vscode.workspace.findFiles(
            scanPattern,
            '{**/node_modules/**,**/dist/**,**/.git/**,**/out/**}'
          );

          // Build map of current files with paths relative to scan root
          for (const uri of currentUris) {
            const relativePath = path.relative(scanRoot.fsPath, uri.fsPath);
            if (!this.shouldSkipFile(relativePath)) {
              try {
                const content = await this.readFileContent(uri);
                // For directory snapshots, we need to keep the paths relative to the snapshot directory
                const adjustedPath = snapshot.snapshotScope?.type === 'directory'
                  ? path.relative(snapshot.snapshotScope.uri, uri.fsPath)
                  : relativePath;
                currentFiles.set(adjustedPath, content);
              } catch (error) {
                console.log(`Skipping likely binary file: ${relativePath}`);
                continue;
              }
            }
          }

          // For directory snapshots, the paths in snapshot files are already relative to the snapshot directory
          const snapshotFiles = new Map(
            snapshot.files
              .filter(f => !this.shouldSkipFile(f.relativePath))
              .map(f => [f.relativePath, f])
          );

          let processedFiles = 0;
          const totalFiles = snapshotFiles.size + currentFiles.size;

          // Check for modified and deleted files
          for (const [relativePath, file] of snapshotFiles) {
            try {
              processedFiles++;
              progress.report({
                message: `Comparing files (${processedFiles}/${totalFiles})`,
                increment: (100 / totalFiles)
              });

              const currentContent = currentFiles.get(relativePath);
              if (currentContent === undefined) {
                // File was deleted
                changedFiles.push({
                  relativePath,
                  path: relativePath,
                  status: 'deleted',
                  original: file.content
                });
              } else if (currentContent !== file.content) {
                // File was modified
                changedFiles.push({
                  relativePath,
                  path: relativePath,
                  status: 'modified',
                  original: file.content,
                  modified: currentContent
                });
              }
              // Remove processed file from currentFiles map
              currentFiles.delete(relativePath);
            } catch (error) {
              console.log(`Skipping file due to error: ${relativePath}`, error);
              currentFiles.delete(relativePath);
              continue;
            }
          }

          // Remaining files in currentFiles are newly created
          for (const [relativePath, content] of currentFiles) {
            try {
              processedFiles++;
              progress.report({
                message: `Comparing files (${processedFiles}/${totalFiles})`,
                increment: (100 / totalFiles)
              });

              changedFiles.push({
                relativePath,
                path: relativePath,
                status: 'created',
                modified: content
              });
            } catch (error) {
              console.log(`Skipping new file due to error: ${relativePath}`, error);
              continue;
            }
          }
        }

        if (changedFiles.length === 0) {
          await this.notificationManager.showInformationMessage('No differences found in any files.');
          return;
        }

        progress.report({ message: 'Opening diff view...' });
        if (this.diffProvider) {
          await this.diffProvider.showDiff(changedFiles, snapshotName, timestamp);
        }
      } catch (error) {
        console.error('Failed to show diff:', error);
        await this.notificationManager.showErrorMessage('Failed to show diff view');
      }
    });
}

  async showTree(snapshotName: string, timestamp: number): Promise<void> {
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Preparing Tree View...',
        cancellable: false
    }, async (progress) => {
        const snapshots = this.getSnapshots();
        const snapshot = snapshots.find(s => s.name === snapshotName && s.timestamp === timestamp);

        if (!snapshot || !snapshot.files.length) {
            throw new Error('Snapshot not found or empty');
        }

        try {
            progress.report({ message: 'Building tree structure...' });
            if (this.treeProvider) {
                await this.treeProvider.showTree(snapshot.files, snapshotName, timestamp);
            }
        } catch (error) {
            console.error('Failed to show tree view:', error);
            await this.notificationManager.showErrorMessage('Failed to show tree view');
        }
    });
  }

  private async restoreFile(file: FileSnapshot): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        throw new Error('No workspace folder is open');
    }

    // Handle untitled files specially
    if (file.relativePath.startsWith('_untitled/')) {
        try {
            // For untitled files, we need to create a new untitled document
            const fileName = file.relativePath.replace('_untitled/', '');

            console.log(`Restoring untitled file: ${fileName}`);
            console.log(`Content length: ${file.content ? file.content.length : 0}`);
            console.log(`Content preview: ${file.content ? file.content.substring(0, 50) : 'EMPTY'}`);

            // Check if there's already an open untitled document with this name
            let existingDocument: vscode.TextDocument | undefined;
            for (const doc of vscode.workspace.textDocuments) {
                if (doc.uri.scheme === 'untitled' && path.basename(doc.fileName) === fileName) {
                    existingDocument = doc;
                    console.log(`Found existing untitled document: ${doc.fileName}`);
                    break;
                }
            }

            if (existingDocument) {
                // If the document exists, edit it
                console.log(`Editing existing untitled document with content length: ${file.content.length}`);
                const edit = new vscode.WorkspaceEdit();
                const fullRange = new vscode.Range(
                    existingDocument.lineAt(0).range.start,
                    existingDocument.lineAt(existingDocument.lineCount - 1).range.end
                );
                edit.replace(existingDocument.uri, fullRange, file.content);
                const success = await vscode.workspace.applyEdit(edit);
                console.log(`Edit applied successfully: ${success}`);
            } else {
                // Otherwise create a new untitled document
                console.log(`Creating new untitled document with content length: ${file.content.length}`);
                const untitledDoc = await vscode.workspace.openTextDocument({ content: file.content });
                await vscode.window.showTextDocument(untitledDoc);
                console.log(`New untitled document created: ${untitledDoc.fileName}, content length: ${untitledDoc.getText().length}`);
            }
        } catch (error) {
            console.error(`Failed to restore untitled file: ${file.relativePath}`, error);
            throw new Error(`Failed to restore untitled file: ${file.relativePath}`);
        }
        return;
    }

    // Handle regular files
    const fullPath = path.join(workspaceFolders[0].uri.fsPath, file.relativePath);
    try {
        // Ensure the directory exists
        const dirPath = path.dirname(fullPath);
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath));

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
                    await this.notificationManager.showInformationMessage('File snapshot skipped - no changes detected');
                    return;
                }
            }
        }

        try {
            progress.report({ message: 'Reading file content...' });

            // Handle untitled files specially
            let content: string;
            let relativePath: string;

            if (this.isUntitledFile(uri)) {
                // For untitled files, get the document directly
                const document = vscode.workspace.textDocuments.find(doc =>
                    doc.uri.toString() === uri.toString());

                if (!document) {
                    throw new Error('Could not find the untitled document');
                }

                content = document.getText();
                relativePath = this.getUntitledFilePath(document);
                console.log(`Taking snapshot of untitled file: ${relativePath}`);
            } else {
                // For regular files
                content = await this.readFileContent(uri);
                relativePath = this.getRelativePath(uri);
            }

            const fileName = this.isUntitledFile(uri) ?
                relativePath.replace('_untitled/', '') :
                path.basename(uri.fsPath);

            const timestamp = this.formatTimestamp();

            const snapshot: Snapshot = {
                name: `${fileName} - ${timestamp}`,
                timestamp: Date.now(),
                files: [{
                    content,
                    relativePath
                }],
                snapshotScope: {
                    type: 'file',
                    uri: uri.toString() // Store as string to preserve scheme
                }
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

  private getRelativePath(uri: vscode.Uri): string {
    // Special handling for untitled files
    if (this.isUntitledFile(uri)) {
        // Find the document for this untitled URI
        const document = vscode.workspace.textDocuments.find(doc =>
            doc.uri.toString() === uri.toString());

        if (document) {
            return this.getUntitledFilePath(document);
        } else {
            // Fallback if document not found
            return `_untitled/${path.basename(uri.path || 'untitled')}`;
        }
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return path.basename(uri.fsPath);
    }

    // Find the workspace folder that contains this file
    const workspaceFolder = workspaceFolders.find(folder =>
        uri.fsPath.startsWith(folder.uri.fsPath)
    );

    if (workspaceFolder) {
        return path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
    }

    return path.basename(uri.fsPath);
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

        const workspaceFolder = workspaceFolders.find(folder =>
            uri.fsPath.startsWith(folder.uri.fsPath)
        );

        if (!workspaceFolder) {
            throw new Error('Directory is not in the current workspace');
        }

        // Use the directory as the pattern root
        const pattern = new vscode.RelativePattern(uri.fsPath, '**/*');
        const uris = await vscode.workspace.findFiles(pattern);
        const totalFiles = uris.length;

        if (totalFiles === 0) {
            throw new Error('No files found in directory');
        }

        progress.report({ message: 'Scanning files...' });

        // Process files in batches, using the directory as the root for relative paths
        const files = await this.processFilesInBatches(
            uris,
            workspaceFolder,
            progress,
            totalFiles,
            uri.fsPath // Pass the directory path as the snapshot root
        );

        if (files.length === 0) {
            throw new Error('No files found to snapshot in this directory');
        }

        progress.report({ message: 'Saving snapshot...' });
        const dirName = path.basename(uri.fsPath);
        const timestamp = this.formatTimestamp();

        const snapshot: Snapshot = {
            name: `${dirName} - ${timestamp}`,
            timestamp: Date.now(),
            files,
            snapshotScope: {
                type: 'directory',
                uri: uri.fsPath
            }
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

  /**
   * Deletes all snapshots
   */
  public async deleteAllSnapshots(): Promise<boolean> {
    const snapshots = this.getSnapshots();
    if (snapshots.length === 0) {
      return false;
    }

    const confirmed = await this.showDeleteConfirmation('', true);
    if (!confirmed) {
      return false;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return false;
    }

    // Clear snapshots for each workspace folder
    for (const folder of workspaceFolders) {
      const key = `${this.WORKSPACE_SNAPSHOTS_KEY}-${folder.uri.fsPath}`;
      await this.context.globalState.update(key, []);
    }

    this.webviewProvider?.refreshList();
    await this.notificationManager.showInformationMessage('All snapshots have been deleted');
    return true;
  }

  /**
   * Renames a snapshot while ensuring the new name is unique
   * @param oldName Current name of the snapshot
   * @param timestamp Timestamp of the snapshot to rename
   * @param newName New name for the snapshot
   * @throws Error if a snapshot with the new name already exists
   */
  public async renameSnapshot(oldName: string, timestamp: number, newName: string): Promise<void> {
    if (!newName.trim()) {
      throw new Error('Snapshot name cannot be empty');
    }

    const snapshots = this.getSnapshots();
    const snapshotToRename = snapshots.find(s => s.name === oldName && s.timestamp === timestamp);

    if (!snapshotToRename) {
      throw new Error('Snapshot not found');
    }

    // Check if another snapshot (excluding the current one) has the same name
    const duplicateName = snapshots.some(s =>
      s.name === newName &&
      !(s.name === oldName && s.timestamp === timestamp)
    );

    if (duplicateName) {
      throw new Error('A snapshot with this name already exists');
    }

    // Update the snapshot name
    snapshotToRename.name = newName;
    await this.saveSnapshots(snapshots);

    // Refresh the webview to show the updated name
    this.webviewProvider?.refreshList();
  }

  public async createSnapshot(name?: string): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      await this.notificationManager.showErrorMessage('No workspace folder is open');
      return;
    }

    const workspaceFolder = workspaceFolders[0].uri.fsPath;
    const files: FileSnapshot[] = [];
    const timestamp = Date.now();

    const snapshot: Snapshot = {
      name: name || this.formatTimestamp(),
      timestamp,
      files,
      workspaceFolder,
      snapshotScope: {
      type: 'workspace',
      uri: workspaceFolder
      }
    };

    const snapshots = this.getSnapshots();
    snapshots.push(snapshot);
    await this.saveSnapshots(snapshots);
  }

  private async loadGitignore(workspaceFolder: string): Promise<ReturnType<typeof ignore> | undefined> {
    // Check if we have a cached instance
    if (this.gitignoreCache.has(workspaceFolder)) {
      return this.gitignoreCache.get(workspaceFolder);
    }

    try {
      const gitignorePath = path.join(workspaceFolder, '.gitignore');
      const gitignoreUri = vscode.Uri.file(gitignorePath);

      try {
        await vscode.workspace.fs.stat(gitignoreUri);
      } catch {
        // No .gitignore file found
        return undefined;
      }

      const gitignoreContent = await vscode.workspace.fs.readFile(gitignoreUri);
      const ig = ignore().add(gitignoreContent.toString());
      this.gitignoreCache.set(workspaceFolder, ig);
      return ig;
    } catch (error) {
      console.error('Error loading .gitignore:', error);
      return undefined;
    }
  }

  private getCustomIgnorePatterns(): string[] {
    const config = vscode.workspace.getConfiguration('localSnapshots');
    const patterns = config.get<(string | { pattern: string, fromGitignore?: boolean })[]>('customIgnorePatterns', []);

    // Convert any object patterns to strings
    return patterns.map(pattern => {
      if (typeof pattern === 'string') {
        return pattern;
      } else if (pattern && typeof pattern === 'object' && pattern.pattern) {
        return pattern.pattern;
      }
      return '';
    }).filter(pattern => pattern !== '');
  }

  private shouldRespectGitignore(): boolean {
    const config = vscode.workspace.getConfiguration('localSnapshots');
    return config.get<boolean>('respectGitignore', true);
  }
}
