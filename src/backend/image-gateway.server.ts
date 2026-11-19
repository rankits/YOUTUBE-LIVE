// Server-only image generation helper (Lovable AI Gateway). Never import from client code.
export const imageSettings = {
  baseURL: "https://ai.gateway.lovable.dev",
  model: "openai/gpt-image-2.5-sunburst",
};

/** Streams a 16:9 YouTube thumbnail. Returns the raw gateway response (SSE when streaming). */
export function generateThumbnailImage(apiKey: string, prompt: string, stream = true) {
  return fetch(`${imageSettings.baseURL}/v1/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: imageSettings.model,
      prompt,
      size: "1536x864",
      quality: "medium",
      ...(stream ? { stream: true, partial_images: 1 } : {}),
    }),
  });
}
