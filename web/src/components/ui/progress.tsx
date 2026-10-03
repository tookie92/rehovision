import { cn } from "../../lib/utils";

export function Progress({
  value = 0,
  className,
}: {
  value?: number;
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn(
        "h-1.5 overflow-hidden rounded-full bg-[var(--bg-subtle)]",
        className,
      )}
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full bg-[var(--ink)] transition-all duration-300"
        style={{ width: `${v}%` }}
      />
    </div>
  );
}
