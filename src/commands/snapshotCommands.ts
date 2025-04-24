import * as vscode from 'vscode';
import * as path from 'path';
import { SnapshotManager } from '../managers/SnapshotManager';
import { NotificationManager } from '../utils/NotificationManager';

export function registerSnapshotCommands(
	context: vscode.ExtensionContext,
	snapshotManager: SnapshotManager,
	refreshWebview: () => void,
	onSnapshotsChanged: () => void
): vscode.Disposable[] {
	const notificationManager = NotificationManager.getInstance();
	return [
		vscode.commands.registerCommand('local-snapshots.takeSnapshot', async () => {
			const name = await vscode.window.showInputBox({
				prompt: 'Enter a name for the snapshot'
			});
			if (name) {
				await snapshotManager.takeSnapshot(name);
				await notificationManager.showInformationMessage(`Created snapshot: ${name}`);
				refreshWebview();
			}
		}),

		vscode.commands.registerCommand('local-snapshots.quickSnapshot', async () => {
			await snapshotManager.takeSnapshot();
			await notificationManager.showInformationMessage('Quick snapshot created');
			refreshWebview();
		}),

		vscode.commands.registerCommand('local-snapshots.restoreSnapshot', async () => {
			const snapshots = snapshotManager.getSnapshots();
			const items = snapshots.map(s => ({
				label: s.name,
				description: new Date(s.timestamp).toLocaleString(),
				timestamp: s.timestamp
			}));

			const selectedSnapshot = await vscode.window.showQuickPick(items, {
				placeHolder: 'Select a snapshot to restore'
			});
			if (!selectedSnapshot) {
				return;
			}

			const choice = await vscode.window.showQuickPick(
				[
					{ label: 'Restore All Files', value: 'all' },
					{ label: 'Select Files to Restore', value: 'select' }
				],
				{
					placeHolder: 'How would you like to restore the snapshot?'
				}
			);

			if (!choice) {
				return;
			}

			if (choice.value === 'all') {
				await snapshotManager.restoreSnapshot(selectedSnapshot.label, selectedSnapshot.timestamp);
				await notificationManager.showInformationMessage(
					`Restored all files from snapshot: ${selectedSnapshot.label}`
				);
			} else {
				const files = await snapshotManager.getSnapshotFiles(selectedSnapshot.label, selectedSnapshot.timestamp);
				const selectedFiles = await vscode.window.showQuickPick(files, {
					canPickMany: true,
					placeHolder: 'Select files to restore'
				});

				if (selectedFiles) {
					await snapshotManager.restoreSnapshot(selectedSnapshot.label, selectedSnapshot.timestamp, selectedFiles);
					await notificationManager.showInformationMessage(
						`Restored ${selectedFiles.length} files from snapshot: ${selectedSnapshot.label}`
					);
				}
			}
		}),

		vscode.commands.registerCommand('local-snapshots.deleteAllSnapshots', async () => {
			try {
				const deleted = await snapshotManager.deleteAllSnapshots();
				if (deleted) {
					onSnapshotsChanged();
				}
			} catch (error) {
				await notificationManager.showErrorMessage('Failed to delete snapshots: ' + (error instanceof Error ? error.message : 'Unknown error'));
			}
		}),

		vscode.commands.registerCommand('local-snapshots.renameSnapshot', async (snapshotName: string, timestamp: number) => {
			const newName = await vscode.window.showInputBox({
				prompt: 'Enter new name for the snapshot',
				placeHolder: 'New snapshot name',
				value: snapshotName,
				validateInput: (value) => {
					if (!value.trim()) {
						return 'Name cannot be empty';
					}
					return null;
				}
			});

			if (newName) {
				try {
					await snapshotManager.renameSnapshot(snapshotName, timestamp, newName);
					await notificationManager.showInformationMessage(`Renamed snapshot to: ${newName}`);
				} catch (error) {
					await notificationManager.showErrorMessage((error instanceof Error ? error.message : 'Failed to rename snapshot'));
				}
			}
		}),

		// Add file to ignore patterns
		vscode.commands.registerCommand('local-snapshots.addFileToIgnore', async (uri: vscode.Uri) => {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders) {
				await notificationManager.showErrorMessage('No workspace folder is open');
				return;
			}

			const workspaceFolder = workspaceFolders.find(folder =>
				uri.fsPath.startsWith(folder.uri.fsPath)
			);

			if (!workspaceFolder) {
				await notificationManager.showErrorMessage('File is not in the current workspace');
				return;
			}

			const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
			const pattern = relativePath.replace(/\\/g, '/');

			const config = vscode.workspace.getConfiguration('localSnapshots');
			const currentPatterns = config.get<string[]>('customIgnorePatterns', []);

			if (currentPatterns.includes(pattern)) {
				await notificationManager.showInformationMessage(`Pattern "${pattern}" is already in ignore list`);
				return;
			}

			await config.update(
				'customIgnorePatterns',
				[...currentPatterns, pattern],
				vscode.ConfigurationTarget.Global
			);

			await notificationManager.showInformationMessage(`Added "${pattern}" to ignore patterns`);
		}),

		// Add directory to ignore patterns
		vscode.commands.registerCommand('local-snapshots.addDirectoryToIgnore', async (uri: vscode.Uri) => {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders) {
				await notificationManager.showErrorMessage('No workspace folder is open');
				return;
			}

			const workspaceFolder = workspaceFolders.find(folder =>
				uri.fsPath.startsWith(folder.uri.fsPath)
			);

			if (!workspaceFolder) {
				await notificationManager.showErrorMessage('Directory is not in the current workspace');
				return;
			}

			const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
			const pattern = relativePath.replace(/\\/g, '/') + '/**';

			const config = vscode.workspace.getConfiguration('localSnapshots');
			const currentPatterns = config.get<string[]>('customIgnorePatterns', []);

			if (currentPatterns.includes(pattern)) {
				await notificationManager.showInformationMessage(`Pattern "${pattern}" is already in ignore list`);
				return;
			}

			await config.update(
				'customIgnorePatterns',
				[...currentPatterns, pattern],
				vscode.ConfigurationTarget.Global
			);

			await notificationManager.showInformationMessage(`Added "${pattern}" to ignore patterns`);
		})
	];
}