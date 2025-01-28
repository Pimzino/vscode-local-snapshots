(function() {
	const vscode = acquireVsCodeApi();
	
	function toggleFolder(item, isCollapsing) {
		const icon = item.querySelector('.codicon-folder, .codicon-folder-opened');
		const chevron = item.querySelector('.toggle .codicon');
		
		if (icon) {
			icon.className = `codicon codicon-${isCollapsing ? 'folder' : 'folder-opened'}`;
		}
		
		if (chevron) {
			chevron.style.transform = isCollapsing ? 'rotate(-90deg)' : '';
		}
		
		if (isCollapsing) {
			item.classList.add('collapsed');
		} else {
			item.classList.remove('collapsed');
		}
	}
	
	function createTreeItem(node) {
		const item = document.createElement('div');
		item.className = `tree-item ${node.type}`;
		
		const toggle = document.createElement('span');
		toggle.className = 'toggle';
		if (node.type === 'directory' && node.children && node.children.length > 0) {
			toggle.innerHTML = '<i class="codicon codicon-chevron-down"></i>';
		}
		
		const icon = document.createElement('i');
		icon.className = `codicon codicon-${node.type === 'directory' ? 'folder' : 'file'}`;
		
		const name = document.createElement('span');
		name.className = 'name';
		name.textContent = node.name;
		
		item.appendChild(toggle);
		item.appendChild(icon);
		item.appendChild(name);
		
		if (node.type === 'file') {
			const actions = document.createElement('div');
			actions.className = 'actions';
			
			const restoredIndicator = document.createElement('div');
			restoredIndicator.className = 'restored-indicator';
			restoredIndicator.innerHTML = '<i class="codicon codicon-check"></i> Restored';
			
			const restoreBtn = document.createElement('button');
			restoreBtn.className = 'restore-button';
			restoreBtn.innerHTML = '<i class="codicon codicon-debug-restart"></i> Restore';
			restoreBtn.title = 'Restore this file';
			restoreBtn.setAttribute('data-path', node.path);
			
			restoreBtn.onclick = (e) => {
				e.stopPropagation();
				restoreBtn.disabled = true;
				vscode.postMessage({
					command: 'restoreFile',
					filePath: node.path
				});
			};
			
			actions.appendChild(restoredIndicator);
			actions.appendChild(restoreBtn);
			item.appendChild(actions);
		}
		
		if (node.type === 'directory' && node.children && node.children.length > 0) {
			item.onclick = (e) => {
				if (e.target === item || e.target === toggle || e.target === icon || e.target === name) {
					const isCollapsing = !item.classList.contains('collapsed');
					toggleFolder(item, isCollapsing);
				}
			};
		}
		
		return item;
	}
	
	function renderTree(node, container) {
		const item = createTreeItem(node);
		container.appendChild(item);
		
		if (node.type === 'directory' && node.children) {
			const childrenContainer = document.createElement('div');
			childrenContainer.className = 'tree-children';
			
			node.children
				.sort((a, b) => {
					if (a.type !== b.type) {
						return a.type === 'directory' ? -1 : 1;
					}
					return a.name.localeCompare(b.name);
				})
				.forEach(child => {
					renderTree(child, childrenContainer);
				});
			
			container.appendChild(childrenContainer);
		}
	}
	
	const treeContainer = document.getElementById('tree');
	renderTree(treeData, treeContainer);
	
	// Global expand/collapse handlers
	document.getElementById('expandAll').onclick = () => {
		const items = document.querySelectorAll('.tree-item.directory');
		items.forEach(item => toggleFolder(item, false));
	};
	
	document.getElementById('collapseAll').onclick = () => {
		const items = document.querySelectorAll('.tree-item.directory');
		items.forEach(item => toggleFolder(item, true));
	};

	// Handle file restore feedback
	window.addEventListener('message', event => {
		const message = event.data;
		if (message.command === 'fileRestored') {
			// Escape special characters in the path for use in CSS selector
			const escapedPath = message.filePath.replace(/["\\]/g, '\\$&');
			const restoreBtn = document.querySelector(`button[data-path="${escapedPath}"]`);
			if (restoreBtn) {
				restoreBtn.disabled = true;
				const actionsContainer = restoreBtn.closest('.actions');
				if (actionsContainer) {
					const restoredIndicator = actionsContainer.querySelector('.restored-indicator');
					if (restoredIndicator) {
						restoredIndicator.classList.add('visible');
						// Ensure the actions container remains visible
						actionsContainer.style.display = 'flex';
					}
				}
			}
		}
	});
})();