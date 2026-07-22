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

/** @type {{ getLineOffsetWithinContainer: typeof getLineOffsetWithinContainer, calculateOverviewMarkerPercent: typeof calculateOverviewMarkerPercent, lineHasDiffChanges: typeof lineHasDiffChanges, isLineInExpandedFile: typeof isLineInExpandedFile, isLineMeasurable: typeof isLineMeasurable, shouldIncludeLineInOverviewRuler: typeof shouldIncludeLineInOverviewRuler }} */
const DiffViewOverviewRulerUtils = {
    getLineOffsetWithinContainer,
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
