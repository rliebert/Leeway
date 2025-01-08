import { Switch, Route } from "wouter";
import { WSProvider } from "@/lib/ws";
import Home from "@/pages/Home";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Loader2 } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import AuthForm from "@/components/auth/AuthForm";
import DirectMessageSidebar from "@/components/chat/DirectMessageSidebar";

function AuthenticatedApp() {
  const { user, isLoading } = useUser();

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
            <h2 className="text-2xl font-bold mb-4">Welcome to Leeway</h2>
            <AuthForm />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <WSProvider>
      <div className="flex h-screen">
        <div className="w-48 border-r bg-card">
          <DirectMessageSidebar selectedDM={null} onSelectDM={() => {}} />
        </div>
        <div className="flex-1">
          <Switch>
            <Route path="/" component={Home} />
            <Route component={NotFound} />
          </Switch>
        </div>
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
  return <AuthenticatedApp />;
}

export default App;