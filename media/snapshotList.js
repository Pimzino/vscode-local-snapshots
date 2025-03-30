const vscode = acquireVsCodeApi();
const snapshotList = document.getElementById('snapshot-list');
const snapshotTemplate = document.getElementById('snapshot-template');


// Filter elements
const filterToggle = document.querySelector('.filter-toggle');
const filterPanel = document.querySelector('.filter-panel');
const clearFilters = document.querySelector('.clear-filters');
const nameFilter = document.getElementById('name-filter');
const dateFrom = document.getElementById('date-from');
const dateTo = document.getElementById('date-to');
const filesFrom = document.getElementById('files-from');
const filesTo = document.getElementById('files-to');

let allSnapshots = [];

// Toggle filter panel
filterToggle.addEventListener('click', () => {
  filterPanel.classList.toggle('expanded');
  filterToggle.setAttribute('aria-expanded', filterPanel.classList.contains('expanded'));
});

// Clear all filters
clearFilters.addEventListener('click', () => {
  nameFilter.value = '';
  dateFrom.value = '';
  dateTo.value = '';
  filesFrom.value = '';
  filesTo.value = '';
  applyFilters();
});

// Add filter event listeners
nameFilter.addEventListener('input', debounce(applyFilters, 300));
dateFrom.addEventListener('change', applyFilters);
dateTo.addEventListener('change', applyFilters);
filesFrom.addEventListener('input', debounce(applyFilters, 300));
filesTo.addEventListener('input', debounce(applyFilters, 300));

// Handle messages from the extension
window.addEventListener('message', event => {
  const message = event.data;
  switch (message.type) {
    case 'refreshList':
      allSnapshots = message.snapshots;
      applyFilters();
      break;
  }
});

function applyFilters() {
  let filteredSnapshots = [...allSnapshots];

  // Apply name filter
  const nameQuery = nameFilter.value.toLowerCase().trim();
  if (nameQuery) {
    filteredSnapshots = filteredSnapshots.filter(snapshot =>
      snapshot.name.toLowerCase().includes(nameQuery)
    );
  }

  // Apply date range filter
  if (dateFrom.value) {
    const fromDate = new Date(dateFrom.value).getTime();
    filteredSnapshots = filteredSnapshots.filter(snapshot =>
      snapshot.timestamp >= fromDate
    );
  }
  if (dateTo.value) {
    const toDate = new Date(dateTo.value).getTime();
    filteredSnapshots = filteredSnapshots.filter(snapshot =>
      snapshot.timestamp <= toDate
    );
  }

  // Apply file count filter
  const minFiles = parseInt(filesFrom.value);
  const maxFiles = parseInt(filesTo.value);
  if (!isNaN(minFiles)) {
    filteredSnapshots = filteredSnapshots.filter(snapshot =>
      snapshot.fileCount >= minFiles
    );
  }
  if (!isNaN(maxFiles)) {
    filteredSnapshots = filteredSnapshots.filter(snapshot =>
      snapshot.fileCount <= maxFiles
    );
  }

  refreshSnapshotsList(filteredSnapshots);
}

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

  // Set timestamp with icon
  const timestamp = new Date(snapshot.timestamp);
  const formattedDate = timestamp.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  const formattedTime = timestamp.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit'
  });
  card.querySelector('.timestamp .time').textContent = `${formattedDate} ${formattedTime}`;

  // Set file count with icon
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

  card.querySelector('.tree-button').addEventListener('click', () => {
    vscode.postMessage({
        type: 'showTree',
        name: snapshot.name,
        timestamp: snapshot.timestamp
    });
  });

  card.querySelector('.rename-button').addEventListener('click', () => {
    vscode.postMessage({
      type: 'renameSnapshot',
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

// Utility function to debounce filter input
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Initial refresh request
vscode.postMessage({ type: 'refresh' });