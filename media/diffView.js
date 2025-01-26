// @ts-check

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
            /** @type {HTMLElement | null} */
            this.filesContainer = document.getElementById('files-list');
            /** @type {HTMLTemplateElement | null} */
            this.fileTemplate = /** @type {HTMLTemplateElement} */ (document.getElementById('file-template'));

            // Global controls
            /** @type {HTMLElement | null} */
            this.expandAllBtn = document.querySelector('.expand-all');
            /** @type {HTMLElement | null} */
            this.collapseAllBtn = document.querySelector('.collapse-all');
            /** @type {HTMLElement | null} */
            this.restoreAllBtn = document.querySelector('.restore-all');

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

            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.type) {
                    case 'showDiff': {
                        this.diffViewStyle = message.diffViewStyle || 'side-by-side';
                        this.renderDiff(message.files);
                        break;
                    }
                    case 'fileRestored': {
                        this.handleFileRestored(message.filePath);
                        break;
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
            return diff.map(line => {
                const lineNumberLeft = line.originalLine || '•';
                const lineNumberRight = line.modifiedLine || '•';
                const lineClass = line.type === 'unchanged' ? '' : line.type;
                
                return `
                    <div class="diff-line ${lineClass}">
                        <div class="diff-line-numbers">
                            <div class="diff-line-number">${lineNumberLeft}</div>
                            <div class="diff-line-number">${lineNumberRight}</div>
                        </div>
                        <div class="diff-line-content">
                            <div class="diff-line-left">${line.type === 'added' ? '' : this.escapeHtml(line.content)}</div>
                            <div class="diff-line-right">${line.type === 'removed' ? '' : this.escapeHtml(line.content)}</div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        /**
         * @param {Array<{type: string, content: string, originalLine?: number, modifiedLine?: number}>} diff
         */
        renderHorizontalDiff(diff) {
            return `<div class="diff-horizontal">
                <div class="diff-content">
                    ${diff.map(line => {
                        const lineNumber = line.originalLine || line.modifiedLine || '•';
                        const lineClass = line.type === 'unchanged' ? '' : line.type;
                        const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
                        
                        return `
                            <div class="diff-line-horizontal ${lineClass}">
                                <div class="diff-line-number">${lineNumber}</div>
                                <div class="diff-line-prefix">${prefix}</div>
                                <div class="diff-line-content">${this.escapeHtml(line.content)}</div>
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