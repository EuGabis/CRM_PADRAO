"use client";

import { useState } from "react";
import { LifeBuoy, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { brand } from "@/lib/config/brand";
import { cn } from "@/lib/utils";

const QUICK_OPTIONS = ["Como conecto o WhatsApp?", "Como crio uma automação?", "Falar com humano"];

export function SupportPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [chat, setChat] = useState<{ from: "bot" | "user"; text: string }[]>([
    {
      from: "bot",
      text: `Olá! 👋 Sou o assistente virtual do ${brand.name}. Fale com a nossa equipe e tire todas as suas dúvidas sobre o CRM!`,
    },
  ]);
  const [input, setInput] = useState("");

  const send = (text: string) => {
    if (!text.trim()) return;
    setChat((c) => [
      ...c,
      { from: "user", text },
      {
        from: "bot",
        text: "Obrigado! Nossa equipe responde em instantes. Você também pode falar com a gente no WhatsApp de suporte.",
      },
    ]);
    setInput("");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-[360px] flex-col sm:max-w-[360px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <LifeBuoy className="size-4 text-lime-500" /> Suporte {brand.name}
          </SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 [scrollbar-width:thin]">
          {chat.map((m, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[85%] rounded-xl px-3 py-2 text-xs",
                m.from === "bot"
                  ? "bg-slate-100 text-slate-700"
                  : "ml-auto bg-indigo-500 text-white"
              )}
            >
              {m.text}
            </div>
          ))}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {QUICK_OPTIONS.map((o) => (
              <button
                key={o}
                onClick={() => send(o)}
                className="rounded-full border border-indigo-200 px-2.5 py-1 text-[11px] text-indigo-600 hover:bg-indigo-50"
              >
                {o}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 border-t p-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder="Escreva sua dúvida"
            className="h-8 text-xs"
          />
          <Button size="sm" className="size-8 p-0" onClick={() => send(input)}>
            <Send className="size-3.5" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
