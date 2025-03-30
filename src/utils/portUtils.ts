import * as net from 'net';

// Default ports for the servers
export const DEFAULT_PORTS = {
    API: 45678,
    MCP: 45679
};

// Port range for dynamic allocation
const MIN_PORT = 10000;
const MAX_PORT = 65535;

// Reserved ports to avoid
const RESERVED_PORTS = [
    80, 443, 3000, 3001, 5000, 5001, 8000, 8080, 8888, 9000
];

/**
 * Check if a port is available
 * @param port The port to check
 * @returns Promise that resolves to true if the port is available, false otherwise
 */
export function isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer();

        server.once('error', (err: any) => {
            if (err.code === 'EADDRINUSE') {
                resolve(false);
            } else {
                // For any other error, we'll consider the port as unavailable
                console.error(`Error checking port ${port}:`, err);
                resolve(false);
            }
        });

        server.once('listening', () => {
            // Close the server and resolve with true (port is available)
            server.close(() => {
                resolve(true);
            });
        });

        server.listen(port);
    });
}

/**
 * Get a random port number within the specified range
 * @returns A random port number
 */
function getRandomPort(): number {
    return Math.floor(Math.random() * (MAX_PORT - MIN_PORT + 1)) + MIN_PORT;
}

/**
 * Find an available port, trying the default port first, then a random port
 * @param defaultPort The default port to try first
 * @param maxAttempts Maximum number of random ports to try (default: 20)
 * @returns Promise that resolves to an available port
 */
export async function findAvailablePort(defaultPort: number, maxAttempts: number = 20): Promise<number> {
    // First try the default port
    if (await isPortAvailable(defaultPort)) {
        return defaultPort;
    }

    console.log(`Default port ${defaultPort} is in use, trying random ports...`);

    // If default port is not available, try random ports
    const attemptedPorts = new Set<number>();

    for (let i = 0; i < maxAttempts; i++) {
        // Get a random port that we haven't tried yet and isn't reserved
        let port: number;
        do {
            port = getRandomPort();
        } while (attemptedPorts.has(port) || RESERVED_PORTS.includes(port));

        attemptedPorts.add(port);

        if (await isPortAvailable(port)) {
            return port;
        }
    }

    // If we still can't find an available port, try sequential ports as a last resort
    for (let port = MIN_PORT; port <= MAX_PORT; port++) {
        if (RESERVED_PORTS.includes(port) || attemptedPorts.has(port)) {
            continue;
        }

        if (await isPortAvailable(port)) {
            return port;
        }

        // Only try a few sequential ports before giving up
        if (port > MIN_PORT + 100) {
            break;
        }
    }

    throw new Error(`Could not find an available port after ${maxAttempts} attempts`);
}
