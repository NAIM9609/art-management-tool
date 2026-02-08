import 'reflect-metadata';
import serverlessExpress from '@vendia/serverless-express';
import express, { Express, Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { corsMiddleware } from './middleware/cors';
import { setupRoutes } from './routes';

let cachedServer: any;

/**
 * Creates and configures the Express application
 */
async function createServer(): Promise<Express> {
  const app = express();
  
  // Basic middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());
  app.use(corsMiddleware);
  
  // Request logging (optional in production)
  if (config.server.environment !== 'production') {
    app.use((req: Request, res: Response, next: NextFunction) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
      next();
    });
  }
  
  // Setup all routes
  setupRoutes(app);
  
  // Error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: config.server.environment === 'development' ? err.message : undefined,
    });
  });

  return app;
}

/**
 * Lambda handler function
 * Uses serverless-express to bridge Express to Lambda
 */
export const handler = async (event: any, context: any) => {
  // Enable connection reuse for better performance
  context.callbackWaitsForEmptyEventLoop = false;

  // Create server once and cache it
  if (!cachedServer) {
    console.log('Initializing Express server for Lambda...');
    const app = await createServer();
    cachedServer = serverlessExpress({ app });
    console.log('Express server initialized');
  }

  return cachedServer(event, context);
};

// For local development testing
export const createApp = createServer;
