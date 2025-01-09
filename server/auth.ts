import { type Express, type Request } from "express";
import { ClerkExpressWithAuth } from '@clerk/clerk-sdk-node';

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

if (!process.env.CLERK_SECRET_KEY) {
  throw new Error('Missing CLERK_SECRET_KEY environment variable');
}

// Authentication middleware using Clerk
export const requireAuth = ClerkExpressWithAuth({
  onError: (err, _req, res) => {
    console.error('Clerk auth error:', err);
    res.status(401).json({ error: 'Authentication required' });
  }
});

export function setupAuth(app: Express) {
  app.get("/api/user", requireAuth, async (req: Request, res) => {
    try {
      if (!req.auth?.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      // Map Clerk user data to our User type
      const mappedUser = {
        id: parseInt(req.auth.userId),
        username: req.auth.sessionClaims?.username || 'User',
        avatar: req.auth.sessionClaims?.image_url,
        lastActiveAt: new Date(),
        createdAt: new Date(req.auth.sessionClaims?.created_at || Date.now()),
      };

      res.json(mappedUser);
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({ error: 'Failed to fetch user details' });
    }
  });
}