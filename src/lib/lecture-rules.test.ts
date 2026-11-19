import { describe, expect, it } from "vitest";
import { defaultFocus, ensureSignOff, focusIndexAt, sanitizeFocus, signOffLine } from "./lecture-rules";

describe("lecture sign-off", () => {
  it("says bye bye and next video in the show's language", () => {
    expect(signOffLine("hinglish")).toBe("Bye bye, milte hain next video mein!");
    expect(signOffLine("hindi")).toBe("बाय बाय, अगले वीडियो में मिलते हैं!");
    expect(signOffLine("english")).toBe("Bye bye, see you in the next video!");
  });

  it("appends the goodbye when the final speech forgot it", () => {
    expect(ensureSignOff("That's the whole course.", "hinglish")).toBe("That's the whole course. Bye bye, milte hain next video mein!");
  });

  it("does not add a second goodbye", () => {
    expect(ensureSignOff("Thanks! Bye bye, see you in the next video.", "english")).toBe("Thanks! Bye bye, see you in the next video.");
  });
});

describe("code walkthrough steps", () => {
  it("clamps model line numbers to the code length", () => {
    expect(sanitizeFocus([{ from: 0, to: 3 }, { from: 9, to: 40, note: "return" }], 10)).toEqual([
      { from: 1, to: 3 },
      { from: 9, to: 10, note: "return" },
    ]);
  });

  it("splits code into 3-line chunks when no steps are given", () => {
    expect(defaultFocus(7)).toEqual([{ from: 1, to: 3 }, { from: 4, to: 6 }, { from: 7, to: 7 }]);
  });

  it("walks steps in order as the speech plays", () => {
    expect(focusIndexAt(0, 4)).toBe(0);
    expect(focusIndexAt(0.5, 4)).toBe(1);
    expect(focusIndexAt(1, 4)).toBe(3);
  });
});
