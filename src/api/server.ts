import express from 'express';
import { Express, Request, Response } from 'express';
import * as vscode from 'vscode';
import { SnapshotManager } from '../managers/SnapshotManager';

export class ApiServer {
    private app: Express;
    private server: any;

    constructor(private snapshotManager: SnapshotManager) {
        console.log('[API] Initializing API server');
        console.log('[API] Express module:', typeof express);

        if (!express) {
            console.error('[API] Express module not properly loaded!');
            throw new Error('Express module not properly loaded. This is likely a dependency issue.');
        }

        this.app = express();
        console.log('[API] Express app created successfully');

        // Add error handling middleware
        this.app.use((err: any, req: Request, res: Response, next: express.NextFunction) => {
            console.error('API Error:', err);
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
                console.error('Snapshot creation error:', error);
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
                console.error('Get snapshots error:', error);
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

    public async start(port: number = 45678): Promise<void> {
        console.log(`[API] Attempting to start API server on port ${port}`);
        return new Promise((resolve, reject) => {
            try {
                // Log the express app configuration
                console.log(`[API] Express app created with ${Object.keys(this.app).length} properties`);
                console.log(`[API] Middleware count: ${(this.app as any)._router?.stack?.length || 'unknown'}`);

                // Create the server
                console.log(`[API] Creating HTTP server for port ${port}`);
                this.server = this.app.listen(port, () => {
                    console.log(`[API] Server successfully started on port ${port}`);
                    vscode.window.showInformationMessage(
                        `Local Snapshots API server running on port ${port}`
                    );
                    resolve();
                });

                // Set up error handling
                this.server.on('error', (error: any) => {
                    const errorDetails = {
                        code: error.code,
                        message: error.message,
                        stack: error.stack
                    };
                    console.error('[API] Server error:', JSON.stringify(errorDetails, null, 2));

                    if (error.code === 'EADDRINUSE') {
                        reject(new Error(`Port ${port} is already in use. Please choose a different port in settings.`));
                    } else {
                        reject(error);
                    }
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                const errorStack = error instanceof Error ? error.stack : 'No stack trace';
                console.error(`[API] Server start error: ${errorMessage}`);
                console.error(`[API] Error stack: ${errorStack}`);
                reject(error);
            }
        });
    }

    public stop() {
        if (this.server) {
            this.server.close();
            this.server = null;
            console.log('API server stopped');
        }
    }
}