import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class IgnorePatternsWebviewProvider {
    private panel?: vscode.WebviewPanel;
    private readonly extensionUri: vscode.Uri;
    private gitignoreWatcher?: vscode.FileSystemWatcher;
    private disposables: vscode.Disposable[] = [];
    private syncedGitignorePatterns: Set<string> = new Set();

    constructor(extensionUri: vscode.Uri) {
        this.extensionUri = extensionUri;
        this.setupGitignoreWatcher();
    }

    private setupGitignoreWatcher() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        // Create a file system watcher for .gitignore files
        this.gitignoreWatcher = vscode.workspace.createFileSystemWatcher('**/.gitignore');

        // Watch for .gitignore changes
        this.gitignoreWatcher.onDidChange(uri => this.handleGitignoreChange(uri));
        this.gitignoreWatcher.onDidCreate(uri => this.handleGitignoreChange(uri));
        this.gitignoreWatcher.onDidDelete(uri => this.handleGitignoreDelete(uri));

        this.disposables.push(this.gitignoreWatcher);

        // Initial load of .gitignore patterns
        this.loadAllGitignorePatterns();
    }

    private async loadAllGitignorePatterns() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        for (const folder of workspaceFolders) {
            const gitignorePath = path.join(folder.uri.fsPath, '.gitignore');
            try {
                await this.handleGitignoreChange(vscode.Uri.file(gitignorePath));
            } catch (error) {
                console.log(`No .gitignore found in ${folder.name}`);
            }
        }
    }

    private async handleGitignoreChange(uri: vscode.Uri) {
        try {
            const content = await fs.promises.readFile(uri.fsPath, 'utf8');
            const patterns = this.parseGitignorePatterns(content);
            await this.syncGitignorePatterns(patterns, uri);
        } catch (error) {
            console.error('Error handling .gitignore change:', error);
        }
    }

    private async handleGitignoreDelete(uri: vscode.Uri) {
        // Remove all patterns that were added from this .gitignore
        const config = vscode.workspace.getConfiguration('localSnapshots');
        const currentPatterns = config.get<string[]>('customIgnorePatterns', []);

        const updatedPatterns = currentPatterns.filter(pattern => !this.syncedGitignorePatterns.has(pattern));
        this.syncedGitignorePatterns.clear();

        await config.update(
            'customIgnorePatterns',
            updatedPatterns,
            vscode.ConfigurationTarget.Global
        );

        if (this.panel) {
            this.sendCurrentPatterns();
        }
    }

    private parseGitignorePatterns(content: string): string[] {
        return content
            .split('\n')
            .map(line => line.trim())
            .filter(line =>
                line &&
                !line.startsWith('#') &&
                !line.startsWith('!') && // Exclude negation patterns
                !line.startsWith('/') // Exclude root-specific patterns
            );
    }

    private async syncGitignorePatterns(newPatterns: string[], gitignoreUri: vscode.Uri) {
        const config = vscode.workspace.getConfiguration('localSnapshots');
        const currentPatterns = config.get<(string | { pattern: string, fromGitignore: boolean })[]>('customIgnorePatterns', []);

        // Remove old synced patterns - both string patterns and object patterns with fromGitignore=true
        const manualPatterns = currentPatterns.filter(pattern => {
            if (typeof pattern === 'string') {
                return !this.syncedGitignorePatterns.has(pattern);
            } else if (typeof pattern === 'object' && pattern !== null) {
                return !pattern.fromGitignore;
            }
            return true;
        });

        // Update the set of synced patterns
        this.syncedGitignorePatterns = new Set(newPatterns);

        // Convert gitignore patterns to objects with fromGitignore flag
        const gitignorePatternObjects = newPatterns.map(pattern => ({
            pattern,
            fromGitignore: true
        }));

        // Combine manual patterns with new gitignore patterns
        const updatedPatterns = [...manualPatterns, ...gitignorePatternObjects];

        await config.update(
            'customIgnorePatterns',
            updatedPatterns,
            vscode.ConfigurationTarget.Global
        );

        if (this.panel) {
            this.sendCurrentPatterns();
        }
    }

    public dispose() {
        this.gitignoreWatcher?.dispose();
        this.disposables.forEach(d => d.dispose());
    }

    public async show() {
        const columnToShowIn = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (this.panel) {
            this.panel.reveal(columnToShowIn);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'ignorePatterns',
            'Manage Ignore Patterns',
            columnToShowIn || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    this.extensionUri
                ],
                retainContextWhenHidden: true
            }
        );

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        this.panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'addPattern':
                    await this.addPattern(message.pattern);
                    break;
                case 'removePattern':
                    await this.removePattern(message.pattern);
                    break;
                case 'addWorkspaceItem':
                    await this.addWorkspaceItem(message.path);
                    break;
                case 'getWorkspaceFiles':
                    await this.sendWorkspaceFiles();
                    break;
                case 'getCurrentPatterns':
                    await this.sendCurrentPatterns();
                    break;
            }
        });

        this.panel.webview.html = await this.getWebviewContent();
    }

    private async getWebviewContent(): Promise<string> {
        const scriptUri = this.panel!.webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'ignorePatterns.js')
        );
        const styleUri = this.panel!.webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'ignorePatterns.css')
        );
        const codiconsUri = this.panel!.webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'codicons', 'codicon.css')
        );
        const nonce = this.getNonce();

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel!.webview.cspSource}; font-src ${this.panel!.webview.cspSource}; script-src 'nonce-${nonce}';">
            <link href="${styleUri}" rel="stylesheet">
            <link href="${codiconsUri}" rel="stylesheet">
            <title>Manage Ignore Patterns</title>
        </head>
        <body>
            <div class="container">
                <div class="patterns-section">
                    <h2>Current Ignore Patterns</h2>
                    <div class="search-box">
                        <span class="codicon codicon-search"></span>
                        <input type="text" id="patternSearch" placeholder="Search patterns...">
                    </div>
                    <div class="scroll-container">
                        <div class="pattern-list" id="patternList"></div>
                    </div>
                    <div class="add-pattern">
                        <input type="text" id="newPattern" placeholder="Enter a pattern (e.g., *.log or temp/**)">
                        <button id="addPattern">
                            <span class="codicon codicon-add"></span>
                            Add Pattern
                        </button>
                    </div>
                </div>

                <div class="workspace-section">
                    <h2>Workspace Files and Folders</h2>
                    <div class="search-box">
                        <span class="codicon codicon-search"></span>
                        <input type="text" id="workspaceSearch" placeholder="Search files and folders...">
                    </div>
                    <div class="scroll-container">
                        <div class="workspace-tree" id="workspaceTree"></div>
                    </div>
                </div>
            </div>
            <script nonce="${nonce}" src="${scriptUri}"></script>
        </body>
        </html>`;
    }

    private async addPattern(pattern: string) {
        const config = vscode.workspace.getConfiguration('localSnapshots');
        const currentPatterns = config.get<string[]>('customIgnorePatterns', []);

        if (!currentPatterns.includes(pattern)) {
            await config.update(
                'customIgnorePatterns',
                [...currentPatterns, pattern],
                vscode.ConfigurationTarget.Global
            );
            await this.sendCurrentPatterns();
        }
    }

    private async removePattern(pattern: string) {
        const config = vscode.workspace.getConfiguration('localSnapshots');
        const currentPatterns = config.get<string[]>('customIgnorePatterns', []);

        await config.update(
            'customIgnorePatterns',
            currentPatterns.filter(p => p !== pattern),
            vscode.ConfigurationTarget.Global
        );
        await this.sendCurrentPatterns();
    }

    private async addWorkspaceItem(itemPath: string) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        const workspaceFolder = workspaceFolders[0];
        const relativePath = path.relative(workspaceFolder.uri.fsPath, itemPath);
        const pattern = relativePath.replace(/\\/g, '/');

        await this.addPattern(pattern);
    }

    private async sendWorkspaceFiles() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || !this.panel) return;

        // Get all files, excluding node_modules and .git
        const files = await vscode.workspace.findFiles(
            '**/*',
            '{**/node_modules/**,**/.git/**}'
        );

        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        const workspaceItems = files.map(file => ({
            path: file.fsPath,
            relativePath: path.relative(workspaceRoot, file.fsPath).replace(/\\/g, '/'),
            type: 'file'
        }));

        // Build a set of all folders
        const folders = new Set<string>();
        workspaceItems.forEach(item => {
            let dir = path.dirname(item.relativePath);
            while (dir && dir !== '.') {
                folders.add(dir);
                dir = path.dirname(dir);
            }
        });

        const allItems = [
            ...Array.from(folders).map(folder => ({
                path: path.join(workspaceRoot, folder),
                relativePath: folder,
                type: 'folder'
            })),
            ...workspaceItems
        ].sort((a, b) => {
            // Sort folders first, then by path
            if (a.type !== b.type) {
                return a.type === 'folder' ? -1 : 1;
            }
            return a.relativePath.localeCompare(b.relativePath);
        });

        this.panel.webview.postMessage({
            command: 'workspaceFiles',
            items: allItems
        });
    }

    private async sendCurrentPatterns() {
        if (!this.panel) return;

        const config = vscode.workspace.getConfiguration('localSnapshots');
        const patterns = config.get<(string | { pattern: string, fromGitignore: boolean })[]>('customIgnorePatterns', []);

        console.log('Current patterns from config:', JSON.stringify(patterns, null, 2));
        console.log('Synced gitignore patterns:', Array.from(this.syncedGitignorePatterns));

        // Convert patterns to objects with source information
        const patternsWithSource = patterns.map(pattern => {
            // If it's already an object with fromGitignore, use that
            if (typeof pattern === 'object' && pattern !== null && pattern.fromGitignore) {
                console.log(`Pattern is already marked as fromGitignore:`, pattern);
                return pattern;
            }

            // If it's a string, check if it's in our synced gitignore patterns
            const patternStr = typeof pattern === 'string' ? pattern : pattern.pattern;
            const isFromGitignore = this.syncedGitignorePatterns.has(patternStr);

            console.log(`Pattern: ${patternStr}, isFromGitignore: ${isFromGitignore}`);

            return {
                pattern: patternStr,
                fromGitignore: isFromGitignore
            };
        });

        console.log('Patterns with source:', JSON.stringify(patternsWithSource, null, 2));

        this.panel.webview.postMessage({
            command: 'currentPatterns',
            patterns: patternsWithSource
        });
    }

    private getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}