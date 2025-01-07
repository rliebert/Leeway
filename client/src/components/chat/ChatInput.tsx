import { useForm } from "react-hook-form";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useWS } from "@/lib/ws.tsx";
import { useUser } from "@/hooks/use-user";

interface ChatInputProps {
  channelId: number;
  parentMessageId?: number;
}

interface FormData {
  message: string;
}

export default function ChatInput({ channelId, parentMessageId }: ChatInputProps) {
  const { send } = useWS();
  const { user } = useUser();
  const form = useForm<FormData>({
    defaultValues: {
      message: "",
    },
  });

  const onSubmit = (data: FormData) => {
    if (!data.message.trim() || !user) return;

    send({
      type: "message",
      channelId,
      content: data.message,
      userId: user.id,
      parentMessageId,
    });

    form.reset();
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex gap-2">
      <Textarea
        {...form.register("message")}
        placeholder="Type your message..."
        className="min-h-[60px]"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            form.handleSubmit(onSubmit)();
          }
        }}
      />
      <Button type="submit">Send</Button>
    </form>
  );
}