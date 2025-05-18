import { Request, Response } from 'express';
import * as vscode from 'vscode';
import { SnapshotManager } from '../managers/SnapshotManager';
import { DEFAULT_PORTS } from '../utils/portUtils';
import { BaseServer } from '../utils/BaseServer';

export class ApiServer extends BaseServer {
    constructor(private snapshotManager: SnapshotManager) {
        super('API', DEFAULT_PORTS.API);
        
        // Add additional JSON verification for API server
        this.app.use((
            req: any, 
            res: Response, 
            next: (err?: any) => void
        ) => {
            if (req.is('application/json') && req.body) {
                try {
                    // Body already parsed by base middleware
                    next();
                } catch (e) {
                    res.status(400).json({
                        error: 'Invalid JSON',
                        details: e instanceof Error ? e.message : 'Could not parse request body'
                    });
                }
            } else {
                next();
            }
        });
    }

    protected setupRoutes() {
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
}