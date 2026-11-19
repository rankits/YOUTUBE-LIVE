import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { topicLabel } from "@/lib/constants";
import { cleanHashtags, cleanTags, cleanTitle, DESCRIPTION_MAX } from "@/lib/promo-rules";

/** AI-written YouTube title options, description, tags, hashtags and a short thumbnail headline. */
export const generatePromoMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ interviewId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { chat, friendlyAiError } = await import("./ai.server");
    const { data: iv } = await context.supabase.from("interviews").select("*").eq("id", data.interviewId).single();
    if (!iv) throw new Error("Interview not found");
    const { data: agents } = await context.supabase
      .from("ai_agents")
      .select("id, name, personality, model")
      .in("id", [iv.interviewer_agent_id, iv.candidate_agent_id].filter(Boolean) as string[]);
    const host = agents?.find((a) => a.id === iv.interviewer_agent_id);
    const guest = agents?.find((a) => a.id === iv.candidate_agent_id);
    const topics = iv.topics?.length ? iv.topics : [topicLabel(iv.topic, iv.custom_topic)];
    const lang =
      iv.language === "hindi" ? "Hindi (Devanagari) mixed with English tech terms" : iv.language === "hinglish" ? "Hinglish (Hindi in Latin script mixed with English)" : "English";

    const system = `You are a YouTube growth expert writing metadata for a LIVE stream where two AI agents interview each other.
Reply with a JSON object only, exactly this shape:
{"titles": [3 strings], "description": string, "tags": [15-25 strings], "hashtags": [8-12 strings], "thumbnailText": string}
Rules:
- titles: 3 different click-worthy but honest titles, max 90 characters each, can use 1 emoji, mention it is an AI vs AI interview.
- description: 120-250 words in ${lang}. Hook in the first 2 lines, what viewers will learn, bullet list of topics, a call to like/subscribe. Do not include hashtags in it. Never claim real humans are speaking.
- tags: search keywords (no # symbol), mix of broad and specific.
- hashtags: short CamelCase hashtags starting with #.
- thumbnailText: 2-5 punchy words for the thumbnail, in English.`;
    const user = `Show title: ${iv.title}
Format: ${iv.format}
Topics: ${topics.join(", ")}
Host AI: ${host?.name ?? "Host"} (${host?.personality ?? ""})
Guest AI: ${guest?.name ?? "Guest"} (${guest?.personality ?? ""})
Length: ${iv.duration_minutes} minutes`;

    let res;
    try {
      res = await chat(
        "openai/gpt-6-astra",
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        { maxTokens: 2500, temperature: 0.8, json: true },
      );
    } catch (e) {
      throw new Error(friendlyAiError(e));
    }
    let parsed: { titles?: unknown; description?: unknown; tags?: unknown; hashtags?: unknown; thumbnailText?: unknown } = {};
    try {
      const m = res.text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(m ? m[0] : res.text);
    } catch {
      throw new Error("The AI reply couldn't be read. Try again.");
    }
    const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    const titles = arr(parsed.titles).map(cleanTitle).filter(Boolean).slice(0, 3);
    if (!titles.length) throw new Error("The AI didn't return any titles. Try again.");
    return {
      titles,
      description: typeof parsed.description === "string" ? parsed.description.trim().slice(0, DESCRIPTION_MAX - 400) : "",
      tags: cleanTags(arr(parsed.tags)),
      hashtags: cleanHashtags(arr(parsed.hashtags)),
      thumbnailText: typeof parsed.thumbnailText === "string" ? parsed.thumbnailText.trim().slice(0, 60) : titles[0]!.slice(0, 40),
      topicLine: topics.join(" · ").slice(0, 120),
      hostName: host?.name ?? "Host",
      guestName: guest?.name ?? "Guest",
    };
  });
