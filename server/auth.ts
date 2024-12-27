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
      64,
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
        secure: false,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'lax',
        httpOnly: true,
        path: '/'
      },
      store: new MemoryStore({
        checkPeriod: 86400000, // prune expired entries every 24h
      }),
    }),
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        console.log("Attempting login for username:", username);
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.username, username))
          .limit(1);

        if (!user) {
          console.log("User not found:", username);
          return done(null, false, { message: "Incorrect username or password" });
        }

        const isValid = await crypto.compare(password, user.password);
        if (!isValid) {
          console.log("Invalid password for user:", username);
          return done(null, false, { message: "Incorrect username or password" });
        }

        console.log("Login successful for user:", username);
        return done(null, user);
      } catch (err) {
        console.error("Login error:", err);
        return done(err);
      }
    }),
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
      console.debug("Raw body received:", req.body);
      console.debug("Incoming registration request:", { body: req.body }); // Log the incoming request body

      const result = insertUserSchema.safeParse(req.body);
      if (!result.success) {
        console.warn(
          "Registration input validation failed:",
          result.error.issues.map((i) => i.message).join(", "),
        ); // Log validation issues
        return res
          .status(400)
          .send(
            "Invalid input: " +
              result.error.issues.map((i) => i.message).join(", "),
          );
      }

      const { username, email, password } = result.data;
      const displayName = username; // Set displayName equal to username
      console.debug("Validated input data:", { username, email }); // Log validated input data

      // Check if username or email already exists
      console.debug("Checking for existing username:", username); // Log username check
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUser) {
        console.warn("Username already exists:", username); // Log existing username
        return res.status(400).send("Username already exists");
      }

      console.debug("Checking for existing email:", email); // Log email check
      const [existingEmail] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingEmail) {
        console.warn("Email already exists:", email); // Log existing email
        return res.status(400).send("Email already exists");
      }

      // Hash password and create user
      console.debug("Hashing password for user:", username); // Log password hashing step
      const hashedPassword = await crypto.hash(password);

      // Set admin flag for @admin.com emails
      const isAdmin = email.toLowerCase().endsWith("@admin.com");
      console.info(
        "Creating user with admin status:",
        isAdmin,
        "for email:",
        email,
      ); // Log admin determination

      // Create new user
      const [newUser] = await db
        .insert(users)
        .values({
          username,
          email,
          displayName,
          password: hashedPassword,
          isAdmin: !!isAdmin,
        })
        .returning();

      console.info("Created new user:", {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        isAdmin: newUser.isAdmin,
      }); // Log user creation details

      // Log in the new user
      console.debug("Logging in new user:", newUser.username); // Log login attempt
      req.login(newUser, (err) => {
        if (err) {
          console.error("Error during login for new user:", err); // Log login error
          return next(err);
        }
        console.info("Successfully logged in new user:", newUser.username); // Log successful login
        return res.json({
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          isAdmin: newUser.isAdmin,
        });
      });
    } catch (error) {
      console.error("Error during user registration:", error); // Log any unexpected errors
      next(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    console.log("Received login request:", { username: req.body.username });

    passport.authenticate("local", (err: any, user: Express.User | false, info: IVerifyOptions) => {
      if (err) {
        console.error("Authentication error:", err);
        return next(err);
      }

      if (!user) {
        console.warn("Authentication failed:", info?.message);
        return res.status(401).json({ 
          ok: false,
          message: info?.message || "Invalid username or password" 
        });
      }

      req.login(user, (err) => {
        if (err) {
          console.error("Login session creation error:", err);
          return next(err);
        }

        console.log("Login successful for user:", user.username);
        return res.json({
          ok: true,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            isAdmin: user.isAdmin,
            displayName: user.displayName,
          }
        });
      });
    })(req, res, next);
  });

  app.get("/api/user", (req, res) => {
    if (req.isAuthenticated()) {
      const { password, ...userWithoutPassword } = req.user;
      return res.json(userWithoutPassword);
    }
    res.status(401).send("Not authenticated");
  });

  app.post("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).send("Logout failed");
      res.json({ message: "Logged out successfully" });
    });
  });
}