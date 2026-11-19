import interviewerAvatar from "@/assets/avatar-interviewer.jpg";
import candidateAvatar from "@/assets/avatar-candidate.jpg";

export const PRESET_AVATARS: Record<string, string> = {
  interviewer: interviewerAvatar,
  candidate: candidateAvatar,
  rankit3d: interviewerAvatar,
};

/** Presets rendered as a live 3D model on stage. */
export const AVATAR_3D_PRESETS = ["rankit3d"];
export const is3dPreset = (k?: string | null) => !!k && AVATAR_3D_PRESETS.includes(k);

export function presetAvatar(key: string | null | undefined, role?: string) {
  if (key && PRESET_AVATARS[key]) return PRESET_AVATARS[key];
  return role === "candidate" ? candidateAvatar : interviewerAvatar;
}
