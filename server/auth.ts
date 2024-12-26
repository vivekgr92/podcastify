import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { type Express } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { users, insertUserSchema, type User as SelectUser } from "@db/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";

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
  const MemoryStore = createMemoryStore(session);

  app.use(
    session({
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
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.username, username))
          .limit(1);

        if (!user) {
          return done(null, false, { message: "Invalid username or password." });
        }

        const isValid = await crypto.compare(password, user.password);
        if (!isValid) {
          return done(null, false, { message: "Invalid username or password." });
        }

        return done(null, user);
      } catch (err) {
        console.error('Authentication error:', err);
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
        return done(new Error('User not found'));
      }

      done(null, user);
    } catch (err) {
      console.error('Deserialization error:', err);
      done(err);
    }
  });

  app.post("/api/register", async (req, res) => {
    try {
      const result = insertUserSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          ok: false,
          message: result.error.issues.map(i => i.message).join(", ")
        });
      }

      const { username, email, password, displayName } = result.data;

      // Check if username already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUser) {
        return res.status(400).json({
          ok: false,
          message: "Username already exists"
        });
      }

      const [existingEmail] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingEmail) {
        return res.status(400).json({
          ok: false,
          message: "Email already exists"
        });
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
          isAdmin: false,
          subscriptionStatus: 'inactive'
        })
        .returning();

      // Log in the new user
      req.login(newUser, (err) => {
        if (err) {
          console.error('Login error after registration:', err);
          return res.status(500).json({
            ok: false,
            message: "Registration successful but login failed"
          });
        }
        return res.json({ 
          ok: true,
          user: {
            id: newUser.id,
            username: newUser.username,
            email: newUser.email,
            displayName: newUser.displayName,
            isAdmin: newUser.isAdmin,
            subscriptionStatus: newUser.subscriptionStatus
          }
        });
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        ok: false,
        message: "An unexpected error occurred during registration"
      });
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) {
        console.error('Login error:', err);
        return res.status(500).json({
          ok: false,
          message: "An unexpected error occurred during login"
        });
      }

      if (!user) {
        return res.status(400).json({
          ok: false,
          message: info?.message || "Login failed"
        });
      }

      req.login(user, (err) => {
        if (err) {
          console.error('Session creation error:', err);
          return res.status(500).json({
            ok: false,
            message: "Failed to create session"
          });
        }

        return res.json({
          ok: true,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            displayName: user.displayName,
            isAdmin: user.isAdmin,
            subscriptionStatus: user.subscriptionStatus
          }
        });
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        console.error('Logout error:', err);
        return res.status(500).json({
          ok: false,
          message: "Logout failed"
        });
      }
      res.json({
        ok: true,
        message: "Logged out successfully"
      });
    });
  });

  app.get("/api/user", (req, res) => {
    if (req.isAuthenticated()) {
      const user = req.user;
      return res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        isAdmin: user.isAdmin,
        subscriptionStatus: user.subscriptionStatus
      });
    }
    res.status(401).json({
      ok: false,
      message: "Not authenticated"
    });
  });
}