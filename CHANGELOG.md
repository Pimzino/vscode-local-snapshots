# Change Log

All notable changes to the "Local Snapshots" extension will be documented in this file.

## [0.0.6] - 2024-01-27

### Added
- Tree View for browsing snapshot contents:
    - Hierarchical directory-based file organization
    - Expand/collapse folder functionality
    - Direct file restoration with visual feedback
    - Global expand/collapse controls

### Fixed
- Fixed mass delete functionality not working after workspace-specific storage migration:
    - Updated delete all snapshots command to handle per-workspace storage
    - Ensured proper cleanup of snapshots across all workspace folders

## [0.0.5] - 2024-01-27

### Changed
- Made snapshots workspace-specific:
    - Each workspace now has its own set of snapshots
    - Added automatic migration of existing snapshots to workspace-specific storage
    - Improved handling of snapshots in multi-root workspaces

## [0.0.4] - 2024-01-27

### Changed
- Updated extension title in sidebar from "Snapshots" to "Local Snapshots" for better clarity and consistency

### Fixed
- Fixed visibility of file status labels in diff view:
	- Added proper styling for "Created" and "Deleted" status indicators
	- Improved contrast and readability of status labels

## [0.0.3] - 2024-01-27

### Fixed
- Fixed missing icons in packaged extension:
	- Added proper bundling of codicon files
	- Ensured icons display correctly in production builds
- Fixed SVG icons not displaying in diff view:
	- Updated Content Security Policy to allow image sources
	- Restored navigation and search button icons

## [0.0.2] - 2024-01-26

### Added
- Delete protection feature with configurable setting
- "Don't ask again" option in delete confirmation dialogs
- Complete workspace state restoration:
	- Added detection and removal of files not present in snapshot
	- Added visual indication of newly created files in diff view

### Changed
- Simplified snapshot naming convention:
	- Removed project name prefix from named snapshots
	- Streamlined automatic snapshot names
	- Added duplicate name validation for manual snapshots
- Improved delete confirmation UX with clearer messaging
- Enhanced UI with VS Code icons:
	- Replaced custom snapshot card action buttons with codicons
	- Added icons for filters, search, and file management
	- Improved visual consistency across all views

### Fixed
- Fixed false success message when canceling snapshot deletion
- Improved binary file handling in diff view:
	- Gracefully skip binary files instead of failing
	- Consistent handling with snapshot creation behavior
	- Better error handling for unreadable files

## [0.0.1] - 2024-01-25

### Added
- Initial release of Local Snapshots
- Manual snapshot creation with naming support
- Quick snapshot functionality with keyboard shortcuts
- Automatic snapshot features:
	- Pre-save snapshots
	- Timed snapshots with configurable intervals
	- Skip unchanged snapshots option
- Enhanced visual diff view:
	- Side-by-side and inline comparison modes
	- File-by-file navigation
	- Direct file restoration from diff view
	- Syntax highlighting for all file types
	- Line number indicators
	- Change markers for additions and deletions
	- Search functionality within diffs:
		- Real-time search highlighting
		- Previous/Next match navigation
		- Match count display
		- Clear search option
- Snapshot management features:
	- Search and filter snapshots
	- Date range filtering
	- File count filtering
	- Rename snapshots with duplicate name validation
	- Delete individual snapshots
	- Delete all snapshots with confirmation
- File and directory specific snapshots
- Selective file restoration
- Snapshot limit management
- Context menu integration
- Keyboard shortcuts:
	- Quick Snapshot (Ctrl+Alt+S / Cmd+Alt+S)
	- Restore Snapshot (Ctrl+Alt+R / Cmd+Alt+R)
- Modern UI with VS Code theme integration
- Comprehensive filtering system:
	- Name-based search
	- Date range selection
	- File count filtering
- Detailed snapshot information:
	- Creation date and time
	- File count
	- Visual indicators for actions

### Changed
- N/A (Initial release)

### Deprecated
- N/A (Initial release)

### Removed
- N/A (Initial release)

### Fixed
- N/A (Initial release)

### Security
- Implemented secure snapshot storage using VS Code's extension storage
- Added confirmation dialog for destructive actions
- Proper sanitization of snapshot names and paths