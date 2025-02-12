# Change Log

All notable changes to the "Local Snapshots" extension will be documented in this file.

## [0.0.10] - 2025-02-12

### 🚀 Major Performance & Configurability Improvements

- **Configurable Batch Processing:** Added new settings `localSnapshots.batchSize`, `localSnapshots.batchDelay`, and `localSnapshots.maxParallelBatches` to allow users to adjust snapshot processing behavior.
- **Faster Processing:** Improved parallel file processing and smarter batching by replacing hardcoded constants with configurable methods, resulting in significantly faster snapshot creation for large workspaces.
- **Enhanced Type Safety & Code Quality:** Resolved multiple linter errors by removing duplicate interface declarations and updating method signatures to ensure proper type compatibility (e.g., for progress reporting).
- **Smarter File Handling:** Implemented caching for file metadata and optimized file filtering based on ignore patterns (including .gitignore integration) and common binary file types.

💡 **Tips:**
- Adjust the new batch processing settings in the extension configuration to optimize performance for your setup.
- Leverage .gitignore integration and custom ignore patterns for even better snapshot efficiency.

## [0.0.9] - 2025-02-12

### 🎉 New Feature: Ignore Patterns Management

We're excited to introduce a powerful new feature that gives you more control over which files are included in your snapshots!

#### 🔄 Automatic .gitignore Integration
- Your existing .gitignore patterns are now automatically respected
- Patterns from .gitignore files are synced in real-time
- Visual indicators show which patterns come from .gitignore
- Changes to .gitignore files are detected and updated automatically

#### ✨ Custom Ignore Patterns
- Add your own patterns to exclude files from snapshots
- Easy-to-use visual interface for managing patterns
- Search functionality to find specific patterns
- Visual workspace file browser to select files/folders to ignore
- Right-click context menu integration in VS Code's explorer

#### 🛠️ New Settings
- `localSnapshots.respectGitignore`: Toggle .gitignore integration (on by default)
- `localSnapshots.customIgnorePatterns`: Define your own exclude patterns

#### 💡 How to Use
1. Click the "Manage Ignore Patterns" button in the Local Snapshots sidebar
2. View your current patterns, including those from .gitignore
3. Add new patterns either by:
   - Typing them directly in the input field
   - Right-clicking files/folders in VS Code's explorer
   - Using the workspace browser in the ignore patterns view
4. Search through patterns and workspace files using the search boxes
5. Remove custom patterns with the delete button (note: .gitignore patterns can only be modified in the .gitignore file)

#### 🚀 Performance Improvements
- Enhanced snapshot performance through optimized file filtering
- Efficient pattern matching using the 'ignore' package
- Smart caching of .gitignore patterns for better performance

## [0.0.8] - 2024-01-27

### Fixed
- Fixed file / directory snapshot diff view incorrectly showing all files as created:
    - Properly adjusted file paths relative to the snapshot directory root
    - Improved path comparison logic for accurate change detection
    - Fixed diff view to correctly show modified, created, and deleted files

## [0.0.7] - 2024-01-27

### Changed
- Updated repository URLs to point to new repository location (vscode-local-snapshots)

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