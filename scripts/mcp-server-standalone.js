// Standalone MCP server for testing
const express = require('express');
const { execSync } = require('child_process');

/**
 * Start a standalone MCP server for testing
 */
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

// Run the server
main();