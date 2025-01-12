import { useUser } from "@/hooks/use-user";
import { useToast } from "@/hooks/use-toast";
import AuthForm from "@/components/auth/AuthForm";

export default function AuthPage() {
  const { login, register } = useUser();
  const { toast } = useToast();

  // handleSubmit function is no longer needed as AuthForm handles its own submission.

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <AuthForm />
    </div>
  );
}