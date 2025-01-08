import { useAuth } from "@clerk/clerk-react";
import { createApiClient } from "@/lib/api";

function YourComponent() {
  const { getToken } = useAuth();
  
  const fetchData = async () => {
    const token = await getToken();
    const api = createApiClient(token);
    
    const response = await api.fetch("/your-endpoint");
    // ...
  };
} 