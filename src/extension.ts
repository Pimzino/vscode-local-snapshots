import * as vscode from 'vscode';
import { SnapshotManager } from './managers/SnapshotManager';
import { SnapshotWebviewProvider } from './views/SnapshotWebviewProvider';
import { registerSnapshotCommands } from './commands/snapshotCommands';

export function activate(context: vscode.ExtensionContext) {
	console.log('==============================================');
	console.log('Local Snapshots extension is now active!');
	console.log('==============================================');

	const snapshotManager = new SnapshotManager(context);

	// Make sure to dispose the snapshot manager when deactivating
	context.subscriptions.push({ dispose: () => snapshotManager.dispose() });

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
		async (snapshotName: string, timestamp: number) => {
			await snapshotManager.deleteSnapshot(snapshotName, timestamp);
			vscode.window.showInformationMessage(`Deleted snapshot: ${snapshotName}`);
			webviewProvider.refreshList();
		},
		async () => snapshotManager.getSnapshots(),
		async (name: string, timestamp: number) => snapshotManager.getSnapshotFiles(name, timestamp),
		async (name: string, timestamp: number) => snapshotManager.showDiff(name, timestamp)
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
		() => webviewProvider.refreshList()
	);

	// Register the settings command
	context.subscriptions.push(
		vscode.commands.registerCommand('local-snapshots.openSettings', () => {
			vscode.commands.executeCommand('workbench.action.openSettings', '@ext:vscode-local-snapshots.local-snapshots');
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
