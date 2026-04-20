import { cn } from "../../lib/utils";

function Separator({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-white/8", className)} aria-hidden="true" />;
}

export { Separator };
