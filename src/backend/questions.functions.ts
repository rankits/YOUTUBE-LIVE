import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { topicLabel } from "@/lib/constants";
import { dedupeQuestions, isVerified, MAX_BANK, parseMcq, questionsNeeded } from "@/lib/mcq-rules";

const BATCH = 10;

export const getQuestionBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ interviewId: z.string().uuid(), target: z.number().int().min(1).max(MAX_BANK).optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: iv } = await context.supabase.from("interviews").select("duration_minutes, max_questions").eq("id", data.interviewId).single();
    if (!iv) throw new Error("Interview not found");
    const { count } = await context.supabase.from("interview_questions").select("id", { count: "exact", head: true }).eq("interview_id", data.interviewId).eq("used", false);
    return { have: count ?? 0, need: Math.max(questionsNeeded(iv.duration_minutes, iv.max_questions), data.target ?? 0) };
  });

/** Generates one verified batch (strict factual mode + independent AI solver). Client loops until full. */
export const generateQuestionBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ interviewId: z.string().uuid(), target: z.number().int().min(1).max(MAX_BANK).optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { chat, friendlyAiError } = await import("./ai.server");
    const { loadUserKeys } = await import("./keys.server");
    const { parseModelJson } = await import("@/lib/json-repair");
    const keys = await loadUserKeys(userId);
    const { data: iv } = await supabase.from("interviews").select("*").eq("id", data.interviewId).single();
    if (!iv) throw new Error("Interview not found");
    // Shorts plans may ask for more questions than the show length needs (capped at MAX_BANK).
    const need = Math.max(questionsNeeded(iv.duration_minutes, iv.max_questions), data.target ?? 0);
    const { data: existing } = await supabase.from("interview_questions").select("question, idx").eq("interview_id", iv.id).order("idx");
    const have = existing?.length ?? 0;
    if (have >= need) return { have, need, added: 0 };

    const playlist = iv.topics?.length ? iv.topics : [topicLabel(iv.topic, iv.custom_topic)];
    const topic = playlist[Math.floor((have / need) * playlist.length) % playlist.length]!;
    const lang = iv.language === "hindi" ? "Hindi (Devanagari)" : iv.language === "hinglish" ? "Hinglish (Hindi in Latin script)" : "English";
    const avoid = (existing ?? []).slice(-40).map((q) => `- ${q.question}`).join("\n");
    const toJson = (t: string) => parseModelJson<Record<string, unknown>>(t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim());

    try {
      const gen = await chat(
        "openai/gpt-6-astra",
        [
          {
            role: "system",
            content: `You write competitive-exam MCQs (SSC, UPSC, Railway, NCERT level) in ${lang}. Only use well-established, undisputed facts. Each question must have exactly 4 distinct options and exactly ONE unambiguously correct answer. No opinion, no "all of the above", no recent/uncertain events. Return JSON: {"questions":[{"question":"...","options":["","","",""],"answer":0,"explanation":"one short sentence"}]}`,
          },
          { role: "user", content: `Topic: ${topic}\nDifficulty: ${iv.difficulty}\nWrite ${BATCH} new questions.${avoid ? `\nDo not repeat these:\n${avoid}` : ""}` },
        ],
        { maxTokens: 4000, temperature: 0.1, json: true, signal: AbortSignal.timeout(90_000) },
        keys,
      );
      const raw = toJson(gen.text);
      const list = (Array.isArray(raw?.["questions"]) ? raw["questions"] : []).map(parseMcq).filter((q): q is NonNullable<typeof q> => !!q);
      const fresh = dedupeQuestions(list, (existing ?? []).map((q) => q.question));
      if (!fresh.length) return { have, need, added: 0 };

      // Independent fact-check: a second call solves the questions without seeing the answers.
      const solve = await chat(
        "openai/gpt-6-astra",
        [
          { role: "system", content: 'You are a strict exam fact-checker. For each question pick the single correct option index (0-3). If a question is ambiguous, has more than one correct option, or none, return -1 for it. Return JSON: {"answers":[n,...]}' },
          { role: "user", content: JSON.stringify(fresh.map((q, i) => ({ i, question: q.question, options: q.options }))) },
        ],
        { maxTokens: 800, temperature: 0, json: true, signal: AbortSignal.timeout(60_000) },
        keys,
      );
      const answers = toJson(solve.text)?.["answers"];
      const verified = fresh.filter((q, i) => isVerified(q.answer, Array.isArray(answers) ? answers[i] : null)).slice(0, need - have);
      if (verified.length) {
        const { error } = await supabase.from("interview_questions").insert(
          verified.map((q, i) => ({ user_id: userId, interview_id: iv.id, idx: have + i, topic, question: q.question, options: q.options, answer: q.answer, explanation: q.explanation })),
        );
        if (error) throw new Error("Could not save questions.");
      }
      return { have: have + verified.length, need, added: verified.length };
    } catch (e) {
      throw new Error(friendlyAiError(e));
    }
  });

export const clearQuestionBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ interviewId: z.string().uuid(), target: z.number().int().min(1).max(MAX_BANK).optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase.from("interview_questions").delete().eq("interview_id", data.interviewId);
    return { ok: true };
  });
