// MCP Server implementation
import * as vscode from 'vscode';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { SnapshotManager } from '../managers/SnapshotManager';
import { handleToolCall } from './mcpTools';
import { MCPInitResponse, MCPServerInfo, MCPCapabilities } from './types';
import { execSync } from 'child_process';
import { findAvailablePort, DEFAULT_PORTS } from '../utils/portUtils';
import { NotificationManager } from '../utils/NotificationManager';
import { Logger } from '../utils/Logger';

// Express types
type Request = express.Request;
type Response = express.Response;

/**
 * MCP Server class for Local Snapshots
 */
export class MCPServer {
    private app: express.Express;
    private server: any;
    private sessions: Map<string, { sseRes: Response, initialized: boolean }> = new Map();
    private port: number;
    private notificationManager: NotificationManager = NotificationManager.getInstance();
    private logger: Logger = Logger.getInstance();

    constructor(private snapshotManager: SnapshotManager) {
        this.logger.info('Initializing MCP server', 'MCP');
        this.logger.info(`Express module: ${typeof express}`, 'MCP');

        if (!express) {
            this.logger.error('Express module not properly loaded!', 'MCP');
            throw new Error('Express module not properly loaded. This is likely a dependency issue.');
        }

        this.app = express();
        this.logger.info('Express app created successfully', 'MCP');
        this.port = DEFAULT_PORTS.MCP; // Default port

        // Add CORS middleware
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

            if (req.method === 'OPTIONS') {
                return res.sendStatus(200);
            }
            next();
        });

        // Add error handling middleware
        this.app.use((err: any, req: Request, res: Response, next: express.NextFunction) => {
            this.logger.error('Server Error', 'MCP', err);
            res.status(500).json({
                jsonrpc: '2.0',
                id: null,
                error: {
                    code: -32000,
                    message: 'Internal Server Error',
                    data: err instanceof Error ? err.message : 'Unknown error'
                }
            });
        });

        // Add JSON parsing middleware
        this.app.use(express.json({
            strict: true,
            limit: '1mb'
        }));

        this.setupRoutes();
    }

    /**
     * Set up the server routes
     */
    private setupRoutes() {
        // SSE endpoint
        this.app.get('/sse', (req: Request, res: Response) => {
            this.logger.info('SSE connection established', 'MCP');

            // Set SSE headers
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            // Generate a session ID
            const sessionId = uuidv4();
            this.sessions.set(sessionId, { sseRes: res, initialized: false });
            this.logger.info(`Created session: ${sessionId}`, 'MCP');

            // Send the endpoint event
            res.write(`event: endpoint\n`);
            res.write(`data: /sse/messages?session_id=${sessionId}\n\n`);

            // Set up heartbeat
            const heartbeat = setInterval(() => {
                res.write(`: ping - ${new Date().toISOString()}\n\n`);
            }, 10000);

            // Clean up on disconnect
            req.on('close', () => {
                clearInterval(heartbeat);
                this.sessions.delete(sessionId);
                this.logger.info(`Session closed: ${sessionId}`, 'MCP');
            });
        });

        // JSON-RPC message endpoint
        this.app.post('/sse/messages', async (req: Request, res: Response) => {
            const sessionId = req.query.session_id as string;
            this.logger.info(`Received message for session: ${sessionId}`, 'MCP', req.body);

            if (!sessionId) {
                return res.status(400).json({
                    jsonrpc: '2.0',
                    id: null,
                    error: {
                        code: -32602,
                        message: 'Missing session_id parameter'
                    }
                });
            }

            const session = this.sessions.get(sessionId);
            if (!session) {
                return res.status(404).json({
                    jsonrpc: '2.0',
                    id: null,
                    error: {
                        code: -32602,
                        message: 'Invalid session_id'
                    }
                });
            }

            const rpc = req.body;

            // Validate JSON-RPC request
            if (!rpc || rpc.jsonrpc !== '2.0' || !rpc.method) {
                return res.status(400).json({
                    jsonrpc: '2.0',
                    id: rpc?.id ?? null,
                    error: {
                        code: -32600,
                        message: 'Invalid JSON-RPC request'
                    }
                });
            }

            // Send minimal HTTP acknowledgment
            res.json({
                jsonrpc: '2.0',
                id: rpc.id,
                result: { ack: `Received ${rpc.method}` }
            });

            // Process the request and send response via SSE
            await this.handleRpcRequest(sessionId, session.sseRes, rpc);
        });

        // Health check endpoint
        this.app.get('/health', (_req: Request, res: Response) => {
            res.json({ status: 'ok' });
        });
    }

    /**
     * Handle JSON-RPC requests
     * @param sessionId The session ID
     * @param sseRes The SSE response object
     * @param rpc The JSON-RPC request
     */
    private async handleRpcRequest(sessionId: string, sseRes: Response, rpc: any) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            this.logger.error(`Session not found: ${sessionId}`, 'MCP');
            return;
        }

        try {
            switch (rpc.method) {
                case 'initialize': {
                    // Mark session as initialized
                    session.initialized = true;

                    // Create server info and capabilities
                    const serverInfo: MCPServerInfo = {
                        name: 'local-snapshots-mcp',
                        version: '1.0.0'
                    };

                    const capabilities: MCPCapabilities = {
                        tools: { listChanged: true },
                        resources: { listChanged: true, subscribe: true },
                        prompts: { listChanged: true },
                        logging: true,
                        roots: { listChanged: true },
                        sampling: true
                    };

                    // Create initialization response
                    const response: MCPInitResponse = {
                        protocolVersion: '2024-11-05',
                        capabilities,
                        serverInfo,
                        offerings: [
                            { name: 'snapshotTools', description: 'Tools for creating and managing local snapshots' }
                        ],
                        tools: [
                            {
                                name: 'takeNamedSnapshot',
                                description: 'Create a named snapshot of the current workspace',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        name: { type: 'string', description: 'Name for the snapshot' }
                                    },
                                    required: ['name']
                                }
                            }
                        ]
                    };

                    // Send response via SSE
                    this.sendSseMessage(sseRes, {
                        jsonrpc: '2.0',
                        id: rpc.id,
                        result: response
                    });
                    break;
                }

                case 'tools/list': {
                    // Send tools list
                    this.sendSseMessage(sseRes, {
                        jsonrpc: '2.0',
                        id: rpc.id,
                        result: {
                            tools: [
                                {
                                    name: 'takeNamedSnapshot',
                                    description: 'Create a named snapshot of the current workspace',
                                    inputSchema: {
                                        type: 'object',
                                        properties: {
                                            name: { type: 'string', description: 'Name for the snapshot' }
                                        },
                                        required: ['name']
                                    }
                                }
                            ]
                        }
                    });
                    break;
                }

                case 'tools/call': {
                    const toolName = rpc.params?.name;
                    const args = rpc.params?.arguments || {};

                    if (!toolName) {
                        this.sendSseMessage(sseRes, {
                            jsonrpc: '2.0',
                            id: rpc.id,
                            error: {
                                code: -32602,
                                message: 'Missing tool name'
                            }
                        });
                        break;
                    }

                    // Handle tool call
                    const result = await handleToolCall(this.snapshotManager, toolName, args);

                    // Send response via SSE
                    this.sendSseMessage(sseRes, {
                        jsonrpc: '2.0',
                        id: rpc.id,
                        result
                    });
                    break;
                }

                case 'notifications/initialized': {
                    // No response needed for notifications
                    this.logger.info(`Client initialized for session: ${sessionId}`, 'MCP');
                    break;
                }

                default: {
                    // Unknown method
                    this.sendSseMessage(sseRes, {
                        jsonrpc: '2.0',
                        id: rpc.id,
                        error: {
                            code: -32601,
                            message: `Method not found: ${rpc.method}`
                        }
                    });
                    break;
                }
            }
        } catch (error) {
            this.logger.error('Error handling request', 'MCP', error);

            // Send error response via SSE
            this.sendSseMessage(sseRes, {
                jsonrpc: '2.0',
                id: rpc.id,
                error: {
                    code: -32000,
                    message: 'Internal server error',
                    data: error instanceof Error ? error.message : 'Unknown error'
                }
            });
        }
    }

    /**
     * Send a message via SSE
     * @param sseRes The SSE response object
     * @param message The message to send
     */
    private sendSseMessage(sseRes: Response, message: any) {
        sseRes.write(`event: message\n`);
        sseRes.write(`data: ${JSON.stringify(message)}\n\n`);
    }

    /**
     * Get the current port the server is running on
     * @returns The current port or undefined if the server is not running
     */
    public getPort(): number | undefined {
        return this.port;
    }

    /**
     * Start the MCP server on an available port
     * @returns Promise that resolves to the port the server is running on
     */
    public async start(): Promise<number> {
        this.logger.info('Attempting to start MCP server', 'MCP');

        try {
            // Find an available port, starting with the default
            const port = await findAvailablePort(DEFAULT_PORTS.MCP);
            this.logger.info(`Found available port: ${port}`, 'MCP');

            // Start the server on the available port
            return await this.startOnPort(port);
        } catch (error) {
            this.logger.error('Failed to start server', 'MCP', error);
            throw error;
        }
    }

    /**
     * Start the server on a specific port
     * @param port The port to start the server on
     * @returns Promise that resolves to the port the server is running on
     */
    private async startOnPort(port: number): Promise<number> {
        this.port = port;

        return new Promise((resolve, reject) => {
            try {
                // Log the express app configuration
                this.logger.info(`Express app created with ${Object.keys(this.app).length} properties`, 'MCP');
                this.logger.info(`Middleware count: ${(this.app as any)._router?.stack?.length || 'unknown'}`, 'MCP');
                this.logger.info(`Active sessions: ${this.sessions.size}`, 'MCP');

                // Create the server
                this.logger.info(`Creating HTTP server for port ${port}`, 'MCP');
                this.server = this.app.listen(port, async () => {
                    this.logger.info(`Server successfully started on port ${port}`, 'MCP');
                    this.logger.info(`Server object: ${this.server ? 'Created successfully' : 'Failed to create'}`, 'MCP');

                    // Show a notification to the user
                    if (port !== DEFAULT_PORTS.MCP) {
                        await this.notificationManager.showInformationMessage(
                            `MCP server running on port ${port} (default port ${DEFAULT_PORTS.MCP} was in use)`
                        );
                    } else {
                        await this.notificationManager.showInformationMessage(
                            `MCP server running on port ${port}`
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
                    console.error('[MCP] Server error:', JSON.stringify(errorDetails, null, 2));
                    reject(error);
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                const errorStack = error instanceof Error ? error.stack : 'No stack trace';
                this.logger.error('Server start error', 'MCP', errorMessage);
                this.logger.error('Error stack', 'MCP', errorStack);
                reject(error);
            }
        });
    }

    /**
     * Stop the MCP server
     */
    public stop() {
        if (this.server) {
            this.server.close();
            this.server = null;
            this.logger.info('Server stopped', 'MCP');
        }
    }
}

// Start the server
async function main() {
    try {
        // Create and start the server
        const app = express();
        const server = app.listen(45679, () => {
            console.log(`MCP server running on port 45679`);
        });

        let nodePath;
        try {
            // Get the actual Node.js path
            nodePath = execSync('node -e "console.log(process.execPath)"', { encoding: 'utf8' }).trim();
        } catch (error) {
            console.error('Failed to get Node.js path:', error);
            nodePath = '<path to your Node.js installation>';
        }

        console.log('MCP server running. Use this configuration in your MCP client:');
        console.log('----------------------------------------');
        console.log('Name: Local Snapshots');
        console.log('Type: script');
        console.log(`Path: ${__filename}`);
        console.log(`Node Path: ${nodePath}`);
        console.log('----------------------------------------');

        // Handle server shutdown
        process.on('SIGINT', () => {
            console.log('Shutting down MCP server...');
            server.close();
            process.exit(0);
        });
    } catch (error) {
        console.error('Failed to start MCP server:', error);
        process.exit(1);
    }
}

// If this file is run directly (not imported), start the server
if (require.main === module) {
    main();
}
