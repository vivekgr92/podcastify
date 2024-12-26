import passport from "passport";
import { Strategy as LocalStrategy, IVerifyOptions } from "passport-local";
import { type Express } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { users, insertUserSchema, type User as SelectUser } from "@db/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { logger } from "./services/logging.js";

// Extend express User type
declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

const crypto = {
  hash: async (password: string) => {
    const salt = randomBytes(16).toString("hex");
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${buf.toString("hex")}.${salt}`;
  },
  compare: async (suppliedPassword: string, storedPassword: string) => {
    const [hashedPassword, salt] = storedPassword.split(".");
    const hashedPasswordBuf = Buffer.from(hashedPassword, "hex");
    const suppliedPasswordBuf = (await scryptAsync(
      suppliedPassword,
      salt,
      64
    )) as Buffer;
    return timingSafeEqual(hashedPasswordBuf, suppliedPasswordBuf);
  },
};

export function setupAuth(app: Express) {
  try {
    const MemoryStore = createMemoryStore(session);
    const sessionSettings: session.SessionOptions = {
      secret: process.env.REPL_ID || "podcast-app-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: app.get("env") === "production",
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      },
      store: new MemoryStore({
        checkPeriod: 86400000 // prune expired entries every 24h
      })
    };

    // Configure session middleware
    app.use(session(sessionSettings));
    app.use(passport.initialize());
    app.use(passport.session());

    passport.use(
      new LocalStrategy(async (username, password, done) => {
        try {
          logger.info(`Attempting login for user: ${username}`);
          const [user] = await db
            .select()
            .from(users)
            .where(eq(users.username, username))
            .limit(1);

          if (!user) {
            logger.info(`Login failed: User ${username} not found`);
            return done(null, false, { message: "Invalid username or password." });
          }

          const isValid = await crypto.compare(password, user.password);
          if (!isValid) {
            logger.info(`Login failed: Invalid password for user ${username}`);
            return done(null, false, { message: "Invalid username or password." });
          }

          logger.info(`Login successful for user: ${username}`);
          return done(null, user);
        } catch (err) {
          logger.error(`Login error for user ${username}: ${err}`);
          return done(err);
        }
      })
    );

    passport.serializeUser((user: Express.User, done) => {
      done(null, user.id);
    });

    passport.deserializeUser(async (id: number, done) => {
      try {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, id))
          .limit(1);

        if (!user) {
          return done(null, false);
        }
        done(null, user);
      } catch (err) {
        done(err);
      }
    });

    app.post("/api/register", async (req, res) => {
      try {
        logger.info('Processing registration request');
        const result = insertUserSchema.safeParse(req.body);
        if (!result.success) {
          const errorMsg = result.error.issues.map(i => i.message).join(", ");
          logger.warn(`Registration validation failed: ${errorMsg}`);
          return res.status(400).json({
            error: "Invalid input",
            details: errorMsg
          });
        }

        const { username, email, password } = result.data;
        const displayName = username; // Set displayName equal to username initially

        // Check if username already exists
        const [existingUser] = await db
          .select()
          .from(users)
          .where(eq(users.username, username))
          .limit(1);

        if (existingUser) {
          logger.warn(`Registration failed: Username ${username} already exists`);
          return res.status(400).json({ error: "Username already exists" });
        }

        // Check if email already exists
        const [existingEmail] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (existingEmail) {
          logger.warn(`Registration failed: Email ${email} already exists`);
          return res.status(400).json({ error: "Email already exists" });
        }

        // Hash password and create user
        const hashedPassword = await crypto.hash(password);

        // Create new user
        const [newUser] = await db
          .insert(users)
          .values({
            username,
            email,
            displayName,
            password: hashedPassword,
            isAdmin: email.toLowerCase().endsWith('@admin.com') // Set admin flag
          })
          .returning();

        logger.info(`Successfully created new user: ${username}`);

        // Log in the new user
        req.login(newUser, (err) => {
          if (err) {
            logger.error(`Login error after registration: ${err}`);
            return res.status(500).json({ 
              error: "Error logging in after registration",
              details: err.message
            });
          }

          // Return user data without password
          const { password: _, ...userWithoutPassword } = newUser;
          logger.info(`Successfully registered and logged in user: ${username}`);
          return res.status(200).json(userWithoutPassword);
        });
      } catch (error) {
        logger.error(`Registration error: ${error}`);
        res.status(500).json({ 
          error: "Internal server error during registration",
          details: error instanceof Error ? error.message : String(error)
        });
      }
    });

    app.post("/api/login", (req, res, next) => {
      passport.authenticate("local", (err: any, user: Express.User | false, info: IVerifyOptions) => {
        if (err) {
          logger.error(`Login error: ${err}`);
          return next(err);
        }
        if (!user) {
          logger.warn(`Login failed: ${info?.message}`);
          return res.status(400).json({ error: info?.message || "Login failed" });
        }

        req.login(user, (err) => {
          if (err) {
            logger.error(`Session error during login: ${err}`);
            return next(err);
          }
          // Return user data without sensitive information
          const { password: _, ...userWithoutPassword } = user;
          logger.info(`User ${user.username} successfully logged in`);
          return res.json(userWithoutPassword);
        });
      })(req, res, next);
    });

    app.post("/api/logout", (req, res) => {
      const username = req.user?.username;
      req.logout((err) => {
        if (err) {
          logger.error(`Logout error for user ${username}: ${err}`);
          return res.status(500).json({ error: "Logout failed" });
        }
        logger.info(`User ${username} logged out successfully`);
        res.json({ message: "Logged out successfully" });
      });
    });

    app.get("/api/user", (req, res) => {
      if (req.isAuthenticated()) {
        const { password: _, ...userWithoutPassword } = req.user;
        return res.json(userWithoutPassword);
      }
      res.status(401).json({ error: "Not authenticated" });
    });

    logger.info('Authentication setup completed successfully');
  } catch (error) {
    logger.error(`Failed to setup authentication: ${error}`);
    throw error;
  }
}