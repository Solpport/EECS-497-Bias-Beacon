import * as React from "react";
import { cn } from "../../lib/utils";

function Progress({
  value = 0,
  className,
  indicatorClassName
}: {
  value?: number;
  className?: string;
  indicatorClassName?: string;
}) {
  return (
    <div className={cn("h-2.5 overflow-hidden rounded-full bg-white/8", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-500 ease-out", indicatorClassName)}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export { Progress };
