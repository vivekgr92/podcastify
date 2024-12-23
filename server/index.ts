import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes.js";
import { setupVite, serveStatic } from "./vite.js";
import { createServer } from "http";

function log(message: string) {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [express] ${message}`);
}

const app = express();

// Basic middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Add raw body parsing for Stripe webhooks
declare global {
  namespace Express {
    interface Request {
      rawBody?: string;
    }
  }
}

app.use((req, res, next) => {
  if (req.path === '/api/webhooks/stripe' && req.method === 'POST') {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      req.rawBody = data;
      next();
    });
  } else {
    next();
  }
});

// Logging middleware
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

// Global error handler
const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  const errorMessage = err instanceof Error ? err.message : String(err);
  log(`Error caught in middleware: ${errorMessage}`);
  if (err.stack) {
    log(`Stack trace: ${err.stack}`);
  }

  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  res.status(status).json({ 
    message,
    type: err.type || 'server_error'
  });
};

async function startServer() {
  try {
    log('Starting server initialization...');

    // Check environment variables
    const requiredEnvVars = ['STRIPE_SECRET_KEY'];
    if (process.env.NODE_ENV === 'production') {
      requiredEnvVars.push('STRIPE_WEBHOOK_SECRET');
    }

    const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingEnvVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
    }

    log('Environment variables validated');

    // Register routes
    log('Registering routes...');
    registerRoutes(app);

    // Create HTTP server
    const server = createServer(app);

    // Add error handler after routes
    app.use(errorHandler);

    // Setup Vite or static serving
    if (process.env.NODE_ENV === "development") {
      log('Setting up Vite for development...');
      await setupVite(app, server);
    } else {
      log('Setting up static file serving for production...');
      serveStatic(app);
    }

    const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;

    // Start server with proper error handling
    return new Promise<void>((resolve, reject) => {
      server.listen(PORT, "0.0.0.0")
        .once('listening', () => {
          log(`Server started successfully on port ${PORT}`);
          resolve();
        })
        .once('error', (error: NodeJS.ErrnoException) => {
          log(`Failed to start server: ${error.message}`);
          if (error.code === 'EADDRINUSE') {
            log(`Port ${PORT} is already in use. Please try a different port.`);
          }
          reject(error);
        });
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`Fatal error during server initialization: ${errorMessage}`);
    if (error instanceof Error && error.stack) {
      log(`Stack trace: ${error.stack}`);
    }
    throw error;
  }
}

// Start the server
startServer().catch((error) => {
  log(`Uncaught error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});