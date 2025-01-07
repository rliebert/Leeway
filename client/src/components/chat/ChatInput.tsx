import { useForm } from "react-hook-form";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useWS } from "@/lib/ws.tsx";
import { useUser } from "@/hooks/use-user";
import { Smile } from "lucide-react";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import { useState, useRef } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const form = useForm<FormData>({
    defaultValues: {
      message: "",
    },
  });

  const onSubmit = (data: FormData) => {
    // Ensure data.message exists and is not empty
    const message = data?.message || "";
    if (!message.trim() || !user) return;

    send({
      type: "message",
      channelId,
      content: message,
      userId: user.id,
      parentMessageId,
    });

    form.reset();
    setShowEmojiPicker(false);
  };

  const onEmojiClick = (emojiData: EmojiClickData) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentValue = form.getValues("message") || "";

    const newValue = 
      currentValue.substring(0, start) + 
      emojiData.emoji + 
      currentValue.substring(end);

    // Update the form value and trigger re-render
    form.setValue("message", newValue, { 
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true,
    });

    // Set cursor position after emoji
    setTimeout(() => {
      if (textarea) {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + emojiData.emoji.length;
      }
    }, 0);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex gap-2">
      <div className="flex-1 flex gap-2">
        <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10"
            >
              <Smile className="h-5 w-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent 
            className="w-full p-0" 
            side="top" 
            align="start"
          >
            <EmojiPicker
              onEmojiClick={onEmojiClick}
              width="100%"
              height="350px"
            />
          </PopoverContent>
        </Popover>
        <Textarea
          {...form.register("message")}
          ref={(e) => {
            form.register("message").ref(e);
            textareaRef.current = e;
          }}
          placeholder="Type your message..."
          className="min-h-[60px]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              form.handleSubmit(onSubmit)();
            }
          }}
        />
      </div>
      <Button type="submit">Send</Button>
    </form>
  );
}