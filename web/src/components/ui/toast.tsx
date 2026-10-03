"use client";

import { useEffect } from "react";
import { cn } from "../../lib/utils";

export function Toast({
  message,
  onDismiss,
  className,
}: {
  message: string | null;
  onDismiss: () => void;
  className?: string;
}) {
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(onDismiss, 4000);
    return () => window.clearTimeout(t);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div
      role="status"
      className={cn(
        "fixed bottom-4 left-1/2 z-50 max-w-md -translate-x-1/2 rounded-xl border border-[var(--line)] bg-[var(--ink)] px-4 py-3 text-sm font-medium text-white shadow-[var(--shadow)] transition-opacity duration-200",
        className,
      )}
    >
      {message}
    </div>
  );
}
