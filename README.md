# Local Snapshots for VS Code

<div align="center">
  <img src="https://github.com/Pimzino/vscode-local-snapshots/blob/master/resources/icon.png?raw=true" alt="Local Snapshots Logo" width="128" height="128">
</div>

<div align="center">

  [![GitHub stars](https://img.shields.io/github/stars/Pimzino/vscode-local-snapshots?style=social)](https://github.com/Pimzino/vscode-local-snapshots)
  [![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Support-yellow.svg?style=flat&logo=buy-me-a-coffee)](https://www.buymeacoffee.com/pimzino)

</div>

Take and restore snapshots of your workspace files with ease. Local Snapshots provides a powerful way to create, manage, and restore file snapshots directly within VS Code, offering both manual and automatic snapshot capabilities.

## Features

### 📸 Multiple Snapshot Types
- **Manual Snapshots**: Take named snapshots of your entire workspace
- **Quick Snapshots**: Quickly capture the current state with a single keystroke
- **Pre-Save Snapshots**: Automatically create snapshots before saving files
- **Timed Snapshots**: Set up automatic snapshots at regular intervals
- **File/Directory Snapshots**: Take snapshots of specific files or directories

### 🔍 Advanced Snapshot Management
- **Visual Diff View**: See exactly what changed between snapshots and current files
  - Side-by-side comparison
  - Inline unified view
  - File-by-file navigation
  - Direct file restoration from diff view
  - Search within diffs
  - Previous/Next match navigation
  - Match count indicator
- **Tree View**: Browse snapshot contents in a hierarchical structure
  - Directory-based file organization
  - Expand/collapse folders
  - Direct file restoration from tree view
  - Visual feedback for restored files
- **Ignore Patterns**: Exclude files from snapshots
  - Automatic .gitignore integration
  - Custom ignore patterns support
  - Visual pattern management interface
  - Search and filter patterns
  - Add files/folders via context menu
  - Real-time pattern updates
- **Selective Restore**: Choose specific files to restore from a snapshot
- **Snapshot Filtering**: Search and filter snapshots by name, date, or file count
- **Snapshot Limits**: Optionally limit the number of snapshots to manage storage
- **Rename Snapshots**: Easily rename snapshots with duplicate name validation
- **Delete Snapshots**: Remove individual snapshots or clear all at once

### ⚡ Quick Actions
- **Context Menu Integration**: Right-click files or folders to take snapshots
- **Keyboard Shortcuts**: Quick access to common actions
	- Take Quick Snapshot: `Ctrl+Alt+S` (Windows/Linux) or `Cmd+Alt+S` (Mac)
	- Restore Snapshot: `Ctrl+Alt+R` (Windows/Linux) or `Cmd+Alt+R` (Mac)

## Getting Started

1. Install the extension from the VS Code marketplace
2. Access Local Snapshots from the activity bar (look for the snapshot icon)
3. Take your first snapshot using the "Take Named Snapshot" button
4. View and manage your snapshots in the sidebar

## Extension Settings

### Automatic Snapshots
* `local-snapshots.enablePreSaveSnapshots`: Enable/disable automatic snapshots before saving files (default: `false`)
* `local-snapshots.enableTimedSnapshots`: Enable/disable automatic snapshots at regular intervals (default: `false`)
* `local-snapshots.timedSnapshotInterval`: Set the interval between automatic snapshots in seconds (default: `300`, minimum: `30`)
* `local-snapshots.showTimedSnapshotNotifications`: Show notifications when timed snapshots are created (default: `true`)
* `local-snapshots.skipUnchangedSnapshots`: Skip creating snapshots when no files have changed, applies to both automatic and manual snapshots (default: `false`)

### Storage Management
* `local-snapshots.limitSnapshotCount`: Enable/disable maximum snapshot limit (default: `false`)
* `local-snapshots.maxSnapshotCount`: Maximum number of snapshots to keep (default: `10`, minimum: `1`)
* `local-snapshots.respectGitignore`: Use .gitignore patterns to exclude files from snapshots (default: `true`)
* `local-snapshots.customIgnorePatterns`: Custom glob patterns to exclude files from snapshots (e.g. ['*.log', 'temp/**'])

### Display Settings
* `local-snapshots.diffViewStyle`: Choose how to display file differences: side-by-side, inline, or both views (default: `side-by-side`)

### REST API Settings
* `local-snapshots.enableApiServer`: Enable/disable the REST API server (default: `false`)
* `local-snapshots.apiPort`: Port number for the REST API server (default: `45678`). Configure before enabling the server.

### MCP Server Settings
* `local-snapshots.enableMcpServer`: Enable/disable the MCP (Model Context Protocol) SSE server (default: `false`)
* `local-snapshots.mcpPort`: Port number for the MCP SSE server (default: `45679`). Configure before enabling the server.

## Usage Tips

### Using the MCP Server
The extension can expose a Model Context Protocol (MCP) server for AI tool integration. This allows AI tools like Cursor AI to create and manage snapshots directly. To use it:

1. Configure the MCP port in settings: `localSnapshots.mcpPort` (default is 45679)
2. Enable the MCP server in settings: `localSnapshots.enableMcpServer`
3. The MCP status and port will be shown in the status bar
4. Connect your MCP-compatible client (like Cursor AI) to the server using the URL: `http://localhost:45679/sse`

#### Available MCP Tools
- `takeNamedSnapshot`: Create a named snapshot of the current workspace
  - Parameters: `name` (string) - Name for the snapshot

#### MCP Client Configuration Example (Cursor AI)
```json
{
  "mcpServers": {
    "local-snapshots": {
      "transport": "sse",
      "url": "http://localhost:45679/sse"
    }
  }
}
```

### Using the REST API
The extension can expose a simple REST API for programmatic snapshot creation. To use it:

1. Configure the API port in settings: `localSnapshots.apiPort` (default is 45678)
2. Enable the API server in settings: `localSnapshots.enableApiServer`
3. The API status and port will be shown in the status bar
4. Create snapshots using HTTP requests:

#### PowerShell Examples
```powershell
# Using Invoke-RestMethod (recommended)
$body = @{
    name = "Pre-AI-Changes"
} | ConvertTo-Json

Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:45678/snapshot" `
    -Body $body `
    -ContentType "application/json"

# List all snapshots
Invoke-RestMethod -Method Get -Uri "http://localhost:45678/snapshots"

# Check API health
Invoke-RestMethod -Method Get -Uri "http://localhost:45678/health"
```

#### Curl Examples
```bash
# Create a snapshot (Windows PowerShell)
curl.exe -X POST http://localhost:45678/snapshot `
  -H "Content-Type: application/json" `
  -d "{\"name\":\"Pre-AI-Changes\"}"

# Create a snapshot (Unix/Git Bash)
curl -X POST http://localhost:45678/snapshot \
  -H "Content-Type: application/json" \
  -d '{"name":"Pre-AI-Changes"}'

# List all snapshots
curl http://localhost:45678/snapshots

# Check API health
curl http://localhost:45678/health
```

#### API Endpoints
- `POST /snapshot`: Create a new snapshot
  - Body: `{ "name": "snapshot-name" }`
  - Response: `{ "success": true, "message": "..." }`
- `GET /snapshots`: List all snapshots
  - Response: `{ "success": true, "snapshots": [...] }`
- `GET /health`: Check API status
  - Response: `{ "status": "ok" }`

#### Error Handling
The API returns detailed error messages in JSON format:
```json
{
    "error": "Error type",
    "details": "Detailed error message"
}
```

Common error codes:
- 400: Bad Request (invalid JSON or missing fields)
- 404: Endpoint not found
- 500: Server error (snapshot operation failed)

If the port is already in use, you'll be prompted to either:
- Configure a different port
- Disable the API server

### Taking Snapshots
- Use named snapshots for important changes or milestones
- Use quick snapshots for rapid iterations
- Enable pre-save snapshots when working on critical changes
- Set up timed snapshots during intensive development sessions

### Managing Snapshots
- Use the filter panel to quickly find specific snapshots
- View diffs before restoring to verify changes
- Use selective restore to recover specific files
- Clean up old snapshots regularly using the snapshot limit feature
- Rename snapshots to keep them organized and meaningful

### Managing Ignore Patterns
- Access the ignore patterns manager from the Local Snapshots sidebar
- Patterns from .gitignore files are automatically synced and marked
- Add custom patterns using the input field or context menu
- Right-click files/folders in VS Code explorer to add them to ignore patterns
- Use the search boxes to filter both patterns and workspace files
- Custom patterns can be removed, while .gitignore patterns are read-only
- Changes take effect immediately for future snapshots

### Keyboard Shortcuts
Create your own keyboard shortcuts for any of these commands:
- `local-snapshots.takeSnapshot`: Take a named snapshot
- `local-snapshots.quickSnapshot`: Take a quick snapshot
- `local-snapshots.restoreSnapshot`: Restore a snapshot
- `local-snapshots.snapshotFile`: Take a snapshot of the current file
- `local-snapshots.snapshotDirectory`: Take a snapshot of a directory

## Requirements
- VS Code version 1.74.0 or higher
- No additional dependencies required

## Known Issues & Feedback
Please report any issues or feature suggestions by creating a new issue on our [GitHub Issues page](https://github.com/Pimzino/vscode-local-snapshots/issues). Also, if you enjoy using the extension, please consider giving the repository a star on [GitHub](https://github.com/Pimzino/vscode-local-snapshots) to show your support!

## Release Notes

See our [CHANGELOG.md](CHANGELOG.md) for detailed release notes.

---

## Contributing
Contributions are welcome! Please feel free to submit a Pull Request.

## License
This extension is licensed under the [MIT License](LICENSE).

**Enjoy using Local Snapshots!**
