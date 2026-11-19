import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Trending headlines for India or World from free Google/Bing RSS (no API key). */
export const listViralTopics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ region: z.enum(["india", "world"]) }).parse(input ?? { region: "india" }),
  )
  .handler(async ({ data }) => {
    const { viralFeeds, parseViralRss, mergeViralTopics } = await import("@/lib/viral-topics-rules");
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
      Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
      "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8",
    };
    const fetchFeed = async (url: string) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(12_000) }).catch(() => null);
        if (res?.ok) {
          const items = parseViralRss(await res.text(), data.region);
          if (items.length) return items;
        }
        await new Promise((r) => setTimeout(r, 700));
      }
      throw new Error("feed failed");
    };
    const feeds = viralFeeds(data.region);
    const results = await Promise.allSettled(feeds.map((f) => fetchFeed(f.url)));
    const lists = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    const items = mergeViralTopics(lists);
    const okFeeds = results.filter((r) => r.status === "fulfilled").length;
    return {
      items,
      sources: `${okFeeds}/${feeds.length} news sources`,
      error: items.length ? null : "All news sources are busy right now. Try Refresh in a few minutes.",
    };
  });

/** Writes a ~25–35 s viral-news Short script, speaks it, returns render payload. */
export const prepareViralShort = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        title: z.string().min(5).max(300),
        source: z.string().max(120),
        region: z.enum(["india", "world"]),
        category: z.string().max(40).optional(),
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
    const { VIRAL_HASHTAGS, VIRAL_TAGS, extractTopicLabel, viralNewsTitle, sceneLayout } = await import("@/lib/viral-topics-rules");
    const keys = await loadUserKeys(userId);
    const regionLabel = data.region === "world" ? "WORLD" : "INDIA";
    const category = (data.category || "Trending").slice(0, 40);
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
            content: `You write the FULL spoken script for a viral news YouTube Short (${regionLabel} trending).

Language for ALL spoken "say" lines: ${lang}.

VOICE STYLE (PROFESSIONAL NEWS DESK):
- Confident TV news presenter: clear, solid, trustworthy — NOT casual friend chat, NOT slang.
- Short crisp lines. Facts first. One continuous briefing (~25–35 seconds) when scenes join.
- Ban: "matlab", "aur haan", "basically", "yaar", "bhai", "suno", "sun lo", "dekho", "listen".
- Do NOT start with "Breaking news", "Dear viewers", "In this video", "Aaj hum baat karenge".
- Stick to what is knowable from the headline. Do NOT invent fake quotes, death tolls, or official statements.
- No "visit the website". No motivational filler.

ON-SCREEN KEYWORDS (critical):
- Every scene.keyword = DIFFERENT 2–5 word FACT the viewer can READ without sound (names, numbers, places, outcomes).
- No soft-only words like "Important" / "Update" alone. Prefer concrete facts.

Return JSON only:
{"headline":"max 70 chars","jobName":"SHORT bold topic label max 24 chars","scenes":[{"say":"one clear spoken beat, 12–22 words","keyword":"2–5 WORD FACT for big on-screen banner","image":"UNIQUE English-only documentary photo idea; no Devanagari; no random portraits"}],"points":["3 short FACT hooks max 40 chars"],"title":"VIRAL YouTube title 85–95 chars (NO #Shorts in JSON). Format: emoji + topic + hook + Watch Now","hook":"2-4 words, 1 emoji","tags":["18-25 viral search tags"],"hashtags":["8-12 CamelCase hashtags with #"]}

Make 5–6 scenes: what happened → key fact → why it matters → detail → context if known → follow CTA. Every keyword unique and readable.`,
          },
          {
            role: "user",
            content: `Region: ${regionLabel}\nCategory: ${category}\nHeadline: ${data.title}\nSource: ${data.source}\nWrite the full professional news-desk script now.`,
          },
        ],
        { maxTokens: 2000, temperature: 0.7, json: true, signal: AbortSignal.timeout(35_000) },
        keys,
      );
      ai = parseModelJson(res.text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim()) ?? {};
    } catch {
      ai = {};
    }

    const headline = (ai.headline || data.title).slice(0, 110);
    const jobName = (ai.jobName || extractTopicLabel(data.title)).trim().slice(0, 28) || extractTopicLabel(data.title);
    const points = (Array.isArray(ai.points) ? ai.points : []).map(String).filter(Boolean).slice(0, 3);
    if (!points.length) points.push(jobName, category, `${regionLabel} trending — follow`);
    const kindLabel = `${regionLabel} · ${category}`.toUpperCase();

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
    const script =
      (scenes.length ? scenes.map((x) => x.say.replace(/\s+/g, " ").trim()).join(" ") : "") ||
      ai.script?.trim() ||
      (data.language === "english"
        ? `Top story right now: ${jobName}. ${data.title}. Follow for more verified news updates.`
        : data.language === "hindi"
          ? `इस समय की प्रमुख खबर: ${jobName}। और अपडेट्स के लिए फॉलो करें।`
          : `Is samay ki pramukh khabar: ${jobName}. Aur updates ke liye follow karein.`);

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
    const path = `${userId}/viral/${crypto.randomUUID()}.${ext}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin.storage.from("interview-audio").upload(path, audio.bytes, { contentType: audio.contentType, upsert: true });
    if (upErr) throw new Error("Could not save the voice clip.");
    const durationMs = ext === "wav" ? wavDurationMs(audio.bytes) : null;
    await supabaseAdmin.from("usage_analytics").insert({ user_id: userId, kind: "tts", model: `${audio.engine}:${audio.voice}`, audio_ms: durationMs ?? 0, cost_credits: 0 });
    const { data: signed } = await supabaseAdmin.storage.from("interview-audio").createSignedUrl(path, 1800);
    if (!signed?.signedUrl) throw new Error("Voice clip missing");

    const { cleanHashtags, cleanTags } = await import("@/lib/promo-rules");
    const hashtags = cleanHashtags([...(ai.hashtags ?? []).map(String), ...VIRAL_HASHTAGS]);
    const title = viralNewsTitle({
      topicLabel: jobName,
      headline,
      region: data.region,
      ...(ai.title ? { aiTitle: ai.title } : {}),
    });
    const description = [
      title.replace(/\s*#Shorts\s*$/i, "").trim(),
      "",
      `📢 ${headline}`,
      `✅ ${regionLabel} · ${category}`,
      "",
      ...scenes.map((x) => `📌 ${x.say}`),
      "",
      ...points.map((p) => `✅ ${p}`),
      "",
      `Source: ${data.source || "News"}`,
      "",
      "🔔 Follow for daily viral news Shorts!",
      "",
      hashtags.join(" "),
    ]
      .filter((l) => l !== undefined)
      .join("\n")
      .slice(0, 4500);
    const tags = cleanTags([...(ai.tags ?? []).map(String), jobName, category, regionLabel, headline, ...VIRAL_TAGS]);
    return {
      audioUrl: signed.signedUrl,
      scenes,
      headline,
      jobName,
      facts: {},
      points,
      hook: ai.hook || "🔥 Trending",
      kindLabel,
      meta: { title, description, tags },
    };
  });
