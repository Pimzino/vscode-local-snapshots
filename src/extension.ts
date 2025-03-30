import * as vscode from 'vscode';
import { SnapshotManager } from './managers/SnapshotManager';
import { SnapshotWebviewProvider } from './views/SnapshotWebviewProvider';
import { registerSnapshotCommands } from './commands/snapshotCommands';
import { IgnorePatternsWebviewProvider } from './views/IgnorePatternsWebviewProvider';
import { ApiServer } from './api/server';
import { MCPServer } from './mcp/server';
import { registerMCPTools } from './mcp/mcpTools';
import path from 'path';

export function activate(context: vscode.ExtensionContext) {
	console.log('==============================================');
	console.log('Local Snapshots extension is now active!');
	console.log('==============================================');

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

	// Function to manage API server state
	async function updateApiServer() {
		const config = vscode.workspace.getConfiguration('localSnapshots');
		const isEnabled = config.get<boolean>('enableApiServer', false);
		const port = config.get<number>('apiPort', 45678);

		// Stop existing server if it's running
		if (apiServer) {
			apiServer.stop();
			apiServer = undefined;
		}

		// Update status bar
		updateApiStatusBar(isEnabled, isEnabled ? port : undefined);

		// Start new server if enabled
		if (isEnabled) {
			try {
				apiServer = new ApiServer(snapshotManager);
				await apiServer.start(port);
				console.log(`API server started on port ${port}`);
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				console.error('Failed to start API server:', errorMessage);

				if (error instanceof Error && error.message.includes('EADDRINUSE')) {
					const action = await vscode.window.showErrorMessage(
						`Port ${port} is already in use. Would you like to configure a different port?`,
						'Open Settings',
						'Disable API'
					);

					if (action === 'Open Settings') {
						await vscode.commands.executeCommand(
							'workbench.action.openSettings',
							'@ext:Pimzino.local-snapshots.apiPort'
						);
					} else {
						// Disable the API server
						await config.update('enableApiServer', false, vscode.ConfigurationTarget.Global);
					}
				} else {
					vscode.window.showErrorMessage(`Failed to start API server: ${errorMessage}`);
					await config.update('enableApiServer', false, vscode.ConfigurationTarget.Global);
				}
			}
		} else {
			console.log('API server is disabled');
		}
	}

	// Function to manage MCP server state
	async function updateMcpServer() {
		const config = vscode.workspace.getConfiguration('localSnapshots');
		const isEnabled = config.get<boolean>('enableMcpServer', false);
		const port = config.get<number>('mcpPort', 45679);

		// Stop existing server if it's running
		if (mcpServer) {
			mcpServer.stop();
			mcpServer = undefined;
		}

		// Update status bar
		updateMcpStatusBar(isEnabled, isEnabled ? port : undefined);

		// Start new server if enabled
		if (isEnabled) {
			try {
				mcpServer = new MCPServer(snapshotManager);
				await mcpServer.start(port);
				console.log(`MCP server started on port ${port}`);
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				console.error('Failed to start MCP server:', errorMessage);

				if (error instanceof Error && error.message.includes('EADDRINUSE')) {
					const action = await vscode.window.showErrorMessage(
						`Port ${port} is already in use. Would you like to configure a different port?`,
						'Open Settings',
						'Disable MCP'
					);

					if (action === 'Open Settings') {
						await vscode.commands.executeCommand(
							'workbench.action.openSettings',
							'@ext:Pimzino.local-snapshots.mcpPort'
						);
					} else {
						// Disable the MCP server
						await config.update('enableMcpServer', false, vscode.ConfigurationTarget.Global);
					}
				} else {
					vscode.window.showErrorMessage(`Failed to start MCP server: ${errorMessage}`);
					await config.update('enableMcpServer', false, vscode.ConfigurationTarget.Global);
				}
			}
		} else {
			console.log('MCP server is disabled');
		}
	}

	// Make sure to dispose everything when deactivating
	context.subscriptions.push({
		dispose: () => {
			snapshotManager.dispose();
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

	// Initial server setup
	updateApiServer();
	updateMcpServer();

	// Register MCP tools
	const mcpToolDisposables = registerMCPTools(snapshotManager);
	context.subscriptions.push(...mcpToolDisposables);

	// Watch for configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('localSnapshots.enableApiServer') ||
				e.affectsConfiguration('localSnapshots.apiPort')) {
				updateApiServer();
			}
			if (e.affectsConfiguration('localSnapshots.enableMcpServer') ||
				e.affectsConfiguration('localSnapshots.mcpPort')) {
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
				vscode.window.showInformationMessage(`Created snapshot: ${name}`);
				webviewProvider.refreshList();
			}
		},
		async (snapshotName: string, timestamp: number, selectedFiles?: string[]) => {
			await snapshotManager.restoreSnapshot(snapshotName, timestamp, selectedFiles);
			vscode.window.showInformationMessage(
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

	// Register the settings command
	context.subscriptions.push(
		vscode.commands.registerCommand('local-snapshots.openSettings', () => {
			vscode.commands.executeCommand(
				'workbench.action.openSettings',
				'@ext:Pimzino.local-snapshots'
			);
		})
	);

	// Register the copy rules command
	context.subscriptions.push(
		vscode.commands.registerCommand('local-snapshots.copyRules', async () => {
			try {
				const rulesPath = path.join(context.extensionPath, 'RULES.md');
				const rules = await vscode.workspace.fs.readFile(vscode.Uri.file(rulesPath));
				await vscode.env.clipboard.writeText(rules.toString());
				vscode.window.showInformationMessage('AI Safety Rules copied to clipboard!');
			} catch (error) {
				console.error('Failed to copy rules:', error);
				vscode.window.showErrorMessage('Failed to copy AI Safety Rules to clipboard');
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

	// Show the webview
	setTimeout(async () => {
		try {
			await vscode.commands.executeCommand('workbench.view.extension.local-snapshots-sidebar');
			console.log('View container shown');
		} catch (error) {
			console.error('Failed to show view container:', error);
		}
	}, 500);
}

export function deactivate() {}
