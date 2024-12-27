import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes.js";
import { setupVite, serveStatic } from "./vite.js";
import { createServer } from "http";
import * as dotenv from "dotenv";
import { logger } from "./services/logging.js";

// Load environment variables
dotenv.config();

const app = express();

// Basic middleware setup
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

// Global error handler
const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  const errorMessage = err instanceof Error ? err.message : String(err);
  logger.error(`Error caught in middleware: ${errorMessage}`);
  if (err.stack) {
    logger.error(`Stack trace: ${err.stack}`);
  }

  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error",
    type: err.type || "server_error",
  });
};

async function startServer() {
  try {
    logger.info("***Starting server initialization...\n\n");

    // Register routes first
    logger.info("Registering routes...");
    await registerRoutes(app);

    // Add error handler after routes
    app.use(errorHandler);

    const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;
    const server = createServer(app);

    // Setup Vite or static serving
    if (process.env.NODE_ENV === "development") {
      logger.info("Setting up Vite for development...");
      await setupVite(app, server);
    } else {
      logger.info("Setting up static file serving for production...");
      serveStatic(app);
    }

    // Start server with explicit host binding
    server.listen(PORT, "0.0.0.0", () => {
      logger.info(`Server started successfully on port ${PORT}`);

      // Construct webhook URL without port number for production URLs
      const webhookUrl =
        process.env.REPL_SLUG && process.env.REPL_OWNER
          ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co/api/webhooks/stripe`
          : `https://${process.env.REPL_ID}.id.repl.co/api/webhooks/stripe`;

      logger.info(`Server is listening on http://0.0.0.0:${PORT}`);
      logger.info(`Webhook endpoint available at: ${webhookUrl}`);
    });

    // Add error handler for server
    server.on('error', (error: Error) => {
      logger.error(`Server error: ${error.message}`);
      if (error.stack) {
        logger.error(`Stack trace: ${error.stack}`);
      }
      process.exit(1);
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
  logger.error(
    `Uncaught error: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});