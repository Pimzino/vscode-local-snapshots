// @ts-check

/**
 * @param {HTMLElement | null | undefined} header
 * @returns {string | null}
 */
function getFilePathFromHeader(header) {
    if (!header) {
        return null;
    }

    const fromAttribute = header.getAttribute('data-file-path');
    if (fromAttribute) {
        return fromAttribute;
    }

    const pathElement = header.querySelector('.file-path .path');
    const fromText = pathElement?.textContent?.trim();
    return fromText || null;
}

/**
 * @param {Element | null | undefined} filePathElement
 * @returns {HTMLElement | null}
 */
function findFileHeaderFromFilePath(filePathElement) {
    if (!filePathElement?.closest) {
        return null;
    }

    return filePathElement.closest('.file-header') ?? null;
}

/**
 * @param {EventTarget | null | undefined} target
 * @returns {HTMLElement | null}
 */
function getFileHeaderFromCopyTarget(target) {
    if (!target || typeof target !== 'object' || typeof /** @type {{ closest?: unknown }} */ (target).closest !== 'function') {
        return null;
    }

    const element = /** @type {Element} */ (target);
    const filePath = element.closest('.file-path');
    if (filePath) {
        return findFileHeaderFromFilePath(filePath);
    }

    const header = element.closest('.file-header');
    if (!header || element.closest('.actions')) {
        return null;
    }

    return /** @type {HTMLElement} */ (header);
}

/**
 * Selects the visible file path text so native copy works in webviews.
 * @param {HTMLElement | null | undefined} header
 * @returns {boolean}
 */
function selectFilePathText(header) {
    const pathElement = header?.querySelector('.file-path .path');
    if (!(pathElement instanceof HTMLElement)) {
        return false;
    }

    const selection = window.getSelection?.();
    if (!selection) {
        return false;
    }

    const range = document.createRange();
    range.selectNodeContents(pathElement);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
}

/**
 * @param {ClipboardEvent} event
 * @param {HTMLElement | null | undefined} header
 * @returns {{ handled: boolean, filePath: string | null, needsExtensionClipboard: boolean }}
 */
function handleFilePathCopyEvent(event, header) {
    const filePath = getFilePathFromHeader(header);
    if (!filePath) {
        return {
            handled: false,
            filePath: null,
            needsExtensionClipboard: false,
        };
    }

    event.preventDefault();

    if (event.clipboardData) {
        event.clipboardData.setData('text/plain', filePath);
    }

    return {
        handled: true,
        filePath,
        needsExtensionClipboard: true,
    };
}

/** @type {{ getFilePathFromHeader: typeof getFilePathFromHeader, findFileHeaderFromFilePath: typeof findFileHeaderFromFilePath, getFileHeaderFromCopyTarget: typeof getFileHeaderFromCopyTarget, selectFilePathText: typeof selectFilePathText, handleFilePathCopyEvent: typeof handleFilePathCopyEvent }} */
const DiffViewClipboardUtils = {
    getFilePathFromHeader,
    findFileHeaderFromFilePath,
    getFileHeaderFromCopyTarget,
    selectFilePathText,
    handleFilePathCopyEvent,
};

if (typeof window !== 'undefined') {
    // @ts-ignore
    window.DiffViewClipboardUtils = DiffViewClipboardUtils;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DiffViewClipboardUtils;
}
