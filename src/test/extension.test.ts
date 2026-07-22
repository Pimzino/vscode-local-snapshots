import * as assert from 'assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'CalculatedRisk.local-snapshots';

suite('Local Snapshots Extension', () => {
	test('extension is present', () => {
		const extension = vscode.extensions.getExtension(EXTENSION_ID);
		assert.ok(extension, `Extension ${EXTENSION_ID} not found`);
	});

	test('extension activates', async () => {
		const extension = vscode.extensions.getExtension(EXTENSION_ID);
		assert.ok(extension);
		await extension!.activate();
		assert.strictEqual(extension!.isActive, true);
	});

	test('commands are registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		const expectedCommands = [
			'local-snapshots.takeSnapshot',
			'local-snapshots.quickSnapshot',
			'local-snapshots.restoreSnapshot',
		];

		for (const command of expectedCommands) {
			assert.ok(
				commands.includes(command),
				`Command ${command} is not registered`
			);
		}
	});
});
