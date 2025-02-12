const vscode = acquireVsCodeApi();
const patternList = document.getElementById('patternList');
const workspaceTree = document.getElementById('workspaceTree');
const newPatternInput = document.getElementById('newPattern');
const addPatternButton = document.getElementById('addPattern');
const patternSearchInput = document.getElementById('patternSearch');
const workspaceSearchInput = document.getElementById('workspaceSearch');

let patterns = [];
let workspaceItems = [];
let expandedFolders = new Set();
let filteredWorkspaceItems = [];
let searchTimeout;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    vscode.postMessage({ command: 'getCurrentPatterns' });
    vscode.postMessage({ command: 'getWorkspaceFiles' });
});

// Handle messages from the extension
window.addEventListener('message', event => {
    const message = event.data;

    switch (message.command) {
        case 'currentPatterns':
            patterns = message.patterns;
            filterAndRenderPatterns();
            break;
        case 'workspaceFiles':
            workspaceItems = message.items;
            filteredWorkspaceItems = [...workspaceItems];
            renderWorkspaceTree();
            break;
    }
});

// Search functionality
patternSearchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(filterAndRenderPatterns, 300);
});

workspaceSearchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(filterAndRenderWorkspaceItems, 300);
});

function filterAndRenderPatterns() {
    const searchTerm = patternSearchInput.value.toLowerCase();
    const filteredPatterns = patterns.filter(pattern => {
        const patternText = (pattern.pattern || pattern).toLowerCase();
        return patternText.includes(searchTerm);
    });
    renderPatterns(filteredPatterns);
}

function filterAndRenderWorkspaceItems() {
    const searchTerm = workspaceSearchInput.value.toLowerCase();
    
    if (!searchTerm) {
        filteredWorkspaceItems = [...workspaceItems];
        renderWorkspaceTree();
        return;
    }

    // Filter items and collect all parent folders
    const matchedPaths = new Set();
    filteredWorkspaceItems = workspaceItems.filter(item => {
        const matches = item.relativePath.toLowerCase().includes(searchTerm);
        if (matches) {
            // Add all parent folders to matched paths
            let currentPath = item.relativePath;
            while (currentPath) {
                matchedPaths.add(currentPath);
                currentPath = path.dirname(currentPath);
                if (currentPath === '.') break;
            }
            return true;
        }
        return false;
    });

    // Auto-expand folders containing matches
    expandedFolders = matchedPaths;
    renderWorkspaceTree();
}

// Add new pattern
addPatternButton.addEventListener('click', () => {
    const pattern = newPatternInput.value.trim();
    if (pattern) {
        vscode.postMessage({ command: 'addPattern', pattern });
        newPatternInput.value = '';
    }
});

newPatternInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addPatternButton.click();
    }
});

// Render patterns
function renderPatterns(patternsToRender = patterns) {
    patternList.innerHTML = '';
    patternsToRender.forEach(pattern => {
        const item = document.createElement('div');
        item.className = 'pattern-item';
        
        const isGitignorePattern = pattern.fromGitignore;
        
        item.innerHTML = `
            <div class="pattern-info">
                <span class="pattern-text">${pattern.pattern || pattern}</span>
                ${isGitignorePattern ? '<span class="pattern-source">.gitignore</span>' : ''}
            </div>
            ${!isGitignorePattern ? `
                <button class="remove-pattern" title="Remove Pattern">
                    <span class="codicon codicon-trash"></span>
                </button>
            ` : ''}
        `;

        if (!isGitignorePattern) {
            item.querySelector('.remove-pattern').addEventListener('click', () => {
                vscode.postMessage({ command: 'removePattern', pattern: pattern.pattern || pattern });
            });
        }

        patternList.appendChild(item);
    });
}

// Path utility function
const path = {
    dirname(p) {
        if (!p || p === '.') return '';
        const parts = p.split('/');
        parts.pop();
        return parts.join('/');
    }
};

// Render workspace tree
function renderWorkspaceTree() {
    workspaceTree.innerHTML = '';
    const tree = buildTree(filteredWorkspaceItems);
    renderTreeNode(tree, workspaceTree);
}

function buildTree(items) {
    const root = { children: {} };
    
    items.forEach(item => {
        const parts = item.relativePath.split('/');
        let current = root;
        
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isLast = i === parts.length - 1;
            
            if (!current.children[part]) {
                current.children[part] = {
                    name: part,
                    path: isLast ? item.path : parts.slice(0, i + 1).join('/'),
                    type: isLast ? item.type : 'folder',
                    children: {}
                };
            }
            current = current.children[part];
        }
    });
    
    return root;
}

function renderTreeNode(node, container, level = 0) {
    const entries = Object.entries(node.children).sort(([a], [b]) => {
        // Folders first, then alphabetically
        const aIsFolder = node.children[a].type === 'folder';
        const bIsFolder = node.children[b].type === 'folder';
        if (aIsFolder !== bIsFolder) return bIsFolder ? 1 : -1;
        return a.localeCompare(b);
    });

    entries.forEach(([name, child]) => {
        const item = document.createElement('div');
        item.className = 'tree-item';
        
        const hasChildren = child.type === 'folder' && Object.keys(child.children).length > 0;
        const isExpanded = expandedFolders.has(child.path);
        
        item.innerHTML = `
            ${hasChildren ? `
                <span class="tree-item-toggle">
                    <span class="codicon codicon-${isExpanded ? 'chevron-down' : 'chevron-right'}"></span>
                </span>
            ` : '<span class="tree-item-toggle"></span>'}
            <span class="codicon codicon-${child.type === 'folder' ? 'folder' : 'file'}"></span>
            <span>${name}</span>
        `;

        if (child.type === 'folder') {
            item.classList.add('tree-item-folder');
        } else {
            item.classList.add('tree-item-file');
        }

        item.addEventListener('click', (e) => {
            if (hasChildren && e.target.closest('.tree-item-toggle')) {
                if (isExpanded) {
                    expandedFolders.delete(child.path);
                } else {
                    expandedFolders.add(child.path);
                }
                renderWorkspaceTree();
            } else {
                vscode.postMessage({ command: 'addWorkspaceItem', path: child.path });
            }
        });

        container.appendChild(item);

        if (hasChildren && isExpanded) {
            const childContainer = document.createElement('div');
            childContainer.className = 'folder-content';
            container.appendChild(childContainer);
            renderTreeNode(child, childContainer, level + 1);
        }
    });
} 