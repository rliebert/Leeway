import { type Express, type Request } from "express";
import { ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node';

// Extend Express Request type to include Clerk's auth property
declare global {
  namespace Express {
    interface Request {
      auth: {
        userId: string;
        sessionId: string;
        sessionClaims?: {
          azp?: string;
          exp?: number;
          iat?: number;
          iss?: string;
          nbf?: number;
          sub?: string;
          sid?: string;
          username?: string;
          email?: string;
          image_url?: string;
          created_at?: string;
          updated_at?: string;
        };
      }
    }
  }
}

// Authentication middleware using Clerk
export const requireAuth = ClerkExpressRequireAuth({
  // By default, ClerkExpressRequireAuth includes CSRF protection
  // Set "strict" to false if you want to allow access to your API from non-browser clients
  strict: false,
});

export function setupAuth(app: Express) {
  // Remove all auth-related routes since Clerk handles them
  app.get("/api/user", requireAuth, (req: Request, res) => {
    // Clerk user data is available in req.auth
    const user = {
      id: parseInt(req.auth.userId),
      username: req.auth.sessionClaims?.username || 'User',
      avatar: req.auth.sessionClaims?.image_url,
      lastActiveAt: new Date(),
      createdAt: new Date(req.auth.sessionClaims?.created_at || Date.now()),
    };

    res.json(user);
  });
}