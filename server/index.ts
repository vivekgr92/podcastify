import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes.js";
import { setupVite, serveStatic } from "./vite.js";
import { createServer } from "http";
import * as dotenv from "dotenv";
import { logger } from "./services/logging.js";
import { setupAuth } from "./auth.js";

// Load environment variables
dotenv.config();

const app = express();

// Basic middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Setup authentication first
setupAuth(app);

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.path} ${res.statusCode} in ${duration}ms`);
  });
  next();
});

// CORS middleware for development
if (process.env.NODE_ENV === "development") {
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "http://localhost:5175");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Cookie"
    );
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}

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
    logger.info("Starting server initialization...");

    const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;
    const server = createServer(app);

    // Register routes first
    logger.info("Registering routes...");
    await registerRoutes(app);

    // Add error handler after routes
    app.use(errorHandler);

    // Setup Vite or static serving
    if (process.env.NODE_ENV === "development") {
      logger.info("Setting up Vite for development...");
      await setupVite(app, server);
    } else {
      logger.info("Setting up static file serving for production...");
      serveStatic(app);
    }

    // Start server with explicit host binding
    await new Promise<void>((resolve, reject) => {
      server.listen(PORT, "0.0.0.0", () => {
        logger.info(`Server started successfully on port ${PORT}`);
        resolve();
      });

      server.on('error', (error: Error) => {
        logger.error(`Failed to start server: ${error.message}`);
        reject(error);
      });
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

// Start the server with improved error handling
startServer().catch((error) => {
  logger.error(
    `Uncaught error during server startup: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});