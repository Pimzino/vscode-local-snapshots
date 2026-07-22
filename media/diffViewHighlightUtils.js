// @ts-check

/** @type {string} */
const ADDED_LINE_MARKER_COLOR = '#73c991';

/** @type {string} */
const REMOVED_LINE_MARKER_COLOR = '#f14c4c';

/**
 * @param {string} lineType
 * @param {boolean} lineLevelDiffEnabled
 * @returns {string}
 */
function getDiffLineClass(lineType, lineLevelDiffEnabled) {
    if (lineType === 'unchanged' || !lineLevelDiffEnabled) {
        return '';
    }

    return lineType;
}

/**
 * Character-level highlighting is only shown when line-level diff is off.
 * @param {{ characterLevelDiffEnabled: boolean, lineLevelDiffEnabled: boolean, lineType: string }} options
 * @returns {boolean}
 */
function shouldApplyCharacterLevelDiff(options) {
    const { characterLevelDiffEnabled, lineLevelDiffEnabled, lineType } = options;

    return (
        characterLevelDiffEnabled &&
        !lineLevelDiffEnabled &&
        lineType !== 'unchanged'
    );
}

/**
 * @param {{ lineLevelDiffEnabled: boolean, isAdded: boolean, characterHighlightColor: string }} options
 * @returns {string}
 */
function getOverviewMarkerColor(options) {
    const { lineLevelDiffEnabled, isAdded, characterHighlightColor } = options;

    if (lineLevelDiffEnabled) {
        return isAdded ? ADDED_LINE_MARKER_COLOR : REMOVED_LINE_MARKER_COLOR;
    }

    return characterHighlightColor;
}

/** @type {{ getDiffLineClass: typeof getDiffLineClass, shouldApplyCharacterLevelDiff: typeof shouldApplyCharacterLevelDiff, getOverviewMarkerColor: typeof getOverviewMarkerColor, ADDED_LINE_MARKER_COLOR: string, REMOVED_LINE_MARKER_COLOR: string }} */
const DiffViewHighlightUtils = {
    getDiffLineClass,
    shouldApplyCharacterLevelDiff,
    getOverviewMarkerColor,
    ADDED_LINE_MARKER_COLOR,
    REMOVED_LINE_MARKER_COLOR,
};

if (typeof window !== 'undefined') {
    // @ts-ignore
    window.DiffViewHighlightUtils = DiffViewHighlightUtils;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DiffViewHighlightUtils;
}
