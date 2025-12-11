import 'reflect-metadata';
import express, { Express, Request, Response, NextFunction } from 'express';
import { config } from './config';
import { initializeDatabase } from './database/connection';
import { corsMiddleware } from './middleware/cors';
import { setupRoutes } from './routes';

const app: Express = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(corsMiddleware);

app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

setupRoutes(app);

app.use('/uploads', express.static(config.uploadBaseDir));

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: config.server.environment === 'development' ? err.message : undefined,
  });
});

const startServer = async () => {
  try {
    await initializeDatabase();
    
    app.listen(config.server.port, () => {
      console.log(`Server starting on port ${config.server.port}`);
      console.log(`Environment: ${config.server.environment}`);
      console.log(`Server started successfully on :${config.server.port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
