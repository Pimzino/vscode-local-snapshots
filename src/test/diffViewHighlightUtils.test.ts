import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const highlightUtils = require(path.join(__dirname, '../../media/diffViewHighlightUtils.js')) as {
	getDiffLineClass: (lineType: string, lineLevelDiffEnabled: boolean) => string;
	shouldApplyCharacterLevelDiff: (options: {
		characterLevelDiffEnabled: boolean;
		lineLevelDiffEnabled: boolean;
		lineType: string;
	}) => boolean;
	getOverviewMarkerColor: (options: {
		lineLevelDiffEnabled: boolean;
		isAdded: boolean;
		characterHighlightColor: string;
	}) => string;
	ADDED_LINE_MARKER_COLOR: string;
	REMOVED_LINE_MARKER_COLOR: string;
};

suite('DiffView highlight utilities', () => {
	test('applies added and removed classes only when line diff is enabled', () => {
		assert.strictEqual(highlightUtils.getDiffLineClass('unchanged', true), '');
		assert.strictEqual(highlightUtils.getDiffLineClass('added', true), 'added');
		assert.strictEqual(highlightUtils.getDiffLineClass('removed', true), 'removed');
		assert.strictEqual(highlightUtils.getDiffLineClass('added', false), '');
		assert.strictEqual(highlightUtils.getDiffLineClass('removed', false), '');
	});

	test('uses character-level diff only when line diff is disabled', () => {
		assert.strictEqual(
			highlightUtils.shouldApplyCharacterLevelDiff({
				characterLevelDiffEnabled: true,
				lineLevelDiffEnabled: true,
				lineType: 'added',
			}),
			false
		);
		assert.strictEqual(
			highlightUtils.shouldApplyCharacterLevelDiff({
				characterLevelDiffEnabled: true,
				lineLevelDiffEnabled: false,
				lineType: 'added',
			}),
			true
		);
		assert.strictEqual(
			highlightUtils.shouldApplyCharacterLevelDiff({
				characterLevelDiffEnabled: false,
				lineLevelDiffEnabled: false,
				lineType: 'added',
			}),
			false
		);
		assert.strictEqual(
			highlightUtils.shouldApplyCharacterLevelDiff({
				characterLevelDiffEnabled: true,
				lineLevelDiffEnabled: false,
				lineType: 'unchanged',
			}),
			false
		);
	});

	test('uses concrete theme-aligned colors for overview markers when line diff is enabled', () => {
		assert.strictEqual(
			highlightUtils.getOverviewMarkerColor({
				lineLevelDiffEnabled: true,
				isAdded: true,
				characterHighlightColor: '#FFD700',
			}),
			highlightUtils.ADDED_LINE_MARKER_COLOR
		);
		assert.strictEqual(
			highlightUtils.getOverviewMarkerColor({
				lineLevelDiffEnabled: true,
				isAdded: false,
				characterHighlightColor: '#FFD700',
			}),
			highlightUtils.REMOVED_LINE_MARKER_COLOR
		);
		assert.ok(
			!highlightUtils.getOverviewMarkerColor({
				lineLevelDiffEnabled: true,
				isAdded: true,
				characterHighlightColor: '#FFD700',
			}).startsWith('var('),
			'Overview marker colors must be concrete values that work in inline styles'
		);
	});

	test('uses green for added overview markers and red for removed overview markers', () => {
		assert.strictEqual(highlightUtils.ADDED_LINE_MARKER_COLOR, '#73c991');
		assert.strictEqual(highlightUtils.REMOVED_LINE_MARKER_COLOR, '#f14c4c');
		assert.notStrictEqual(
			highlightUtils.ADDED_LINE_MARKER_COLOR,
			highlightUtils.REMOVED_LINE_MARKER_COLOR,
			'Added and removed overview markers must be visually distinct'
		);
	});

	test('uses the color picker color for overview markers when line diff is disabled', () => {
		assert.strictEqual(
			highlightUtils.getOverviewMarkerColor({
				lineLevelDiffEnabled: false,
				isAdded: true,
				characterHighlightColor: '#FF00AA',
			}),
			'#FF00AA'
		);
	});
});

suite('DiffView line diff CSS', () => {
	const cssPath = path.join(__dirname, '../../media/diffView.css');

	test('defines fallback line diff background variables with visible colors', () => {
		const css = fs.readFileSync(cssPath, 'utf8');

		assert.ok(
			css.includes('--diff-inserted-line-background'),
			'Expected inserted line background variable with fallback'
		);
		assert.ok(
			css.includes('--diff-removed-line-background'),
			'Expected removed line background variable with fallback'
		);
		assert.match(
			css,
			/--diff-inserted-line-background:\s*var\(--vscode-diffEditor-insertedLineBackground,\s*[^)]+\)/,
			'Inserted line background must include a non-theme fallback color'
		);
		assert.match(
			css,
			/--diff-removed-line-background:\s*var\(--vscode-diffEditor-removedLineBackground,\s*[^)]+\)/,
			'Removed line background must include a non-theme fallback color'
		);
	});

	test('styles added side-by-side lines with the inserted background variable', () => {
		const css = fs.readFileSync(cssPath, 'utf8');

		assert.match(
			css,
			/\.diff-line\.added \.diff-line-right\s*\{[^}]*background-color:\s*var\(--diff-inserted-line-background\)/,
			'Added lines in side-by-side view must use the inserted background variable'
		);
	});

	test('styles removed side-by-side lines with the removed background variable', () => {
		const css = fs.readFileSync(cssPath, 'utf8');

		assert.match(
			css,
			/\.diff-line\.removed \.diff-line-left\s*\{[^}]*background-color:\s*var\(--diff-removed-line-background\)/,
			'Removed lines in side-by-side view must use the removed background variable'
		);
	});

	test('uses a green fallback for inserted lines and a red fallback for removed lines', () => {
		const css = fs.readFileSync(cssPath, 'utf8');

		assert.match(
			css,
			/--diff-inserted-line-background:[^;]*rgba\(\s*115,\s*201,\s*145/,
			'Inserted line fallback background must be visibly green'
		);
		assert.match(
			css,
			/--diff-removed-line-background:[^;]*rgba\(\s*241,\s*76,\s*76/,
			'Removed line fallback background must be visibly red'
		);
	});

	test('styles inline removed lines with the removed background variable', () => {
		const css = fs.readFileSync(cssPath, 'utf8');

		assert.match(
			css,
			/\.diff-line-horizontal\.removed\s*\{[^}]*background-color:\s*var\(--diff-removed-line-background\)/,
			'Removed lines in inline view must use the removed background variable'
		);
	});

	test('styles inline added lines with the inserted background variable', () => {
		const css = fs.readFileSync(cssPath, 'utf8');

		assert.match(
			css,
			/\.diff-line-horizontal\.added\s*\{[^}]*background-color:\s*var\(--diff-inserted-line-background\)/,
			'Added lines in inline view must use the inserted background variable'
		);
	});
});
