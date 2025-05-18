import * as vscode from 'vscode';

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

/**
 * Logger class that manages logging to VS Code's output channel
 */
export class Logger {
    private static _instance: Logger;
    private _outputChannel: vscode.OutputChannel;
    private _logLevel: LogLevel = LogLevel.INFO;

    private constructor() {
        this._outputChannel = vscode.window.createOutputChannel('Local Snapshots');
    }

    /**
     * Get the singleton instance of the logger
     */
    public static getInstance(): Logger {
        if (!Logger._instance) {
            Logger._instance = new Logger();
        }
        return Logger._instance;
    }

    /**
     * Set the minimum log level to display
     */
    public setLogLevel(level: LogLevel): void {
        this._logLevel = level;
    }

    /**
     * Show the output channel in the VS Code UI
     */
    public show(): void {
        this._outputChannel.show();
    }

    /**
     * Format a log message with timestamp and optional component name
     */
    private formatMessage(message: string, component?: string): string {
        const timestamp = new Date().toISOString();
        return component
            ? `[${timestamp}] [${component}] ${message}`
            : `[${timestamp}] ${message}`;
    }

    /**
     * Log a debug message
     */
    public debug(message: string, component?: string, ...args: any[]): void {
        if (this._logLevel <= LogLevel.DEBUG) {
            const formattedMessage = this.formatMessage(message, component);
            this._outputChannel.appendLine(formattedMessage);
            if (args.length > 0) {
                args.forEach(arg => {
                    if (typeof arg === 'object') {
                        this._outputChannel.appendLine(JSON.stringify(arg, null, 2));
                    } else {
                        this._outputChannel.appendLine(String(arg));
                    }
                });
            }
        }
    }

    /**
     * Log an info message
     */
    public info(message: string, component?: string, ...args: any[]): void {
        if (this._logLevel <= LogLevel.INFO) {
            const formattedMessage = this.formatMessage(message, component);
            this._outputChannel.appendLine(formattedMessage);
            if (args.length > 0) {
                args.forEach(arg => {
                    if (typeof arg === 'object') {
                        this._outputChannel.appendLine(JSON.stringify(arg, null, 2));
                    } else {
                        this._outputChannel.appendLine(String(arg));
                    }
                });
            }
        }
    }

    /**
     * Log a warning message
     */
    public warn(message: string, component?: string, ...args: any[]): void {
        if (this._logLevel <= LogLevel.WARN) {
            const formattedMessage = this.formatMessage(message, component);
            this._outputChannel.appendLine(formattedMessage);
            if (args.length > 0) {
                args.forEach(arg => {
                    if (typeof arg === 'object') {
                        this._outputChannel.appendLine(JSON.stringify(arg, null, 2));
                    } else {
                        this._outputChannel.appendLine(String(arg));
                    }
                });
            }
        }
    }

    /**
     * Log an error message
     */
    public error(message: string, component?: string, ...args: any[]): void {
        if (this._logLevel <= LogLevel.ERROR) {
            const formattedMessage = this.formatMessage(message, component);
            this._outputChannel.appendLine(formattedMessage);
            if (args.length > 0) {
                args.forEach(arg => {
                    if (typeof arg === 'object') {
                        this._outputChannel.appendLine(JSON.stringify(arg, null, 2));
                    } else {
                        this._outputChannel.appendLine(String(arg));
                    }
                });
            }
        }
    }

    /**
     * Dispose the output channel
     */
    public dispose(): void {
        this._outputChannel.dispose();
    }
}