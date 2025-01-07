import { useForm } from "react-hook-form";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useWS } from "@/lib/ws";

interface ChatInputProps {
  channelId: number;
}

interface FormData {
  message: string;
}

export default function ChatInput({ channelId }: ChatInputProps) {
  const { send } = useWS();
  const form = useForm<FormData>({
    defaultValues: {
      message: "",
    },
  });

  const onSubmit = (data: FormData) => {
    if (!data.message.trim()) return;

    send({
      type: "message",
      channelId,
      content: data.message,
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
