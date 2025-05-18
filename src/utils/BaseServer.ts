import * as vscode from 'vscode';
import express from 'express';
import { Express, Request, Response } from 'express';
import { findAvailablePort } from './portUtils';
import { NotificationManager } from './NotificationManager';
import { Logger } from './Logger';

/**
 * Base server class to be extended by API and MCP servers
 */
export abstract class BaseServer {
  protected app: Express;
  protected server: any;
  protected port: number | undefined;
  protected notificationManager: NotificationManager = NotificationManager.getInstance();
  protected logger: Logger = Logger.getInstance();

  /**
   * @param serverName The name of the server for logging purposes
   * @param defaultPort The default port to start the server on
   */
  constructor(
    protected serverName: string,
    protected defaultPort: number
  ) {
    this.logger.info(`Initializing ${this.serverName} server`, this.serverName);
    this.logger.info(`Express module: ${typeof express}`, this.serverName);

    if (!express) {
      this.logger.error('Express module not properly loaded!', this.serverName);
      throw new Error('Express module not properly loaded. This is likely a dependency issue.');
    }

    this.app = express();
    this.logger.info('Express app created successfully', this.serverName);

    // Add common middleware
    this.setupCommonMiddleware();
    
    // Setup routes (implemented by child classes)
    this.setupRoutes();
  }

  /**
   * Set up common middleware for all servers
   */
  private setupCommonMiddleware() {
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
      this.logger.error(`Server Error`, this.serverName, err);
      
      // Different response formats based on server type
      if (this.serverName === 'MCP') {
        res.status(500).json({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32000,
            message: 'Internal Server Error',
            data: err instanceof Error ? err.message : 'Unknown error'
          }
        });
      } else {
        res.status(500).json({
          error: 'Internal Server Error',
          details: err instanceof Error ? err.message : 'Unknown error'
        });
      }
    });

    // Add JSON parsing middleware
    this.app.use(express.json({
      strict: true,
      limit: '1mb'
    }));
  }

  /**
   * Abstract method to set up routes, must be implemented by subclasses
   */
  protected abstract setupRoutes(): void;

  /**
   * Get the current port the server is running on
   * @returns The current port or undefined if the server is not running
   */
  public getPort(): number | undefined {
    return this.port;
  }

  /**
   * Start the server on an available port
   * @returns Promise that resolves to the port the server is running on
   */
  public async start(): Promise<number> {
    this.logger.info(`Attempting to start ${this.serverName} server`, this.serverName);

    try {
      // Find an available port, starting with the default
      const port = await findAvailablePort(this.defaultPort);
      this.logger.info(`Found available port: ${port}`, this.serverName);

      // Start the server on the available port
      return await this.startOnPort(port);
    } catch (error) {
      this.logger.error('Failed to start server', this.serverName, error);
      throw error;
    }
  }

  /**
   * Start the server on a specific port
   * @param port The port to start the server on
   * @returns Promise that resolves to the port the server is running on
   */
  protected async startOnPort(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      try {
        // Log the express app configuration
        this.logger.info(`Express app created with ${Object.keys(this.app).length} properties`, this.serverName);
        this.logger.info(`Middleware count: ${(this.app as any)._router?.stack?.length || 'unknown'}`, this.serverName);

        // Create the server
        this.logger.info(`Creating HTTP server for port ${port}`, this.serverName);
        this.server = this.app.listen(port, async () => {
          this.logger.info(`Server successfully started on port ${port}`, this.serverName);

          // Store the port
          this.port = port;

          // Show a notification to the user
          if (port !== this.defaultPort) {
            await this.notificationManager.showInformationMessage(
              `${this.serverName} server running on port ${port} (default port ${this.defaultPort} was in use)`
            );
          } else {
            await this.notificationManager.showInformationMessage(
              `${this.serverName} server running on port ${port}`
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
          this.logger.error('Server error', this.serverName, JSON.stringify(errorDetails, null, 2));
          reject(error);
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : 'No stack trace';
        this.logger.error('Server start error', this.serverName, errorMessage);
        this.logger.error('Error stack', this.serverName, errorStack);
        reject(error);
      }
    });
  }

  /**
   * Stop the server
   */
  public stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.logger.info('Server stopped', this.serverName);

      // Clear the port
      this.port = undefined;
    }
  }
}