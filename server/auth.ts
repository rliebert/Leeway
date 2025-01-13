import passport from "passport";
import { IVerifyOptions, Strategy as LocalStrategy } from "passport-local";
import { type Express } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { users } from "@db/schema";
import { db } from "@db";
import { eq } from "drizzle-orm";
import { z } from "zod";

declare module "express-session" {
  interface SessionData {
    passport: {
      user: string;
    };
  }
}

declare global {
  namespace Express {
    interface User extends User {}
  }
}

const scryptAsync = promisify(scrypt);

// Create and export the MemoryStore instance
const MemoryStore = createMemoryStore(session);
export const sessionStore = new MemoryStore({
  checkPeriod: 86400000, // prune expired entries every 24h
});

// User cache to reduce database queries
const userCache = new Map<string, Express.User>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Crypto utilities
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

// Validation schema
const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export function setupAuth(app: Express) {
  // Session configuration
  const sessionSettings: session.SessionOptions = {
    secret: process.env.REPL_ID || "leeway-secret-key",
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    name: 'connect.sid',
    cookie: {
      httpOnly: true,
      secure: false, // Must be false for WebSocket to work in development
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/',
      sameSite: 'lax'
    }
  };

  // Setup session middleware
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  // Passport configuration
  passport.serializeUser((user: Express.User, done) => {
    console.log('Serializing user:', user.id);
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      // Check cache first
      const cachedUser = userCache.get(id);
      if (cachedUser) {
        return done(null, cachedUser);
      }

      console.log('Cache miss, deserializing user from database:', id);
      const user = await db.query.users.findFirst({
        where: eq(users.id, id),
      });

      if (!user) {
        console.log('User not found during deserialization:', id);
        return done(null, false);
      }

      // Cache the user
      userCache.set(id, user);
      setTimeout(() => userCache.delete(id), CACHE_TTL);

      done(null, user);
    } catch (err) {
      console.error('Error deserializing user:', err);
      done(err);
    }
  });

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await db.query.users.findFirst({
          where: eq(users.username, username),
        });

        if (!user) {
          return done(null, false, { message: "Incorrect username." });
        }

        const isMatch = await crypto.compare(password, user.password);
        if (!isMatch) {
          return done(null, false, { message: "Incorrect password." });
        }

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  // Auth routes
  app.post("/api/login", (req, res, next) => {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).send(result.error.issues.map(i => i.message).join(", "));
    }

    passport.authenticate("local", (err: any, user: Express.User | false, info: IVerifyOptions) => {
      if (err) return next(err);
      if (!user) return res.status(401).send(info.message ?? "Authentication failed");

      req.logIn(user, (err) => {
        if (err) return next(err);

        // Save session explicitly to ensure it's stored before responding
        req.session.save((err) => {
          if (err) return next(err);
          res.json({ id: user.id, username: user.username });
        });
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    if (!req.user) {
      return res.status(401).send("Not logged in");
    }

    // Clear user from cache
    if (req.user.id) {
      userCache.delete(req.user.id);
    }

    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy((err) => {
        if (err) return next(err);
        res.clearCookie('connect.sid', { path: '/' });
        res.json({ message: "Logged out successfully" });
      });
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    res.json(req.user);
  });

  console.log("Auth setup completed");
}