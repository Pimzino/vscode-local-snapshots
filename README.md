# Local Snapshots for VS Code

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
- **Selective Restore**: Choose specific files to restore from a snapshot
- **Snapshot Filtering**: Search and filter snapshots by name, date, or file count
- **Snapshot Limits**: Optionally limit the number of snapshots to manage storage

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

## Usage Tips

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

## Known Issues
Please report any issues on our [GitHub repository](https://github.com/yourusername/local-snapshots/issues).

## Release Notes

### 0.0.1
- Initial release
- Basic snapshot functionality
- Automatic snapshot features
- Diff view implementation
- Filtering and management features

---

## Contributing
Contributions are welcome! Please feel free to submit a Pull Request.

## License
This extension is licensed under the [MIT License](LICENSE).

**Enjoy using Local Snapshots!**
