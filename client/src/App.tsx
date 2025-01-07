import { Switch, Route } from "wouter";
import { WSProvider } from "@/lib/ws";
import Home from "@/pages/Home";
import { ClerkProvider, SignIn, useUser } from "@clerk/clerk-react";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function AuthenticatedApp() {
  const { isLoaded, user } = useUser();
  const { toast } = useToast();

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <SignIn />
      </div>
    );
  }

  return (
    <WSProvider>
      <Switch>
        <Route path="/" component={Home} />
      </Switch>
    </WSProvider>
  );
}

function App() {
  const { toast } = useToast();

  try {
    if (!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) {
      toast({
        variant: "destructive",
        description: "Missing Clerk configuration. Please check environment variables.",
      });
      return (
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-destructive">Authentication configuration error</p>
        </div>
      );
    }

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
          elements: {
            rootBox: "w-full h-full",
            card: "bg-background border rounded-lg shadow-sm",
            headerTitle: "text-foreground",
            headerSubtitle: "text-muted-foreground",
            socialButtonsBlockButton: "bg-muted text-muted-foreground hover:bg-muted/80",
            formFieldLabel: "text-muted-foreground",
            formFieldInput: "bg-background border",
            formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90",
            footerActionText: "text-muted-foreground",
            footerActionLink: "text-primary hover:text-primary/90",
          },
        }}
        signInUrl="/"
        signUpUrl="/"
        afterSignInUrl="/"
        afterSignUpUrl="/"
      >
        <AuthenticatedApp />
      </ClerkProvider>
    );
  } catch (error) {
    console.error('Error initializing Clerk:', error);
    toast({
      variant: "destructive",
      description: "Failed to initialize authentication. Please try again.",
    });
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-destructive">Authentication error</p>
      </div>
    );
  }
}

export default App;