import { motion } from "framer-motion";
import { CheckCircle2, Timer } from "lucide-react";
import { LETTERS, type McqVisual } from "@/lib/mcq-rules";
import { cn } from "@/lib/utils";

/** Exam-style question with a 2x2 option grid; the correct option turns green on reveal. */
export function McqBoard({ mcq, revealed, countdown }: { mcq: McqVisual; revealed: boolean; countdown: boolean }) {
  return (
    <div className="w-full space-y-4">
      <div className="rounded-2xl glass px-7 py-5 shadow-glow">
        <div className="mb-1 text-sm font-semibold uppercase tracking-widest text-primary">Q{mcq.number}</div>
        <p className="text-[26px] font-semibold leading-snug">{mcq.question}</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {mcq.options.map((o, i) => {
          const correct = revealed && i === mcq.answer;
          return (
            <motion.div
              key={i}
              animate={correct ? { scale: [1, 1.05, 1] } : { scale: 1, opacity: revealed ? 0.55 : 1 }}
              transition={{ duration: 0.5 }}
              className={cn(
                "flex items-center gap-4 rounded-2xl border-2 px-5 py-4 text-[22px] font-medium transition-colors",
                correct ? "border-success bg-success text-success-foreground" : "border-border bg-card/80",
              )}
            >
              <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold", correct ? "bg-background/25" : "bg-primary/15 text-primary")}>
                {correct ? <CheckCircle2 className="h-6 w-6" /> : LETTERS[i]}
              </span>
              <span className="min-w-0">{o}</span>
            </motion.div>
          );
        })}
      </div>
      <div className="flex h-10 items-center justify-center">
        {countdown && (
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-3 rounded-full glass px-5 py-2 text-lg font-semibold">
            <Timer className="h-5 w-5 text-primary" />
            <span className="relative h-2 w-48 overflow-hidden rounded-full bg-muted">
              <motion.span className="absolute inset-y-0 left-0 bg-gradient-primary" initial={{ width: "100%" }} animate={{ width: "0%" }} transition={{ duration: 2, ease: "linear" }} />
            </span>
          </motion.div>
        )}
      </div>
    </div>
  );
}
