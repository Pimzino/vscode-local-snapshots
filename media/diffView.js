// @ts-check

(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    class DiffView {
        constructor() {
            this.container = document.getElementById('diff-container');
            this.filesContainer = document.getElementById('files-list');
            this.fileTemplate = document.getElementById('file-template');

            // Global controls
            this.expandAllBtn = document.querySelector('.expand-all');
            this.collapseAllBtn = document.querySelector('.collapse-all');
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
                    case 'showDiff':
                        this.renderDiff(message.files, message.snapshotName);
                        break;
                    case 'fileRestored':
                        this.handleFileRestored(message.filePath);
                        break;
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
            restoreButtons?.forEach(button => button.click());
        }

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

        renderDiff(files, snapshotName) {
            if (!this.filesContainer || !this.fileTemplate) return;

            this.filesContainer.innerHTML = '';

            files.forEach(file => {
                const fileGroup = this.fileTemplate.content.cloneNode(true);
                const header = fileGroup.querySelector('.file-header');
                const content = fileGroup.querySelector('.diff-content');
                const collapseIndicator = fileGroup.querySelector('.collapse-indicator');

                // Set file path
                header.setAttribute('data-file-path', file.path);
                header.querySelector('.file-path .path').textContent = file.path;

                // Add tooltip for collapse/expand
                collapseIndicator.setAttribute('data-tooltip', 'Click to collapse');

                // Add click handler for collapse/expand on the header
                header.addEventListener('click', (e) => {
                    // Don't trigger if clicking the restore button
                    if (!e.target.closest('.restore-button')) {
                        const isCollapsed = header.classList.toggle('collapsed');
                        content.classList.toggle('expanded');
                        collapseIndicator.setAttribute('data-tooltip', 
                            isCollapsed ? 'Click to expand' : 'Click to collapse'
                        );
                    }
                });

                // Add click handler for restore button
                const restoreButton = header.querySelector('.restore-button');
                restoreButton?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    vscode.postMessage({
                        command: 'restoreFile',
                        filePath: file.path
                    });
                });

                // Create diff using VS Code's diff algorithm
                const originalLines = file.original.split('\n');
                const modifiedLines = file.modified.split('\n');
                const diff = this.computeDiff(originalLines, modifiedLines);
                content.innerHTML = this.renderDiffContent(diff);

                this.filesContainer.appendChild(fileGroup);
            });
        }


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

        renderDiffContent(diff) {
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