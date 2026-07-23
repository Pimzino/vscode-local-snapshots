import * as assert from 'assert';
import { compareDiffFilePaths, sortDiffFilesByPath } from '../utils/diffFileUtils';
import { DiffFile } from '../types/interfaces';

suite('diffFileUtils', () => {
	test('sortDiffFilesByPath sorts paths alphabetically case-insensitively', () => {
		const files: DiffFile[] = [
			{ relativePath: 'src/ui/search-ui.ts', path: 'src/ui/search-ui.ts', status: 'modified' },
			{ relativePath: 'README.md', path: 'README.md', status: 'modified' },
			{ relativePath: 'src/core/search-service.ts', path: 'src/core/search-service.ts', status: 'modified' },
			{ relativePath: 'src/providers/text-provider.ts', path: 'src/providers/text-provider.ts', status: 'modified' },
		];

		const sorted = sortDiffFilesByPath(files);

		assert.deepStrictEqual(
			sorted.map(file => file.relativePath),
			[
				'README.md',
				'src/core/search-service.ts',
				'src/providers/text-provider.ts',
				'src/ui/search-ui.ts',
			]
		);
	});

	test('compareDiffFilePaths uses natural numeric ordering', () => {
		assert.strictEqual(compareDiffFilePaths({ relativePath: 'file2.ts' }, { relativePath: 'file10.ts' }), -1);
	});
});
