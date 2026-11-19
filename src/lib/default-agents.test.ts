import { describe, expect, it } from "vitest";
import { DEFAULT_AGENTS, missingDefaultAgents } from "./default-agents";

describe("default agents", () => {
  it("are Aria (host) and Dev (guest) on free Microsoft voices", () => {
    expect(DEFAULT_AGENTS.map((a) => [a.name, a.role, a.voice_provider, a.voice_id])).toEqual([
      ["Aria Kapoor", "interviewer", "google_cloud", "hi-IN-Neural2-A"],
      ["Dev Malhotra", "candidate", "google_cloud", "hi-IN-Neural2-B"],
      ["Rankit", "interviewer", "google_cloud", "hi-IN-Neural2-B"],
    ]);
  });
  it("only adds the ones the user doesn't already have", () => {
    expect(missingDefaultAgents([]).length).toBe(3);
    expect(missingDefaultAgents(["aria kapoor"]).map((a) => a.name)).toEqual(["Dev Malhotra", "Rankit"]);
    expect(missingDefaultAgents(["Aria Kapoor", "Dev Malhotra", "Rankit"])).toEqual([]);
  });
});
