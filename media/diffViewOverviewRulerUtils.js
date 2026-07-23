// @ts-check

/**
 * Returns a diff line's top offset relative to the scroll container's content.
 * @param {Element} line
 * @param {HTMLElement} container
 * @returns {number}
 */
function getLineOffsetWithinContainer(line, container) {
    const lineRect = line.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    return lineRect.top - containerRect.top + container.scrollTop;
}

/**
 * Returns the bottom edge of the laid-out file list based on visible file groups.
 * @param {HTMLElement} container
 * @returns {number}
 */
function getMeasuredFileGroupsBottom(container) {
    let bottom = 0;

    container.querySelectorAll('.file-group').forEach(group => {
        if (!group || typeof /** @type {HTMLElement} */ (group).offsetHeight !== 'number') {
            return;
        }

        const groupElement = /** @type {HTMLElement} */ (group);
        const header = group.querySelector('.file-header');
        if (!header) {
            return;
        }

        const top = getLineOffsetWithinContainer(header, container);
        bottom = Math.max(bottom, top + groupElement.offsetHeight);
    });

    return bottom;
}

/**
 * Returns the scroll-space bounds of all expanded diff content regions.
 * @param {HTMLElement} container
 * @returns {{ top: number, height: number, bottom: number }}
 */
function getOverviewRulerBounds(container) {
    const expandedContents = container.querySelectorAll('.file-group > .diff-content.expanded');
    if (expandedContents.length === 0) {
        const measuredBottom = getMeasuredFileGroupsBottom(container);
        const scrollHeight = container.scrollHeight;
        const bottom = measuredBottom > 0 ? measuredBottom : scrollHeight;
        return { top: 0, height: bottom, bottom };
    }

    let top = Infinity;
    let bottom = 0;

    expandedContents.forEach(content => {
        const contentElement = /** @type {HTMLElement} */ (content);
        if (!contentElement || typeof contentElement.offsetHeight !== 'number') {
            return;
        }

        const contentTop = getLineOffsetWithinContainer(content, container);
        const contentBottom = contentTop + contentElement.offsetHeight;
        top = Math.min(top, contentTop);
        bottom = Math.max(bottom, contentBottom);
    });

    if (top === Infinity) {
        const measuredBottom = getMeasuredFileGroupsBottom(container);
        const scrollHeight = container.scrollHeight;
        const resolvedBottom = measuredBottom > 0 ? measuredBottom : scrollHeight;
        return { top: 0, height: resolvedBottom, bottom: resolvedBottom };
    }

    const height = Math.max(0, bottom - top);
    return { top, height, bottom };
}

/**
 * Returns the total scrollable height used to map markers onto the overview ruler.
 * Mirrors VS Code's minimap: markers and the scrollbar share one coordinate system.
 * Use scrollHeight when it reflects the laid-out content; otherwise fall back to
 * measured layout when scrollHeight under-reports (e.g. first file before layout settles).
 * @param {HTMLElement} container
 * @returns {number}
 */
function getOverviewRulerTotalHeight(container) {
    const measuredBottom = getMeasuredFileGroupsBottom(container);
    const bounds = getOverviewRulerBounds(container);
    const layoutHeight = Math.max(measuredBottom, bounds.bottom);
    const scrollHeight = container.scrollHeight;

    if (layoutHeight === 0) {
        return scrollHeight;
    }

    // scrollHeight can under-report during layout or over-report after collapse;
    // trust measured layout when the two diverge.
    if (scrollHeight < layoutHeight * 0.99 || scrollHeight > layoutHeight * 1.01) {
        return layoutHeight;
    }

    return scrollHeight;
}

/**
 * Returns the coordinate system for mapping the overview ruler onto the scroll container.
 * Uses scrollHeight so markers and the viewport band align with the native scrollbar.
 * @param {HTMLElement} container
 * @returns {{ mode: 'document', offsetTop: number, totalHeight: number }}
 */
function getOverviewRulerScale(container) {
    const scrollHeight = container.scrollHeight;
    const totalHeight = scrollHeight > 0 ? scrollHeight : getOverviewRulerTotalHeight(container);

    return {
        mode: 'document',
        offsetTop: 0,
        totalHeight,
    };
}

/**
 * @param {number} lineOffset
 * @param {number} totalHeight
 * @returns {number}
 */
function calculateOverviewMarkerPercent(lineOffset, totalHeight) {
    if (totalHeight === 0) {
        return 0;
    }

    return (lineOffset / totalHeight) * 100;
}

/**
 * @param {Element} line
 * @returns {boolean}
 */
function lineHasDiffChanges(line) {
    return (
        line.classList.contains('added') ||
        line.classList.contains('removed') ||
        Boolean(line.querySelector('.char-added')) ||
        Boolean(line.querySelector('.char-removed'))
    );
}

/**
 * @param {Element} line
 * @returns {boolean}
 */
function isLineInExpandedFile(line) {
    const fileGroup = line.closest('.file-group');
    if (!fileGroup) {
        return false;
    }

    const diffContent = fileGroup.querySelector('.diff-content');
    return Boolean(diffContent?.classList.contains('expanded'));
}

/**
 * @param {Element} line
 * @returns {boolean}
 */
function isLineMeasurable(line) {
    const rect = line.getBoundingClientRect();
    return rect.height > 0 && rect.width > 0;
}

/**
 * @param {Element} line
 * @returns {boolean}
 */
function shouldIncludeLineInOverviewRuler(line) {
    return (
        lineHasDiffChanges(line) &&
        isLineInExpandedFile(line) &&
        isLineMeasurable(line)
    );
}

/** @type {{ getLineOffsetWithinContainer: typeof getLineOffsetWithinContainer, getMeasuredFileGroupsBottom: typeof getMeasuredFileGroupsBottom, getOverviewRulerBounds: typeof getOverviewRulerBounds, getOverviewRulerTotalHeight: typeof getOverviewRulerTotalHeight, getOverviewRulerScale: typeof getOverviewRulerScale, calculateOverviewMarkerPercent: typeof calculateOverviewMarkerPercent, lineHasDiffChanges: typeof lineHasDiffChanges, isLineInExpandedFile: typeof isLineInExpandedFile, isLineMeasurable: typeof isLineMeasurable, shouldIncludeLineInOverviewRuler: typeof shouldIncludeLineInOverviewRuler }} */
const DiffViewOverviewRulerUtils = {
    getLineOffsetWithinContainer,
    getMeasuredFileGroupsBottom,
    getOverviewRulerBounds,
    getOverviewRulerTotalHeight,
    getOverviewRulerScale,
    calculateOverviewMarkerPercent,
    lineHasDiffChanges,
    isLineInExpandedFile,
    isLineMeasurable,
    shouldIncludeLineInOverviewRuler,
};

if (typeof window !== 'undefined') {
    // @ts-ignore
    window.DiffViewOverviewRulerUtils = DiffViewOverviewRulerUtils;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DiffViewOverviewRulerUtils;
}
