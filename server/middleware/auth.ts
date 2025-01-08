import { ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node';
import { Request, Response, NextFunction } from 'express';

// Middleware to validate Clerk JWT tokens
export const requireAuth = ClerkExpressRequireAuth({
  // Optional: customize the behavior
  onError: (err, req, res) => {
    console.error('Auth error:', err);
    res.status(401).json({ error: 'Unauthorized' });
  }
}); 