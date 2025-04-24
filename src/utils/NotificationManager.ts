import * as vscode from 'vscode';

// Create a global variable to store the singleton instance
// This ensures it works correctly even when bundled by webpack
declare global {
    var notificationManagerInstance: NotificationManager | undefined;
}

/**
 * Manages notifications to prevent infinite recursion and throttle notification frequency
 */
export class NotificationManager {
    private isShowingNotification: boolean = false;
    private notificationQueue: Array<{
        message: string;
        type: 'info' | 'warning' | 'error';
        options?: string[];
        modal?: boolean;
    }> = [];
    private lastNotificationTime: number = 0;
    private notificationCount: number = 0;
    private readonly THROTTLE_INTERVAL_MS = 500; // Minimum time between notifications
    private readonly MAX_NOTIFICATIONS_PER_MINUTE = 10;
    private readonly notificationTimestamps: number[] = [];
    private instanceId: string;

    private constructor() {
        // Private constructor to enforce singleton
        this.instanceId = Date.now().toString();
        console.log(`[NotificationManager] Created new instance with ID: ${this.instanceId}`);
    }

    /**
     * Get the NotificationManager instance
     */
    public static getInstance(): NotificationManager {
        if (!global.notificationManagerInstance) {
            console.log('[NotificationManager] Creating new global instance');
            global.notificationManagerInstance = new NotificationManager();
        } else {
            console.log(`[NotificationManager] Returning existing instance with ID: ${global.notificationManagerInstance.instanceId}`);
        }
        return global.notificationManagerInstance;
    }

    /**
     * Show an information message with throttling and recursion prevention
     * @param message The message to show
     * @param options The options to include
     * @param modal Whether to show as modal
     * @returns Promise that resolves to the selected item or undefined
     */
    public async showInformationMessage(
        message: string,
        options?: string[],
        modal: boolean = false
    ): Promise<string | undefined> {
        return this.showNotification(message, 'info', options, modal);
    }

    /**
     * Show a warning message with throttling and recursion prevention
     * @param message The message to show
     * @param options The options to include
     * @param modal Whether to show as modal
     * @returns Promise that resolves to the selected item or undefined
     */
    public async showWarningMessage(
        message: string,
        options?: string[],
        modal: boolean = false
    ): Promise<string | undefined> {
        return this.showNotification(message, 'warning', options, modal);
    }

    /**
     * Show an error message with throttling and recursion prevention
     * @param message The message to show
     * @param options The options to include
     * @param modal Whether to show as modal
     * @returns Promise that resolves to the selected item or undefined
     */
    public async showErrorMessage(
        message: string,
        options?: string[],
        modal: boolean = false
    ): Promise<string | undefined> {
        return this.showNotification(message, 'error', options, modal);
    }

    /**
     * Internal method to show a notification with throttling and recursion prevention
     */
    private async showNotification(
        message: string,
        type: 'info' | 'warning' | 'error',
        options?: string[],
        modal: boolean = false
    ): Promise<string | undefined> {
        try {
            console.log(`[NotificationManager ${this.instanceId}] Showing notification: ${message} (type: ${type}, modal: ${modal})`);

            // Check if notifications are disabled in settings
            const config = vscode.workspace.getConfiguration('localSnapshots');
            const quietMode = config.get<boolean>('quietMode', false);
            console.log(`[NotificationManager ${this.instanceId}] Quiet mode: ${quietMode}`);

            // Check if this is a delete confirmation message (these should never be suppressed)
            const isDeleteConfirmation =
                message.includes('Are you sure you want to delete') ||
                message.includes('This action cannot be undone');

            if (quietMode && type === 'info' && !isDeleteConfirmation && !modal) {
                // Skip non-critical notifications in quiet mode, but always show delete confirmations
                // and any modal dialogs as these are considered important
                console.log(`[NotificationManager ${this.instanceId}] Suppressed in quiet mode: ${message}`);
                return undefined;
            }

            // Check if we're already showing a notification to prevent recursion
            if (this.isShowingNotification) {
                console.log(`[NotificationManager ${this.instanceId}] Already showing notification, queueing: ${message}`);
                this.notificationQueue.push({ message, type, options, modal });
                return undefined;
            }

            // Check if we should throttle based on time
            const now = Date.now();
            if (now - this.lastNotificationTime < this.THROTTLE_INTERVAL_MS) {
                console.log(`[NotificationManager ${this.instanceId}] Throttling notification: ${message}`);
                this.notificationQueue.push({ message, type, options, modal });
                return undefined;
            }

            // Check if we've shown too many notifications recently
            this.notificationTimestamps.push(now);
            // Keep only timestamps from the last minute
            const oneMinuteAgo = now - 60000;
            while (this.notificationTimestamps.length > 0 && this.notificationTimestamps[0] < oneMinuteAgo) {
                this.notificationTimestamps.shift();
            }

            if (this.notificationTimestamps.length > this.MAX_NOTIFICATIONS_PER_MINUTE) {
                console.log(`[NotificationManager ${this.instanceId}] Too many notifications, suppressing: ${message}`);
                // Only queue critical notifications when rate limited
                if (type === 'error') {
                    this.notificationQueue.push({ message, type, options, modal });
                }
                return undefined;
            }

            // Set flag to prevent recursive notifications
            this.isShowingNotification = true;
            this.lastNotificationTime = now;
            this.notificationCount++;

            // Show the notification based on type
            let result: string | undefined;
            try {
                console.log(`[NotificationManager ${this.instanceId}] About to show ${type} notification: "${message}"`);

                if (type === 'info') {
                    if (options && options.length > 0) {
                        console.log(`[NotificationManager ${this.instanceId}] Showing info message with options:`, options);
                        result = await vscode.window.showInformationMessage(message, { modal }, ...options);
                    } else {
                        console.log(`[NotificationManager ${this.instanceId}] Showing info message without options`);
                        await vscode.window.showInformationMessage(message, { modal });
                    }
                } else if (type === 'warning') {
                    if (options && options.length > 0) {
                        console.log(`[NotificationManager ${this.instanceId}] Showing warning message with options:`, options);
                        result = await vscode.window.showWarningMessage(message, { modal }, ...options);
                    } else {
                        console.log(`[NotificationManager ${this.instanceId}] Showing warning message without options`);
                        await vscode.window.showWarningMessage(message, { modal });
                    }
                } else if (type === 'error') {
                    if (options && options.length > 0) {
                        console.log(`[NotificationManager ${this.instanceId}] Showing error message with options:`, options);
                        result = await vscode.window.showErrorMessage(message, { modal }, ...options);
                    } else {
                        console.log(`[NotificationManager ${this.instanceId}] Showing error message without options`);
                        await vscode.window.showErrorMessage(message, { modal });
                    }
                }

                console.log(`[NotificationManager ${this.instanceId}] Notification shown successfully, result:`, result);
            } catch (error) {
                console.error(`[NotificationManager ${this.instanceId}] Error showing notification: ${error}`);
            }

            // Reset flag
            this.isShowingNotification = false;

            // Process next notification in queue if any
            this.processQueue();

            return result;
        } catch (error) {
            // Ensure flag is reset even if an error occurs
            this.isShowingNotification = false;
            console.error(`[NotificationManager] Notification error: ${error}`);
            return undefined;
        }
    }

    /**
     * Process the next notification in the queue
     */
    private async processQueue(): Promise<void> {
        if (this.notificationQueue.length === 0) {
            console.log(`[NotificationManager ${this.instanceId}] No notifications in queue to process`);
            return;
        }

        console.log(`[NotificationManager ${this.instanceId}] Processing queue with ${this.notificationQueue.length} notifications`);

        // Wait a bit before showing the next notification
        setTimeout(async () => {
            const next = this.notificationQueue.shift();
            if (next) {
                console.log(`[NotificationManager ${this.instanceId}] Processing queued notification: ${next.message}`);
                await this.showNotification(next.message, next.type, next.options, next.modal);
            }
        }, this.THROTTLE_INTERVAL_MS);
    }
}
