import * as vscode from 'vscode';
import { ApiServer } from '../api/server';
import { MCPServer } from '../mcp/server';
import { SnapshotManager } from '../managers/SnapshotManager';
import { DEFAULT_PORTS } from '../utils/portUtils';

// Define types for status bar update functions
type StatusBarUpdateFunction = (isEnabled: boolean, port?: number) => void;

export class SettingsWebviewProvider {
    private panel: vscode.WebviewPanel | undefined;
    private readonly extensionUri: vscode.Uri;

    private snapshotManager: SnapshotManager;
    private apiServer: ApiServer | undefined;
    private mcpServer: MCPServer | undefined;
    private updateApiStatusBar: StatusBarUpdateFunction;
    private updateMcpStatusBar: StatusBarUpdateFunction;

    constructor(
        extensionUri: vscode.Uri,
        snapshotManager: SnapshotManager,
        updateApiStatusBar: StatusBarUpdateFunction,
        updateMcpStatusBar: StatusBarUpdateFunction
    ) {
        this.extensionUri = extensionUri;
        this.snapshotManager = snapshotManager;
        this.updateApiStatusBar = updateApiStatusBar;
        this.updateMcpStatusBar = updateMcpStatusBar;

        // Initialize servers based on current settings
        this.initializeServers();
    }

    /**
     * Initialize servers based on current settings
     */
    private async initializeServers() {
        const config = vscode.workspace.getConfiguration('localSnapshots');
        const apiEnabled = config.get<boolean>('enableApiServer', false);
        const mcpEnabled = config.get<boolean>('enableMcpServer', false);

        console.log(`[SettingsProvider] Initializing servers - API: ${apiEnabled}, MCP: ${mcpEnabled}`);

        // Initialize API server if enabled
        if (apiEnabled) {
            try {
                console.log(`[SettingsProvider] Initializing API server`);
                // Send initial status update - server is starting
                await this.sendApiServerStatusUpdate(true);

                this.apiServer = new ApiServer(this.snapshotManager);
                const actualPort = await this.apiServer.start();
                this.updateApiStatusBar(true, actualPort);
                console.log(`[SettingsProvider] API server initialized successfully on port ${actualPort}`);

                // Send status update with the actual port
                await this.sendApiServerStatusUpdate(true, actualPort);
            } catch (error) {
                console.error(`[SettingsProvider] Failed to initialize API server:`, error);
                // Update the setting to false if server failed to start
                await config.update('enableApiServer', false, vscode.ConfigurationTarget.Global);
                this.updateApiStatusBar(false);

                // Send status update - server failed to start
                await this.sendApiServerStatusUpdate(false);
            }
        } else {
            // Update status bar to show server is disabled
            this.updateApiStatusBar(false);

            // Send status update - server is disabled
            await this.sendApiServerStatusUpdate(false);
        }

        // Initialize MCP server if enabled
        if (mcpEnabled) {
            try {
                console.log(`[SettingsProvider] Initializing MCP server`);
                // Send initial status update - server is starting
                await this.sendMcpServerStatusUpdate(true);

                this.mcpServer = new MCPServer(this.snapshotManager);
                const actualPort = await this.mcpServer.start();
                this.updateMcpStatusBar(true, actualPort);
                console.log(`[SettingsProvider] MCP server initialized successfully on port ${actualPort}`);

                // Send status update with the actual port
                await this.sendMcpServerStatusUpdate(true, actualPort);
            } catch (error) {
                console.error(`[SettingsProvider] Failed to initialize MCP server:`, error);
                // Update the setting to false if server failed to start
                await config.update('enableMcpServer', false, vscode.ConfigurationTarget.Global);
                this.updateMcpStatusBar(false);

                // Send status update - server failed to start
                await this.sendMcpServerStatusUpdate(false);
            }
        } else {
            // Update status bar to show server is disabled
            this.updateMcpStatusBar(false);

            // Send status update - server is disabled
            await this.sendMcpServerStatusUpdate(false);
        }
    }

    public async show() {
        // If we already have a panel, show it
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            return;
        }

        // Otherwise, create a new panel
        this.panel = vscode.window.createWebviewPanel(
            'localSnapshotsSettings',
            'Local Snapshots Settings',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [this.extensionUri],
                retainContextWhenHidden: true
            }
        );

        // Set the webview's HTML content
        this.panel.webview.html = await this.getWebviewContent(this.panel.webview);

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'getSettings':
                    await this.sendSettingsToWebview();
                    break;
                case 'updateSetting':
                    await this.updateSetting(message.key, message.value, message.target);
                    break;
                case 'resetSetting':
                    await this.resetSetting(message.key);
                    break;
                case 'resetAllSettings':
                    await this.resetAllSettings();
                    break;
            }
        });

        // Clean up resources when the panel is closed
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        // Send settings to the webview
        await this.sendSettingsToWebview();
    }

    /**
     * Send API server status update to the webview
     * @param isRunning Whether the server is running
     * @param port The port the server is running on (if running)
     */
    private async sendApiServerStatusUpdate(isRunning: boolean, port?: number) {
        if (!this.panel) {
            return;
        }

        await this.panel.webview.postMessage({
            command: 'serverStatusUpdate',
            serverType: 'api',
            isRunning,
            port
        });
    }

    /**
     * Send MCP server status update to the webview
     * @param isRunning Whether the server is running
     * @param port The port the server is running on (if running)
     */
    private async sendMcpServerStatusUpdate(isRunning: boolean, port?: number) {
        if (!this.panel) {
            return;
        }

        await this.panel.webview.postMessage({
            command: 'serverStatusUpdate',
            serverType: 'mcp',
            isRunning,
            port
        });
    }

    private async sendSettingsToWebview() {
        if (!this.panel) {
            return;
        }

        const config = vscode.workspace.getConfiguration('localSnapshots');
        const settingsData: Record<string, any> = {};
        const metadata = this.getSettingsMetadata();

        // Get all settings with their metadata
        for (const key of Object.keys(metadata)) {
            settingsData[key] = {
                value: config.get(key),
                ...metadata[key]
            };
        }

        // Get the actual ports being used from the server instances
        const apiSessionPort = this.apiServer?.getPort();
        const mcpSessionPort = this.mcpServer?.getPort();

        // Send settings to webview
        await this.panel.webview.postMessage({
            command: 'settingsLoaded',
            settingsData,
            apiSessionPort,
            mcpSessionPort
        });
    }

    // Flag to track if we're currently updating a server setting
    public isUpdatingServerSetting = false;

    private async updateSetting(key: string, value: any, target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global) {
        const config = vscode.workspace.getConfiguration('localSnapshots');
        console.log(`[SettingsProvider] Updating setting ${key} to ${value}`);

        try {
            // Special handling for customIgnorePatterns to filter out empty strings
            if (key === 'customIgnorePatterns' && Array.isArray(value)) {
                // Filter out empty strings
                value = value.filter(item => {
                    if (typeof item === 'string') {
                        return item.trim() !== '';
                    } else if (typeof item === 'object' && item !== null && item.pattern) {
                        return item.pattern.trim() !== '';
                    }
                    return true;
                });
            }

            // Special handling for API server
            if (key === 'enableApiServer') {
                if (value === true) {
                    // Enabling API server
                    console.log(`[SettingsProvider] Directly enabling API server`);

                    // Set flag to prevent race conditions
                    this.isUpdatingServerSetting = true;

                    try {
                        // Stop existing server if it's running
                        if (this.apiServer) {
                            console.log('[SettingsProvider] Stopping existing API server');
                            this.apiServer.stop();
                            this.apiServer = undefined;
                        }

                        // Send initial status update - server is starting
                        await this.sendApiServerStatusUpdate(true);

                        // Create and start the server
                        console.log(`[SettingsProvider] Creating new API server`);
                        this.apiServer = new ApiServer(this.snapshotManager);
                        const actualPort = await this.apiServer.start();

                        // Update the setting
                        await config.update(key, true, target);

                        // Server started successfully
                        console.log(`[SettingsProvider] API server started successfully on port ${actualPort}`);

                        // Update status bar
                        this.updateApiStatusBar(true, actualPort);

                        // Send status update with the actual port
                        await this.sendApiServerStatusUpdate(true, actualPort);

                        if (this.panel) {
                            await this.panel.webview.postMessage({
                                command: 'settingUpdated',
                                key,
                                value: true,
                                success: true
                            });
                        }
                    } catch (error) {
                        // Server failed to start
                        console.error(`[SettingsProvider] Failed to start API server:`, error);

                        // Update the setting to false
                        await config.update(key, false, target);

                        // Send error message to webview
                        if (this.panel) {
                            await this.panel.webview.postMessage({
                                command: 'settingUpdated',
                                key,
                                value: false,
                                success: false,
                                error: error instanceof Error ? error.message : 'Unknown error'
                            });
                        }
                    } finally {
                        // Clear the flag
                        this.isUpdatingServerSetting = false;
                    }
                } else {
                    // Disabling API server
                    console.log(`[SettingsProvider] Disabling API server`);

                    // Stop the server
                    if (this.apiServer) {
                        console.log('[SettingsProvider] Stopping API server');
                        this.apiServer.stop();
                        this.apiServer = undefined;
                    }

                    // Update the setting
                    await config.update(key, false, target);

                    // Update status bar
                    this.updateApiStatusBar(false);

                    // Send status update - server is disabled
                    await this.sendApiServerStatusUpdate(false);

                    // Send success message to webview
                    if (this.panel) {
                        await this.panel.webview.postMessage({
                            command: 'settingUpdated',
                            key,
                            value: false,
                            success: true
                        });
                    }
                }
            }
            // Special handling for MCP server
            else if (key === 'enableMcpServer') {
                if (value === true) {
                    // Enabling MCP server
                    console.log(`[SettingsProvider] Directly enabling MCP server`);

                    // Set flag to prevent race conditions
                    this.isUpdatingServerSetting = true;

                    try {
                        // Stop existing server if it's running
                        if (this.mcpServer) {
                            console.log('[SettingsProvider] Stopping existing MCP server');
                            this.mcpServer.stop();
                            this.mcpServer = undefined;
                        }

                        // Send initial status update - server is starting
                        await this.sendMcpServerStatusUpdate(true);

                        // Create and start the server
                        console.log(`[SettingsProvider] Creating new MCP server`);
                        this.mcpServer = new MCPServer(this.snapshotManager);
                        const actualPort = await this.mcpServer.start();

                        // Update the setting
                        await config.update(key, true, target);

                        // Server started successfully
                        console.log(`[SettingsProvider] MCP server started successfully on port ${actualPort}`);

                        // Update status bar
                        this.updateMcpStatusBar(true, actualPort);

                        // Send status update with the actual port
                        await this.sendMcpServerStatusUpdate(true, actualPort);

                        if (this.panel) {
                            await this.panel.webview.postMessage({
                                command: 'settingUpdated',
                                key,
                                value: true,
                                success: true
                            });
                        }
                    } catch (error) {
                        // Server failed to start
                        console.error(`[SettingsProvider] Failed to start MCP server:`, error);

                        // Update the setting to false
                        await config.update(key, false, target);

                        // Send error message to webview
                        if (this.panel) {
                            await this.panel.webview.postMessage({
                                command: 'settingUpdated',
                                key,
                                value: false,
                                success: false,
                                error: error instanceof Error ? error.message : 'Unknown error'
                            });
                        }
                    } finally {
                        // Clear the flag
                        this.isUpdatingServerSetting = false;
                    }
                } else {
                    // Disabling MCP server
                    console.log(`[SettingsProvider] Disabling MCP server`);

                    // Stop the server
                    if (this.mcpServer) {
                        console.log('[SettingsProvider] Stopping MCP server');
                        this.mcpServer.stop();
                        this.mcpServer = undefined;
                    }

                    // Update the setting
                    await config.update(key, false, target);

                    // Update status bar
                    this.updateMcpStatusBar(false);

                    // Send status update - server is disabled
                    await this.sendMcpServerStatusUpdate(false);

                    // Send success message to webview
                    if (this.panel) {
                        await this.panel.webview.postMessage({
                            command: 'settingUpdated',
                            key,
                            value: false,
                            success: true
                        });
                    }
                }
            }
            // Normal setting update
            else {
                console.log(`[SettingsProvider] Performing normal setting update`);
                await config.update(key, value, target);
                if (this.panel) {
                    console.log(`[SettingsProvider] Sending success message to webview`);
                    await this.panel.webview.postMessage({
                        command: 'settingUpdated',
                        key,
                        value,
                        success: true
                    });
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorStack = error instanceof Error ? error.stack : 'No stack trace';
            console.error(`[SettingsProvider] Failed to update setting ${key}:`, errorMessage);
            console.error(`[SettingsProvider] Error stack:`, errorStack);

            if (this.panel) {
                console.log(`[SettingsProvider] Sending error message to webview`);
                await this.panel.webview.postMessage({
                    command: 'settingUpdated',
                    key,
                    success: false,
                    error: errorMessage
                });
            }
        }
    }

    private async resetSetting(key: string) {
        const config = vscode.workspace.getConfiguration('localSnapshots');
        await config.update(key, undefined, vscode.ConfigurationTarget.Global);
        await this.sendSettingsToWebview();
    }

    private async resetAllSettings() {
        const config = vscode.workspace.getConfiguration('localSnapshots');

        for (const key of Object.keys(this.getSettingsMetadata())) {
            await config.update(key, undefined, vscode.ConfigurationTarget.Global);
        }

        await this.sendSettingsToWebview();
    }

    private getSettingsMetadata(): Record<string, { type: string; default: any; description: string; category: string; dependsOn?: string; minimum?: number; maximum?: number; enum?: string[] }> {
        // This returns metadata about all settings to help with UI generation
        return {
            // General Settings
            'enablePreSaveSnapshots': {
                type: 'boolean',
                default: false,
                description: 'Automatically create snapshots before saving files',
                category: 'General'
            },
            'enableTimedSnapshots': {
                type: 'boolean',
                default: false,
                description: 'Automatically create snapshots at regular intervals',
                category: 'General'
            },
            'timedSnapshotInterval': {
                type: 'number',
                default: 300,
                minimum: 30,
                description: 'Interval in seconds between automatic snapshots (minimum 30 seconds)',
                category: 'General',
                dependsOn: 'enableTimedSnapshots'
            },
            'showTimedSnapshotNotifications': {
                type: 'boolean',
                default: true,
                description: 'Show notifications when timed snapshots are created',
                category: 'General',
                dependsOn: 'enableTimedSnapshots'
            },
            'enableDeleteProtection': {
                type: 'boolean',
                default: true,
                description: 'Show confirmation dialog when deleting snapshots',
                category: 'General'
            },
            'quietMode': {
                type: 'boolean',
                default: false,
                description: 'Reduce the number of notifications shown. Only critical notifications will be displayed.',
                category: 'General'
            },

            // Storage Management
            'limitSnapshotCount': {
                type: 'boolean',
                default: false,
                description: 'Enable maximum snapshot limit',
                category: 'Storage'
            },
            'maxSnapshotCount': {
                type: 'number',
                default: 10,
                minimum: 1,
                description: 'Maximum number of snapshots to keep',
                category: 'Storage',
                dependsOn: 'limitSnapshotCount'
            },
            'respectGitignore': {
                type: 'boolean',
                default: true,
                description: 'Use .gitignore patterns to exclude files from snapshots',
                category: 'Storage'
            },
            'customIgnorePatterns': {
                type: 'array',
                default: [],
                description: 'Custom glob patterns to exclude files from snapshots',
                category: 'Storage'
            },

            // Performance Settings
            'batchSize': {
                type: 'number',
                default: 50,
                minimum: 1,
                description: 'Number of files to process in each batch',
                category: 'Performance'
            },
            'batchDelay': {
                type: 'number',
                default: 10,
                minimum: 0,
                description: 'Delay in milliseconds between processing batches',
                category: 'Performance'
            },
            'maxParallelBatches': {
                type: 'number',
                default: 1,
                minimum: 1,
                maximum: 10,
                description: 'Maximum number of batches to process in parallel',
                category: 'Performance'
            },

            // Display Settings
            'diffViewStyle': {
                type: 'string',
                enum: ['side-by-side', 'inline', 'both'],
                default: 'side-by-side',
                description: 'Choose how to display file differences',
                category: 'Display'
            },

            // API Server Settings
            'enableApiServer': {
                type: 'boolean',
                default: false,
                description: 'Enable the REST API server',
                category: 'API Server'
            },

            // MCP Server Settings
            'enableMcpServer': {
                type: 'boolean',
                default: false,
                description: 'Enable the MCP SSE server',
                category: 'MCP Server'
            }
        };
    }

    private async getWebviewContent(webview: vscode.Webview): Promise<string> {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'settings.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'settings.css')
        );
        const codiconsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'codicons', 'codicon.css')
        );
        const codiconsFontUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'codicons', 'codicon.ttf')
        );

        const nonce = this.getNonce();

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
            <style>
                @font-face {
                    font-family: "codicon";
                    src: url("${codiconsFontUri}") format("truetype");
                }
            </style>
            <link href="${styleUri}" rel="stylesheet">
            <link href="${codiconsUri}" rel="stylesheet">
            <title>Local Snapshots Settings</title>
        </head>
        <body>
            <div class="settings-container">
                <header class="settings-header">
                    <h1>
                        <span class="codicon codicon-settings-gear"></span>
                        Local Snapshots Settings
                    </h1>
                    <div class="header-actions">
                        <div class="search-container">
                            <div class="search-input-container">
                                <span class="codicon codicon-search"></span>
                                <input type="text" id="settings-search" class="search-input" placeholder="Search settings...">
                                <button id="clear-search" class="clear-search" title="Clear search">
                                    <span class="codicon codicon-close"></span>
                                </button>
                            </div>
                        </div>
                        <button id="resetAllBtn" class="action-button" title="Reset All Settings">
                            <span class="codicon codicon-discard"></span>
                            Reset All
                        </button>
                    </div>
                </header>

                <div class="settings-content">
                    <div class="settings-sidebar">
                        <ul class="settings-tabs">
                            <li class="settings-tab active" data-category="General">
                                <span class="codicon codicon-settings"></span>
                                General
                            </li>
                            <li class="settings-tab" data-category="Storage">
                                <span class="codicon codicon-database"></span>
                                Storage
                            </li>
                            <li class="settings-tab" data-category="Performance">
                                <span class="codicon codicon-dashboard"></span>
                                Performance
                            </li>
                            <li class="settings-tab" data-category="Display">
                                <span class="codicon codicon-eye"></span>
                                Display
                            </li>
                            <li class="settings-tab" data-category="API Server">
                                <span class="codicon codicon-server"></span>
                                API Server
                            </li>
                            <li class="settings-tab" data-category="MCP Server">
                                <span class="codicon codicon-radio-tower"></span>
                                MCP Server
                            </li>
                        </ul>
                    </div>

                    <div class="settings-panels">
                        <div id="loading" class="settings-loading">
                            <span class="codicon codicon-loading codicon-modifier-spin"></span>
                            Loading settings...
                        </div>

                        <div id="General" class="settings-panel active"></div>
                        <div id="Storage" class="settings-panel"></div>
                        <div id="Performance" class="settings-panel"></div>
                        <div id="Display" class="settings-panel"></div>
                        <div id="API Server" class="settings-panel"></div>
                        <div id="MCP Server" class="settings-panel"></div>
                    </div>
                </div>
            </div>

            <script nonce="${nonce}" src="${scriptUri}"></script>
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

    public dispose() {
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }

        // Stop servers if they're running
        if (this.apiServer) {
            console.log('[SettingsProvider] Stopping API server on dispose');
            this.apiServer.stop();
            this.apiServer = undefined;
        }

        if (this.mcpServer) {
            console.log('[SettingsProvider] Stopping MCP server on dispose');
            this.mcpServer.stop();
            this.mcpServer = undefined;
        }
    }
}
