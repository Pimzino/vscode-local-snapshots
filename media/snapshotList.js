const vscode = acquireVsCodeApi();
const snapshotList = document.getElementById('snapshot-list');
const snapshotTemplate = document.getElementById('snapshot-template');

// Handle messages from the extension
window.addEventListener('message', event => {
  const message = event.data;
  switch (message.type) {
    case 'refreshList':
      refreshSnapshotsList(message.snapshots);
      break;
  }
});

function refreshSnapshotsList(snapshots) {
  // Clear the current list
  snapshotList.innerHTML = '';

  if (!snapshots || snapshots.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.innerHTML = `
      <div class="empty-state-icon">
        <span class="codicon codicon-history"></span>
      </div>
      <div>No snapshots available</div>
    `;
    snapshotList.appendChild(emptyState);
    return;
  }

  // Sort snapshots by timestamp (newest first)
  snapshots.sort((a, b) => b.timestamp - a.timestamp);

  // Create and append snapshot cards
  snapshots.forEach(snapshot => {
    const card = createSnapshotCard(snapshot);
    snapshotList.appendChild(card);
  });
}

function createSnapshotCard(snapshot) {
  const template = snapshotTemplate.content.cloneNode(true);
  const card = template.querySelector('.snapshot-card');

  // Set snapshot name
  card.querySelector('.snapshot-title .name').textContent = snapshot.name;

  // Set timestamp
  const timestamp = new Date(snapshot.timestamp).toLocaleString();
  card.querySelector('.snapshot-meta .timestamp').textContent = timestamp;

  // Set file count
  const fileCount = `${snapshot.fileCount} file${snapshot.fileCount !== 1 ? 's' : ''}`;
  card.querySelector('.file-count .count').textContent = fileCount;

  // Add button event listeners
  card.querySelector('.restore-button').addEventListener('click', () => {
    vscode.postMessage({ 
      type: 'restoreSnapshot',
      name: snapshot.name,
      timestamp: snapshot.timestamp
    });
  });

  card.querySelector('.diff-button').addEventListener('click', () => {
    vscode.postMessage({ 
      type: 'showDiff',
      name: snapshot.name,
      timestamp: snapshot.timestamp
    });
  });

  card.querySelector('.delete-button').addEventListener('click', () => {
    vscode.postMessage({ 
      type: 'deleteSnapshot',
      name: snapshot.name,
      timestamp: snapshot.timestamp
    });
  });

  return card;
}

// Initial refresh request
vscode.postMessage({ type: 'refresh' }); 