import { useUser as useClerkUser } from "@clerk/clerk-react";

export const useUser = () => {
  const { user, isLoaded } = useClerkUser();
  return { user, isLoading: !isLoaded };
};
