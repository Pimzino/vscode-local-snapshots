// @ts-check
/// <reference path="./colorPicker.d.ts" />

(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    /**
     * @typedef {Object} DiffFile
     * @property {string} path
     * @property {string} [original]
     * @property {string} [modified]
     * @property {string} [status]
     */


    class DiffView {
        constructor() {
            /** @type {HTMLElement | null} */
            this.container = document.getElementById('diff-container');
            /** @type {string} */
            this.diffViewStyle = 'side-by-side'; // Default style
            /** @type {boolean} */
            this.textWrappingEnabled = false; // Default to no text wrapping
            /** @type {boolean} */
            this.lineLevelDiffEnabled = true; // Default to enabled
            /** @type {boolean} */
            this.characterLevelDiffEnabled = true; // Default to enabled
            /** @type {string} */
            this.characterDiffHighlightColor = '#FFD700'; // Default to gold color
            /** @type {number | null} */
            this.colorUpdateTimeout = null;
            /** @type {any[] | null} */
            this.currentFiles = null;
            /** @type {HTMLElement | null} */
            this.filesContainer = document.getElementById('files-list');
            /** @type {HTMLTemplateElement | null} */
            this.fileTemplate = /** @type {HTMLTemplateElement} */ (document.getElementById('file-template'));

            // Search elements
            /** @type {HTMLInputElement | null} */
            this.searchInput = /** @type {HTMLInputElement} */ (document.getElementById('search-input'));
            /** @type {HTMLElement | null} */
            this.searchCount = document.getElementById('search-count');
            /** @type {HTMLButtonElement | null} */
            this.prevMatchBtn = /** @type {HTMLButtonElement} */ (document.getElementById('prev-match'));
            /** @type {HTMLButtonElement | null} */
            this.nextMatchBtn = /** @type {HTMLButtonElement} */ (document.getElementById('next-match'));
            /** @type {HTMLButtonElement | null} */
            this.clearSearchBtn = /** @type {HTMLButtonElement} */ (document.getElementById('clear-search'));

            // Search state
            /** @type {number} */
            this.currentMatchIndex = -1;
            /** @type {HTMLElement[]} */
            this.currentMatches = [];

            // Global controls
            /** @type {HTMLElement | null} */
            this.expandAllBtn = document.querySelector('.expand-all');
            /** @type {HTMLElement | null} */
            this.collapseAllBtn = document.querySelector('.collapse-all');
            /** @type {HTMLElement | null} */
            this.restoreAllBtn = document.querySelector('.restore-all');
            /** @type {import('./colorPicker').ColorPicker | null} */
            this.colorPicker = null;

            if (!this.container || !this.filesContainer || !this.fileTemplate) {
                console.error('Required DOM elements not found');
                return;
            }

            this.initialize();
        }

        initialize() {
            // Handle global controls
            this.expandAllBtn?.addEventListener('click', () => this.expandAllFiles());
            this.collapseAllBtn?.addEventListener('click', () => this.collapseAllFiles());
            this.restoreAllBtn?.addEventListener('click', () => this.restoreAllFiles());

            // Create text wrap toggle button
            this.createTextWrapToggle();

            // Create line-level diff toggle button
            this.createLineLevelDiffToggle();

            // Create color picker
            this.createColorPicker();

            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.type) {
                    case 'showDiff': {
                        this.diffViewStyle = message.diffViewStyle || 'side-by-side';
                        this.textWrappingEnabled = message.enableTextWrapping || false;
                        this.lineLevelDiffEnabled = message.enableLineLevelDiff !== false; // Default to true if not specified
                        this.characterLevelDiffEnabled = message.enableCharacterLevelDiff !== false; // Default to true if not specified
                        this.characterDiffHighlightColor = message.characterDiffHighlightColor || '#FFD700';
                        this.applyTextWrapping();
                        this.applyCustomHighlightColor();
                        this.renderDiff(message.files);
                        break;
                    }
                    case 'fileRestored': {
                        this.handleFileRestored(message.filePath);
                        break;
                    }
                }
            });

            // Initialize search functionality
            this.initializeSearch();
        }

        /**
         * Creates the text wrap toggle button in the global controls
         */
        createTextWrapToggle() {
            if (!this.container) {
                return;
            }

            const controlsRight = this.container.querySelector('.controls-right');
            if (!controlsRight) {
                return;
            }

            // Create the text wrap toggle button
            const textWrapToggle = document.createElement('button');
            textWrapToggle.className = 'global-control text-wrap-toggle';
            textWrapToggle.innerHTML = '<span class="codicon codicon-word-wrap"></span> Wrap Text';
            textWrapToggle.title = 'Toggle text wrapping';

            // Set initial state based on the setting
            if (this.textWrappingEnabled) {
                textWrapToggle.classList.add('active');
            }

            // Add click handler
            textWrapToggle.addEventListener('click', () => {
                this.textWrappingEnabled = !this.textWrappingEnabled;
                textWrapToggle.classList.toggle('active', this.textWrappingEnabled);
                this.applyTextWrapping();

                // Send message to extension to update the setting
                vscode.postMessage({
                    command: 'toggleTextWrapping',
                    enabled: this.textWrappingEnabled
                });
            });

            // Add the button to the controls
            controlsRight.appendChild(textWrapToggle);
        }

        /**
         * Creates the line-level diff toggle button in the global controls
         */
        createLineLevelDiffToggle() {
            if (!this.container) {
                return;
            }

            const controlsRight = this.container.querySelector('.controls-right');
            if (!controlsRight) {
                return;
            }

            // Create the line-level diff toggle button
            const lineLevelDiffToggle = document.createElement('button');
            lineLevelDiffToggle.className = 'global-control line-level-diff-toggle';
            lineLevelDiffToggle.innerHTML = '<span class="codicon codicon-list-selection"></span> Line Diff';
            lineLevelDiffToggle.title = 'Toggle line-level diff highlighting';

            // Set initial state based on the setting
            if (this.lineLevelDiffEnabled) {
                lineLevelDiffToggle.classList.add('active');
            }

            // Add click handler
            lineLevelDiffToggle.addEventListener('click', () => {
                this.lineLevelDiffEnabled = !this.lineLevelDiffEnabled;
                lineLevelDiffToggle.classList.toggle('active', this.lineLevelDiffEnabled);

                // Re-render the diff with the new setting
                this.renderDiff(this.currentFiles);

                // Send message to extension to update the setting
                vscode.postMessage({
                    command: 'toggleLineLevelDiff',
                    enabled: this.lineLevelDiffEnabled
                });
            });

            // Add the button to the controls
            controlsRight.appendChild(lineLevelDiffToggle);
        }

        /**
         * Creates the color picker in the global controls
         */
        createColorPicker() {
            if (!this.container || typeof window.ColorPicker !== 'function') {
                return;
            }

            const controlsRight = this.container.querySelector('.controls-right');
            if (!controlsRight) {
                return;
            }

            // Create the color picker
            /** @type {any} */
            const ColorPickerConstructor = window.ColorPicker;
            this.colorPicker = new ColorPickerConstructor(this.characterDiffHighlightColor, (color) => {
                // Update the color
                this.characterDiffHighlightColor = color;

                // Apply the new color
                this.applyCustomHighlightColor();

                // Send message to extension to update the setting
                // We'll throttle this to avoid too many updates
                this.debounceUpdateColorSetting(color);
            }, true); // true = enable real-time updates

            // Create the color picker element
            const colorPickerElement = this.colorPicker.create();

            // Add the color picker to the controls
            controlsRight.appendChild(colorPickerElement);
        }

        /**
         * Applies text wrapping based on the current setting
         */
        applyTextWrapping() {
            if (!this.container) {
                return;
            }

            if (this.textWrappingEnabled) {
                this.container.classList.add('text-wrap-enabled');
            } else {
                this.container.classList.remove('text-wrap-enabled');
            }
        }

        /**
         * Applies the custom highlight color for character-level diffs
         */
        applyCustomHighlightColor() {
            if (!this.container) {
                return;
            }

            // Create or update the style element for custom colors
            let styleEl = document.getElementById('custom-highlight-styles');
            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = 'custom-highlight-styles';
                document.head.appendChild(styleEl);
            }

            // Set the custom CSS with the user's color
            styleEl.textContent = `
                .char-added { background-color: ${this.characterDiffHighlightColor} !important; }
                .char-removed { background-color: ${this.characterDiffHighlightColor} !important; }
            `;

            // Also update any existing character-level diff spans
            const charAddedSpans = document.querySelectorAll('.char-added');
            const charRemovedSpans = document.querySelectorAll('.char-removed');

            charAddedSpans.forEach(span => {
                span.style.backgroundColor = this.characterDiffHighlightColor;
            });

            charRemovedSpans.forEach(span => {
                span.style.backgroundColor = this.characterDiffHighlightColor;
            });
        }

        /**
         * Debounces the color setting update to avoid too many updates
         * @param {string} color - The color to set
         */
        debounceUpdateColorSetting(color) {
            if (this.colorUpdateTimeout) {
                clearTimeout(this.colorUpdateTimeout);
            }

            this.colorUpdateTimeout = setTimeout(() => {
                vscode.postMessage({
                    command: 'updateCharacterDiffHighlightColor',
                    color: color
                });
                this.colorUpdateTimeout = null;
            }, 300); // 300ms debounce time
        }

        initializeSearch() {
            if (!this.searchInput || !this.prevMatchBtn || !this.nextMatchBtn || !this.clearSearchBtn) {
                return;
            }

            // Handle search input
            this.searchInput.addEventListener('input', () => {
                this.performSearch();
            });

            // Handle keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                if (e.ctrlKey || e.metaKey) {
                    if (e.key === 'f') {
                        e.preventDefault();
                        this.searchInput?.focus();
                    }
                }
                if (document.activeElement === this.searchInput) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (e.shiftKey) {
                            this.navigateMatches('prev');
                        } else {
                            this.navigateMatches('next');
                        }
                    }
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        this.clearSearch();
                    }
                }
            });

            // Handle navigation buttons
            this.prevMatchBtn.addEventListener('click', () => this.navigateMatches('prev'));
            this.nextMatchBtn.addEventListener('click', () => this.navigateMatches('next'));
            this.clearSearchBtn.addEventListener('click', () => this.clearSearch());
        }

        /**
         * Performs a search across all file names and diff content
         */
        performSearch() {
            if (!this.searchInput || !this.searchCount) {
                return;
            }

            const query = this.searchInput.value.trim().toLowerCase();

            // Clear previous highlights
            this.clearHighlights();

            if (!query) {
                this.updateSearchCount(0, 0);
                return;
            }

            this.currentMatches = [];
            this.currentMatchIndex = -1;

            // Search in file names and content
            const fileGroups = this.filesContainer?.querySelectorAll('.file-group');
            fileGroups?.forEach(group => {
                // Search in file name
                const pathElement = group.querySelector('.file-path .path');
                if (pathElement && pathElement.textContent?.toLowerCase().includes(query)) {
                    this.highlightText(/** @type {HTMLElement} */ (pathElement), query);
                }

                // Search in diff content
                const diffContent = group.querySelector('.diff-content');
                if (diffContent) {
                    // Handle both vertical and horizontal diff views
                    const verticalLines = diffContent.querySelectorAll('.diff-line-left, .diff-line-right');
                    const horizontalLines = diffContent.querySelectorAll('.diff-line-horizontal .diff-line-content');

                    const searchInLines = (lines) => {
                        lines.forEach(line => {
                            const text = line.textContent || '';
                            if (text.toLowerCase().includes(query)) {
                                // Expand the file group to show matches
                                diffContent.classList.add('expanded');
                                group.querySelector('.file-header')?.classList.remove('collapsed');

                                // Create a wrapper for the highlighted content
                                const wrapper = document.createElement('span');
                                wrapper.className = 'search-wrapper';
                                const content = text;

                                // Split and highlight the matching text
                                const lowerContent = content.toLowerCase();
                                let lastIndex = 0;
                                let html = '';

                                let matchIndex = lowerContent.indexOf(query);
                                while (matchIndex !== -1) {
                                    // Add text before match
                                    html += this.escapeHtml(content.slice(lastIndex, matchIndex));

                                    // Add highlighted match
                                    const highlight = document.createElement('span');
                                    highlight.className = 'search-highlight';
                                    highlight.textContent = content.slice(matchIndex, matchIndex + query.length);
                                    html += highlight.outerHTML;

                                    lastIndex = matchIndex + query.length;
                                    matchIndex = lowerContent.indexOf(query, lastIndex);
                                }

                                // Add remaining text
                                if (lastIndex < content.length) {
                                    html += this.escapeHtml(content.slice(lastIndex));
                                }

                                wrapper.innerHTML = html;
                                line.innerHTML = wrapper.outerHTML;

                                // Add the newly created highlights to our matches array
                                const highlights = line.querySelectorAll('.search-highlight');
                                highlights.forEach(highlight => {
                                    this.currentMatches.push(/** @type {HTMLElement} */ (highlight));
                                });
                            }
                        });
                    };

                    searchInLines(verticalLines);
                    searchInLines(horizontalLines);
                }
            });

            // Update match count and navigation
            this.updateSearchCount(this.currentMatches.length, 0);
            if (this.currentMatches.length > 0) {
                this.navigateMatches('next');
            }
        }

        /**
         * Highlights text matches within an element
         * @param {HTMLElement} element
         * @param {string} query
         */
        highlightText(element, query) {
            const text = element.textContent || '';
            const lowerText = text.toLowerCase();
            let lastIndex = 0;
            const fragments = [];

            let matchIndex = lowerText.indexOf(query);
            while (matchIndex !== -1) {
                // Add text before match
                if (matchIndex > lastIndex) {
                    fragments.push(document.createTextNode(text.slice(lastIndex, matchIndex)));
                }

                // Add highlighted match
                const highlight = document.createElement('span');
                highlight.className = 'search-highlight';
                highlight.textContent = text.slice(matchIndex, matchIndex + query.length);
                fragments.push(highlight);
                this.currentMatches.push(highlight);

                lastIndex = matchIndex + query.length;
                matchIndex = lowerText.indexOf(query, lastIndex);
            }

            // Add remaining text
            if (lastIndex < text.length) {
                fragments.push(document.createTextNode(text.slice(lastIndex)));
            }

            // Replace element content
            element.textContent = '';
            fragments.forEach(fragment => element.appendChild(fragment));
        }

        /**
         * Updates the search count display
         * @param {number} total
         * @param {number} current
         */
        updateSearchCount(total, current) {
            if (!this.searchCount || !this.prevMatchBtn || !this.nextMatchBtn) {
                return;
            }

            if (total === 0) {
                this.searchCount.textContent = 'No matches';
                this.prevMatchBtn.disabled = true;
                this.nextMatchBtn.disabled = true;
            } else {
                this.searchCount.textContent = `${current + 1} of ${total}`;
                this.prevMatchBtn.disabled = false;
                this.nextMatchBtn.disabled = false;
            }
        }

        /**
         * Navigates between matches
         * @param {'next' | 'prev'} direction
         */
        navigateMatches(direction) {
            if (this.currentMatches.length === 0) {
                return;
            }

            // Remove active class from current match
            if (this.currentMatchIndex >= 0 && this.currentMatchIndex < this.currentMatches.length) {
                this.currentMatches[this.currentMatchIndex].classList.remove('active');
            }

            // Update current match index
            if (direction === 'next') {
                this.currentMatchIndex = (this.currentMatchIndex + 1) % this.currentMatches.length;
            } else {
                this.currentMatchIndex = (this.currentMatchIndex - 1 + this.currentMatches.length) % this.currentMatches.length;
            }

            // Highlight new current match
            const currentMatch = this.currentMatches[this.currentMatchIndex];
            currentMatch.classList.add('active');

            // Ensure the match is visible
            const fileGroup = currentMatch.closest('.file-group');
            if (fileGroup) {
                // Expand the file group if it's collapsed
                const diffContent = fileGroup.querySelector('.diff-content');
                const header = fileGroup.querySelector('.file-header');
                if (diffContent && header) {
                    diffContent.classList.add('expanded');
                    header.classList.remove('collapsed');
                }

                // Scroll the match into view
                currentMatch.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'nearest'
                });
            }

            // Update count display
            this.updateSearchCount(this.currentMatches.length, this.currentMatchIndex);
        }

        /**
         * Clears the search
         */
        clearSearch() {
            if (!this.searchInput) {
                return;
            }

            this.searchInput.value = '';
            this.clearHighlights();
            this.updateSearchCount(0, 0);
            this.currentMatchIndex = -1;
            this.currentMatches = [];
        }

        /**
         * Clears all search highlights
         */
        clearHighlights() {
            // Clear file path highlights
            const pathHighlights = this.container?.querySelectorAll('.file-path .path .search-highlight');
            pathHighlights?.forEach(highlight => {
                const parent = highlight.parentNode;
                if (parent) {
                    parent.replaceChild(document.createTextNode(highlight.textContent || ''), highlight);
                }
            });

            // Clear diff content highlights
            const diffWrappers = this.container?.querySelectorAll('.search-wrapper');
            diffWrappers?.forEach(wrapper => {
                if (wrapper.textContent) {
                    const parent = wrapper.parentNode;
                    if (parent) {
                        parent.textContent = wrapper.textContent;
                    }
                }
            });
        }

        expandAllFiles() {
            const fileGroups = this.filesContainer?.querySelectorAll('.file-group');
            fileGroups?.forEach(group => {
                const content = group.querySelector('.diff-content');
                const header = group.querySelector('.file-header');
                if (content && header) {
                    content.classList.add('expanded');
                    header.classList.remove('collapsed');
                }
            });
        }

        collapseAllFiles() {
            const fileGroups = this.filesContainer?.querySelectorAll('.file-group');
            fileGroups?.forEach(group => {
                const content = group.querySelector('.diff-content');
                const header = group.querySelector('.file-header');
                if (content && header) {
                    content.classList.remove('expanded');
                    header.classList.add('collapsed');
                }
            });
        }

        restoreAllFiles() {
            const restoreButtons = this.filesContainer?.querySelectorAll('.restore-button:not(:disabled)');
            restoreButtons?.forEach(button => {
                if (button instanceof HTMLButtonElement) {
                    button.click();
                }
            });
        }

        /**
         * @param {string} filePath
         */
        handleFileRestored(filePath) {
            const fileHeader = this.filesContainer?.querySelector(`[data-file-path="${filePath}"]`);
            if (fileHeader) {
                const restoreButton = fileHeader.querySelector('.restore-button');
                const restoredIndicator = fileHeader.querySelector('.restored-indicator');
                if (restoreButton instanceof HTMLButtonElement && restoredIndicator) {
                    restoreButton.disabled = true;
                    restoredIndicator.classList.add('visible');
                }
            }
        }

        /**
         * @param {DiffFile[]} files
         */
        renderDiff(files) {
            if (!this.filesContainer || !this.fileTemplate) {
                return;
            }

            // Store the current files for re-rendering when settings change
            this.currentFiles = files;

            this.filesContainer.innerHTML = '';

            files.forEach(file => {
                if (!this.fileTemplate || !this.filesContainer) {
                    return;
                }

                const fileGroup = this.fileTemplate.content.cloneNode(true);
                if (!(fileGroup instanceof DocumentFragment)) {
                    return;
                }

                const header = fileGroup.querySelector('.file-header');
                const content = fileGroup.querySelector('.diff-content');
                const collapseIndicator = fileGroup.querySelector('.collapse-indicator');

                if (!header || !content || !collapseIndicator) {
                    return;
                }

                // Set file path
                header.setAttribute('data-file-path', file.path);
                const pathElement = header.querySelector('.file-path .path');
                if (pathElement) {
                    pathElement.textContent = file.path;
                }

                // Set file status
                const statusElement = header.querySelector('.file-status');
                if (statusElement) {
                    if (file.status === 'created') {
                        statusElement.textContent = 'Created';
                        statusElement.classList.add('created');
                    } else if (file.status === 'deleted') {
                        statusElement.textContent = 'Deleted';
                        statusElement.classList.add('deleted');
                    }
                }

                // Add tooltip for collapse/expand
                collapseIndicator.setAttribute('data-tooltip', 'Click to collapse');

                // Add click handler for collapse/expand on the header
                header.addEventListener('click', (e) => {
                    const target = /** @type {HTMLElement} */ (e.target);
                    // Don't trigger if clicking the restore button
                    if (!target.closest('.restore-button')) {
                        const isCollapsed = header.classList.toggle('collapsed');
                        content.classList.toggle('expanded');
                        collapseIndicator.setAttribute('data-tooltip',
                            isCollapsed ? 'Click to expand' : 'Click to collapse'
                        );
                    }
                });

                if (file.status === 'deleted') {
                    content.innerHTML = '<div class="deleted-file-message">This file has been deleted.</div>';
                    header.classList.add('deleted-file');
                } else if (file.original !== undefined && file.modified !== undefined) {
                    try {
                        // Check if the file content is too large
                        if (file.original.length > 1000000 || file.modified.length > 1000000) {
                            content.innerHTML = '<div class="large-file-message">This file is too large to display inline. Use the restore button to restore the file and view changes in the editor.</div>';
                            header.classList.add('large-file');
                        } else {
                            // Create diff using VS Code's diff algorithm
                            const originalLines = file.original.split('\n');
                            const modifiedLines = file.modified.split('\n');
                            const diff = this.computeDiff(originalLines, modifiedLines);
                            content.innerHTML = this.renderDiffContent(diff);
                        }
                    } catch (error) {
                        console.error('Error rendering diff:', error);
                        content.innerHTML = '<div class="error-message">Error displaying file differences. Use the restore button to restore the file and view changes in the editor.</div>';
                        header.classList.add('error-file');
                    }
                }

                // Add click handler for restore button
                const restoreButton = header.querySelector('.restore-button');
                restoreButton?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    vscode.postMessage({
                        command: 'restoreFile',
                        filePath: file.path
                    });
                });

                this.filesContainer.appendChild(fileGroup);
            });
        }



        /**
         * @param {string[]} originalLines
         * @param {string[]} modifiedLines
         */
        computeDiff(originalLines, modifiedLines) {
            const diff = [];
            let originalIndex = 0;
            let modifiedIndex = 0;

            while (originalIndex < originalLines.length || modifiedIndex < modifiedLines.length) {
                if (originalIndex < originalLines.length && modifiedIndex < modifiedLines.length &&
                    originalLines[originalIndex] === modifiedLines[modifiedIndex]) {
                    // Line is unchanged
                    diff.push({
                        type: 'unchanged',
                        content: originalLines[originalIndex],
                        originalLine: originalIndex + 1,
                        modifiedLine: modifiedIndex + 1
                    });
                    originalIndex++;
                    modifiedIndex++;
                } else {
                    // Check for removed lines
                    if (originalIndex < originalLines.length &&
                        (modifiedIndex >= modifiedLines.length ||
                         originalLines[originalIndex] !== modifiedLines[modifiedIndex])) {
                        diff.push({
                            type: 'removed',
                            content: originalLines[originalIndex],
                            originalLine: originalIndex + 1
                        });
                        originalIndex++;
                    }
                    // Check for added lines
                    if (modifiedIndex < modifiedLines.length &&
                        (originalIndex >= originalLines.length ||
                         originalLines[originalIndex] !== modifiedLines[modifiedIndex])) {
                        diff.push({
                            type: 'added',
                            content: modifiedLines[modifiedIndex],
                            modifiedLine: modifiedIndex + 1
                        });
                        modifiedIndex++;
                    }
                }
            }
            return diff;
        }

        /**
         * Computes character-level diff between two strings
         * @param {string} original - The original string
         * @param {string} modified - The modified string
         * @returns {Array<{type: string, text: string}>} - Array of segments with their types
         */
        computeCharacterDiff(original, modified) {
            // Simple implementation of character-level diff
            if (original === modified) {
                return [{type: 'unchanged', text: original}];
            }

            // If one string is empty, return appropriate result
            if (!original) {
                return [{type: 'added', text: modified}];
            }
            if (!modified) {
                return [{type: 'removed', text: original}];
            }

            // Find common prefix and suffix
            let i = 0;
            while (i < original.length && i < modified.length && original[i] === modified[i]) {
                i++;
            }

            let j = 0;
            while (
                original.length - 1 - j >= i &&
                modified.length - 1 - j >= i &&
                original[original.length - 1 - j] === modified[modified.length - 1 - j]
            ) {
                j++;
            }

            const prefix = original.substring(0, i);
            const originalMiddle = original.substring(i, original.length - j);
            const modifiedMiddle = modified.substring(i, modified.length - j);
            const suffix = original.substring(original.length - j);

            const result = [];

            // Add common prefix if it exists
            if (prefix) {
                result.push({type: 'unchanged', text: prefix});
            }

            // Add the changed parts
            if (originalMiddle) {
                result.push({type: 'removed', text: originalMiddle});
            }
            if (modifiedMiddle) {
                result.push({type: 'added', text: modifiedMiddle});
            }

            // Add common suffix if it exists
            if (suffix) {
                result.push({type: 'unchanged', text: suffix});
            }

            return result;
        }

        /**
         * Renders a line with character-level diff highlighting
         * @param {string} content - The line content
         * @param {string} originalContent - The original line content for comparison
         * @param {string} type - The line type (added, removed, unchanged)
         * @returns {string} - HTML string with character-level highlighting
         */
        renderLineWithCharDiff(content, originalContent, type) {
            // If character-level diff is disabled or the line is unchanged, just return the content
            if (!this.characterLevelDiffEnabled || type === 'unchanged' || !originalContent || !content) {
                return this.escapeHtml(content || '');
            }

            // For added/removed lines, compute character diff
            const charDiff = this.computeCharacterDiff(
                type === 'removed' ? content : originalContent,
                type === 'added' ? content : originalContent
            );

            // Convert the diff to HTML
            return charDiff.map(segment => {
                const escapedText = this.escapeHtml(segment.text);
                if (segment.type === 'unchanged') {
                    return escapedText;
                } else if ((segment.type === 'added' && type === 'added') ||
                           (segment.type === 'removed' && type === 'removed')) {
                    // Apply the custom highlight color with inline style for better visibility
                    // The !important in the CSS will ensure this is applied correctly
                    return `<span class="char-${segment.type}" style="background-color: ${this.characterDiffHighlightColor}">${escapedText}</span>`;
                } else {
                    return escapedText;
                }
            }).join('');
        }

        /**
         * @param {Array<{type: string, content: string, originalLine?: number, modifiedLine?: number}>} diff
         */
        renderDiffContent(diff) {
            if (this.diffViewStyle === 'both') {
                return `
                    <div class="diff-container">
                        <div class="diff-vertical">
                            <h3>Side by Side View</h3>
                            ${this.renderVerticalDiff(diff)}
                        </div>
                        <div class="diff-horizontal">
                            <h3>Inline View</h3>
                            ${this.renderHorizontalDiff(diff)}
                        </div>
                    </div>
                `;
            }

            return this.diffViewStyle === 'side-by-side'
                ? this.renderVerticalDiff(diff)
                : this.renderHorizontalDiff(diff);
        }

        /**
         * @param {Array<{type: string, content: string, originalLine?: number, modifiedLine?: number}>} diff
         */
        renderVerticalDiff(diff) {
            // Find corresponding lines for character-level diff
            const lineMap = new Map();
            diff.forEach(line => {
                if (line.type === 'added' || line.type === 'removed') {
                    // Try to find a corresponding line with the opposite type
                    const oppositeType = line.type === 'added' ? 'removed' : 'added';
                    const lineNumber = line.type === 'added' ? line.modifiedLine : line.originalLine;

                    // Look for a line with the opposite type and a similar line number
                    const correspondingLine = diff.find(l =>
                        l.type === oppositeType &&
                        (l.originalLine === lineNumber || l.modifiedLine === lineNumber)
                    );

                    if (correspondingLine) {
                        lineMap.set(line, correspondingLine);
                    }
                }
            });

            return diff.map(line => {
                const lineNumberLeft = line.originalLine || '•';
                const lineNumberRight = line.modifiedLine || '•';
                // Only apply line class if line-level diff is enabled
                const lineClass = line.type === 'unchanged' ? '' :
                                 (this.lineLevelDiffEnabled ? line.type : '');

                // Get corresponding line for character-level diff if available
                const correspondingLine = lineMap.get(line);

                let leftContent = '';
                let rightContent = '';

                if (line.type === 'added') {
                    // For added lines, show empty on left, content on right
                    leftContent = '';
                    rightContent = this.renderLineWithCharDiff(
                        line.content,
                        correspondingLine ? correspondingLine.content : '',
                        'added'
                    );
                } else if (line.type === 'removed') {
                    // For removed lines, show content on left, empty on right
                    leftContent = this.renderLineWithCharDiff(
                        line.content,
                        correspondingLine ? correspondingLine.content : '',
                        'removed'
                    );
                    rightContent = '';
                } else {
                    // For unchanged lines, show content on both sides
                    leftContent = this.escapeHtml(line.content);
                    rightContent = this.escapeHtml(line.content);
                }

                return `
                    <div class="diff-line ${lineClass}">
                        <div class="diff-line-numbers">
                            <div class="diff-line-number">${lineNumberLeft}</div>
                            <div class="diff-line-number">${lineNumberRight}</div>
                        </div>
                        <div class="diff-line-content">
                            <div class="diff-line-left">${leftContent}</div>
                            <div class="diff-line-right">${rightContent}</div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        /**
         * @param {Array<{type: string, content: string, originalLine?: number, modifiedLine?: number}>} diff
         */
        renderHorizontalDiff(diff) {
            // Find corresponding lines for character-level diff
            const lineMap = new Map();
            diff.forEach(line => {
                if (line.type === 'added' || line.type === 'removed') {
                    // Try to find a corresponding line with the opposite type
                    const oppositeType = line.type === 'added' ? 'removed' : 'added';
                    const lineNumber = line.type === 'added' ? line.modifiedLine : line.originalLine;

                    // Look for a line with the opposite type and a similar line number
                    const correspondingLine = diff.find(l =>
                        l.type === oppositeType &&
                        (l.originalLine === lineNumber || l.modifiedLine === lineNumber)
                    );

                    if (correspondingLine) {
                        lineMap.set(line, correspondingLine);
                    }
                }
            });

            return `<div class="diff-horizontal">
                <div class="diff-content">
                    ${diff.map(line => {
                        const lineNumber = line.originalLine || line.modifiedLine || '•';
                        // Only apply line class if line-level diff is enabled
                        const lineClass = line.type === 'unchanged' ? '' :
                                         (this.lineLevelDiffEnabled ? line.type : '');
                        const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';

                        // Get corresponding line for character-level diff if available
                        const correspondingLine = lineMap.get(line);

                        // Apply character-level diff if enabled and we have a corresponding line
                        const content = line.type !== 'unchanged'
                            ? this.renderLineWithCharDiff(
                                line.content,
                                correspondingLine ? correspondingLine.content : '',
                                line.type
                              )
                            : this.escapeHtml(line.content);

                        return `
                            <div class="diff-line-horizontal ${lineClass}">
                                <div class="diff-line-number">${lineNumber}</div>
                                <div class="diff-line-prefix">${prefix}</div>
                                <div class="diff-line-content">${content}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>`;
        }

        /**
         * @param {string} unsafe
         */
        escapeHtml(unsafe) {
            return unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }
    }

    new DiffView();
}());