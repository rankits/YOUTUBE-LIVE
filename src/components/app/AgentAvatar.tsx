import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { lazy, Suspense, useEffect, useState } from "react";
import { presetAvatar, is3dPreset } from "@/lib/avatars";

const Avatar3D = lazy(() => import("./Avatar3D"));

/**
 * Animated avatar fallback: a portrait with idle breathing, a speaking glow and a
 * level-driven mouth/energy bar. It is NOT lip-synced video and is labelled as such.
 */
export function AgentAvatar({
  name,
  avatarUrl,
  presetKey,
  role,
  speaking,
  level = 0,
  tone = "primary",
  size = "lg",
}: {
  name: string;
  avatarUrl?: string | null | undefined;
  presetKey?: string | null | undefined;
  role?: string | undefined;
  speaking: boolean;
  level?: number | undefined;
  tone?: "primary" | "secondary" | undefined;
  size?: "sm" | "md" | "lg" | "xl" | undefined;
}) {
  const src = avatarUrl || presetAvatar(presetKey, role);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const use3d = !avatarUrl && is3dPreset(presetKey) && mounted;
  const dims = { sm: "h-12 w-12", md: "h-24 w-24", lg: "h-44 w-44", xl: "h-52 w-52" }[size];
  const ring = tone === "primary" ? "ring-primary shadow-glow" : "ring-secondary shadow-glow-secondary";
  const scale = speaking ? 1 + Math.min(level, 1) * 0.035 : 1;
  if (use3d && size !== "sm") {
    // Full-body 3D character: no circle crop, so hands and gestures stay visible.
    const tall = { md: "h-48 w-40", lg: "h-80 w-72", xl: "h-[26rem] w-[22rem]" }[size];
    return (
      <div className={cn("relative", tall)}>
        <Suspense fallback={<img src={src} alt={name} className="h-full w-full object-contain" />}>
          <Avatar3D modelKey={presetKey!} speaking={speaking} level={level} />
        </Suspense>
      </div>
    );
  }
  return (
    <div className={cn("relative", dims)}>
      {speaking && (
        <>
          <span className={cn("absolute inset-0 rounded-full animate-ring-pulse", tone === "primary" ? "bg-primary/30" : "bg-secondary/30")} />
          <span className={cn("absolute -inset-2 rounded-full animate-ring-pulse [animation-delay:0.5s]", tone === "primary" ? "bg-primary/15" : "bg-secondary/15")} />
        </>
      )}
      <motion.div
        animate={{ scale }}
        transition={{ type: "spring", stiffness: 300, damping: 18 }}
        className={cn(
          "relative h-full w-full overflow-hidden rounded-full ring-2 transition-all duration-500",
          speaking ? ring : "ring-border opacity-80 grayscale-[35%]",
          !speaking && "animate-breathe",
        )}
      >
        {use3d ? (
          <Suspense fallback={<img src={src} alt={name} className="h-full w-full object-cover" />}>
            <div className="h-full w-full bg-card"><Avatar3D modelKey={presetKey!} speaking={speaking} level={level} /></div>
          </Suspense>
        ) : (
          <img src={src} alt={name} className="h-full w-full object-cover" width={816} height={816} />
        )}
        {/* Mouth/energy overlay driven by real audio level */}
        {speaking && size !== "sm" && !use3d && (
          <motion.div
            className={cn("absolute bottom-[22%] left-1/2 h-1.5 -translate-x-1/2 rounded-full", tone === "primary" ? "bg-primary-glow/80" : "bg-secondary/80")}
            animate={{ width: `${12 + Math.min(level, 1) * 22}%`, opacity: 0.35 + Math.min(level, 1) * 0.5 }}
            transition={{ duration: 0.08 }}
          />
        )}
      </motion.div>
    </div>
  );
}

export function Waveform({ active, level = 0, tone = "primary", bars = 24 }: { active: boolean; level?: number; tone?: "primary" | "secondary"; bars?: number }) {
  return (
    <div className="flex h-10 items-end justify-center gap-[3px]" aria-hidden>
      {Array.from({ length: bars }).map((_, i) => {
        const base = 0.15 + Math.abs(Math.sin(i * 1.7)) * 0.5;
        const h = active ? Math.min(1, base * (0.4 + level * 1.6)) : 0.08;
        return (
          <motion.span
            key={i}
            className={cn("w-1 rounded-full", tone === "primary" ? "bg-primary" : "bg-secondary")}
            animate={{ height: `${Math.max(8, h * 100)}%`, opacity: active ? 0.9 : 0.3 }}
            transition={{ duration: 0.12 }}
          />
        );
      })}
    </div>
  );
}
