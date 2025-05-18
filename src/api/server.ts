import express from 'express';
import { Express, Request, Response } from 'express';
import * as vscode from 'vscode';
import { SnapshotManager } from '../managers/SnapshotManager';
import { findAvailablePort, DEFAULT_PORTS } from '../utils/portUtils';
import { NotificationManager } from '../utils/NotificationManager';
import { Logger } from '../utils/Logger';

export class ApiServer {
    private app: Express;
    private server: any;
    private port: number | undefined;
    private notificationManager: NotificationManager = NotificationManager.getInstance();
    private logger: Logger = Logger.getInstance();

    constructor(private snapshotManager: SnapshotManager) {
        this.logger.info('Initializing API server', 'API');
        this.logger.info(`Express module: ${typeof express}`, 'API');

        if (!express) {
            this.logger.error('Express module not properly loaded!', 'API');
            throw new Error('Express module not properly loaded. This is likely a dependency issue.');
        }

        this.app = express();
        this.logger.info('Express app created successfully', 'API');

        // Add error handling middleware
        this.app.use((err: any, req: Request, res: Response, next: express.NextFunction) => {
            this.logger.error('API Error', 'API', err);
            res.status(500).json({
                error: 'Internal Server Error',
                details: err instanceof Error ? err.message : 'Unknown error'
            });
        });

        // Add request parsing middleware
        this.app.use(express.json({
            strict: true,
            limit: '1mb',
            verify: (req: any, res: Response, buf: Buffer) => {
                try {
                    JSON.parse(buf.toString());
                } catch (e) {
                    res.status(400).json({
                        error: 'Invalid JSON',
                        details: e instanceof Error ? e.message : 'Could not parse request body'
                    });
                    throw new Error('Invalid JSON');
                }
            }
        }));

        this.setupRoutes();
    }

    private setupRoutes() {
        // Take snapshot endpoint
        this.app.post('/snapshot', async (req: Request, res: Response) => {
            try {
                const { name } = req.body;

                // Validate request body
                if (!req.is('application/json')) {
                    return res.status(400).json({
                        error: 'Invalid Content-Type',
                        details: 'Request must be application/json'
                    });
                }

                if (!name || typeof name !== 'string' || name.trim().length === 0) {
                    return res.status(400).json({
                        error: 'Invalid snapshot name',
                        details: 'Snapshot name must be a non-empty string'
                    });
                }

                await this.snapshotManager.takeSnapshot(name.trim());
                res.json({
                    success: true,
                    message: `Snapshot '${name}' created successfully`
                });
            } catch (error) {
                this.logger.error('Snapshot creation error', 'API', error);
                res.status(500).json({
                    error: 'Failed to create snapshot',
                    details: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // Get snapshots endpoint
        this.app.get('/snapshots', async (_req: Request, res: Response) => {
            try {
                const snapshots = this.snapshotManager.getSnapshots();
                res.json({
                    success: true,
                    snapshots
                });
            } catch (error) {
                this.logger.error('Get snapshots error', 'API', error);
                res.status(500).json({
                    error: 'Failed to get snapshots',
                    details: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // Add a health check endpoint
        this.app.get('/health', (_req: Request, res: Response) => {
            res.json({ status: 'ok' });
        });

        // Handle 404s
        this.app.use((_req: Request, res: Response) => {
            res.status(404).json({
                error: 'Not Found',
                details: 'The requested endpoint does not exist'
            });
        });
    }

    /**
     * Get the current port the server is running on
     * @returns The current port or undefined if the server is not running
     */
    public getPort(): number | undefined {
        return this.port;
    }

    /**
     * Start the API server on an available port
     * @returns Promise that resolves to the port the server is running on
     */
    public async start(): Promise<number> {
        this.logger.info('Attempting to start API server', 'API');

        try {
            // Find an available port, starting with the default
            const port = await findAvailablePort(DEFAULT_PORTS.API);
            this.logger.info(`Found available port: ${port}`, 'API');

            // Start the server on the available port
            return await this.startOnPort(port);
        } catch (error) {
            this.logger.error('Failed to start server', 'API', error);
            throw error;
        }
    }

    /**
     * Start the server on a specific port
     * @param port The port to start the server on
     * @returns Promise that resolves to the port the server is running on
     */
    private async startOnPort(port: number): Promise<number> {
        return new Promise((resolve, reject) => {
            try {
                // Log the express app configuration
                this.logger.info(`Express app created with ${Object.keys(this.app).length} properties`, 'API');
                this.logger.info(`Middleware count: ${(this.app as any)._router?.stack?.length || 'unknown'}`, 'API');

                // Create the server
                this.logger.info(`Creating HTTP server for port ${port}`, 'API');
                this.server = this.app.listen(port, async () => {
                    this.logger.info(`Server successfully started on port ${port}`, 'API');

                    // Store the port
                    this.port = port;

                    // Show a notification to the user
                    if (port !== DEFAULT_PORTS.API) {
                        await this.notificationManager.showInformationMessage(
                            `API server running on port ${port} (default port ${DEFAULT_PORTS.API} was in use)`
                        );
                    } else {
                        await this.notificationManager.showInformationMessage(
                            `API server running on port ${port}`
                        );
                    }

                    // Resolve with the port
                    resolve(port);
                });

                // Set up error handling
                this.server.on('error', (error: any) => {
                    const errorDetails = {
                        code: error.code,
                        message: error.message,
                        stack: error.stack
                    };
                    this.logger.error('Server error', 'API', JSON.stringify(errorDetails, null, 2));
                    reject(error);
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                const errorStack = error instanceof Error ? error.stack : 'No stack trace';
                this.logger.error('Server start error', 'API', errorMessage);
                this.logger.error('Error stack', 'API', errorStack);
                reject(error);
            }
        });
    }

    /**
     * Stop the API server
     */
    public stop() {
        if (this.server) {
            this.server.close();
            this.server = null;
            this.logger.info('Server stopped', 'API');

            // Clear the port
            this.port = undefined;
        }
    }
}