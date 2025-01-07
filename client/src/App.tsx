import { Switch, Route } from "wouter";
import { WSProvider } from "@/lib/ws";
import Home from "@/pages/Home";
import { ClerkProvider } from "@clerk/clerk-react";
import { Loader2 } from "lucide-react";

if (!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) {
  throw new Error("Missing Clerk Publishable Key");
}

function App() {
  return (
    <ClerkProvider 
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
      appearance={{
        variables: {
          colorPrimary: "hsl(var(--primary))",
          colorBackground: "hsl(var(--background))",
          colorText: "hsl(var(--foreground))",
          colorTextSecondary: "hsl(var(--muted-foreground))",
        },
      }}
      afterSignInUrl="/"
      afterSignUpUrl="/"
    >
      <WSProvider>
        <Switch>
          <Route path="/" component={Home} />
        </Switch>
      </WSProvider>
    </ClerkProvider>
  );
}

export default App;