import { useQuery } from '@tanstack/react-query';

interface User {
  id: string;
  username: string;
  avatar_url?: string;
}

export function useUser() {
  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ['user'],
    queryFn: () => fetch('/api/me').then(res => res.json()),
  });

  return { user, isLoading, error };
} 