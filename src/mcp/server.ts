// MCP Server implementation
import * as vscode from 'vscode';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { SnapshotManager } from '../managers/SnapshotManager';
import { handleToolCall } from './mcpTools';
import { MCPInitResponse, MCPServerInfo, MCPCapabilities } from './types';
import { execSync } from 'child_process';
import { DEFAULT_PORTS } from '../utils/portUtils';
import { BaseServer } from '../utils/BaseServer';

/**
 * MCP Server class for Local Snapshots
 */
export class MCPServer extends BaseServer {
    private sessions: Map<string, { sseRes: Response, initialized: boolean }> = new Map();

    constructor(private snapshotManager: SnapshotManager) {
        super('MCP', DEFAULT_PORTS.MCP);
    }

    /**
     * Set up the server routes
     */
    protected setupRoutes() {
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
}
