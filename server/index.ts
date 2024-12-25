import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes.js";
import { setupVite, serveStatic } from "./vite.js";
import { createServer } from "http";
import * as dotenv from 'dotenv';
import { logger } from "./services/logging.js";

// Load environment variables
dotenv.config();

const app = express();

// Basic middleware setup
app.use(express.urlencoded({ extended: false }));

// Configure raw body parsing middleware for Stripe webhooks
app.use((req, res, next) => {
  if (req.originalUrl === '/api/webhooks/stripe') {
    let rawBody = Buffer.from([]);

    req.on('data', (chunk) => {
      rawBody = Buffer.concat([rawBody, chunk]);
    });

    req.on('end', () => {
      req.body = rawBody;
      next();
    });
  } else {
    express.json()(req, res, next);
  }
});

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.path} ${res.statusCode} in ${duration}ms`);
  });
  next();
});

// Global error handler
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

    // Register routes first
    logger.info('Registering routes...');
    await registerRoutes(app);

    // Add error handler after routes
    app.use(errorHandler);

    const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;
    const server = createServer(app);

    // Setup Vite or static serving
    if (process.env.NODE_ENV === "development") {
      logger.info('Setting up Vite for development...');
      await setupVite(app, server);
    } else {
      logger.info('Setting up static file serving for production...');
      serveStatic(app);
    }

    // Start server
    server.listen(PORT, '0.0.0.0', () => {
      // Construct webhook URL without port number
      const webhookUrl = process.env.REPL_SLUG && process.env.REPL_OWNER
        ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co/api/webhooks/stripe`
        : `https://${process.env.REPL_ID}.id.repl.co/api/webhooks/stripe`;

      logger.info(`Server started successfully on port ${PORT}`);
      logger.info(`Webhook endpoint available at: ${webhookUrl}`);
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Fatal error during server initialization: ${errorMessage}`);
    if (error instanceof Error && error.stack) {
      logger.error(`Stack trace: ${error.stack}`);
    }
    process.exit(1);
  }
}

// Start the server
startServer().catch((error) => {
  logger.error(`Uncaught error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});