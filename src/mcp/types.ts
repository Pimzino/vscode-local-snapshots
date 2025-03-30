// MCP Types
import * as vscode from 'vscode';

// MCP Tool definition
export interface MCPTool {
    name: string;
    description: string;
    parameters: MCPToolParameter[];
}

// MCP Tool parameter
export interface MCPToolParameter {
    name: string;
    type: string;
    description: string;
    required: boolean;
    items?: {
        type: string;
        description?: string;
    };
}

// MCP Response
export interface MCPResponse {
    schemaVersion: number;
    tools: {
        name: string;
        description: string;
        schema: {
            type: string;
            properties: { [key: string]: { type: string; description: string } };
            required: string[];
        };
    }[];
}

// MCP Server Info
export interface MCPServerInfo {
    name: string;
    version: string;
}

// MCP Capabilities
export interface MCPCapabilities {
    tools: { listChanged: boolean };
    resources?: { listChanged: boolean; subscribe: boolean };
    prompts?: { listChanged: boolean };
    logging?: boolean;
    roots?: { listChanged: boolean };
    sampling?: boolean;
}

// MCP Initialization Response
export interface MCPInitResponse {
    protocolVersion: string;
    capabilities: MCPCapabilities;
    serverInfo: MCPServerInfo;
    offerings?: { name: string; description: string }[];
    tools?: {
        name: string;
        description: string;
        inputSchema: {
            type: string;
            properties: { [key: string]: any };
            required: string[];
        };
    }[];
}

// MCP Tool Call Response
export interface MCPToolCallResponse {
    content: {
        type: string;
        text: string;
    }[];
}
