import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const toggleUtils = require(path.join(__dirname, '../../media/diffViewToggleUtils.js')) as {
	syncToggleButtonState: (button: HTMLElement | null | undefined, enabled: boolean) => void;
	isToggleButtonActive: (button: HTMLElement | null | undefined) => boolean;
	syncToggleBySelector: (container: ParentNode | null | undefined, selector: string, enabled: boolean) => void;
};

function createMockClassList(): { classes: Set<string>; classList: DOMTokenList } {
	const classes = new Set<string>();
	const classList = {
		add: (...tokens: string[]) => tokens.forEach(token => classes.add(token)),
		remove: (...tokens: string[]) => tokens.forEach(token => classes.delete(token)),
		contains: (token: string) => classes.has(token),
		toggle: (token: string, force?: boolean) => {
			if (force === undefined) {
				if (classes.has(token)) {
					classes.delete(token);
					return false;
				}

				classes.add(token);
				return true;
			}

			if (force) {
				classes.add(token);
			} else {
				classes.delete(token);
			}

			return force;
		},
	} as unknown as DOMTokenList;

	return { classes, classList };
}

function createToggleButton(className = 'global-control text-wrap-toggle'): HTMLElement {
	const { classList } = createMockClassList();
	const element = { className, classList } as unknown as HTMLElement;
	return element;
}

function createMockContainer(children: HTMLElement[]): ParentNode {
	return {
		querySelector: (selector: string) =>
			children.find(child => child.className.includes(selector.replace('.', ''))) ?? null,
	} as unknown as ParentNode;
}

suite('DiffView toggle utilities', () => {
	test('adds active class when toggle is enabled', () => {
		const button = createToggleButton();

		toggleUtils.syncToggleButtonState(button, true);

		assert.strictEqual(toggleUtils.isToggleButtonActive(button), true);
		assert.ok(button.classList.contains('active'));
	});

	test('removes active class when toggle is disabled', () => {
		const button = createToggleButton();
		button.classList.add('active');

		toggleUtils.syncToggleButtonState(button, false);

		assert.strictEqual(toggleUtils.isToggleButtonActive(button), false);
		assert.ok(!button.classList.contains('active'));
	});

	test('syncToggleBySelector updates matching toggle button', () => {
		const wrapToggle = createToggleButton('global-control text-wrap-toggle');
		const lineToggle = createToggleButton('global-control line-level-diff-toggle');
		const container = createMockContainer([wrapToggle, lineToggle]);

		toggleUtils.syncToggleBySelector(container, '.text-wrap-toggle', true);
		toggleUtils.syncToggleBySelector(container, '.line-level-diff-toggle', false);

		assert.strictEqual(toggleUtils.isToggleButtonActive(wrapToggle), true);
		assert.strictEqual(toggleUtils.isToggleButtonActive(lineToggle), false);
	});

	test('syncToggleBySelector is a no-op when container is missing', () => {
		assert.doesNotThrow(() => {
			toggleUtils.syncToggleBySelector(null, '.text-wrap-toggle', true);
		});
	});
});

suite('DiffView toggle CSS', () => {
	const cssPath = path.join(__dirname, '../../media/diffView.css');

	test('defines borderless off-state for wrap text and line diff toggles', () => {
		const css = fs.readFileSync(cssPath, 'utf8');

		assert.ok(
			css.includes('.action-group .global-control.text-wrap-toggle'),
			'Expected wrap text toggle off-state styles'
		);
		assert.ok(
			css.includes('.action-group .global-control.line-level-diff-toggle'),
			'Expected line diff toggle off-state styles'
		);
		assert.match(
			css,
			/\.action-group \.global-control\.text-wrap-toggle[\s\S]*?border:\s*none/,
			'Expected off-state wrap text toggle to have no border'
		);
	});

	test('defines bordered on-state for wrap text and line diff toggles', () => {
		const css = fs.readFileSync(cssPath, 'utf8');

		assert.ok(
			css.includes('.action-group .global-control.text-wrap-toggle.active'),
			'Expected wrap text toggle on-state styles'
		);
		assert.ok(
			css.includes('.action-group .global-control.line-level-diff-toggle.active'),
			'Expected line diff toggle on-state styles'
		);
		assert.match(
			css,
			/\.action-group \.global-control\.text-wrap-toggle\.active[\s\S]*?border:\s*1px solid var\(--vscode-widget-border\)/,
			'Expected on-state toggle to show a widget border'
		);
	});
});
