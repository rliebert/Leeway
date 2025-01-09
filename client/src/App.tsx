import React from 'react';
import { Switch, Route } from "wouter";
import { WSProvider } from "@/lib/ws";
import Home from "@/pages/Home";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Loader2 } from "lucide-react";
import { ClerkProvider, SignIn, SignedIn, SignedOut } from "@clerk/clerk-react";
import DirectMessageView from "@/components/chat/DirectMessageView";
import leewayLogo from "../../attached_assets/leeway-logo3.png";

if (!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

function AuthenticatedApp() {
  return (
    <WSProvider>
      <div className="h-screen">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/dm/:channelId">
            {(params) => <DirectMessageView channelId={parseInt(params.channelId)} />}
          </Route>
          <Route component={NotFound} />
        </Switch>
      </div>
    </WSProvider>
  );
}

// fallback 404 not found page
function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">404 Page Not Found</h1>
          </div>
          <p className="mt-4 text-sm text-gray-600">
            Did you forget to add the page to the router?
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function App() {
  return (
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
      <SignedIn>
        <AuthenticatedApp />
      </SignedIn>
      <SignedOut>
        <div className="flex items-center justify-center min-h-screen">
          <Card className="w-full max-w-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-4">
                <img src={leewayLogo} alt="Leeway Logo" className="w-8 h-8" />
                <h2 className="text-2xl font-bold">Welcome to Leeway</h2>
              </div>
              <SignIn />
            </CardContent>
          </Card>
        </div>
      </SignedOut>
    </ClerkProvider>
  );
}

export default App;