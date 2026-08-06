import { Mail, MessageCircle, MessageSquare, type LucideIcon } from "lucide-react";
import type { Channel } from "@/lib/data/types";
import { cn } from "@/lib/utils";

const config: Record<
  Channel,
  { icon?: LucideIcon; text?: string; className: string; label: string }
> = {
  whatsapp: { icon: MessageCircle, className: "bg-emerald-500", label: "WhatsApp" },
  instagram: {
    text: "IG",
    className: "bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600",
    label: "Instagram",
  },
  facebook: { text: "f", className: "bg-blue-600", label: "Facebook" },
  sms: { icon: MessageSquare, className: "bg-slate-500", label: "SMS" },
  email: { icon: Mail, className: "bg-amber-500", label: "E-mail" },
};

export function ChannelIcon({ channel, size = 16 }: { channel: Channel; size?: number }) {
  const { icon: Icon, text, className, label } = config[channel];
  return (
    <span
      title={label}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-bold text-white",
        className
      )}
      style={{ width: size, height: size, fontSize: size * 0.55 }}
    >
      {Icon ? <Icon style={{ width: size * 0.6, height: size * 0.6 }} /> : text}
    </span>
  );
}

export const channelLabel = (channel: Channel) => config[channel].label;
