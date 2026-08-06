import { cn } from "@/lib/utils";

export function SlaBadge({ days }: { days: number }) {
  if (days <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-bold",
        "bg-red-100 text-red-600"
      )}
    >
      -{days}d
    </span>
  );
}
