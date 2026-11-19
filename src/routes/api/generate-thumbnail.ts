import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const Body = z.object({
  headline: z.string().min(1).max(80),
  topic: z.string().max(200),
  hostName: z.string().max(60),
  guestName: z.string().max(60),
  idea: z.string().max(600).optional(),
  stream: z.boolean().optional(),
});

// Signed-in users only: image generation spends workspace AI credits.
export const Route = createFileRoute("/api/generate-thumbnail")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        const url = process.env["SUPABASE_URL"];
        const anon = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!token || !url || !anon) return new Response("Sign in first.", { status: 401 });
        const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data: u } = await sb.auth.getUser(token);
        if (!u.user) return new Response("Sign in first.", { status: 401 });

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Invalid thumbnail request.", { status: 400 });
        const b = parsed.data;
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("AI image generation is not configured.", { status: 500 });

        const idea = b.idea?.trim();
        const prompt = idea
          ? [
              "YouTube live stream thumbnail, 16:9, high contrast, eye-catching.",
              `Follow this creative direction closely: ${idea}`,
              `Context: an AI vs AI interview show about ${b.topic}, host ${b.hostName}, guest ${b.guestName}.`,
              `If the direction doesn't specify other text, add large bold headline text spelled exactly: "${b.headline}", placed well inside the edges.`,
              "No watermarks.",
            ].join("\n")
          : [
          "Eye-catching YouTube live stream thumbnail, 16:9, high contrast, bold and clean.",
          `Scene: a futuristic neon podcast studio where two stylized AI characters face each other — an AI host named ${b.hostName} on the left and an AI guest named ${b.guestName} on the right — with a glowing "VS" between them.`,
          `Topic of the show: ${b.topic}.`,
          `Large bold headline text, spelled exactly: "${b.headline}". Place it in the central band of the image, well inside the edges.`,
          'Small red "LIVE" badge in the top-left corner.',
          "Dark indigo and violet background with cyan and magenta rim lights, cinematic depth of field. No other text, no watermarks, no logos.",
        ].join("\n");

        const { generateThumbnailImage } = await import("@/backend/image-gateway.server");
        const upstream = await generateThumbnailImage(apiKey, prompt, b.stream !== false);
        return new Response(upstream.body, {
          status: upstream.status,
          headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json", "Cache-Control": "no-cache" },
        });
      },
    },
  },
});
