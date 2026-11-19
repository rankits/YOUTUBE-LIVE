import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Latest job / exam / admit-card / result headlines from free RSS
 * (SarkariExam + Google News + Bing News, no key).
 * All feeds are fetched together with one retry each, so one source rate-limiting the server never empties the list.
 */
export const listJobNews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { newsFeeds, parseNewsRss, mergeNews } = await import("@/lib/news-rules");
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
      Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
      "Accept-Language": "hi-IN,hi;q=0.9,en-IN;q=0.8,en;q=0.7",
    };
    const fetchFeed = async (url: string) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(12_000) }).catch(() => null);
        if (res?.ok) {
          const items = parseNewsRss(await res.text());
          if (items.length) return items;
        }
        await new Promise((r) => setTimeout(r, 700));
      }
      throw new Error("feed failed");
    };
    const feeds = newsFeeds();
    const results = await Promise.allSettled(feeds.map((f) => fetchFeed(f.url)));
    const lists = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    const items = mergeNews(lists);
    const okFeeds = results.filter((r) => r.status === "fulfilled").length;
    return {
      items,
      sources: `${okFeeds}/${feeds.length} news sources`,
      error: items.length ? null : "All news sources are busy right now. Showing saved alerts — try Refresh in a few minutes.",
    };
  });

const kind = z.enum(["vacancy", "exam", "admit", "result"]);

/** Writes a 25-30 s breaking-news script for one alert, speaks it and returns everything the browser needs to render. */
export const prepareNewsShort = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        title: z.string().min(5).max(300),
        source: z.string().max(120),
        kind,
        language: z.enum(["hindi", "hinglish", "english"]),
        agentId: z.string().uuid().optional(),
        voiceProvider: z.string().min(2).max(40).optional(),
        voiceId: z.string().min(2).max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { chat, speakWithFallback, wavDurationMs, friendlyAiError } = await import("./ai.server");
    const { parseModelJson } = await import("@/lib/json-repair");
    const { loadUserKeys } = await import("./keys.server");
    const { NEWS_HASHTAGS, KIND_LABEL, VIRAL_JOB_TAGS, viralJobTitle } = await import("@/lib/news-rules");
    const keys = await loadUserKeys(userId);
    const lang =
      data.language === "hindi"
        ? "Hindi in Devanagari script only"
        : data.language === "hinglish"
          ? "Hinglish — Hindi words in easy Latin script (jaise log WhatsApp pe bolte hain)"
          : "simple spoken Indian English";

    let ai: {
      scenes?: { say?: string; keyword?: string; image?: string }[];
      headline?: string;
      jobName?: string;
      points?: string[];
      facts?: { posts?: string; startDate?: string; endDate?: string; qualification?: string; ageLimit?: string; pattern?: string[] };
      script?: string;
      title?: string;
      hook?: string;
      tags?: string[];
      hashtags?: string[];
    } = {};
    try {
      const res = await chat(
        "openai/gpt-6-astra",
        [
          {
            role: "system",
            content: `You write the FULL spoken script for an Indian government job / exam YouTube Short.

Language for ALL spoken "say" lines: ${lang}.

VOICE STYLE (most important — PROFESSIONAL NEWS DESK):
- Sound like a confident TV news reporter / job-update presenter: clear, solid, trustworthy — NOT casual WhatsApp chat, NOT slangy "dost" banter, NOT stiff legal notice language.
- Short crisp lines. Firm facts first. Calm authority. One continuous briefing (~25–35 seconds) when scenes are joined.
- Do NOT use: "matlab", "aur haan", "basically", "and yeah", "suno", "sun lo", "dekho", "yaar", "bhai", "chalo".
- Do NOT start with "Breaking news", "Dear students", "In this video", "Aaj hum baat karenge", "नमस्कार दोस्तों आज की वीडियो में".
- Do NOT use: "candidates are advised", "hereby informed", "official notification states".
- Put real facts: posts, dates, eligibility, age, exam pattern when known from the headline or well-known for that exam. Skip unknown details. NEVER say "visit the website" / "check official site".

ON-SCREEN KEYWORDS (critical for retention):
- Every scene.keyword MUST be a DIFFERENT high-value fact the viewer can READ without audio: e.g. "1688 Posts", "Last Date 13 Nov", "12th Pass", "Age 18–28", "CBT 100 Q".
- Keywords: 2–5 words MAX, numbers preferred, NO full sentences, NO soft words like "Important" / "Update" alone.
- keywords drive the big on-screen banners — make them the facts people need.

BANNED FILLER:
- No repeated listen/suno/dekho. No generic tips (time management, revise carefully, stay focused, hard work, don't panic).
- Vacancy / admit / result / date alerts: facts + short follow CTA only. No tip scene.

GOOD professional examples:
- Hinglish: "Railway NTPC ki nayi bharti notify hui hai. Total posts eighteen hundred plus hain."
- Hindi: "रेलवे एनटीपीसी की नई भर्ती अधिसूचित हुई है। कुल पद अठारह सौ से अधिक हैं।"
- English: "Railway NTPC has a fresh recruitment notification. Total posts are over eighteen hundred."

Return JSON only:
{"headline":"max 70 chars","jobName":"SHORT bold name e.g. 'RRB NTPC' or 'मप्र पुलिस' — max 24","facts":{"posts":"or omit","startDate":"or omit","endDate":"or omit","qualification":"or omit","ageLimit":"or omit","pattern":["up to 4 short fact lines"]},"scenes":[{"say":"one clear spoken beat, 12–22 words, continues from previous scene","keyword":"2–5 WORD FACT for on-screen banner e.g. '1688 Posts' / 'Last Date 13 Nov' / '12th Pass' / 'CBT 100 Q'","image":"UNIQUE English-only documentary photo idea for THIS scene; different each scene; no Devanagari; no random portraits"}],"points":["3 short FACTS max 40 chars — posts/date/eligibility only"],"title":"VIRAL YouTube title 85–95 chars (NO #Shorts in JSON). Format: emoji + job name + vacancy hook + Apply Now.","hook":"2-4 words, 1 emoji","tags":["18-25 viral search tags"],"hashtags":["8-12 CamelCase hashtags with #"]}

Make 5–6 scenes: open with vacancy → posts → dates → eligibility → (exam pattern if known) → follow CTA. Every keyword must be a unique readable FACT.`,
          },
          { role: "user", content: `Type: ${KIND_LABEL[data.kind]}\nHeadline: ${data.title}\nSource: ${data.source}\nWrite the full professional news-desk script now.` },
        ],
        { maxTokens: 2000, temperature: 0.7, json: true, signal: AbortSignal.timeout(35_000) },
        keys,
      );
      ai = parseModelJson(res.text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim()) ?? {};
    } catch {
      ai = {};
    }
    const headline = (ai.headline || data.title).slice(0, 110);
    const { extractJobLabel, sceneLayout } = await import("@/lib/news-rules");
    const jobName = (ai.jobName || extractJobLabel(data.title)).trim().slice(0, 28) || extractJobLabel(data.title);
    const points = (Array.isArray(ai.points) ? ai.points : []).map(String).filter(Boolean).slice(0, 3);
    if (!points.length) points.push(jobName, KIND_LABEL[data.kind], "Daily job alerts — follow");
    const rawFacts = ai.facts && typeof ai.facts === "object" ? ai.facts : {};
    const facts = {
      posts: rawFacts.posts ? String(rawFacts.posts).slice(0, 40) : undefined,
      startDate: rawFacts.startDate ? String(rawFacts.startDate).slice(0, 28) : undefined,
      endDate: rawFacts.endDate ? String(rawFacts.endDate).slice(0, 28) : undefined,
      qualification: rawFacts.qualification ? String(rawFacts.qualification).slice(0, 40) : undefined,
      ageLimit: rawFacts.ageLimit ? String(rawFacts.ageLimit).slice(0, 28) : undefined,
      pattern: Array.isArray(rawFacts.pattern) ? rawFacts.pattern.map(String).filter(Boolean).slice(0, 4) : undefined,
    };
    const { sceneImageQuery, posterHeroQuery } = await import("@/lib/short-image-prompt");
    const rawScenes = (Array.isArray(ai.scenes) ? ai.scenes : [])
      .map((x) => ({
        say: String(x?.say ?? "").trim(),
        keyword: String(x?.keyword ?? "").trim().slice(0, 40),
        imageHint: String(x?.image ?? x?.keyword ?? ""),
      }))
      .filter((x) => x.say)
      .slice(0, 8);
    const scenes = rawScenes.map((x, i) => {
      const layout = sceneLayout(i, rawScenes.length);
      return {
        say: x.say,
        keyword: x.keyword,
        layout,
        image: (layout === "poster" ? posterHeroQuery(data.title) : sceneImageQuery(data.title, i, x.imageHint)).slice(0, 200),
      };
    });
    // Join as one continuous spoken talk (scenes already written to flow).
    const script =
      (scenes.length ? scenes.map((x) => x.say.replace(/\s+/g, " ").trim()).join(" ") : "") ||
      ai.script?.trim() ||
      (data.language === "english"
        ? `Important update on ${jobName}. ${data.title}. Follow for daily government job alerts.`
        : data.language === "hindi"
          ? `${jobName} की महत्वपूर्ण अपडेट आई है। रोज़ सरकारी नौकरी अलर्ट के लिए फॉलो करें।`
          : `${jobName} ki mahatvapurn update aayi hai. Roz ke sarkari job alerts ke liye follow karein.`);

    // Prefer selected agent; fall back to first agent / language default.
    let agentRow: { voice_provider: string; voice_id: string; speaking_speed: number | string; language?: string } | null = null;
    if (data.agentId) {
      const { data: picked } = await supabase
        .from("ai_agents")
        .select("voice_provider, voice_id, speaking_speed, language")
        .eq("id", data.agentId)
        .maybeSingle();
      agentRow = picked;
    }
    if (!agentRow) {
      const { data: first } = await supabase
        .from("ai_agents")
        .select("voice_provider, voice_id, speaking_speed, language")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      agentRow = first;
    }
    const voiceAgent = {
      voice_provider: data.voiceProvider || agentRow?.voice_provider || "edge",
      voice_id:
        data.voiceId ||
        agentRow?.voice_id ||
        (data.language === "english" ? "en-IN-NeerjaNeural" : "hi-IN-SwaraNeural"),
      speaking_speed: Number(agentRow?.speaking_speed) || 1.02,
    };
    let audio: Awaited<ReturnType<typeof speakWithFallback>>;
    try {
      audio = await speakWithFallback(script, voiceAgent, data.language, keys);
    } catch (e) {
      throw new Error(`Voice generation failed: ${friendlyAiError(e)}`);
    }
    const ext = audio.contentType.includes("mpeg") ? "mp3" : "wav";
    const path = `${userId}/news/${crypto.randomUUID()}.${ext}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin.storage.from("interview-audio").upload(path, audio.bytes, { contentType: audio.contentType, upsert: true });
    if (upErr) throw new Error("Could not save the voice clip.");
    const durationMs = ext === "wav" ? wavDurationMs(audio.bytes) : null;
    await supabaseAdmin.from("usage_analytics").insert({ user_id: userId, kind: "tts", model: `${audio.engine}:${audio.voice}`, audio_ms: durationMs ?? 0, cost_credits: 0 });
    const { data: signed } = await supabaseAdmin.storage.from("interview-audio").createSignedUrl(path, 1800);
    if (!signed?.signedUrl) throw new Error("Voice clip missing");

    const { cleanHashtags, cleanTags } = await import("@/lib/promo-rules");
    const hashtags = cleanHashtags([...(ai.hashtags ?? []).map(String), ...NEWS_HASHTAGS]);
    const title = viralJobTitle({
      jobName,
      headline,
      kindLabel: KIND_LABEL[data.kind],
      aiTitle: ai.title,
    });
    const description = [
      title.replace(/\s*#Shorts\s*$/i, "").trim(),
      "",
      `📢 ${headline}`,
      jobName ? `✅ Recruitment: ${jobName}` : "",
      facts.posts ? `✅ Posts: ${facts.posts}` : "",
      facts.endDate ? `✅ Last Date: ${facts.endDate}` : "",
      facts.qualification ? `✅ Qualification: ${facts.qualification}` : "",
      "",
      ...scenes.map((x) => `📌 ${x.say}`),
      "",
      ...points.map((p) => `✅ ${p}`),
      "",
      `Source: ${data.source || "News"}`,
      "",
      "🔔 Follow for daily sarkari naukri job alerts!",
      "",
      hashtags.join(" "),
    ]
      .filter((l) => l !== undefined)
      .join("\n")
      .slice(0, 4500);
    const tags = cleanTags([
      ...(ai.tags ?? []).map(String),
      jobName,
      KIND_LABEL[data.kind],
      headline,
      ...VIRAL_JOB_TAGS,
    ]);
    return { audioUrl: signed.signedUrl, scenes, headline, jobName, facts, points, hook: ai.hook || "🚨 Breaking", kindLabel: KIND_LABEL[data.kind], meta: { title, description, tags } };
  });
