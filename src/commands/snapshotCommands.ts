import * as vscode from 'vscode';
import * as path from 'path';
import { SnapshotManager } from '../managers/SnapshotManager';

export function registerSnapshotCommands(
	context: vscode.ExtensionContext,
	snapshotManager: SnapshotManager,
	refreshWebview: () => void
): vscode.Disposable[] {
	return [
		vscode.commands.registerCommand('local-snapshots.takeSnapshot', async () => {
			const name = await vscode.window.showInputBox({
				prompt: 'Enter a name for the snapshot'
			});
			if (name) {
				await snapshotManager.takeSnapshot(name);
				vscode.window.showInformationMessage(`Created snapshot: ${name}`);
				refreshWebview();
			}
		}),

		vscode.commands.registerCommand('local-snapshots.quickSnapshot', async () => {
			await snapshotManager.takeSnapshot();
			vscode.window.showInformationMessage('Quick snapshot created');
			refreshWebview();
		}),

		vscode.commands.registerCommand('local-snapshots.restoreSnapshot', async () => {
			const snapshots = snapshotManager.getSnapshots();
			const items = snapshots.map(s => ({
				label: s.name,
				description: new Date(s.timestamp).toLocaleString()
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
				await snapshotManager.restoreSnapshot(selectedSnapshot.label);
				vscode.window.showInformationMessage(
					`Restored all files from snapshot: ${selectedSnapshot.label}`
				);
			} else {
				const files = await snapshotManager.getSnapshotFiles(selectedSnapshot.label);
				const selectedFiles = await vscode.window.showQuickPick(files, {
					canPickMany: true,
					placeHolder: 'Select files to restore'
				});
				
				if (selectedFiles) {
					await snapshotManager.restoreSnapshot(selectedSnapshot.label, selectedFiles);
					vscode.window.showInformationMessage(
						`Restored ${selectedFiles.length} files from snapshot: ${selectedSnapshot.label}`
					);
				}
			}
		}),

		vscode.commands.registerCommand('local-snapshots.restoreFile', async () => {
			const activeEditor = vscode.window.activeTextEditor;
			if (!activeEditor) {
				vscode.window.showErrorMessage('No active file to restore');
				return;
			}

			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders) {
				vscode.window.showErrorMessage('No workspace folder is open');
				return;
			}

			const relativePath = path.relative(
				workspaceFolders[0].uri.fsPath,
				activeEditor.document.uri.fsPath
			);

			await snapshotManager.restoreFile(relativePath);
			vscode.window.showInformationMessage('File restored from snapshot');
		})
	];
} 