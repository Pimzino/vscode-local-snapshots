import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('DiffView search with text wrap', () => {
	const cssPath = path.join(__dirname, '../../media/diffView.css');

	function readCss(): string {
		return fs.readFileSync(cssPath, 'utf8');
	}

	function getRuleBlock(css: string, selector: string): string | null {
		const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const match = css.match(new RegExp(`[^{}]*${escapedSelector}[^{}]*\\{[^}]*\\}`));

		return match ? match[0] : null;
	}

	test('search wrapper inherits white-space so wrapped lines stay wrapped during search', () => {
		const css = readCss();
		const baseRule = getRuleBlock(css, '.search-wrapper');
		const scopedRule = getRuleBlock(css, '.diff-line-left .search-wrapper');

		assert.ok(baseRule, 'Expected base .search-wrapper rule');
		assert.ok(scopedRule, 'Expected scoped .diff-line-left .search-wrapper rule');

		for (const rule of [baseRule, scopedRule]) {
			assert.ok(
				rule!.includes('white-space: inherit'),
				`Expected ${rule} to inherit white-space from the diff line`
			);
			assert.ok(
				!rule!.includes('white-space: pre'),
				`Expected ${rule} not to force white-space: pre`
			);
		}
	});

	test('search highlight inherits white-space so wrapped lines stay wrapped during search', () => {
		const css = readCss();
		const baseRule = getRuleBlock(css, '.search-highlight');
		const scopedRule = getRuleBlock(css, '.diff-line-left .search-highlight');

		assert.ok(baseRule, 'Expected base .search-highlight rule');
		assert.ok(scopedRule, 'Expected scoped .diff-line-left .search-highlight rule');

		for (const rule of [baseRule, scopedRule]) {
			assert.ok(
				rule!.includes('white-space: inherit'),
				`Expected ${rule} to inherit white-space from the diff line`
			);
			assert.ok(
				!rule!.includes('white-space: pre'),
				`Expected ${rule} not to force white-space: pre`
			);
		}
	});
});
