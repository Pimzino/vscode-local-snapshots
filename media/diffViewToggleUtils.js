// @ts-check

/**
 * Synchronizes a toggle button's visual active state with its enabled value.
 * @param {HTMLElement | null | undefined} button
 * @param {boolean} enabled
 */
function syncToggleButtonState(button, enabled) {
    if (!button) {
        return;
    }

    button.classList.toggle('active', enabled);
}

/**
 * @param {HTMLElement | null | undefined} button
 * @returns {boolean}
 */
function isToggleButtonActive(button) {
    return Boolean(button?.classList.contains('active'));
}

/**
 * @param {ParentNode | null | undefined} container
 * @param {string} selector
 * @param {boolean} enabled
 */
function syncToggleBySelector(container, selector, enabled) {
    if (!container) {
        return;
    }

    const button = container.querySelector(selector);
    syncToggleButtonState(/** @type {HTMLElement | null} */ (button), enabled);
}

/** @type {{ syncToggleButtonState: typeof syncToggleButtonState, isToggleButtonActive: typeof isToggleButtonActive, syncToggleBySelector: typeof syncToggleBySelector }} */
const DiffViewToggleUtils = {
    syncToggleButtonState,
    isToggleButtonActive,
    syncToggleBySelector,
};

if (typeof window !== 'undefined') {
    // @ts-ignore
    window.DiffViewToggleUtils = DiffViewToggleUtils;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DiffViewToggleUtils;
}
