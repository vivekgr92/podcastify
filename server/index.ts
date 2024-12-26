import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes.js";
import { setupVite, serveStatic } from "./vite.js";
import { createServer } from "http";
import * as dotenv from 'dotenv';
import { logger } from "./services/logging.js";

// Load environment variables
dotenv.config();

// Create express app with initial logging
logger.info('Initializing Express application...');
const app = express();

// Basic middleware setup with logging
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.path} ${res.statusCode} in ${duration}ms`);
  });
  next();
});

// Global error handler with improved type safety and detailed logging
const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  const errorMessage = err instanceof Error ? err.message : String(err);
  logger.error(`Error caught in middleware: ${errorMessage}`);
  if (err.stack) {
    logger.error(`Stack trace: ${err.stack}`);
  }

  res.status(err.status || 500).json({ 
    message: err.message || "Internal Server Error",
    type: err.type || 'server_error'
  });
};

async function startServer() {
  try {
    logger.info('Starting server initialization...');

    const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;
    const server = createServer(app);

    // Setup Vite or static serving
    if (process.env.NODE_ENV === "development") {
      logger.info('Setting up Vite for development...');
      await setupVite(app);
      logger.info('Vite setup completed');
    } else {
      logger.info('Setting up static file serving for production...');
      serveStatic(app);
      logger.info('Static file serving setup completed');
    }

    // Register routes after Vite setup
    logger.info('Registering routes...');
    registerRoutes(app);
    logger.info('Routes registered successfully');

    // Add error handler after routes
    logger.info('Setting up error handler...');
    app.use(errorHandler);

    // Start server with detailed error handling
    server.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server started successfully on port ${PORT}`);
      logger.info(`Server environment: ${process.env.NODE_ENV}`);
    });

    return server;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Fatal error during server initialization: ${errorMessage}`);
    if (error instanceof Error && error.stack) {
      logger.error(`Stack trace: ${error.stack}`);
    }
    process.exit(1);
  }
}

// Start the server with enhanced error handling
startServer().catch((error) => {
  logger.error(`Uncaught error during server startup: ${error instanceof Error ? error.message : String(error)}`);
  if (error instanceof Error && error.stack) {
    logger.error(`Stack trace: ${error.stack}`);
  }
  process.exit(1);
});