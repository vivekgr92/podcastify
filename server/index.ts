import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import { createServer } from "http";
import { logger } from "./services/logging";

function log(message: string) {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  logger.info(`${formattedTime} [express] ${message}`);
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// CORS middleware for development
if (app.get("env") === "development") {
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Content-Length, X-Requested-With"
    );
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
    } else {
      next();
    }
  });
}

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    registerRoutes(app);
    const server = createServer(app);

    // Global error handler
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      logger.error(`Error: ${message}`);
      res.status(status).json({ message });
    });

    // Set up Vite or static serving
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;

    const tryPort = (port: number): Promise<number> => {
      return new Promise((resolve, reject) => {
        server.listen(port, "0.0.0.0")
          .once('listening', () => {
            resolve(port);
          })
          .once('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE') {
              logger.warn(`Port ${port} in use, trying ${port + 1}`);
              resolve(tryPort(port + 1));
            } else {
              reject(err);
            }
          });
      });
    };

    tryPort(PORT)
      .then(finalPort => {
        log(`Server started successfully on port ${finalPort}`);
      })
      .catch(error => {
        logger.error(`Failed to start server: ${error.message}`);
        process.exit(1);
      });
  } catch (error) {
    logger.error(`Uncaught error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
})();