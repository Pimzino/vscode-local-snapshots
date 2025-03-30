// Test script for MCP server
const http = require('http');
const EventSource = require('eventsource');

// Check if EventSource is installed
try {
    if (!EventSource) {
        console.error('EventSource module not found. Please run: npm install eventsource');
        process.exit(1);
    }
} catch (error) {
    console.error('EventSource module not found. Please run: npm install eventsource');
    process.exit(1);
}

// Configuration
const MCP_PORT = 45679;
const MCP_HOST = 'localhost';

// Test function
async function testMcpServer() {
    console.log('Testing MCP server...');

    // Step 1: Connect to SSE endpoint
    console.log('Step 1: Connecting to SSE endpoint...');
    const eventSource = new EventSource(`http://${MCP_HOST}:${MCP_PORT}/sse`);

    // Handle SSE events
    let sessionId = null;

    return new Promise((resolve, reject) => {
        // Set timeout for the entire test
        const timeout = setTimeout(() => {
            eventSource.close();
            reject(new Error('Test timed out after 30 seconds'));
        }, 30000);

        // Handle endpoint event (first event)
        eventSource.addEventListener('endpoint', (event) => {
            console.log('Received endpoint event:', event.data);
            sessionId = event.data.split('session_id=')[1];
            console.log('Session ID:', sessionId);

            // Step 2: Send initialize request
            console.log('Step 2: Sending initialize request...');
            sendJsonRpcRequest({
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2024-11-05',
                    capabilities: {
                        sampling: {},
                        roots: { listChanged: true }
                    },
                    clientInfo: {
                        name: 'mcp-test-client',
                        version: '1.0.0'
                    }
                }
            }, sessionId);
        });

        // Handle message events (responses)
        eventSource.addEventListener('message', (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('Received message event:', JSON.stringify(data, null, 2));

                // Check if this is the initialize response
                if (data.id === 1 && data.result && data.result.protocolVersion) {
                    console.log('Initialize successful!');

                    // Step 3: Send tools/list request
                    console.log('Step 3: Sending tools/list request...');
                    sendJsonRpcRequest({
                        jsonrpc: '2.0',
                        id: 2,
                        method: 'tools/list'
                    }, sessionId);
                }

                // Check if this is the tools/list response
                if (data.id === 2 && data.result && data.result.tools) {
                    console.log('Tools list successful!');
                    console.log('Available tools:', data.result.tools.map(t => t.name).join(', '));

                    // Step 4: Call takeNamedSnapshot tool
                    console.log('Step 4: Calling takeNamedSnapshot tool...');
                    sendJsonRpcRequest({
                        jsonrpc: '2.0',
                        id: 3,
                        method: 'tools/call',
                        params: {
                            name: 'takeNamedSnapshot',
                            arguments: {
                                name: 'MCP Test Snapshot'
                            }
                        }
                    }, sessionId);
                }

                // Check if this is the tools/call response
                if (data.id === 3 && data.result && data.result.content) {
                    console.log('Tool call successful!');
                    console.log('Result:', data.result.content[0].text);

                    // Step 5: Call listSnapshots tool
                    console.log('Step 5: Calling listSnapshots tool...');
                    sendJsonRpcRequest({
                        jsonrpc: '2.0',
                        id: 4,
                        method: 'tools/call',
                        params: {
                            name: 'listSnapshots',
                            arguments: {}
                        }
                    }, sessionId);
                }

                // Check if this is the listSnapshots response
                if (data.id === 4 && data.result && data.result.content) {
                    console.log('List snapshots successful!');
                    console.log('Snapshots:', data.result.content[0].text);

                    // All tests passed
                    console.log('All tests passed!');
                    eventSource.close();
                    clearTimeout(timeout);
                    resolve();
                }
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        });

        // Handle errors
        eventSource.addEventListener('error', (error) => {
            console.error('SSE error:', error);
            eventSource.close();
            clearTimeout(timeout);
            reject(error);
        });
    });
}

// Helper function to send JSON-RPC requests
function sendJsonRpcRequest(request, sessionId) {
    return new Promise((resolve, reject) => {
        const requestData = JSON.stringify(request);

        const options = {
            hostname: MCP_HOST,
            port: MCP_PORT,
            path: `/sse/messages?session_id=${sessionId}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(requestData)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    console.log('HTTP response:', JSON.stringify(response, null, 2));
                    resolve(response);
                } catch (error) {
                    console.error('Error parsing response:', error);
                    reject(error);
                }
            });
        });

        req.on('error', (error) => {
            console.error('Request error:', error);
            reject(error);
        });

        req.write(requestData);
        req.end();
    });
}

// Run the test
testMcpServer()
    .then(() => {
        console.log('MCP server test completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('MCP server test failed:', error);
        process.exit(1);
    });
