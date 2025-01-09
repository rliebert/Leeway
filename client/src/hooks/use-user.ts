import { useUser as useClerkUser } from "@clerk/clerk-react";
import type { User } from "@db/schema";

export function useUser() {
  const { user, isLoaded, isSignedIn } = useClerkUser();

  // Map Clerk user to our User type
  const mappedUser: User | null = user && isSignedIn ? {
    id: parseInt(user.id),
    username: user.username || user.firstName || 'User',
    password: undefined, // Password is optional now
    avatar: user.imageUrl,
    lastActiveAt: new Date(user.lastSignInAt || Date.now()),
    createdAt: new Date(user.createdAt),
  } : null;

  return {
    user: mappedUser,
    isLoading: !isLoaded,
    error: null,
  };
}