import * as assert from 'assert';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const overviewRulerUtils = require(path.join(__dirname, '../../media/diffViewOverviewRulerUtils.js')) as {
	getLineOffsetWithinContainer: (line: Element, container: HTMLElement) => number;
	getOverviewRulerBounds: (container: HTMLElement) => { top: number; height: number; bottom: number };
	getOverviewRulerTotalHeight: (container: HTMLElement) => number;
	getOverviewRulerScale: (container: HTMLElement) => { mode: 'document'; offsetTop: number; totalHeight: number };
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
		offsetHeight: options.height ?? 800,
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
		querySelectorAll: () => [],
	} as unknown as HTMLElement;
}

function createMockDiffContent(options: {
	top: number;
	height: number;
}): HTMLElement {
	return {
		offsetHeight: options.height,
		getBoundingClientRect: () => ({
			top: options.top,
			left: 0,
			right: 0,
			bottom: options.top + options.height,
			width: 0,
			height: options.height,
			x: 0,
			y: options.top,
			toJSON: () => ({}),
		}),
	} as unknown as HTMLElement;
}

function createMockContainerWithExpandedContent(options: {
	scrollHeight: number;
	scrollTop: number;
	containerTop: number;
	contentTop: number;
	contentHeight: number;
	containerHeight?: number;
}): HTMLElement {
	const expandedContent = createMockDiffContent({
		top: options.contentTop,
		height: options.contentHeight,
	});

	return {
		scrollHeight: options.scrollHeight,
		scrollTop: options.scrollTop,
		offsetHeight: options.containerHeight ?? 800,
		getBoundingClientRect: () => ({
			top: options.containerTop,
			left: 0,
			right: 0,
			bottom: options.containerTop + (options.containerHeight ?? 800),
			width: 0,
			height: options.containerHeight ?? 800,
			x: 0,
			y: options.containerTop,
			toJSON: () => ({}),
		}),
		querySelectorAll: (selector: string) =>
			selector === '.file-group > .diff-content.expanded' ? [expandedContent] : [],
	} as unknown as HTMLElement;
}

function createMockFileGroup(options: {
	headerTop: number;
	expanded: boolean;
	contentTop?: number;
	contentHeight: number;
}): HTMLElement {
	const headerHeight = 65;
	const contentTop = options.contentTop ?? options.headerTop + headerHeight;
	const groupHeight = options.expanded
		? headerHeight + options.contentHeight
		: headerHeight;

	const header = {
		getBoundingClientRect: () => ({
			top: options.headerTop,
			left: 0,
			right: 0,
			bottom: options.headerTop + headerHeight,
			width: 0,
			height: headerHeight,
			x: 0,
			y: options.headerTop,
			toJSON: () => ({}),
		}),
	};

	const content = {
		classList: {
			contains: (className: string) => className === 'expanded' && options.expanded,
		},
		offsetHeight: options.expanded ? options.contentHeight : 0,
		getBoundingClientRect: () => ({
			top: contentTop,
			left: 0,
			right: 0,
			bottom: contentTop + (options.expanded ? options.contentHeight : 0),
			width: 0,
			height: options.expanded ? options.contentHeight : 0,
			x: 0,
			y: contentTop,
			toJSON: () => ({}),
		}),
	};

	return {
		offsetHeight: groupHeight,
		querySelector: (selector: string) => {
			if (selector === '.file-header') {
				return header;
			}
			if (selector === '.diff-content') {
				return content;
			}
			return null;
		},
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
		const totalHeight = overviewRulerUtils.getOverviewRulerTotalHeight(container);
		const markerPercent = overviewRulerUtils.calculateOverviewMarkerPercent(
			lineOffset,
			totalHeight
		);
		const incorrectPercent = overviewRulerUtils.calculateOverviewMarkerPercent(
			changedLine.offsetTop,
			totalHeight
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
		const totalHeight = overviewRulerUtils.getOverviewRulerTotalHeight(container);
		const markerPercent = overviewRulerUtils.calculateOverviewMarkerPercent(
			lineOffset,
			totalHeight
		);

		assert.strictEqual(lineOffset, 1400);
		assert.strictEqual(markerPercent, 70);
	});

	test('returns zero percent when total height is zero', () => {
		assert.strictEqual(overviewRulerUtils.calculateOverviewMarkerPercent(400, 0), 0);
	});

	test('uses measured content bottom when scrollHeight under-reports for the first file', () => {
		const fileHeaderHeight = 60;
		const lineHeight = 18;
		const contentHeight = 3600;
		const container = createMockContainerWithExpandedContent({
			scrollHeight: 1200,
			scrollTop: 0,
			containerTop: 100,
			contentTop: 100 + fileHeaderHeight,
			contentHeight,
		});

		const bounds = overviewRulerUtils.getOverviewRulerBounds(container);
		const totalHeight = overviewRulerUtils.getOverviewRulerTotalHeight(container);
		const firstChangedLine = createMockLine({
			offsetTop: 200,
			top: 100 + fileHeaderHeight + 50 * lineHeight,
		});

		const lineOffset = overviewRulerUtils.getLineOffsetWithinContainer(firstChangedLine, container);
		const markerPercent = overviewRulerUtils.calculateOverviewMarkerPercent(lineOffset, totalHeight);
		const buggyPercent = overviewRulerUtils.calculateOverviewMarkerPercent(
			lineOffset,
			container.scrollHeight
		);

		assert.strictEqual(bounds.top, fileHeaderHeight);
		assert.strictEqual(bounds.bottom, fileHeaderHeight + contentHeight);
		assert.strictEqual(totalHeight, fileHeaderHeight + contentHeight);
		assert.strictEqual(markerPercent, (lineOffset / totalHeight) * 100);
		assert.ok(
			markerPercent < buggyPercent,
			'first-file markers should not be pushed down by an under-reported scrollHeight'
		);
		assert.ok(markerPercent < 30, 'first change around line 50 should not appear past the lower third');
	});

	test('keeps fourth-file marker positions when scrollHeight is already correct', () => {
		const fileHeaderHeight = 60;
		const lineHeight = 18;
		const contentHeight = 1800;
		const headersAbove = fileHeaderHeight * 3;
		const contentTop = 100 + headersAbove + fileHeaderHeight;
		const scrollHeight = headersAbove + fileHeaderHeight + contentHeight;
		const container = createMockContainerWithExpandedContent({
			scrollHeight,
			scrollTop: 0,
			containerTop: 100,
			contentTop,
			contentHeight,
		});

		const totalHeight = overviewRulerUtils.getOverviewRulerTotalHeight(container);
		const changedLine = createMockLine({
			offsetTop: 200,
			top: contentTop + 10 * lineHeight,
		});

		const lineOffset = overviewRulerUtils.getLineOffsetWithinContainer(changedLine, container);
		const markerPercent = overviewRulerUtils.calculateOverviewMarkerPercent(lineOffset, totalHeight);
		const expectedPercent = (lineOffset / scrollHeight) * 100;

		assert.strictEqual(totalHeight, scrollHeight);
		assert.strictEqual(markerPercent, expectedPercent);
	});

	test('uses scrollHeight for first-file markers when collapsed siblings follow expanded file', () => {
		const containerTop = 100;
		const scrollTop = 0;
		const scrollHeight = 90509;
		const firstFileBottom = 90225;
		const collapsedHeaderTop = containerTop + firstFileBottom;

		const firstGroup = {
			offsetHeight: 90224,
			querySelector: (selector: string) => {
				if (selector === '.file-header') {
					return {
						getBoundingClientRect: () => ({
							top: containerTop + 1,
							left: 0,
							right: 0,
							bottom: containerTop + 66,
							width: 0,
							height: 65,
							x: 0,
							y: containerTop + 1,
							toJSON: () => ({}),
						}),
					};
				}
				if (selector === '.diff-content') {
					return {
						classList: { contains: (className: string) => className === 'expanded' },
						offsetHeight: 90159,
						getBoundingClientRect: () => ({
							top: containerTop + 65,
							left: 0,
							right: 0,
							bottom: containerTop + 90224,
							width: 0,
							height: 90159,
							x: 0,
							y: containerTop + 65,
							toJSON: () => ({}),
						}),
					};
				}
				return null;
			},
		};

		const collapsedGroup = {
			offsetHeight: 65,
			querySelector: (selector: string) => {
				if (selector === '.file-header') {
					return {
						getBoundingClientRect: () => ({
							top: collapsedHeaderTop,
							left: 0,
							right: 0,
							bottom: collapsedHeaderTop + 65,
							width: 0,
							height: 65,
							x: 0,
							y: collapsedHeaderTop,
							toJSON: () => ({}),
						}),
					};
				}
				if (selector === '.diff-content') {
					return {
						classList: { contains: () => false },
						offsetHeight: 0,
						getBoundingClientRect: () => ({
							top: collapsedHeaderTop + 65,
							left: 0,
							right: 0,
							bottom: collapsedHeaderTop + 65,
							width: 0,
							height: 0,
							x: 0,
							y: collapsedHeaderTop + 65,
							toJSON: () => ({}),
						}),
					};
				}
				return null;
			},
		};

		const container = {
			scrollHeight,
			scrollTop,
			getBoundingClientRect: () => ({
				top: containerTop,
				left: 0,
				right: 0,
				bottom: containerTop + 323,
				width: 0,
				height: 323,
				x: 0,
				y: containerTop,
				toJSON: () => ({}),
			}),
			querySelectorAll: (selector: string) => {
				if (selector === '.file-group') {
					return [firstGroup, collapsedGroup];
				}
				if (selector === '.file-group > .diff-content.expanded') {
					return [firstGroup.querySelector('.diff-content')];
				}
				return [];
			},
		} as unknown as HTMLElement;

		const totalHeight = overviewRulerUtils.getOverviewRulerTotalHeight(container);
		const firstChangeLine = createMockLine({
			offsetTop: 200,
			top: containerTop + 2998,
		});
		const lastChangeLine = createMockLine({
			offsetTop: 89000,
			top: containerTop + 90189,
		});

		const firstOffset = overviewRulerUtils.getLineOffsetWithinContainer(firstChangeLine, container);
		const lastOffset = overviewRulerUtils.getLineOffsetWithinContainer(lastChangeLine, container);
		const firstPercent = overviewRulerUtils.calculateOverviewMarkerPercent(firstOffset, totalHeight);
		const lastPercent = overviewRulerUtils.calculateOverviewMarkerPercent(lastOffset, totalHeight);

		assert.strictEqual(totalHeight, scrollHeight);
		assert.ok(firstPercent > 3 && firstPercent < 4, `expected ~3.3%, got ${firstPercent}`);
		assert.ok(lastPercent > 99 && lastPercent <= 100, `expected ~99.6%, got ${lastPercent}`);
	});

	test('keeps marker and scrollbar on the same scrollHeight coordinate system', () => {
		const containerTop = 100;
		const contentViewportTop = 298;
		const contentHeight = 24815;
		const scrollHeight = 25156;

		const expandedContent = createMockDiffContent({
			top: contentViewportTop,
			height: contentHeight,
		});

		const container = {
			scrollHeight,
			scrollTop: 0,
			getBoundingClientRect: () => ({
				top: containerTop,
				left: 0,
				right: 0,
				bottom: containerTop + 332,
				width: 0,
				height: 332,
				x: 0,
				y: containerTop,
				toJSON: () => ({}),
			}),
			querySelectorAll: (selector: string) =>
				selector === '.file-group > .diff-content.expanded' ? [expandedContent] : [],
		} as unknown as HTMLElement;

		const totalHeight = overviewRulerUtils.getOverviewRulerTotalHeight(container);
		const changedLine = createMockLine({
			offsetTop: 200,
			top: containerTop + 1155,
		});

		const lineOffset = overviewRulerUtils.getLineOffsetWithinContainer(changedLine, container);
		const markerPercent = overviewRulerUtils.calculateOverviewMarkerPercent(lineOffset, totalHeight);
		const scrollHeightPercent = overviewRulerUtils.calculateOverviewMarkerPercent(lineOffset, scrollHeight);

		assert.strictEqual(totalHeight, scrollHeight);
		assert.strictEqual(markerPercent, scrollHeightPercent);
		assert.strictEqual(markerPercent, (lineOffset / scrollHeight) * 100);
		assert.ok(markerPercent > 4 && markerPercent < 5, `expected ~4.6%, got ${markerPercent}`);
	});

	test('uses scrollHeight when exactly one file is expanded so minimap matches scrollbar', () => {
		const containerTop = 100;
		const contentViewportTop = 298;
		const contentHeight = 24815;
		const scrollHeight = 25156;

		const expandedContent = createMockDiffContent({
			top: contentViewportTop,
			height: contentHeight,
		});

		const container = {
			scrollHeight,
			scrollTop: 0,
			getBoundingClientRect: () => ({
				top: containerTop,
				left: 0,
				right: 0,
				bottom: containerTop + 332,
				width: 0,
				height: 332,
				x: 0,
				y: containerTop,
				toJSON: () => ({}),
			}),
			querySelectorAll: (selector: string) =>
				selector === '.file-group > .diff-content.expanded' ? [expandedContent] : [],
		} as unknown as HTMLElement;

		const scale = overviewRulerUtils.getOverviewRulerScale(container);
		const changedLine = createMockLine({
			offsetTop: 200,
			top: containerTop + 1155,
		});
		const lineOffset = overviewRulerUtils.getLineOffsetWithinContainer(changedLine, container);
		const markerPercent = overviewRulerUtils.calculateOverviewMarkerPercent(
			lineOffset,
			scale.totalHeight
		);

		assert.strictEqual(scale.mode, 'document');
		assert.strictEqual(scale.totalHeight, scrollHeight);
		assert.ok(markerPercent > 4 && markerPercent < 5, `expected ~4.6%, got ${markerPercent}`);
	});

	test('uses measured layout when scrollHeight over-reports after collapse', () => {
		const containerTop = 100;
		const contentViewportTop = 298;
		const contentTop = contentViewportTop - containerTop;
		const contentHeight = 24815;
		const staleScrollHeight = 173290;

		const expandedContent = createMockDiffContent({
			top: contentViewportTop,
			height: contentHeight,
		});

		const collapsedHeaderHeight = 65;
		const fileGroups = [
			createMockFileGroup({
				headerTop: containerTop + 1,
				expanded: false,
				contentHeight: 0,
			}),
			createMockFileGroup({
				headerTop: containerTop + 1 + collapsedHeaderHeight,
				expanded: false,
				contentHeight: 0,
			}),
			createMockFileGroup({
				headerTop: containerTop + 1 + collapsedHeaderHeight * 2,
				expanded: true,
				contentTop: contentViewportTop,
				contentHeight,
			}),
		];

		const container = {
			scrollHeight: staleScrollHeight,
			scrollTop: 0,
			getBoundingClientRect: () => ({
				top: containerTop,
				left: 0,
				right: 0,
				bottom: containerTop + 332,
				width: 0,
				height: 332,
				x: 0,
				y: containerTop,
				toJSON: () => ({}),
			}),
			querySelectorAll: (selector: string) => {
				if (selector === '.file-group') {
					return fileGroups;
				}
				if (selector === '.file-group > .diff-content.expanded') {
					return [expandedContent];
				}
				return [];
			},
		} as unknown as HTMLElement;

		const totalHeight = overviewRulerUtils.getOverviewRulerTotalHeight(container);
		const changedLine = createMockLine({
			offsetTop: 200,
			top: containerTop + 1155,
		});
		const lineOffset = overviewRulerUtils.getLineOffsetWithinContainer(changedLine, container);
		const markerPercent = overviewRulerUtils.calculateOverviewMarkerPercent(lineOffset, totalHeight);
		const stalePercent = overviewRulerUtils.calculateOverviewMarkerPercent(lineOffset, staleScrollHeight);

		assert.notStrictEqual(totalHeight, staleScrollHeight);
		assert.ok(totalHeight < staleScrollHeight * 0.2, `layout height should be much smaller than stale scrollHeight`);
		assert.ok(markerPercent > 4 && markerPercent < 5, `expected ~4.6%, got ${markerPercent}`);
		assert.ok(stalePercent < 1, `stale scrollHeight would compress marker to ${stalePercent}%`);
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
