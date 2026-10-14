import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [{ label: "Plan" }, { label: "Account" }, { label: "Payment" }];

export function SignupStepper({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center justify-center" role="list" aria-label="Sign-up progress">
      {STEPS.map((s, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <div key={s.label} className="flex items-center" role="listitem">
            {i > 0 && (
              <div
                className={cn("h-px w-8 sm:w-14 transition-colors", done ? "bg-primary" : "bg-border")}
                aria-hidden
              />
            )}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "grid size-8 place-items-center rounded-full text-sm font-bold transition-colors",
                  done
                    ? "bg-primary text-white"
                    : active
                      ? "ring-2 ring-primary bg-primary/10 text-primary"
                      : "bg-surface-3 text-muted-foreground",
                )}
                aria-current={active ? "step" : undefined}
              >
                {done ? <Check className="size-4" /> : n}
              </div>
              <span
                className={cn(
                  "hidden text-[11px] font-medium sm:block",
                  active ? "text-foreground" : done ? "text-soft" : "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
