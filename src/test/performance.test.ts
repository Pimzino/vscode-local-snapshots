import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Performance Diagnostics', () => {
	test('extension activates and diagnostics command is registered', async () => {
		const extension = vscode.extensions.getExtension('CalculatedRisk.local-snapshots');
		assert.ok(extension, 'Extension should be present');

		await extension?.activate();
		const commands = await vscode.commands.getCommands(true);
		assert.ok(
			commands.includes('local-snapshots.runPerformanceDiagnostics'),
			'Performance diagnostics command should be registered'
		);
	});

	test('runPerformanceDiagnostics completes without throwing', async function () {
		this.timeout(30000);

		const extension = vscode.extensions.getExtension('CalculatedRisk.local-snapshots');
		await extension?.activate();

		const report = await vscode.commands.executeCommand<string>(
			'local-snapshots.runPerformanceDiagnostics',
			{ includeHeavyBenchmarks: false, silent: true }
		);

		assert.ok(typeof report === 'string', 'Diagnostics should return a report string');
		assert.ok(report.includes('Performance Diagnostics'), 'Report should include diagnostics header');
	});
});
