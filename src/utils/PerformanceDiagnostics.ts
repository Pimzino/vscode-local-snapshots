import * as vscode from 'vscode';
import { SnapshotManager } from '../managers/SnapshotManager';
import { Logger } from './Logger';

const BENCHMARK_EXCLUDE_PATTERN =
	'{**/node_modules/**,**/dist/**,**/.git/**,**/out/**,**/.vscode-test/**,**/.next/**,**/build/**,**/.cache/**,**/coverage/**}';

export interface PerformanceDiagnosticsOptions {
	includeHeavyBenchmarks?: boolean;
	silent?: boolean;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}
	if (bytes < 1024 * 1024 * 1024) {
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatMemory(): string {
	const mem = process.memoryUsage();
	return [
		`heap used ${formatBytes(mem.heapUsed)}`,
		`heap total ${formatBytes(mem.heapTotal)}`,
		`rss ${formatBytes(mem.rss)}`,
		`external ${formatBytes(mem.external)}`
	].join(', ');
}

export class PerformanceDiagnostics {
	static async run(
		snapshotManager: SnapshotManager,
		options: PerformanceDiagnosticsOptions = {}
	): Promise<string> {
		const includeHeavyBenchmarks = options.includeHeavyBenchmarks ?? true;
		const lines: string[] = [];
		const logger = Logger.getInstance();
		const config = vscode.workspace.getConfiguration('localSnapshots');

		lines.push('=== Local Snapshots Performance Diagnostics ===');
		lines.push(`Timestamp: ${new Date().toISOString()}`);
		lines.push(`Extension host memory: ${formatMemory()}`);
		lines.push('');

		lines.push('--- Configuration ---');
		const configEntries: Array<[string, unknown]> = [
			['enablePreSaveSnapshots', config.get('enablePreSaveSnapshots', false)],
			['enableTimedSnapshots', config.get('enableTimedSnapshots', false)],
			['timedSnapshotInterval', config.get('timedSnapshotInterval', 300)],
			['skipUnchangedSnapshots', config.get('skipUnchangedSnapshots', false)],
			['limitSnapshotCount', config.get('limitSnapshotCount', false)],
			['maxSnapshotCount', config.get('maxSnapshotCount', 10)],
			['enableApiServer', config.get('enableApiServer', false)],
			['enableMcpServer', config.get('enableMcpServer', false)],
			['batchSize', config.get('batchSize', 50)],
			['batchDelay', config.get('batchDelay', 10)],
			['maxParallelBatches', config.get('maxParallelBatches', 1)],
		];
		for (const [key, value] of configEntries) {
			lines.push(`  ${key}: ${value}`);
		}
		lines.push('');

		const runtime = snapshotManager.getRuntimeDiagnostics();
		lines.push('--- Runtime State ---');
		lines.push(`  Tracked open documents (pre-save): ${runtime.documentStatesCount}`);
		lines.push(`  Pending change paths: ${runtime.pendingChangesCount}`);
		lines.push(`  Active diff preparations: ${runtime.activeDiffPreparations}`);
		lines.push(`  Active tree preparations: ${runtime.activeTreePreparations}`);
		lines.push(`  Cached gitignore parsers: ${runtime.gitignoreCacheSize}`);
		lines.push('');

		const snapshots = snapshotManager.getSnapshots();
		let totalFiles = 0;
		let totalContentBytes = 0;
		const snapshotDetails: Array<{ name: string; timestamp: number; files: number; bytes: number }> = [];

		for (const snapshot of snapshots) {
			let snapshotBytes = 0;
			for (const file of snapshot.files) {
				snapshotBytes += Buffer.byteLength(file.content, 'utf8');
				totalFiles++;
			}
			totalContentBytes += snapshotBytes;
			snapshotDetails.push({
				name: snapshot.name,
				timestamp: snapshot.timestamp,
				files: snapshot.files.length,
				bytes: snapshotBytes
			});
		}

		const serializedBytes = Buffer.byteLength(JSON.stringify(snapshots), 'utf8');
		lines.push('--- Snapshot Storage ---');
		lines.push(`  Snapshot count: ${snapshots.length}`);
		lines.push(`  Total files across snapshots: ${totalFiles}`);
		lines.push(`  Total file content: ${formatBytes(totalContentBytes)}`);
		lines.push(`  Serialized globalState size: ${formatBytes(serializedBytes)}`);

		if (snapshotDetails.length > 0) {
			const largest = snapshotDetails.reduce((current, candidate) =>
				candidate.bytes > current.bytes ? candidate : current
			);
			lines.push(`  Largest snapshot: "${largest.name}" (${formatBytes(largest.bytes)}, ${largest.files} files)`);
			lines.push('  Per-snapshot breakdown:');
			for (const snapshot of snapshotDetails.sort((a, b) => b.bytes - a.bytes).slice(0, 10)) {
				lines.push(
					`    - ${snapshot.name} @ ${new Date(snapshot.timestamp).toISOString()}: ${snapshot.files} files, ${formatBytes(snapshot.bytes)}`
				);
			}
			if (snapshotDetails.length > 10) {
				lines.push(`    ... and ${snapshotDetails.length - 10} more`);
			}
		}
		lines.push('');

		lines.push('--- Benchmarks ---');
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			lines.push('  (no workspace folder open — skipping workspace benchmarks)');
		} else {
			const folder = workspaceFolders[0];
			const findFilesStart = Date.now();
			const uris = await vscode.workspace.findFiles(
				new vscode.RelativePattern(folder, '**/*'),
				BENCHMARK_EXCLUDE_PATTERN
			);
			lines.push(`  findFiles: ${Date.now() - findFilesStart}ms (${uris.length} files)`);

			const getSnapshotsStart = Date.now();
			const loadedSnapshots = snapshotManager.getSnapshots();
			const serialized = JSON.stringify(loadedSnapshots);
			lines.push(
				`  getSnapshots + JSON.stringify: ${Date.now() - getSnapshotsStart}ms (${formatBytes(Buffer.byteLength(serialized, 'utf8'))})`
			);

			if (snapshots.length > 0) {
				const latestSnapshot = [...snapshots].sort((a, b) => b.timestamp - a.timestamp)[0];
				let worstCaseDiffBytes = 0;
				for (const file of latestSnapshot.files) {
					worstCaseDiffBytes += Buffer.byteLength(file.content, 'utf8') * 2;
				}
				lines.push(
					`  Latest snapshot diff payload (worst case): ${formatBytes(worstCaseDiffBytes)} across ${latestSnapshot.files.length} files`
				);
			}

			if (includeHeavyBenchmarks && snapshots.length > 0) {
				const changedFilesStart = Date.now();
				const changed = await snapshotManager.benchmarkHasChangedFiles();
				lines.push(
					`  hasChangedFiles: ${changed.durationMs}ms (result: ${changed.changed ? 'changed' : 'unchanged'})`
				);
			} else if (!includeHeavyBenchmarks) {
				lines.push('  hasChangedFiles: skipped (lightweight diagnostics mode)');
			} else {
				lines.push('  hasChangedFiles: skipped (no snapshots to compare)');
			}
		}
		lines.push('');

		lines.push('--- Risk Assessment ---');
		const warnings: string[] = [];
		if (serializedBytes > 50 * 1024 * 1024) {
			warnings.push('CRITICAL: Snapshot storage exceeds 50MB — high OOM / extension host crash risk');
		} else if (serializedBytes > 10 * 1024 * 1024) {
			warnings.push('WARNING: Snapshot storage exceeds 10MB — expect sluggish saves and UI freezes');
		}
		if (config.get('enablePreSaveSnapshots', false) && runtime.documentStatesCount > 50) {
			warnings.push(`WARNING: Pre-save is tracking ${runtime.documentStatesCount} full document copies in memory`);
		}
		if (config.get('enableTimedSnapshots', false) && config.get('skipUnchangedSnapshots', false)) {
			warnings.push('NOTE: skipUnchangedSnapshots still performs a full workspace scan in hasChangedFiles()');
		}
		if (snapshots.length > 5 && serializedBytes > 5 * 1024 * 1024) {
			warnings.push('NOTE: Opening diff view can read the entire workspace and send large postMessage payloads');
		}

		if (warnings.length === 0) {
			lines.push('  No critical issues detected from storage/config analysis.');
		} else {
			for (const warning of warnings) {
				lines.push(`  ! ${warning}`);
			}
		}

		lines.push('');
		lines.push('=== End Diagnostics ===');

		const report = lines.join('\n');
		logger.info(report, 'PerformanceDiagnostics');
		return report;
	}
}
