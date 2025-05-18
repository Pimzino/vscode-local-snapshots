import * as vscode from 'vscode';

/**
 * Configuration manager for the Local Snapshots extension
 * Centralizes all configuration access and provides typed settings with defaults
 */
export class ConfigurationManager {
  private static instance: ConfigurationManager;
  private readonly CONFIG_PREFIX = 'localSnapshots';
  
  private constructor() {}

  /**
   * Get the singleton instance of the ConfigurationManager
   */
  public static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  /**
   * Get the configuration object
   */
  private getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(this.CONFIG_PREFIX);
  }

  /**
   * Get a configuration value
   * @param key The configuration key
   * @param defaultValue The default value
   */
  public get<T>(key: string, defaultValue: T): T {
    return this.getConfig().get<T>(key, defaultValue);
  }

  /**
   * Update a configuration value
   * @param key The configuration key
   * @param value The new value
   * @param target The configuration target
   */
  public async update(key: string, value: any, target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global): Promise<void> {
    await this.getConfig().update(key, value, target);
  }

  // API Server settings
  public get enableApiServer(): boolean {
    return this.get('enableApiServer', false);
  }

  public get apiPort(): number {
    return this.get('apiPort', 54321);
  }

  // MCP Server settings
  public get enableMcpServer(): boolean {
    return this.get('enableMcpServer', false);
  }

  public get mcpPort(): number {
    return this.get('mcpPort', 45679);
  }

  // Snapshot settings
  public get enablePreSaveSnapshots(): boolean {
    return this.get('enablePreSaveSnapshots', false);
  }

  public get enableTimedSnapshots(): boolean {
    return this.get('enableTimedSnapshots', false);
  }

  public get timedSnapshotInterval(): number {
    return this.get('timedSnapshotInterval', 300);
  }

  public get showTimedSnapshotNotifications(): boolean {
    return this.get('showTimedSnapshotNotifications', true);
  }

  public get skipUnchangedSnapshots(): boolean {
    return this.get('skipUnchangedSnapshots', false);
  }

  public get enableDeleteProtection(): boolean {
    return this.get('enableDeleteProtection', true);
  }

  public get limitSnapshotCount(): boolean {
    return this.get('limitSnapshotCount', false);
  }

  public get maxSnapshotCount(): number {
    return this.get('maxSnapshotCount', 10);
  }

  // File processing settings
  public get batchSize(): number {
    return this.get('batchSize', 50);
  }

  public get batchDelay(): number {
    return this.get('batchDelay', 10);
  }

  public get maxParallelBatches(): number {
    return this.get('maxParallelBatches', 1);
  }

  public get respectGitignore(): boolean {
    return this.get('respectGitignore', true);
  }

  public get customIgnorePatterns(): string[] {
    return this.get('customIgnorePatterns', []);
  }
}