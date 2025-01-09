import React from 'react';
import { Switch, Route } from "wouter";
import { WSProvider } from "@/lib/ws";
import Home from "@/pages/Home";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Loader2 } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import DirectMessageView from "@/components/chat/DirectMessageView";
import leewayLogo from "../../attached_assets/leeway-logo3.png";
import AuthForm from "@/components/auth/AuthForm";

// Keep the existing AuthenticatedApp component
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

// Keep the existing NotFound component
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
  const { user, isLoading } = useUser();

  console.log('Auth state:', { isLoading, hasUser: !!user });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-4">
              <img src={leewayLogo} alt="Leeway Logo" className="w-8 h-8" />
              <h2 className="text-2xl font-bold">Welcome to Leeway</h2>
            </div>
            <AuthForm />
          </CardContent>
        </Card>
      </div>
    );
  }

  return <AuthenticatedApp />;
}

export default App;