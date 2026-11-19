// Pure conversation-engine rules shared by the server orchestrator and tests.
import { AGENT_MODELS } from "./constants";

/** Absolute ceiling on turns for any interview, regardless of settings. */
export const HARD_TURN_CAP = 1300;

/** Longest show allowed (10 hours). */
export const MAX_DURATION_MINUTES = 600;
export const MAX_QUESTIONS = 600;

/** Turn 0 is the interviewer's opening; speakers then alternate. */
/** Solo lecture: one teacher agent speaks every turn. */
export function isLecture(format: string): boolean {
  return format === "lecture";
}

/** Single-speaker shows: solo lecture and competitive-exam MCQ quiz. */
export function isSolo(format: string): boolean {
  return format === "lecture" || format === "mcq";
}

export function nextSpeaker(turnIndex: number, format = ""): "interviewer" | "candidate" {
  if (isSolo(format)) return "interviewer";
  return turnIndex % 2 === 0 ? "interviewer" : "candidate";
}

/**
 * Max turns: host welcome (0) + guest self-introduction (1) + (question, answer)
 * per question + one closing line.
 */
export function maxTurns(maxQuestions: number): number {
  const q = Math.max(1, Math.min(MAX_QUESTIONS, Math.floor(maxQuestions)));
  return Math.min(HARD_TURN_CAP, q * 2 + 3);
}

/** Turns 0 and 1 are introductions: no technical question/answer yet. */
export function introPhase(turnIndex: number): "host_welcome" | "guest_intro" | null {
  if (turnIndex === 0) return "host_welcome";
  if (turnIndex === 1) return "guest_intro";
  return null;
}

/** Suggested question count for a duration (~1.25 min per question/answer pair). */
export function suggestedQuestions(durationMinutes: number): number {
  return Math.max(1, Math.min(MAX_QUESTIONS, Math.round(durationMinutes * 0.8)));
}

/** Which topic of a playlist is active: the show time is split evenly across topics. */
export function currentTopicIndex(args: { topicsCount: number; durationMinutes: number; startedAt: Date | null; now: Date }): number {
  const n = Math.max(1, Math.floor(args.topicsCount));
  if (n === 1 || !args.startedAt) return 0;
  const segmentMs = (args.durationMinutes * 60_000) / n;
  const elapsed = Math.max(0, args.now.getTime() - args.startedAt.getTime());
  return Math.min(n - 1, Math.floor(elapsed / segmentMs));
}

/** Guest answers must carry an on-screen visual when the previous answer had none. */
export function visualRequired(args: { role: "interviewer" | "candidate"; turnIndex: number; format: string; lastOwnHadVisual: boolean | null }): boolean {
  if (args.format === "mcq") return false; // the quiz board is its own visual
  // Lecture: the teacher puts a code/diagram on the board every other lesson part.
  if (isLecture(args.format)) return args.turnIndex > 0 && args.lastOwnHadVisual !== true;
  if (args.role !== "candidate" || introPhase(args.turnIndex)) return false;
  if (args.format === "hr") return false;
  return args.lastOwnHadVisual !== true;
}

export type EndReason = "turn_limit" | "time_limit" | null;

/** Whether the interview must stop before generating turn `turnIndex`. */
export function endReason(args: {
  turnIndex: number;
  maxQuestions: number;
  durationMinutes: number;
  startedAt: Date | null;
  now: Date;
}): EndReason {
  if (args.turnIndex >= maxTurns(args.maxQuestions)) return "turn_limit";
  if (args.startedAt) {
    const elapsedMs = args.now.getTime() - args.startedAt.getTime();
    // Allow a 2-minute grace so the closing line can finish.
    if (elapsedMs > (args.durationMinutes + 2) * 60_000) return "time_limit";
  }
  return null;
}

/** The last turn is always the interviewer's closing statement. */
export function isClosingTurn(args: {
  turnIndex: number;
  maxQuestions: number;
  durationMinutes: number;
  startedAt: Date | null;
  now: Date;
}): boolean {
  if (args.turnIndex === maxTurns(args.maxQuestions) - 1) return true;
  if (args.startedAt && nextSpeaker(args.turnIndex) === "interviewer") {
    const elapsedMs = args.now.getTime() - args.startedAt.getTime();
    return elapsedMs >= args.durationMinutes * 60_000;
  }
  return false;
}

/** Estimated credits for a chat completion, from catalog per-token rates. */
export function estimateChatCost(model: string, promptTokens: number, completionTokens: number) {
  const m = AGENT_MODELS.find((x) => x.id === model);
  if (!m) return 0;
  return +(promptTokens * m.inputCost + completionTokens * m.outputCost).toFixed(6);
}

/** Token budget for a reply of `words` words, with headroom for reasoning tokens. */
export function tokenBudget(words: number) {
  return Math.min(8000, Math.max(1200, Math.round(words * 2.2) + 1000));
}

/** Detects a near-duplicate question/answer by normalized word overlap. */
export function isRepetitive(candidate: string, previous: string[], threshold = 0.75): boolean {
  const norm = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .map((w) => w.replace(/(ing|ed|s)$/, "")),
    );
  const a = norm(candidate);
  if (a.size < 4) return false;
  return previous.some((p) => {
    const b = norm(p);
    if (b.size < 4) return false;
    let shared = 0;
    a.forEach((w) => {
      if (b.has(w)) shared++;
    });
    return shared / Math.min(a.size, b.size) >= threshold;
  });
}

/** Strip characters that could break prompt framing from user-provided topic text. */
export function sanitizeTopic(input: string) {
  return input.replace(/[`<>{}]/g, "").replace(/\s+/g, " ").trim().slice(0, 300);
}

/** YouTube lifecycle states from which a broadcast can be moved to "complete". */
export function canEndYoutubeBroadcast(lifeCycleStatus: string | null | undefined): boolean {
  return lifeCycleStatus === "live" || lifeCycleStatus === "testing" || lifeCycleStatus === "liveStarting" || lifeCycleStatus === "testStarting";
}
