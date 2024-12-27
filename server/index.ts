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

// Setup authentication first, before any route handling
setupAuth(app);

// Body parsing middleware after auth setup
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

// Register routes before error handler
registerRoutes(app);

// Global error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const errorMessage = err instanceof Error ? err.message : String(err);
  logger.error(`Error caught in middleware: ${errorMessage}`);
  if (err.stack) {
    logger.error(`Stack trace: ${err.stack}`);
  }

  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error",
    type: err.type || "server_error",
  });
});

// Setup Vite or static serving
if (process.env.NODE_ENV === "development") {
  setupVite(app, createServer(app));
} else {
  serveStatic(app);
}

// Start server with explicit host binding
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;

app.listen(PORT, "0.0.0.0", () => {
  logger.info(`Server started successfully on port ${PORT}`);
}).on('error', (error) => {
  logger.error(`Failed to start server: ${error.message}`);
  process.exit(1);
});