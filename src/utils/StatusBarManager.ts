import * as vscode from 'vscode';

/**
 * Types of status bar items managed by this class
 */
export enum StatusBarItemType {
  API_SERVER,
  MCP_SERVER,
  TIMED_SNAPSHOT
}

/**
 * Manages the creation and updates of all status bar items
 */
export class StatusBarManager {
  private static instance: StatusBarManager;
  private statusBarItems: Map<StatusBarItemType, vscode.StatusBarItem> = new Map();
  private countdownInterval?: NodeJS.Timeout;

  private constructor() {
    // Initialize the status bar items with different priorities
    this.createStatusBarItem(StatusBarItemType.API_SERVER, 100);
    this.createStatusBarItem(StatusBarItemType.MCP_SERVER, 99);
    this.createStatusBarItem(StatusBarItemType.TIMED_SNAPSHOT, 98);

    // Set the same command for all status bar items
    this.setCommand(StatusBarItemType.API_SERVER, 'local-snapshots.openSettings');
    this.setCommand(StatusBarItemType.MCP_SERVER, 'local-snapshots.openSettings');
    this.setCommand(StatusBarItemType.TIMED_SNAPSHOT, 'local-snapshots.openSettings');
  }

  /**
   * Get the singleton instance of the StatusBarManager
   */
  public static getInstance(): StatusBarManager {
    if (!StatusBarManager.instance) {
      StatusBarManager.instance = new StatusBarManager();
    }
    return StatusBarManager.instance;
  }

  /**
   * Create a status bar item with the given priority
   * @param type The type of status bar item
   * @param priority The priority of the status bar item
   */
  private createStatusBarItem(type: StatusBarItemType, priority: number): vscode.StatusBarItem {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, priority);
    this.statusBarItems.set(type, item);
    return item;
  }

  /**
   * Set the command to be executed when the status bar item is clicked
   * @param type The type of status bar item
   * @param command The command to execute
   */
  public setCommand(type: StatusBarItemType, command: string): void {
    const item = this.statusBarItems.get(type);
    if (item) {
      item.command = command;
    }
  }

  /**
   * Update the API server status bar item
   * @param isEnabled Whether the API server is enabled
   * @param port The port the API server is running on
   */
  public updateApiStatus(isEnabled: boolean, port?: number): void {
    const item = this.statusBarItems.get(StatusBarItemType.API_SERVER);
    if (!item) {
      return;
    }

    if (isEnabled && port) {
      item.text = `$(radio-tower) API: ${port}`;
      item.tooltip = `Local Snapshots API running on port ${port}. Click to change settings.`;
      item.show();
    } else {
      item.text = `$(radio-tower) API: Off`;
      item.tooltip = 'Local Snapshots API is disabled. Click to change settings.';
      item.show();
    }
  }

  /**
   * Update the MCP server status bar item
   * @param isEnabled Whether the MCP server is enabled
   * @param port The port the MCP server is running on
   */
  public updateMcpStatus(isEnabled: boolean, port?: number): void {
    const item = this.statusBarItems.get(StatusBarItemType.MCP_SERVER);
    if (!item) {
      return;
    }

    if (isEnabled && port) {
      item.text = `$(plug) MCP: ${port}`;
      item.tooltip = `Local Snapshots MCP server running on port ${port}. Click to change settings.`;
      item.show();
    } else {
      item.text = `$(plug) MCP: Off`;
      item.tooltip = 'Local Snapshots MCP server is disabled. Click to change settings.';
      item.show();
    }
  }

  /**
   * Start the timed snapshot countdown
   * @param nextSnapshotTime The timestamp of the next snapshot
   */
  public startTimedSnapshotCountdown(nextSnapshotTime: number): void {
    // Stop any existing countdown
    this.stopTimedSnapshotCountdown();

    const item = this.statusBarItems.get(StatusBarItemType.TIMED_SNAPSHOT);
    if (!item) {
      return;
    }

    // Update status bar immediately
    this.updateTimedSnapshotStatus(nextSnapshotTime);
    item.show();

    // Set up countdown interval
    this.countdownInterval = setInterval(() => {
      this.updateTimedSnapshotStatus(nextSnapshotTime);
    }, 1000);
  }

  /**
   * Stop the timed snapshot countdown
   */
  public stopTimedSnapshotCountdown(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = undefined;
    }

    const item = this.statusBarItems.get(StatusBarItemType.TIMED_SNAPSHOT);
    if (item) {
      item.hide();
    }
  }

  /**
   * Update the timed snapshot status bar item
   * @param nextSnapshotTime The timestamp of the next snapshot
   */
  private updateTimedSnapshotStatus(nextSnapshotTime: number): void {
    const item = this.statusBarItems.get(StatusBarItemType.TIMED_SNAPSHOT);
    if (!item) {
      return;
    }

    const timeLeft = Math.max(0, nextSnapshotTime - Date.now());
    const hours = Math.floor(timeLeft / 3600000);
    const minutes = Math.floor((timeLeft % 3600000) / 60000);
    const seconds = Math.floor((timeLeft % 60000) / 1000);

    const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    item.text = `$(history) Next snapshot in ${timeString}`;
    item.tooltip = 'Click to open Local Snapshots settings';
  }

  /**
   * Dispose all status bar items
   */
  public dispose(): void {
    this.stopTimedSnapshotCountdown();
    for (const item of this.statusBarItems.values()) {
      item.dispose();
    }
    this.statusBarItems.clear();
  }

  /**
   * Get all status bar items as disposables
   */
  public getDisposables(): vscode.Disposable[] {
    return Array.from(this.statusBarItems.values());
  }
}