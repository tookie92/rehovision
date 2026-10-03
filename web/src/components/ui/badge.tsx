import { cn } from "../../lib/utils";

export function Badge({
  className,
  tone = "muted",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "muted" | "ok" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
        tone === "ok" && "bg-[var(--signal-soft)] text-[var(--signal)]",
        tone === "danger" && "bg-red-50 text-[var(--danger)]",
        tone === "muted" && "bg-[var(--accent-soft)] text-[var(--muted)]",
        className,
      )}
      {...props}
    />
  );
}
