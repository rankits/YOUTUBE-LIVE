import { describe, expect, it } from "vitest";
import { parseModelJson } from "./json-repair";

describe("parseModelJson", () => {
  it("accepts raw newlines inside a code string", () => {
    const raw = '{"speech":"Use createRoot","visual":{"type":"code","language":"tsx","code":"const root = createRoot(el);\nroot.render(<App />);"}}';
    const obj = parseModelJson<{ visual: { code: string } }>(raw);
    expect(obj?.visual.code).toBe("const root = createRoot(el);\nroot.render(<App />);");
  });

  it("recovers speech from a truncated answer", () => {
    const raw = '{"speech":"React 18 ke concurrent features enable karne ke liye sabse pehle hume createRoot se ap';
    const obj = parseModelJson<{ speech: string }>(raw);
    expect(obj?.speech).toBe("React 18 ke concurrent features enable karne ke liye sabse pehle hume createRoot se ap");
  });

  it("returns null for plain text", () => {
    expect(parseModelJson("no json here")).toBeNull();
  });
});

describe("parseModelJson stray quotes", () => {
  it("drops a stray quote before the closing braces", () => {
    const raw = '{"speech":"Hi","visual":{"type":"code","code":"root.render(<App />);"}"}}';
    const obj = parseModelJson<{ speech: string; visual: { code: string } }>(raw);
    expect(obj?.visual.code).toBe("root.render(<App />);");
    expect(obj?.speech).toBe("Hi");
  });
});
