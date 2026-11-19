import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Signed-in users only: Shorts / Job Alert backgrounds.
 * mode=real → Wikimedia + Openverse real photos (Job Alerts), then AI fallback.
 * default → Cloudflare FLUX, then Pollinations.
 */

async function cloudflareFluxJpeg(prompt: string, seed: number): Promise<Response | null> {
  const accountId = process.env["CLOUDFLARE_ACCOUNT_ID"]?.trim();
  const apiToken = process.env["CLOUDFLARE_API_TOKEN"]?.trim();
  if (!accountId || !apiToken) return null;

  const steps = Math.min(8, Math.max(4, Number(process.env["CLOUDFLARE_FLUX_STEPS"]) || 6));
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: prompt.slice(0, 2048), seed, steps }),
      signal: AbortSignal.timeout(90_000),
    },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { success?: boolean; result?: { image?: string }; errors?: unknown };
  const b64 = json.result?.image;
  if (!json.success || !b64) return null;
  const bytes = Buffer.from(b64, "base64");
  return new Response(bytes, {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600", "X-Image-Source": "cloudflare-flux" },
  });
}

async function pollinationsImage(prompt: string, seed: number, width: number, height: number): Promise<Response | null> {
  const res = await fetch(
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&seed=${seed}&enhance=true`,
    { signal: AbortSignal.timeout(60_000) },
  );
  const type = res.headers.get("content-type") ?? "";
  if (res.ok && type.startsWith("image/")) {
    return new Response(res.body, {
      headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600", "X-Image-Source": "pollinations" },
    });
  }
  return null;
}

export const Route = createFileRoute("/api/short-image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        const url = process.env["SUPABASE_URL"];
        const anon = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!token || !url || !anon) return Response.json({ error: "Sign in first." }, { status: 401 });
        const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data: u } = await sb.auth.getUser(token);
        if (!u.user) return Response.json({ error: "Sign in first." }, { status: 401 });

        const params = new URL(request.url).searchParams;
        const q = (params.get("q") ?? "").trim().slice(0, 200);
        const seed = Math.abs(Math.floor(Number(params.get("seed")) || Date.now())) % 1_000_000;
        if (!q) return Response.json({ error: "Question missing." }, { status: 400 });

        const mode = (params.get("mode") ?? "").toLowerCase();
        const landscape = params.get("landscape") === "1";
        const width = landscape ? 960 : 1080;
        const height = landscape ? 540 : 1920;

        try {
          if (mode === "real" || mode === "stock") {
            const { fetchRealImageBytes } = await import("@/lib/real-image-search");
            const real = await fetchRealImageBytes(q, seed).catch(() => null);
            if (real) {
              return new Response(real.bytes, {
                headers: {
                  "Content-Type": real.contentType,
                  "Cache-Control": "private, max-age=3600",
                  "X-Image-Source": real.source,
                  "X-Image-Search": real.search.slice(0, 80),
                },
              });
            }
            // Fall through to AI if free photo search found nothing.
          }

          const { buildShortImagePrompt } = await import("@/lib/short-image-prompt");
          const prompt = buildShortImagePrompt(q, seed);

          const cf = await cloudflareFluxJpeg(prompt, seed).catch(() => null);
          if (cf) return cf;

          const poll = await pollinationsImage(prompt, seed, width, height).catch(() => null);
          if (poll) return poll;

          return Response.json(
            {
              error: process.env["CLOUDFLARE_ACCOUNT_ID"]
                ? "Image service busy. Try again."
                : "Add CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN in .env (Workers AI), or Pollinations is down.",
            },
            { status: 502 },
          );
        } catch {
          return Response.json({ error: "Image service did not answer." }, { status: 504 });
        }
      },
    },
  },
});
