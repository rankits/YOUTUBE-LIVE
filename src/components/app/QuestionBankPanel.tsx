import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { generateQuestionBatch, getQuestionBank } from "@/backend/questions.functions";

export function QuestionBankPanel({ interviewId, disabled, onChange, target }: { interviewId: string; disabled?: boolean; onChange?: () => void; target?: number | undefined }) {
  const get = useServerFn(getQuestionBank);
  const gen = useServerFn(generateQuestionBatch);
  const [have, setHave] = useState(0);
  const [need, setNeed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);

  useEffect(() => {
    get({ data: { interviewId, target } }).then((r) => { setHave(r.have); setNeed(r.need); }).catch(() => {});
    return () => { stop.current = true; };
  }, [interviewId, get, target]);

  async function run() {
    setBusy(true); setError(null); stop.current = false;
    let empty = 0;
    try {
      while (!stop.current) {
        const r = await gen({ data: { interviewId, target } });
        setHave(r.have); setNeed(r.need);
        if (r.added) onChange?.();
        if (r.have >= r.need) break;
        empty = r.added === 0 ? empty + 1 : 0;
        if (empty >= 3) { setError("AI couldn't produce more verified questions. Try again later."); break; }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const done = need > 0 && have >= need;
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" /> Question bank
        </h3>
        {done && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            <CheckCircle2 className="h-3.5 w-3.5" /> Ready to go live
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">AI generates questions in advance and a second AI verifies every answer.</p>
      <Progress value={need ? (have / need) * 100 : 0} className="h-2.5" />
      <div className="text-sm font-medium text-foreground">
        {have} / {need} verified questions ready
      </div>
      {busy ? (
        <Button variant="outline" className="w-full" onClick={() => { stop.current = true; }}>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating… (stop)
        </Button>
      ) : !done ? (
        <Button variant="hero" className="w-full" onClick={run} disabled={disabled}>
          {have ? "Continue generating" : "Generate questions with AI"}
        </Button>
      ) : null}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
