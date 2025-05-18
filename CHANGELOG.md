# Change Log

All notable changes to the "Local Snapshots" extension will be documented in this file.

## [0.0.20] - 2025-05-18

### Improved
- Implemented centralized logging system:
  - Added dedicated Output panel channel "Local Snapshots" for all extension logs
  - Improved error message readability with structured formatting
  - Better diagnostic information for troubleshooting
  - More consistent log messages across all extension components

## [0.0.19] - 2025-05-17

### Fixes
- Fixed a bug with the character level diff highlighter not using the correct color set by the user in settings.
- Fixed a bug with the diff view character level color selected wasnt being persisted between different diff view sessions.

## [0.0.18] - 2025-05-16

### ✨ New Features: Enhanced Diff Controls

- Added line-level diff toggle to allow more control over how differences are displayed
- Improved character-level diff highlighting with better contrast and visibility across all themes

#### What's New
- Line-level diff toggle to show/hide line background colors
- Toggle button in the diff view UI for quick access
- Persistent setting that works across all diff views
- Ability to combine line-level and character-level diffs in any way you prefer
- Enhanced character-level diff highlighting with improved contrast in both light and dark themes

#### New Settings
- `localSnapshots.enableLineLevelDiff`: Enable/disable line-level diff highlighting (default: `true`)

## [0.0.17] - 2025-05-15

### ✨ New Feature: Text Wrapping in Diff View

- We've added text wrapping support to make it easier to read and compare long lines of text. (Thanks @fungai2000 for the enhancement request!)

#### What's New
- Text wrapping option for both side-by-side and inline diff views
- Toggle button in the diff view UI for quick access
- Persistent setting that works across all diff views
- Especially useful for markdown files and other prose content with long paragraphs

#### New Settings
- `localSnapshots.enableTextWrapping`: Enable/disable text wrapping in diff view (default: `false`)

## [0.0.16] - 2025-05-01

### 🐛 Bug Fixes

- Fixed a few accessibility issues with the extensions views.
- Stopped the extension from automatically opening the sidebar on startup and changing to the Local Snapshots view automatically.

## [0.0.15] - 2025-05-01

### 🐛 Bug Fixes

- Fixed issue with manual (right-click) file snapshot where diff view was unable to read the file due to incorrect path construction.
- Added 'Skip Unchanged Snapshots' to our custom settings page as it wasnt added when the custom extension settings page was created.

## [0.0.14] - 2025-04-29

### 🐛 Bug Fixes

- Fixed critical issue with pre-save snapshots:
  - Fixed restore functionality to only affect the specific file in pre-save snapshots
  - Improved diff view to only show the specific file that was snapshotted
  - Added proper handling of untitled files in pre-save snapshots
  - Enhanced logging and error handling for untitled file operations

- Exclusions List:
  - Improved filtering to prevent duplicate entries and ensure a clean UI
  - Implemented proper indexing to ensure correct indices for future operations
  - Fixed UI not refreshing when removing / adding entries
  - Made the exclusions list collapsible for better organization

## [0.0.13] - 2025-04-24

### 🐛 Bug Fixes

- Fixed "Maximum Call Stack Size Exceeded" error related to notifications:
  - Implemented a notification throttling mechanism to prevent recursive notifications
  - Added safeguards to prevent infinite notification loops
  - Created a new NotificationManager utility class to handle all notifications safely
  - Added a new "quietMode" setting to reduce the number of non-critical notifications

### ⚙️ New Settings

- `localSnapshots.quietMode`: Reduce the number of notifications shown. Only critical notifications will be displayed.

## [0.0.12] - 2025-03-30

### 🚀 Major Update: MCP Server, Custom Settings UI & Dynamic Port Management

This release brings three major improvements: MCP server support for AI integration, a modern custom settings page, and intelligent dynamic port management!

### 🤖 New Feature: MCP Server for AI Integration

We've added a Model Context Protocol (MCP) server that allows AI tools like Cursor AI to directly create and manage snapshots!

#### ✨ What's New
- MCP SSE server for AI tool integration
- Status bar indicator showing MCP status and port
- Easy configuration for MCP clients

#### 🛠️ New Settings
- `localSnapshots.enableMcpServer`: Toggle the MCP server

#### 💡 How to Use
1. Enable the MCP server
2. Monitor the status in the status bar
3. Connect your MCP-compatible client (like Cursor AI) to the server using the displayed URL

#### 🔧 Available MCP Tools
- `takeNamedSnapshot`: Create a named snapshot of the current workspace

### 🎛️ New Feature: Custom Settings Page

We've completely redesigned the settings experience with a modern, user-friendly interface!

#### ✨ What's New
- Tabbed interface for better organization of settings
- Dedicated tabs for General, Snapshots, API Server, and MCP Server settings
- Informational panels with usage examples and connection details
- Real-time updates of server status and port information
- Improved visual design that matches VS Code's aesthetic

### 🔌 New Feature: Dynamic Port Management

No more port conflicts! The extension now automatically handles port allocation for both API and MCP servers.

#### ✨ What's New
- Automatic port selection when default ports are in use
- Real-time port information in the status bar and settings UI
- Seamless operation across multiple VS Code instances
- No manual port configuration needed

#### 🔄 Changes
- Removed manual port configuration settings
- Servers now automatically find available ports
- Default ports are still tried first (45678 for API, 45679 for MCP)
- Clear notifications when alternate ports are being used

#### 🔒 Safety Features
- Uses non-standard ports by default to avoid conflicts
- Automatic port conflict resolution
- Servers automatically stop when disabled

## [0.0.11] - 2025-02-13

### 🌐 New Feature: REST API for Automation

We've added a simple REST API that allows other tools (like AI assistants) to programmatically create snapshots!

#### ✨ What's New
- REST API server for creating snapshots programmatically
- Status bar indicator showing API status and port
- Secure port management with conflict detection
- Easy-to-use PowerShell and curl examples

#### 🛠️ New Settings
- `localSnapshots.enableApiServer`: Toggle the REST API server
- `localSnapshots.apiPort`: Configure the port (default: 45678)

#### 💡 How to Use
1. Configure your preferred port in settings (default: 45678)
2. Enable the API server
3. Monitor the status in the status bar
4. Create snapshots using simple HTTP requests:
   ```powershell
   Invoke-RestMethod -Method Post -Uri "http://localhost:45678/snapshot" `
     -Body (@{name="Pre-AI-Changes"} | ConvertTo-Json) `
     -ContentType "application/json"
   ```

#### 🔒 Safety Features
- Uses a non-standard port (45678) to avoid conflicts
- Automatic port conflict detection
- Easy port reconfiguration if needed
- API server automatically stops when disabled

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