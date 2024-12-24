import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes.js";
import { setupVite, serveStatic } from "./vite.js";
import { createServer } from "http";
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

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

// Add raw body parsing for Stripe webhooks
declare global {
  namespace Express {
    interface Request {
      rawBody?: string;
    }
  }
}

// Configure raw body parsing for Stripe webhooks before any other middleware
app.use((req, res, next) => {
  if (req.path === '/api/webhooks/stripe' && req.method === 'POST') {
    let rawBody = '';
    req.setEncoding('utf8');

    req.on('data', chunk => {
      rawBody += chunk;
    });

    req.on('end', () => {
      req.rawBody = rawBody;
      next();
    });
  } else {
    next();
  }
});

// Regular body parsing middleware for other routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    log(`${req.method} ${req.path} ${res.statusCode} in ${duration}ms`);
  });
  next();
});

// Global error handler with improved webhook error handling
const errorHandler = (err: any, req: Request, res: Response, _next: NextFunction) => {
  const errorMessage = err instanceof Error ? err.message : String(err);
  log(`Error caught in middleware: ${errorMessage}`);
  if (err.stack) {
    log(`Stack trace: ${err.stack}`);
  }

  // Special handling for Stripe webhook errors
  if (req.path === '/api/webhooks/stripe') {
    log(`Stripe webhook error: ${errorMessage}`);
    // Return a 400 for Stripe to retry the webhook
    return res.status(400).json({
      error: 'Webhook Error',
      message: errorMessage
    });
  }

  res.status(err.status || 500).json({ 
    message: err.message || "Internal Server Error",
    type: err.type || 'server_error'
  });
};

async function startServer() {
  try {
    log('Starting server initialization...');

    // Verify Stripe configuration
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      throw new Error('STRIPE_WEBHOOK_SECRET is required for webhook handling');
    }

    // Register routes first
    log('Registering routes...');
    await registerRoutes(app);

    // Add error handler after routes
    app.use(errorHandler);

    const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;
    const server = createServer(app);

    // Setup Vite or static serving
    if (process.env.NODE_ENV === "development") {
      log('Setting up Vite for development...');
      await setupVite(app, server);
    } else {
      log('Setting up static file serving for production...');
      serveStatic(app);
    }

    // Start server
    server.listen(PORT, '0.0.0.0', () => {
      log(`Server started successfully on port ${PORT}`);
      log('Webhook endpoint configured at /api/webhooks/stripe');
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`Fatal error during server initialization: ${errorMessage}`);
    if (error instanceof Error && error.stack) {
      log(`Stack trace: ${error.stack}`);
    }
    process.exit(1);
  }
}

// Start the server
startServer().catch((error) => {
  log(`Uncaught error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});