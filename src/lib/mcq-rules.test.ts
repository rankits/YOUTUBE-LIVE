import { describe, expect, it } from "vitest";
import { composeMcqSpeech, parseMcq } from "./mcq-rules";

const base = { question: "Capital of India?", options: ["Mumbai", "Delhi", "Pune", "Agra"], answer: 1, explanation: "Delhi is the capital." };

describe("mcq rules", () => {
  it("accepts exactly four options and a 0-3 answer", () => {
    expect(parseMcq(base)?.answer).toBe(1);
    expect(parseMcq({ ...base, options: ["a", "b", "c"] })).toBeNull();
    expect(parseMcq({ ...base, answer: 4 })).toBeNull();
  });
  it("accepts a letter answer", () => {
    expect(parseMcq({ ...base, answer: "C" })?.answer).toBe(2);
  });
  it("speaks the correct option only after the question part", () => {
    const { speech, revealAt } = composeMcqSpeech({ ...parseMcq(base)!, number: 1 }, "english");
    const cut = Math.round(speech.length * revealAt);
    expect(speech.slice(0, cut).toLowerCase()).not.toContain("correct answer");
    expect(speech.slice(cut)).toMatch(/Correct answer:\s*B,\s*Delhi/i);
    expect(speech.slice(0, cut)).toContain("A Mumbai");
    expect(speech).not.toContain("Question number");
    expect(speech).not.toContain("Delhi is the capital");
  });
});

import { dedupeQuestions, isVerified, questionsNeeded } from "./mcq-rules";
describe("question bank rules", () => {
  it("8 hour show needs 600 questions", () => expect(questionsNeeded(480)).toBe(600));
  it("10 minute show needs 13 questions", () => expect(questionsNeeded(10)).toBe(13));
  it("caps at the show's question limit", () => expect(questionsNeeded(60, 20)).toBe(20));
  it("verifies only when solver agrees", () => {
    expect(isVerified(2, 2)).toBe(true);
    expect(isVerified(2, "C")).toBe(true);
    expect(isVerified(2, 1)).toBe(false);
    expect(isVerified(0, null)).toBe(false);
  });
  it("drops duplicate questions", () => {
    expect(dedupeQuestions([{ question: "What is H2O?" }, { question: "what is h2o" }], []).length).toBe(1);
    expect(dedupeQuestions([{ question: "A?" }], ["a"]).length).toBe(0);
  });
});
