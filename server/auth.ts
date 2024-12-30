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

// Extend express User type
declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

export const crypto = {
  hash: async (password: string) => {
    const salt = randomBytes(16).toString("hex");
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${buf.toString("hex")}.${salt}`;
  },
  compare: async (suppliedPassword: string, storedPassword: string) => {
    try {
      const [hashedPassword, salt] = storedPassword.split(".");
      const hashedPasswordBuf = Buffer.from(hashedPassword, "hex");
      const suppliedPasswordBuf = (await scryptAsync(suppliedPassword, salt, 64)) as Buffer;
      return timingSafeEqual(hashedPasswordBuf, suppliedPasswordBuf);
    } catch (error) {
      console.error("Password comparison error:", error);
      return false;
    }
  }
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
          return done(null, false, { message: "Incorrect username." });
        }

        const isValid = await crypto.compare(password, user.password);
        if (!isValid) {
          return done(null, false, { message: "Incorrect password." });
        }

        return done(null, user);
      } catch (err) {
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
      
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const result = insertUserSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).send(
          "Invalid input: " + result.error.issues.map(i => i.message).join(", ")
        );
      }

      const { username, email, password } = result.data;
      const displayName = username; // Set displayName equal to username

      // Check if username or email already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUser) {
        return res.status(400).send("Username already exists");
      }

      const [existingEmail] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingEmail) {
        return res.status(400).send("Email already exists");
      }

      // Hash password and create user
      const hashedPassword = await crypto.hash(password);
      // Set admin flag for @admin.com emails - ensure domain match is exact
      const isAdmin = email.toLowerCase().endsWith('@admin.com');
      console.log('Creating user with admin status:', isAdmin, 'for email:', email);
      
      // Create new user with admin status
      const [newUser] = await db
        .insert(users)
        .values({
          username,
          email,
          displayName,
          password: hashedPassword,
          isAdmin: !!isAdmin // Ensure it's a proper boolean
        })
        .returning();

      console.log('Created user:', { 
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        isAdmin: newUser.isAdmin 
      });

      // Log in the new user
      req.login(newUser, (err) => {
        if (err) return next(err);
        return res.json({ 
          id: newUser.id, 
          username: newUser.username,
          email: newUser.email,
          isAdmin: newUser.isAdmin 
        });
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: Express.User | false, info: IVerifyOptions) => {
      if (err) return next(err);
      if (!user) return res.status(400).send(info?.message || "Login failed");

      req.login(user, (err) => {
        if (err) return next(err);
        // Ensure we return consistent user data including admin status
        return res.json({ 
          id: user.id, 
          username: user.username,
          email: user.email,
          isAdmin: user.isAdmin, // This will be a boolean from the database
          displayName: user.displayName
        });
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).send("Logout failed");
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/user", (req, res) => {
    if (req.isAuthenticated()) {
      const { password, ...userWithoutPassword } = req.user;
      const userData = {
        ...userWithoutPassword,
        isAdmin: !!req.user.isAdmin // Ensure it's a boolean
      };
      console.log('User data:', userData);
      return res.json(userData);
    }
    res.status(401).send("Not authenticated");
  });
}
