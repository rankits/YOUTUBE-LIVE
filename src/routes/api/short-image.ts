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

  const steps = Math.min(6, Math.max(4, Number(process.env["CLOUDFLARE_FLUX_STEPS"]) || 4));
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: prompt.slice(0, 1200), seed, steps }),
      signal: AbortSignal.timeout(18_000),
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
  // No enhance= — faster and less likely to hit Vercel function timeouts.
  const res = await fetch(
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 400))}?width=${width}&height=${height}&nologo=true&seed=${seed}`,
    { signal: AbortSignal.timeout(20_000) },
  );
  const type = res.headers.get("content-type") ?? "";
  if (res.ok && type.startsWith("image/")) {
    return new Response(res.body, {
      headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600", "X-Image-Source": "pollinations" },
    });
  }
  return null;
}

/** Last-resort graphic so Shorts still render when AI/stock image APIs are down. */
function placeholderSvg(q: string, seed: number): Response {
  const hues = [210, 18, 160, 280, 40];
  const h = hues[seed % hues.length]!;
  const safe = q.replace(/[<>&"']/g, "").slice(0, 48);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="hsl(${h} 55% 22%)"/><stop offset="100%" stop-color="hsl(${(h + 40) % 360} 50% 12%)"/>
  </linearGradient></defs>
  <rect width="720" height="1280" fill="url(#g)"/>
  <text x="36" y="120" fill="#ffd400" font-family="Arial,sans-serif" font-size="28" font-weight="700">SHORTS</text>
  <text x="36" y="640" fill="#ffffff" font-family="Arial,sans-serif" font-size="36" font-weight="700">${safe}</text>
</svg>`;
  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=600", "X-Image-Source": "placeholder" },
  });
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
        // Smaller than 1080×1920 so generation finishes inside Vercel time limits.
        const width = landscape ? 960 : 720;
        const height = landscape ? 540 : 1280;

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

          // Soft fallback — never 502 the UI; Shorts can still render with a graphic.
          return placeholderSvg(q, seed);
        } catch {
          return placeholderSvg(q, seed);
        }
      },
    },
  },
});
