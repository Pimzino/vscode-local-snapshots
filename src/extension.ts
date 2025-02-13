import * as vscode from 'vscode';
import { SnapshotManager } from './managers/SnapshotManager';
import { SnapshotWebviewProvider } from './views/SnapshotWebviewProvider';
import { registerSnapshotCommands } from './commands/snapshotCommands';
import { IgnorePatternsWebviewProvider } from './views/IgnorePatternsWebviewProvider';
import { ApiServer } from './api/server';
import path from 'path';

export function activate(context: vscode.ExtensionContext) {
	console.log('==============================================');
	console.log('Local Snapshots extension is now active!');
	console.log('==============================================');

	const snapshotManager = new SnapshotManager(context);
	let apiServer: ApiServer | undefined;

	// Create status bar item for API server
	const apiStatusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Right,
		100
	);
	apiStatusBarItem.command = 'local-snapshots.openSettings';
	context.subscriptions.push(apiStatusBarItem);

	function updateStatusBar(isEnabled: boolean, port?: number) {
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
		updateStatusBar(isEnabled, isEnabled ? port : undefined);

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

	// Make sure to dispose everything when deactivating
	context.subscriptions.push({ 
		dispose: () => {
			snapshotManager.dispose();
			if (apiServer) {
				apiServer.stop();
				apiServer = undefined;
			}
			apiStatusBarItem.dispose();
		}
	});

	// Initial API server setup
	updateApiServer();

	// Watch for configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('localSnapshots.enableApiServer') || 
				e.affectsConfiguration('localSnapshots.apiPort')) {
				updateApiServer();
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
