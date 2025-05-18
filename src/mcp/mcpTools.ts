// MCP Tools implementation
import * as vscode from 'vscode';
import { SnapshotManager } from '../managers/SnapshotManager';
import { MCPTool, MCPResponse, MCPToolCallResponse } from './types';
import { Logger } from '../utils/Logger';

/**
 * Registers MCP tools for the Local Snapshots extension
 * @param snapshotManager The snapshot manager instance
 * @returns Array of disposables
 */
export function registerMCPTools(snapshotManager: SnapshotManager): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    // Define the tools
    const tools: MCPTool[] = [
        {
            name: 'takeNamedSnapshot',
            description: 'Create a named snapshot of the current workspace',
            parameters: [
                {
                    name: 'name',
                    type: 'string',
                    description: 'Name for the snapshot',
                    required: true
                }
            ]
        }
    ];

    // Register each tool as a VS Code command
    tools.forEach(tool => {
        const disposable = vscode.commands.registerCommand(
            `local-snapshots.mcp.${tool.name}`,
            async (params: any) => {
                try {
                    switch (tool.name) {
                        case 'takeNamedSnapshot':
                            await snapshotManager.takeSnapshot(params.name);
                            return {
                                success: true,
                                message: `Created snapshot: ${params.name}`
                            };
                        default:
                            throw new Error(`Unknown tool: ${tool.name}`);
                    }
                } catch (error) {
                    const logger = Logger.getInstance();
                    logger.error(`Error executing MCP tool ${tool.name}`, 'MCPTools', error);
                    return {
                        success: false,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    };
                }
            }
        );
        disposables.push(disposable);
    });

    // Register a command to get the tool definitions (for AI tools to discover available commands)
    disposables.push(
        vscode.commands.registerCommand('local-snapshots.mcp.getTools', () => {
            const logger = Logger.getInstance();
            logger.info('getTools command executed', 'MCPTools');
            const response: MCPResponse = {
                schemaVersion: 1,
                tools: tools.map(tool => ({
                    name: tool.name,
                    description: tool.description,
                    schema: {
                        type: 'object',
                        properties: tool.parameters.reduce((acc, param) => {
                            acc[param.name] = {
                                type: param.type,
                                description: param.description
                            };
                            return acc;
                        }, {} as { [key: string]: { type: string; description: string } }),
                        required: tool.parameters
                            .filter(param => param.required)
                            .map(param => param.name)
                    }
                }))
            };
            return response;
        })
    );

    return disposables;
}

/**
 * Handles MCP tool calls
 * @param snapshotManager The snapshot manager instance
 * @param toolName The name of the tool to call
 * @param args The arguments for the tool
 * @returns The result of the tool call
 */
export async function handleToolCall(
    snapshotManager: SnapshotManager,
    toolName: string,
    args: any
): Promise<MCPToolCallResponse> {
    try {
        switch (toolName) {
            case 'takeNamedSnapshot': {
                const { name } = args;
                if (!name || typeof name !== 'string') {
                    throw new Error('Snapshot name is required and must be a string');
                }

                await snapshotManager.takeSnapshot(name);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Successfully created snapshot: ${name}`
                        }
                    ]
                };
            }

            default:
                throw new Error(`Unknown tool: ${toolName}`);
        }
    } catch (error) {
        const logger = Logger.getInstance();
        logger.error(`Error executing MCP tool ${toolName}`, 'MCPTools', error);
        return {
            content: [
                {
                    type: 'text',
                    text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
                }
            ]
        };
    }
}
