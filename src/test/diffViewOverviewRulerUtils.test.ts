import * as assert from 'assert';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const overviewRulerUtils = require(path.join(__dirname, '../../media/diffViewOverviewRulerUtils.js')) as {
	getLineOffsetWithinContainer: (line: Element, container: HTMLElement) => number;
	calculateOverviewMarkerPercent: (lineOffset: number, totalHeight: number) => number;
	lineHasDiffChanges: (line: Element) => boolean;
	isLineInExpandedFile: (line: Element) => boolean;
	isLineMeasurable: (line: Element) => boolean;
	shouldIncludeLineInOverviewRuler: (line: Element) => boolean;
};

interface MockRect {
	top: number;
	height: number;
}

function createMockContainer(options: {
	scrollHeight: number;
	scrollTop: number;
	top: number;
	height?: number;
}): HTMLElement {
	const rect: MockRect = {
		top: options.top,
		height: options.height ?? 800,
	};

	return {
		scrollHeight: options.scrollHeight,
		scrollTop: options.scrollTop,
		getBoundingClientRect: () => ({
			top: rect.top,
			left: 0,
			right: 0,
			bottom: rect.top + rect.height,
			width: 0,
			height: rect.height,
			x: 0,
			y: rect.top,
			toJSON: () => ({}),
		}),
	} as unknown as HTMLElement;
}

function createMockLine(options: {
	offsetTop: number;
	top: number;
	height?: number;
}): Element {
	const rect: MockRect = {
		top: options.top,
		height: options.height ?? 18,
	};

	return {
		offsetTop: options.offsetTop,
		getBoundingClientRect: () => ({
			top: rect.top,
			left: 0,
			right: 0,
			bottom: rect.top + rect.height,
			width: 0,
			height: rect.height,
			x: 0,
			y: rect.top,
			toJSON: () => ({}),
		}),
	} as unknown as Element;
}

suite('DiffView overview ruler utilities', () => {
	test('positions markers using container-relative offset for nested diff lines', () => {
		const container = createMockContainer({
			scrollHeight: 2000,
			scrollTop: 0,
			top: 100,
		});

		// Simulates a changed line deep in the file. offsetTop is relative to a nested parent,
		// not the scroll container, so using it directly would place the marker near the top.
		const changedLine = createMockLine({
			offsetTop: 200,
			top: 1500,
		}) as HTMLElement;

		const lineOffset = overviewRulerUtils.getLineOffsetWithinContainer(changedLine, container);
		const markerPercent = overviewRulerUtils.calculateOverviewMarkerPercent(
			lineOffset,
			container.scrollHeight
		);
		const incorrectPercent = overviewRulerUtils.calculateOverviewMarkerPercent(
			changedLine.offsetTop,
			container.scrollHeight
		);

		assert.strictEqual(lineOffset, 1400);
		assert.strictEqual(markerPercent, 70);
		assert.strictEqual(incorrectPercent, 10);
		assert.ok(markerPercent > 50, 'marker should appear in the lower half of the file');
		assert.notStrictEqual(markerPercent, incorrectPercent);
	});

	test('accounts for container scroll position when calculating marker offset', () => {
		const container = createMockContainer({
			scrollHeight: 2000,
			scrollTop: 500,
			top: 100,
		});

		const changedLine = createMockLine({
			offsetTop: 200,
			top: 1000,
		});

		const lineOffset = overviewRulerUtils.getLineOffsetWithinContainer(changedLine, container);
		const markerPercent = overviewRulerUtils.calculateOverviewMarkerPercent(
			lineOffset,
			container.scrollHeight
		);

		assert.strictEqual(lineOffset, 1400);
		assert.strictEqual(markerPercent, 70);
	});

	test('returns zero percent when container has no scrollable height', () => {
		assert.strictEqual(overviewRulerUtils.calculateOverviewMarkerPercent(400, 0), 0);
	});
});

function createMockDiffLine(options: {
	classes?: string[];
	hasCharAdded?: boolean;
	hasCharRemoved?: boolean;
	expanded?: boolean;
	measurable?: boolean;
}): Element {
	const classes = new Set(options.classes ?? []);
	const expanded = options.expanded ?? true;
	const measurable = options.measurable ?? true;

	const diffContent = {
		classList: {
			contains: (className: string) =>
				className === 'expanded' ? expanded : false,
		},
	};

	const fileGroup = {
		querySelector: (selector: string) =>
			selector === '.diff-content' ? diffContent : null,
	};

	return {
		classList: {
			contains: (className: string) => classes.has(className),
		},
		querySelector: (selector: string) => {
			if (selector === '.char-added') {
				return options.hasCharAdded ? {} : null;
			}
			if (selector === '.char-removed') {
				return options.hasCharRemoved ? {} : null;
			}
			return null;
		},
		closest: (selector: string) => (selector === '.file-group' ? fileGroup : null),
		getBoundingClientRect: () => ({
			top: 0,
			left: 0,
			right: measurable ? 100 : 0,
			bottom: measurable ? 18 : 0,
			width: measurable ? 100 : 0,
			height: measurable ? 18 : 0,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		}),
	} as unknown as Element;
}

suite('DiffView overview ruler line filtering', () => {
	test('does not treat unchanged lines as diff changes', () => {
		const unchangedLine = createMockDiffLine({});

		assert.strictEqual(overviewRulerUtils.lineHasDiffChanges(unchangedLine), false);
		assert.strictEqual(
			overviewRulerUtils.shouldIncludeLineInOverviewRuler(unchangedLine),
			false
		);
	});

	test('includes lines with added, removed, or character-level diff markers', () => {
		assert.strictEqual(
			overviewRulerUtils.lineHasDiffChanges(createMockDiffLine({ classes: ['added'] })),
			true
		);
		assert.strictEqual(
			overviewRulerUtils.lineHasDiffChanges(createMockDiffLine({ classes: ['removed'] })),
			true
		);
		assert.strictEqual(
			overviewRulerUtils.lineHasDiffChanges(createMockDiffLine({ hasCharAdded: true })),
			true
		);
		assert.strictEqual(
			overviewRulerUtils.lineHasDiffChanges(createMockDiffLine({ hasCharRemoved: true })),
			true
		);
	});

	test('excludes diff lines from collapsed files', () => {
		const collapsedChangedLine = createMockDiffLine({
			classes: ['added'],
			expanded: false,
		});

		assert.strictEqual(overviewRulerUtils.isLineInExpandedFile(collapsedChangedLine), false);
		assert.strictEqual(
			overviewRulerUtils.shouldIncludeLineInOverviewRuler(collapsedChangedLine),
			false
		);
	});

	test('includes measurable changed lines only from expanded files', () => {
		const changedLine = createMockDiffLine({
			classes: ['added'],
			expanded: true,
			measurable: true,
		});

		assert.strictEqual(overviewRulerUtils.isLineInExpandedFile(changedLine), true);
		assert.strictEqual(overviewRulerUtils.isLineMeasurable(changedLine), true);
		assert.strictEqual(overviewRulerUtils.shouldIncludeLineInOverviewRuler(changedLine), true);
	});

	test('excludes hidden lines that cannot be measured in the layout', () => {
		const hiddenChangedLine = createMockDiffLine({
			classes: ['added'],
			expanded: true,
			measurable: false,
		});

		assert.strictEqual(overviewRulerUtils.isLineMeasurable(hiddenChangedLine), false);
		assert.strictEqual(
			overviewRulerUtils.shouldIncludeLineInOverviewRuler(hiddenChangedLine),
			false
		);
	});
});
