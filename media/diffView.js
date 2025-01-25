// @ts-check

(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    class DiffView {
        constructor() {
            this.container = document.getElementById('diff-container');
            this.filesContainer = document.getElementById('files-list');
            this.diffContent = document.getElementById('diff-content');

            if (!this.container || !this.filesContainer || !this.diffContent) {
                console.error('Required DOM elements not found');
                return;
            }

            this.initialize();
        }

        initialize() {
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
            if (!this.filesContainer) {
                console.error('Files container not found');
                return;
            }

            const filesContainer = this.filesContainer;
            filesContainer.innerHTML = '';

            // Add global controls
            const controls = document.createElement('div');
            controls.className = 'global-controls';
            controls.innerHTML = `
                <button class="global-control" id="expand-all">
                    <span class="codicon codicon-expand-all"></span>
                    Expand All
                </button>
                <button class="global-control" id="collapse-all">
                    <span class="codicon codicon-collapse-all"></span>
                    Collapse All
                </button>
            `;

            // Add event listeners for global controls
            const expandAllButton = controls.querySelector('#expand-all');
            const collapseAllButton = controls.querySelector('#collapse-all');

            if (expandAllButton) {
                expandAllButton.addEventListener('click', () => {
                    filesContainer.querySelectorAll('.diff-content').forEach(content => {
                        content.classList.add('expanded');
                    });
                    filesContainer.querySelectorAll('.file-header').forEach(header => {
                        header.classList.remove('collapsed');
                    });
                });
            }

            if (collapseAllButton) {
                collapseAllButton.addEventListener('click', () => {
                    filesContainer.querySelectorAll('.diff-content').forEach(content => {
                        content.classList.remove('expanded');
                    });
                    filesContainer.querySelectorAll('.file-header').forEach(header => {
                        header.classList.add('collapsed');
                    });
                });
            }

            filesContainer.appendChild(controls);

            files.forEach(file => {
                const fileGroup = document.createElement('div');
                fileGroup.className = 'file-group';

                const header = document.createElement('div');
                header.className = 'file-header';
                header.setAttribute('data-file-path', file.path);
                header.innerHTML = `
                    <span class="file-path">${file.path}</span>
                    <div class="actions">
                        <div class="restored-indicator">
                            <span class="codicon codicon-check"></span>
                            File Restored
                        </div>
                        <button class="restore-button">
                            <span class="codicon codicon-arrow-left"></span>
                            Restore File
                        </button>
                        <div class="collapse-indicator">
                            <span class="codicon codicon-chevron-down collapse-icon"></span>
                        </div>
                    </div>
                `;

                const content = document.createElement('div');
                content.className = 'diff-content expanded';
                
                // Create diff using VS Code's diff algorithm
                const originalLines = file.original.split('\n');
                const modifiedLines = file.modified.split('\n');
                const diff = this.computeDiff(originalLines, modifiedLines);
                
                content.innerHTML = this.renderDiffContent(diff);

                // Add click handler for collapse/expand
                const collapseIndicator = header.querySelector('.collapse-indicator');
                if (collapseIndicator) {
                    collapseIndicator.addEventListener('click', (e) => {
                        e.stopPropagation();
                        content.classList.toggle('expanded');
                        header.classList.toggle('collapsed');
                    });
                }

                // Add click handler for restore button
                const restoreButton = header.querySelector('.restore-button');
                if (restoreButton) {
                    restoreButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        vscode.postMessage({
                            command: 'restoreFile',
                            filePath: file.path
                        });
                    });
                }

                fileGroup.appendChild(header);
                fileGroup.appendChild(content);
                filesContainer.appendChild(fileGroup);
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
                const lineNumberLeft = line.originalLine || '';
                const lineNumberRight = line.modifiedLine || '';
                const lineClass = line.type === 'unchanged' ? '' : line.type;
                
                return `
                    <div class="diff-line ${lineClass}">
                        <div class="diff-line-numbers">
                            <div class="diff-line-number">${lineNumberLeft}</div>
                            <div class="diff-line-number">${lineNumberRight}</div>
                        </div>
                        <div class="diff-line-content">
                            <div class="diff-line-left">${line.type !== 'added' ? this.escapeHtml(line.content) : ''}</div>
                            <div class="diff-line-right">${line.type !== 'removed' ? this.escapeHtml(line.content) : ''}</div>
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