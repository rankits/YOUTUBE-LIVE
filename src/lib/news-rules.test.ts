import { describe, expect, it } from "vitest";
import { classifyNews, extractJobLabel, mergeNews, parseNewsRss, pickViralNews, type NewsItem } from "./news-rules";

describe("extractJobLabel", () => {
  it("pulls a bold short name for common bhartis", () => {
    expect(extractJobLabel("MP Police Constable Bharti 2026 notification")).toBe("MP POLICE");
    expect(extractJobLabel("RRB NTPC CBT date announced")).toBe("RRB NTPC");
    expect(extractJobLabel("SSC CGL Tier 1 admit card")).toBe("SSC CGL");
    expect(extractJobLabel("मप्र पुलिस दरोगा भर्ती")).toBe("MP POLICE");
  });
});

describe("classifyNews", () => {
  it("detects vacancies, results, admit cards and exam dates", () => {
    expect(classifyNews("UPSC भर्ती: डेंटल सर्जन पदों पर नौकरियां")).toBe("vacancy");
    expect(classifyNews("SSC CGL Result 2026 declared")).toBe("result");
    expect(classifyNews("RRB NTPC Admit Card out")).toBe("admit");
    expect(classifyNews("UPSC Prelims exam date announced")).toBe("exam");
    expect(classifyNews("Cricket match highlights")).toBeNull();
  });
});

describe("parseNewsRss", () => {
  it("splits the source off the title", () => {
    const xml = `<rss><channel><item><title>RRB ALP Recruitment 9000 posts - Jagran Josh</title><link>https://x/1</link><pubDate>Tue, 17 Nov 2026 08:00:00 GMT</pubDate><source url="https://j">Jagran Josh</source></item></channel></rss>`;
    const [i] = parseNewsRss(xml);
    expect(i).toMatchObject({ title: "RRB ALP Recruitment 9000 posts", source: "Jagran Josh", link: "https://x/1", kind: "vacancy" });
  });
});

describe("pickViralNews", () => {
  const mk = (title: string, link: string, published: string): NewsItem => ({ title, link, source: "s", published, kind: classifyNews(title) });
  const items = [mk("SSC GD Result out", "a", "Tue, 17 Nov 2026 06:00:00 GMT"), mk("Railway bharti 5000 posts", "b", "Tue, 17 Nov 2026 08:00:00 GMT"), mk("Movie review", "c", "Tue, 17 Nov 2026 09:00:00 GMT")];
  it("picks the newest alert and skips non-alerts", () => expect(pickViralNews(items, [])?.link).toBe("b"));
  it("never reuses a posted link", () => expect(pickViralNews(items, ["b"])?.link).toBe("a"));
  it("returns null when everything was used", () => expect(pickViralNews(items, ["a", "b"])).toBeNull());
});

import { nextDailySlot as _nds, DAILY_SLOT_HOURS as _H } from "./news-rules";
describe("nextDailySlot", () => {
  it("uses 8 slots a day", () => expect(_H.length).toBe(8));
  it("picks the next slot at least 15 min ahead", () => {
    const s = _nds(new Date(2026, 10, 18, 9, 30));
    expect([s.getHours(), s.getDate()]).toEqual([10, 18]);
    expect(_nds(new Date(2026, 10, 18, 9, 30), [s.getTime()]).getHours()).toBe(12);
  });
  it("rolls to 8 AM next day after 10 PM", () => {
    const s = _nds(new Date(2026, 10, 18, 22, 30));
    expect([s.getHours(), s.getDate()]).toEqual([8, 19]);
  });
});

describe("multi-source feed", () => {
  it("reads Bing items: real article link and News:Source", () => {
    const xml = `<rss><channel><item><title>SBI Clerk Mains Admit Card 2026 Out</title><link>http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;url=https%3a%2f%2fwww.bankersadda.com%2fsbi%2f&amp;mkt=en-in</link><pubDate>Wed, 18 Nov 2026 08:00:00 GMT</pubDate><News:Source>Adda247</News:Source></item></channel></rss>`;
    const [i] = parseNewsRss(xml);
    expect(i).toMatchObject({ link: "https://www.bankersadda.com/sbi/", source: "Adda247", kind: "admit" });
  });
  it("reads SarkariExam WordPress RSS and labels source", () => {
    const xml = `<?xml version="1.0"?><rss><channel><title>Sarkari Exam</title><item><title>NTPC NGEL Engineer Admit Card 2026</title><link>https://www.sarkariexam.com/ntpc-ngel-admit/</link><dc:creator><![CDATA[Sarkari Result Team]]></dc:creator><pubDate>Thu, 19 Nov 2026 08:18:08 +0000</pubDate></item></channel></rss>`;
    const [i] = parseNewsRss(xml);
    expect(i).toMatchObject({
      title: "NTPC NGEL Engineer Admit Card 2026",
      link: "https://www.sarkariexam.com/ntpc-ngel-admit/",
      source: "SarkariExam",
      kind: "admit",
    });
  });
  it("merges feeds without duplicates or stale news, newest first", () => {
    const now = Date.parse("2026-11-19T04:00:00Z");
    const a: NewsItem = { title: "RRB NTPC Result declared", link: "a", source: "x", published: "2026-11-18T10:00:00Z", kind: "result" };
    const dupTitle: NewsItem = { ...a, link: "b" };
    const newer: NewsItem = { title: "SSC GD Admit Card out", link: "c", source: "y", published: "2026-11-19T01:00:00Z", kind: "admit" };
    const old: NewsItem = { title: "UPSC vacancy 2026", link: "d", source: "z", published: "2026-11-10T01:00:00Z", kind: "vacancy" };
    const notAlert: NewsItem = { title: "Cricket", link: "e", source: "z", published: "2026-11-19T01:00:00Z", kind: null };
    expect(mergeNews([[a, old], [dupTitle, newer, notAlert]], now).map((i) => i.link)).toEqual(["c", "a"]);
  });
});
