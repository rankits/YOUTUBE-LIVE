import { Highlight, themes } from "prism-react-renderer";
import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PenLine } from "lucide-react";
import { defaultFocus, focusIndexAt, type FocusStep } from "@/lib/lecture-rules";

export type Visual = { type: "code"; language: string; code: string; focus?: FocusStep[] } | { type: "mermaid"; code: string } | import("@/lib/mcq-rules").McqVisual;

// Warm the diagram library once in the browser so the first diagram doesn't stall the show.
if (typeof window !== "undefined") {
  const warm = () => void import("mermaid").catch(() => {});
  if ("requestIdleCallback" in window) window.requestIdleCallback(warm);
  else setTimeout(warm, 1500);
}

type Box = { top: number; height: number };

/** Hand-drawn pen stroke around the lines being explained. */
function PenMark({ box, note }: { box: Box; note?: string | undefined }) {
  const h = Math.max(18, box.height + 6);
  // Slightly wobbly rectangle so it looks drawn by hand.
  const d = `M 6 ${h * 0.55} C 4 6, 30 2, 200 3 S 990 1, 994 ${h * 0.4} S 990 ${h - 2}, 600 ${h - 1} S 12 ${h + 1}, 8 ${h * 0.5} L 14 4`;
  return (
    <div className="pointer-events-none absolute left-1 right-1 z-10" style={{ top: box.top - 3, height: h }}>
      <div className="absolute inset-0 rounded-md bg-warning/10 animate-pen-fill" />
      <svg className="absolute inset-0 h-full w-full overflow-visible text-warning" viewBox={`0 0 1000 ${h}`} preserveAspectRatio="none">
        <path d={d} fill="none" stroke="currentColor" strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeLinecap="round" pathLength={1} className="animate-pen-draw" />
      </svg>
      <PenLine className="absolute -bottom-3 h-5 w-5 text-warning drop-shadow animate-pen-move" />
      {note && (
        <span className="absolute -top-3 right-3 rounded-md bg-warning px-2 py-0.5 font-display text-[11px] font-bold text-background shadow-glow animate-pen-fill">
          {note}
        </span>
      )}
    </div>
  );
}

/** Syntax-highlighted code. Memoized: only re-renders when the active step changes. */
export const CodeBlock = memo(function CodeBlock({ code, language, step, maxHeight = 300 }: { code: string; language: string; step?: FocusStep | null; maxHeight?: number | undefined }) {
  const preRef = useRef<HTMLPreElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [box, setBox] = useState<Box | null>(null);

  useLayoutEffect(() => {
    const pre = preRef.current;
    if (!pre || !step) return setBox(null);
    const first = lineRefs.current[step.from - 1];
    const last = lineRefs.current[step.to - 1] ?? first;
    if (!first || !last) return setBox(null);
    const top = first.offsetTop;
    const height = last.offsetTop + last.offsetHeight - top;
    setBox({ top, height });
    // Keep the explained lines in the middle of the board.
    const target = Math.max(0, top - (pre.clientHeight - height) / 2);
    pre.scrollTo({ top: target, behavior: "smooth" });
  }, [step?.from, step?.to, code]);

  return (
    <Highlight theme={themes.nightOwl} code={code.trimEnd()} language={language || "tsx"}>
      {({ tokens, getLineProps, getTokenProps, style }) => (
        <pre ref={preRef} style={{ ...style, background: "transparent", maxHeight }} className="relative overflow-auto p-4 font-mono text-[12px] leading-relaxed [scrollbar-width:none]">
          {box && step && <PenMark key={`${step.from}-${step.to}`} box={box} note={step.note} />}
          {tokens.map((line, i) => {
            const on = step ? i + 1 >= step.from && i + 1 <= step.to : false;
            return (
              <div
                key={i}
                ref={(el) => {
                  lineRefs.current[i] = el;
                }}
                {...getLineProps({ line })}
                style={{ opacity: step && !on ? 0.55 : 1, transition: "opacity 300ms" }}
              >
                <span className="mr-4 inline-block w-6 select-none text-right text-muted-foreground/50">{i + 1}</span>
                {line.map((token, k) => (
                  <span key={k} {...getTokenProps({ token })} />
                ))}
              </div>
            );
          })}
        </pre>
      )}
    </Highlight>
  );
});

export function MermaidDiagram({ code }: { code: string }) {
  const id = useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict" });
        const { svg } = await mermaid.render(`m${id}`, code);
        if (!cancelled) setSvg(svg);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, id]);
  if (failed) return <CodeBlock code={code} language="markdown" />;
  if (!svg) return <div className="p-6 text-sm text-muted-foreground">Rendering diagram…</div>;
  return <div className="flex justify-center p-4 [&_svg]:max-h-[280px] [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/**
 * `progress` (0..1) is how far the speaker is through the current turn; code
 * scrolls and the pen moves step by step with it. Omit it for a static view.
 */
export function VisualPanel({ visual, progress, maxHeight }: { visual: Visual; progress?: number | undefined; maxHeight?: number | undefined }) {
  const steps = useMemo(() => {
    if (visual.type !== "code") return [];
    if (visual.focus?.length) return visual.focus;
    return defaultFocus(visual.code.trimEnd().split("\n").length);
  }, [visual]);
  const idx = progress === undefined ? -1 : focusIndexAt(progress, steps.length);
  const step = idx >= 0 ? (steps[idx] ?? null) : null;
  return (
    <div className="overflow-hidden rounded-xl border bg-background/80 backdrop-blur">
      <div className="flex items-center gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
        <span className="ml-2 font-mono">{visual.type === "code" ? visual.language || "code" : "diagram"}</span>
        {step && (
          <span className="ml-auto font-mono text-warning">
            lines {step.from}
            {step.to !== step.from ? `–${step.to}` : ""} · step {idx + 1}/{steps.length}
          </span>
        )}
      </div>
      {visual.type === "code" ? <CodeBlock code={visual.code} language={visual.language} step={step} maxHeight={maxHeight} /> : visual.type === "mermaid" ? <MermaidDiagram code={visual.code} /> : null}
    </div>
  );
}
