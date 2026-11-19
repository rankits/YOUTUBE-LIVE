import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TTS_COST_PER_SECOND, topicLabel } from "@/lib/constants";

type McqOpts = [string, string, string, string];
const uuid = z.string().uuid();

/** Question-bank questions of a quiz show that still need a Short, plus how many already went to YouTube. */
export const listShortQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ interviewId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("interview_questions")
      .select("id, idx, question, options, topic, short_url")
      .eq("interview_id", data.interviewId)
      .order("idx");
    const all = rows ?? [];
    const pending = all.filter((r) => !r.short_url);
    // Last scheduled publish time across all the user's Shorts, so a new plan continues after it (one channel).
    const { data: last } = await context.supabase
      .from("interview_questions")
      .select("short_publish_at")
      .not("short_publish_at", "is", null)
      .order("short_publish_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const asOpts = (o: unknown): string[] => (Array.isArray(o) ? o.map(String).slice(0, 4) : []);
    return {
      total: all.length,
      done: all.length - pending.length,
      lastScheduled: last?.short_publish_at ?? null,
      pending: pending.slice(0, 744).map((r) => ({
        id: r.id,
        number: r.idx + 1,
        question: r.question,
        options: asOpts(r.options),
        topic: r.topic ?? "",
      })),
      recent: all
        .filter((r) => r.short_url)
        .slice(-6)
        .reverse()
        .map((r) => ({ number: r.idx + 1, question: r.question, url: r.short_url! })),
    };
  });

/** Speaks one bank question with the show's host voice and returns everything the browser needs to render the Short. */
export const prepareShortClip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ questionId: uuid, voiceSlot: z.number().int().min(0).max(100_000).optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: q } = await supabase.from("interview_questions").select("*").eq("id", data.questionId).single();
    if (!q) throw new Error("Question not found");
    const { data: iv } = await supabase.from("interviews").select("*").eq("id", q.interview_id).single();
    if (!iv) throw new Error("Show not found");
    const { data: agent } = await supabase.from("ai_agents").select("*").eq("id", iv.interviewer_agent_id!).single();
    if (!agent) throw new Error("The show's teacher agent is missing.");

    const { composeMcqSpeech } = await import("@/lib/mcq-rules");
    const { speakWithFallback, wavDurationMs, friendlyAiError } = await import("./ai.server");
    const { loadUserKeys } = await import("./keys.server");
    const keys = await loadUserKeys(userId);
    const base = { number: q.idx + 1, question: q.question, options: q.options as McqOpts, answer: q.answer, explanation: q.explanation };
    const { speech, revealAt } = composeMcqSpeech(base, iv.language ?? agent.language);

    const language = iv.language ?? agent.language;
    const topic = q.topic ?? topicLabel(iv.topic, iv.custom_topic);
    // Viral metadata is written while the voice is generated; any AI failure falls back to template metadata.
    const metaP = (async () => {
      const { chat } = await import("./ai.server");
      const { parseModelJson } = await import("@/lib/json-repair");
      const lang = language === "hindi" ? "Hindi (Devanagari)" : language === "hinglish" ? "Hinglish (Hindi in Latin script)" : "English";
      const res = await chat(
        "openai/gpt-6-astra",
        [
          {
            role: "system",
            content: `You are a YouTube Shorts growth expert for Indian competitive-exam quiz channels. Write viral metadata in ${lang} for one MCQ Short. Return JSON only: {"title":"","hook":"","tags":[],"hashtags":[]}
- title: max 80 chars, curiosity/challenge style (e.g. "99% log galat batate hain 😱 ..."), 1-2 emoji, mention the subject. NEVER reveal or hint the correct answer. Do not add #Shorts.
- hook: 2-5 punchy words shown huge on the first frame, max 30 chars, 1 emoji, no answer.
- tags: 12 trending search keywords without #, e.g. exam names (SSC, UPSC, Railway), "gk in hindi", topic words.
- hashtags: 8 trending CamelCase hashtags starting with #.`,
          },
          { role: "user", content: `Topic: ${topic}\nQuestion: ${q.question}\nOptions: ${(q.options as string[]).join(" | ")}` },
        ],
        { maxTokens: 600, temperature: 0.9, json: true, signal: AbortSignal.timeout(25_000) },
        keys,
      );
      return parseModelJson<Record<string, unknown>>(res.text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim());
    })().catch(() => null);

    let audio: Awaited<ReturnType<typeof speakWithFallback>>;
    try {
      // Voice mix: rotate the show voice with free female/male voices so Shorts don't all sound the same.
      const { shuffleVoice } = await import("@/lib/shuffle-rules");
      const alt = data.voiceSlot === undefined ? null : shuffleVoice(language, data.voiceSlot);
      audio = await speakWithFallback(speech, alt ? { ...agent, ...alt } : agent, language, keys);
    } catch (e) {
      throw new Error(`Voice generation failed: ${friendlyAiError(e)}`);
    }
    const ext = audio.contentType.includes("mpeg") ? "mp3" : "wav";
    const path = `${userId}/${iv.id}/shorts/${q.id}.${ext}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin.storage.from("interview-audio").upload(path, audio.bytes, { contentType: audio.contentType, upsert: true });
    if (upErr) throw new Error("Could not save the voice clip.");
    const { edgeMp3DurationMs } = await import("@/lib/tts-rules");
    const durationMs = ext === "wav" ? wavDurationMs(audio.bytes) : audio.engine === "edge" ? edgeMp3DurationMs(audio.bytes.length) : Math.round((speech.split(/\s+/).length / 2.6) * 1000);
    await supabaseAdmin.from("usage_analytics").insert({
      user_id: userId,
      interview_id: iv.id,
      agent_id: agent.id,
      kind: "tts",
      model: audio.engine === "lovable" ? "google/gemini-3.1-flash-tts-preview" : `${audio.engine}:${audio.voice}`,
      audio_ms: durationMs ?? 0,
      cost_credits: audio.ownKey || audio.engine === "edge" ? 0 : +(((durationMs ?? 0) / 1000) * TTS_COST_PER_SECOND).toFixed(6),
    });
    const { data: signed } = await supabaseAdmin.storage.from("interview-audio").createSignedUrl(path, 1800);
    if (!signed?.signedUrl) throw new Error("Voice clip missing");
    const { buildShortMeta } = await import("@/lib/shorts-rules");
    const meta = buildShortMeta({ question: q.question, options: base.options, answer: q.answer, topic, number: base.number, language, ai: await metaP });
    return {
      audioUrl: signed.signedUrl,
      topic,
      language,
      meta,
      mcq: { type: "mcq" as const, ...base, revealAt },
    };
  });

/** Remembers that a bank question is already on YouTube so it is never posted twice. */
export const markShortUploaded = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ questionId: uuid, url: z.string().url().max(200), publishAt: z.string().datetime().nullish() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("interview_questions").update({ short_url: data.url, short_publish_at: data.publishAt ?? null }).eq("id", data.questionId);
    if (error) throw new Error("Could not save the Short link.");
    return { ok: true };
  });
