import * as vscode from 'vscode';
import { SnapshotManager } from './managers/SnapshotManager';
import { SnapshotWebviewProvider } from './views/SnapshotWebviewProvider';
import { registerSnapshotCommands } from './commands/snapshotCommands';
import { IgnorePatternsWebviewProvider } from './views/IgnorePatternsWebviewProvider';
import { SettingsWebviewProvider } from './views/SettingsWebviewProvider';
import { ApiServer } from './api/server';
import { MCPServer } from './mcp/server';
import { registerMCPTools } from './mcp/mcpTools';
import { NotificationManager } from './utils/NotificationManager';
import { Logger } from './utils/Logger';
import path from 'path';

export function activate(context: vscode.ExtensionContext) {
	// Initialize logger
	const logger = Logger.getInstance();
	logger.info('==============================================');
	logger.info('Local Snapshots extension is now active!');
	logger.info('==============================================');

	// Add logger to extension subscriptions so it can be disposed
	context.subscriptions.push({
		dispose: () => {
			logger.info('Disposing logger', 'Extension');
			logger.dispose();
		}
	});

	// Initialize the notification manager and ensure it's properly set up
	const notificationManager = NotificationManager.getInstance();

	// Test notification to verify the notification system is working
	setTimeout(async () => {
		try {
			logger.info('Sending test notification to verify notification system', 'Extension');
			await notificationManager.showInformationMessage('Local Snapshots extension is ready', undefined, false);
		} catch (error) {
			logger.error('Error sending test notification', 'Extension', error);
		}
	}, 3000);
	const snapshotManager = new SnapshotManager(context);
	let apiServer: ApiServer | undefined;
	let mcpServer: MCPServer | undefined;

	// Create status bar items for API and MCP servers
	const apiStatusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Right,
		100
	);
	apiStatusBarItem.command = 'local-snapshots.openSettings';
	context.subscriptions.push(apiStatusBarItem);

	const mcpStatusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Right,
		99
	);
	mcpStatusBarItem.command = 'local-snapshots.openSettings';
	context.subscriptions.push(mcpStatusBarItem);

	function updateApiStatusBar(isEnabled: boolean, port?: number) {
		if (isEnabled && port) {
			apiStatusBarItem.text = `$(radio-tower) API: ${port}`;
			apiStatusBarItem.tooltip = `Local Snapshots API running on port ${port}. Click to change settings.`;
			apiStatusBarItem.show();
		} else {
			apiStatusBarItem.text = `$(radio-tower) API: Off`;
			apiStatusBarItem.tooltip = 'Local Snapshots API is disabled. Click to change settings.';
			apiStatusBarItem.show();
		}
	}

	function updateMcpStatusBar(isEnabled: boolean, port?: number) {
		if (isEnabled && port) {
			mcpStatusBarItem.text = `$(plug) MCP: ${port}`;
			mcpStatusBarItem.tooltip = `Local Snapshots MCP server running on port ${port}. Click to change settings.`;
			mcpStatusBarItem.show();
		} else {
			mcpStatusBarItem.text = `$(plug) MCP: Off`;
			mcpStatusBarItem.tooltip = 'Local Snapshots MCP server is disabled. Click to change settings.';
			mcpStatusBarItem.show();
		}
	}

	// Register the settings provider
	const settingsProvider = new SettingsWebviewProvider(
		context.extensionUri,
		snapshotManager,
		updateApiStatusBar,
		updateMcpStatusBar
	);

	// Function to manage API server state
	async function updateApiServer() {
		const config = vscode.workspace.getConfiguration('localSnapshots');
		const isEnabled = config.get<boolean>('enableApiServer', false);

		logger.info(`updateApiServer called - isEnabled: ${isEnabled}`, 'Extension');

		// Skip if the settings provider is currently updating this setting
		if (settingsProvider.isUpdatingServerSetting) {
			logger.info('Skipping API server update because settings provider is updating a server setting', 'Extension');
			return;
		}

		// Stop existing server if it's running
		if (apiServer) {
			logger.info('Stopping existing API server', 'Extension');
			apiServer.stop();
			apiServer = undefined;
		}

		// Update status bar initially
		updateApiStatusBar(isEnabled, undefined);

		// Start new server if enabled
		if (isEnabled) {
			logger.info('API server is enabled, attempting to start', 'Extension');
			try {
				logger.info('Creating new ApiServer instance', 'Extension');
				apiServer = new ApiServer(snapshotManager);

				logger.info('Calling apiServer.start()', 'Extension');
				const actualPort = await apiServer.start();

				// Update status bar with actual port
				updateApiStatusBar(true, actualPort);

				logger.info(`API server successfully started on port ${actualPort}`, 'Extension');
				logger.info(`API server object: ${apiServer ? 'Created successfully' : 'Failed to create'}`, 'Extension');
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				const errorStack = error instanceof Error ? error.stack : 'No stack trace';
				logger.error('Failed to start API server', 'Extension', errorMessage);
				logger.error('Error stack', 'Extension', errorStack);

				const detailedError = `${errorMessage}\n\nCheck the Output panel > Local Snapshots for more details.`;
				await notificationManager.showErrorMessage(`Failed to start API server: ${detailedError}`);
				logger.info('Disabling API server due to startup error', 'Extension');
				await config.update('enableApiServer', false, vscode.ConfigurationTarget.Global);
			}
		} else {
			logger.info('API server is disabled', 'Extension');
		}
	}

	// Function to manage MCP server state
	async function updateMcpServer() {
		const config = vscode.workspace.getConfiguration('localSnapshots');
		const isEnabled = config.get<boolean>('enableMcpServer', false);

		logger.info(`updateMcpServer called - isEnabled: ${isEnabled}`, 'Extension');

		// Skip if the settings provider is currently updating this setting
		if (settingsProvider.isUpdatingServerSetting) {
			logger.info('Skipping MCP server update because settings provider is updating a server setting', 'Extension');
			return;
		}

		// Stop existing server if it's running
		if (mcpServer) {
			logger.info('Stopping existing MCP server', 'Extension');
			mcpServer.stop();
			mcpServer = undefined;
		}

		// Update status bar initially
		updateMcpStatusBar(isEnabled, undefined);

		// Start new server if enabled
		if (isEnabled) {
			logger.info('MCP server is enabled, attempting to start', 'Extension');
			try {
				logger.info('Creating new MCPServer instance', 'Extension');
				mcpServer = new MCPServer(snapshotManager);

				logger.info('Calling mcpServer.start()', 'Extension');
				const actualPort = await mcpServer.start();

				// Update status bar with actual port
				updateMcpStatusBar(true, actualPort);

				logger.info(`MCP server successfully started on port ${actualPort}`, 'Extension');
				logger.info(`MCP server object: ${mcpServer ? 'Created successfully' : 'Failed to create'}`, 'Extension');
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				const errorStack = error instanceof Error ? error.stack : 'No stack trace';
				logger.error('Failed to start MCP server', 'Extension', errorMessage);
				logger.error('Error stack', 'Extension', errorStack);

				const detailedError = `${errorMessage}\n\nCheck the Output panel > Local Snapshots for more details.`;
				await notificationManager.showErrorMessage(`Failed to start MCP server: ${detailedError}`);
				logger.info('Disabling MCP server due to startup error', 'Extension');
				await config.update('enableMcpServer', false, vscode.ConfigurationTarget.Global);
			}
		} else {
			logger.info('MCP server is disabled', 'Extension');
		}
	}

	// Make sure to dispose everything when deactivating
	context.subscriptions.push({
		dispose: () => {
			snapshotManager.dispose();

			// Dispose the settings provider (which will stop its servers)
			settingsProvider.dispose();

			// Stop the main servers if they're running
			if (apiServer) {
				apiServer.stop();
				apiServer = undefined;
			}
			if (mcpServer) {
				mcpServer.stop();
				mcpServer = undefined;
			}
			apiStatusBarItem.dispose();
			mcpStatusBarItem.dispose();
		}
	});

	// Initial server setup is now handled by the settings provider

	// Register MCP tools
	const mcpToolDisposables = registerMCPTools(snapshotManager);
	context.subscriptions.push(...mcpToolDisposables);

	// Register the settings provider (moved above to ensure it's defined before usage)

	// Watch for configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			logger.info('Configuration changed', 'Extension', e);

			// Skip if the settings provider is currently updating a server setting
			if (settingsProvider.isUpdatingServerSetting) {
				logger.info('Skipping configuration change event because settings provider is updating a server setting', 'Extension');
				return;
			}

			if (e.affectsConfiguration('localSnapshots.enableApiServer') ||
				e.affectsConfiguration('localSnapshots.apiPort')) {
				logger.info('API server settings changed, updating server...', 'Extension');
				updateApiServer();
			}
			if (e.affectsConfiguration('localSnapshots.enableMcpServer') ||
				e.affectsConfiguration('localSnapshots.mcpPort')) {
				logger.info('MCP server settings changed, updating server...', 'Extension');
				updateMcpServer();
			}
		})
	);

	const webviewProvider = new SnapshotWebviewProvider(
		context.extensionUri,
		async () => {
			const name = await vscode.window.showInputBox({
				prompt: 'Enter a name for the snapshot'
			});
			if (name) {
				await snapshotManager.takeSnapshot(name);
				await notificationManager.showInformationMessage(`Created snapshot: ${name}`);
				webviewProvider.refreshList();
			}
		},
		async (snapshotName: string, timestamp: number, selectedFiles?: string[]) => {
			await snapshotManager.restoreSnapshot(snapshotName, timestamp, selectedFiles);
			await notificationManager.showInformationMessage(
				`Restored ${selectedFiles ? selectedFiles.length : 'all'} files from snapshot: ${snapshotName}`
			);
		},
		snapshotManager.deleteSnapshot.bind(snapshotManager),
		async (snapshotName: string, timestamp: number) => {
			await vscode.commands.executeCommand('local-snapshots.renameSnapshot', snapshotName, timestamp);
		},
		async () => snapshotManager.getSnapshots(),
		async (name: string, timestamp: number) => snapshotManager.getSnapshotFiles(name, timestamp),
		async (name: string, timestamp: number) => snapshotManager.showDiff(name, timestamp),
		async (name: string, timestamp: number) => snapshotManager.showTree(name, timestamp)
	);

	snapshotManager.setWebviewProvider(webviewProvider);

	// Register the webview provider
	const webviewDisposable = vscode.window.registerWebviewViewProvider(
		SnapshotWebviewProvider.viewType,
		webviewProvider,
		{
			webviewOptions: {
				retainContextWhenHidden: true
			}
		}
	);

	// Register all commands
	const commandDisposables = registerSnapshotCommands(
		context,
		snapshotManager,
		() => webviewProvider.refreshList(),
		() => webviewProvider.refreshList()
	);

	// Register the settings command with custom settings page
	context.subscriptions.push(
		vscode.commands.registerCommand('local-snapshots.openSettings', () => {
			settingsProvider.show();
		})
	);

	// Register the copy rules command
	context.subscriptions.push(
		vscode.commands.registerCommand('local-snapshots.copyRules', async () => {
			try {
				const rulesPath = path.join(context.extensionPath, 'RULES.md');
				const rules = await vscode.workspace.fs.readFile(vscode.Uri.file(rulesPath));
				await vscode.env.clipboard.writeText(rules.toString());
				await notificationManager.showInformationMessage('AI Safety Rules copied to clipboard!');
			} catch (error) {
				logger.error('Failed to copy rules', 'Extension', error);
				await notificationManager.showErrorMessage('Failed to copy AI Safety Rules to clipboard');
			}
		})
	);

	// Register the ignore patterns command
	const ignorePatternsProvider = new IgnorePatternsWebviewProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.commands.registerCommand('local-snapshots.manageIgnorePatterns', () => {
			ignorePatternsProvider.show();
		})
	);

	// Add all disposables to context
	context.subscriptions.push(webviewDisposable, ...commandDisposables);
}

export function deactivate() {}
