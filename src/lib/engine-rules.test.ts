import { describe, expect, it } from "vitest";
import { currentTopicIndex, endReason, introPhase, isClosingTurn, isRepetitive, maxTurns, nextSpeaker, visualRequired, HARD_TURN_CAP } from "./engine-rules";

const start = new Date("2026-01-01T10:00:00Z");

describe("conversation engine rules", () => {
  it("interviewer opens and speakers alternate", () => {
    expect(nextSpeaker(0)).toBe("interviewer");
    expect(nextSpeaker(1)).toBe("candidate");
    expect(nextSpeaker(2)).toBe("interviewer");
  });

  it("8 questions allow 19 turns (welcome + guest intro + 8 Q/A pairs + closing)", () => {
    expect(maxTurns(8)).toBe(19);
  });

  it("never exceeds the hard turn cap", () => {
    expect(maxTurns(600)).toBeLessThanOrEqual(HARD_TURN_CAP);
  });

  it("opens with host welcome, then guest self-introduction", () => {
    expect(introPhase(0)).toBe("host_welcome");
    expect(introPhase(1)).toBe("guest_intro");
    expect(introPhase(2)).toBeNull();
  });

  it("10-hour show with 5 topics switches topic every 2 hours", () => {
    const at = (h: number) => new Date(start.getTime() + h * 3600_000);
    const args = { topicsCount: 5, durationMinutes: 600, startedAt: start };
    expect(currentTopicIndex({ ...args, now: at(1.9) })).toBe(0);
    expect(currentTopicIndex({ ...args, now: at(2.1) })).toBe(1);
    expect(currentTopicIndex({ ...args, now: at(9.9) })).toBe(4);
    expect(currentTopicIndex({ ...args, now: at(11) })).toBe(4);
  });

  it("guest answer must show a visual when the previous answer had none", () => {
    expect(visualRequired({ role: "candidate", turnIndex: 3, format: "technical", lastOwnHadVisual: false })).toBe(true);
    expect(visualRequired({ role: "candidate", turnIndex: 5, format: "technical", lastOwnHadVisual: true })).toBe(false);
    expect(visualRequired({ role: "candidate", turnIndex: 1, format: "technical", lastOwnHadVisual: null })).toBe(false);
    expect(visualRequired({ role: "interviewer", turnIndex: 2, format: "technical", lastOwnHadVisual: false })).toBe(false);
  });
  it("lecture: teacher speaks every turn and shows a visual every other part", () => {
    expect([0, 1, 2, 3].map((t) => nextSpeaker(t, "lecture"))).toEqual(["interviewer", "interviewer", "interviewer", "interviewer"]);
    expect(nextSpeaker(1, "technical")).toBe("candidate");
    expect(visualRequired({ role: "interviewer", turnIndex: 0, format: "lecture", lastOwnHadVisual: null })).toBe(false);
    expect(visualRequired({ role: "interviewer", turnIndex: 1, format: "lecture", lastOwnHadVisual: false })).toBe(true);
    expect(visualRequired({ role: "interviewer", turnIndex: 2, format: "lecture", lastOwnHadVisual: true })).toBe(false);
  });

  it("stops once the turn limit is reached", () => {
    expect(endReason({ turnIndex: 19, maxQuestions: 8, durationMinutes: 60, startedAt: start, now: start })).toBe("turn_limit");
    expect(endReason({ turnIndex: 18, maxQuestions: 8, durationMinutes: 60, startedAt: start, now: start })).toBeNull();
  });

  it("stops after duration plus 2 minutes of grace", () => {
    const now = new Date(start.getTime() + 13 * 60_000);
    expect(endReason({ turnIndex: 3, maxQuestions: 8, durationMinutes: 10, startedAt: start, now })).toBe("time_limit");
  });

  it("asks the interviewer to close once the duration has elapsed", () => {
    const now = new Date(start.getTime() + 10 * 60_000);
    expect(isClosingTurn({ turnIndex: 4, maxQuestions: 8, durationMinutes: 10, startedAt: start, now })).toBe(true);
    expect(isClosingTurn({ turnIndex: 5, maxQuestions: 8, durationMinutes: 10, startedAt: start, now })).toBe(false);
  });

  it("flags repeated questions", () => {
    expect(
      isRepetitive("How does React reconciliation work under the hood?", [
        "Can you explain how React reconciliation works under the hood?",
      ]),
    ).toBe(true);
    expect(isRepetitive("What is your favourite database and why?", ["How does React reconciliation work?"])).toBe(false);
  });
});

import { canEndYoutubeBroadcast } from "./engine-rules";
describe("canEndYoutubeBroadcast", () => {
  it("ends live and testing broadcasts", () => {
    expect(canEndYoutubeBroadcast("live")).toBe(true);
    expect(canEndYoutubeBroadcast("testing")).toBe(true);
  });
  it("leaves broadcasts that never went live or already ended", () => {
    expect(canEndYoutubeBroadcast("ready")).toBe(false);
    expect(canEndYoutubeBroadcast("created")).toBe(false);
    expect(canEndYoutubeBroadcast("complete")).toBe(false);
  });
});
