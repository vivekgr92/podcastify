
import bcrypt from "bcrypt";
import { users, insertUserSchema, type User as SelectUser } from "@db/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";

// Extend express User type
declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const crypto = {
  hash: async (password: string) => {
    return bcrypt.hash(password, 10);
  },
  compare: async (suppliedPassword: string, storedPassword: string) => {
    return bcrypt.compare(suppliedPassword, storedPassword);
  },
};

export function setupAuth(app: express.Express) {
  // Session setup
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "your-secret-key",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      }
    })
  );

  // CORS setup for development
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'http://localhost:5175');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Passport setup
  app.use(passport.initialize());
  app.use(passport.session());

  // Passport local strategy
  passport.use(
    new LocalStrategy(
      { usernameField: "email" },
      async (email, password, done) => {
        try {
          const [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, email))
            .limit(1);

          if (!user) {
            return done(null, false, { message: "Incorrect email" });
          }

          const isValid = await crypto.compare(password, user.password);
          if (!isValid) {
            return done(null, false, { message: "Incorrect password" });
          }

          return done(null, user);
        } catch (error) {
          return done(error);
        }
      }
    )
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
      done(null, user || undefined);
    } catch (error) {
      done(error);
    }
  });
}

export { crypto };
