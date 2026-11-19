// Shared, browser-safe configuration for the AI Interview Arena.
import { EDGE_VOICES } from "./edge-voices";

export const TOPICS = [
  "React.js",
  "Node.js",
  "Python",
  "JavaScript",
  "TypeScript",
  "MERN Stack",
  "Artificial Intelligence",
  "Generative AI",
  "Agentic AI",
  "Machine Learning",
  "Deep Learning",
  "System Design",
  "Cloud Computing",
  "DevOps",
  "Cybersecurity",
  "Technology Debate",
  "Custom Topic",
] as const;

export const FORMATS = [
  { value: "technical", label: "Technical Interview" },
  { value: "podcast", label: "Podcast Discussion" },
  { value: "expert", label: "Expert Discussion" },
  { value: "debate", label: "Debate" },
  { value: "challenge", label: "Knowledge Challenge" },
  { value: "educational", label: "Educational Discussion" },
  { value: "hr", label: "HR Interview" },
  { value: "lecture", label: "Solo Lecture / Full Course" },
  { value: "mcq", label: "Competitive Exam MCQ Quiz" },
] as const;

export const DIFFICULTIES = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "expert", label: "Expert" },
] as const;

export const DURATIONS = [5, 10, 20, 30, 45, 60, 120, 180, 240, 360, 480, 600] as const;

export function durationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} hour${h > 1 ? "s" : ""}${m ? ` ${m} min` : ""}`;
}

export const LANGUAGES = [
  { value: "english", label: "English" },
  { value: "hindi", label: "Hindi" },
  { value: "hinglish", label: "Hinglish" },
] as const;

export type AgentModelId =
  | "openai/gpt-6-astra"
  | "openai/gpt-6.1-terra"
  | "google/gemini-3.8-flash"
  | "google/gemini-4-argon"
  | "google/gemini-3.1-pro-preview";

// Credits per token, taken from the AI gateway model catalog (estimates).
export const AGENT_MODELS: {
  id: AgentModelId;
  label: string;
  vendor: "OpenAI" | "Google";
  note: string;
  inputCost: number;
  outputCost: number;
}[] = [
  { id: "openai/gpt-6-astra", label: "GPT-6 Astra", vendor: "OpenAI", note: "Most capable", inputCost: 0.00004, outputCost: 0.0002 },
  { id: "openai/gpt-6.1-terra", label: "GPT-6.1 Terra", vendor: "OpenAI", note: "Fast & efficient", inputCost: 0.000004, outputCost: 0.00003 },
  { id: "google/gemini-3.8-flash", label: "Gemini 3.8 Flash", vendor: "Google", note: "Fast, low cost", inputCost: 0.000003, outputCost: 0.000015 },
  { id: "google/gemini-4-argon", label: "Gemini 4 Argon", vendor: "Google", note: "Frontier reasoning", inputCost: 0.000008, outputCost: 0.00004 },
  { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", vendor: "Google", note: "Deep reasoning", inputCost: 0.000008, outputCost: 0.000048 },
];

export const TTS_MODEL = "google/gemini-3.1-flash-tts-preview";
// Credits per output audio token (catalog estimate); ~25 audio tokens per second.
export const TTS_COST_PER_SECOND = 0.00008 * 25;

export const LOVABLE_VOICES = [
  { id: "Kore", label: "Kore — firm, clear (F)" },
  { id: "Aoede", label: "Aoede — breezy (F)" },
  { id: "Leda", label: "Leda — youthful (F)" },
  { id: "Zephyr", label: "Zephyr — bright (F)" },
  { id: "Sulafat", label: "Sulafat — warm (F)" },
  { id: "Puck", label: "Puck — upbeat (M)" },
  { id: "Charon", label: "Charon — informative (M)" },
  { id: "Fenrir", label: "Fenrir — excitable (M)" },
  { id: "Orus", label: "Orus — firm (M)" },
  { id: "Iapetus", label: "Iapetus — clear (M)" },
];

/** ElevenLabs voices for dropdowns — Indian first, then other premade voices. */
export const ELEVENLABS_VOICES: { id: string; label: string; group: "Indian" | "Other" }[] = [
  // Indian / Hindi-friendly (library voices — add in ElevenLabs if missing)
  { id: "2zRM7PkgwBPiau2jvVXc", label: "Monika Sogam — Indian English (F)", group: "Indian" },
  { id: "EaBs7G1VibMrNAuz2Na7", label: "Monika — Natural Hindi/English (F)", group: "Indian" },
  { id: "0AhMLhS8cg2zbxNVsWMV", label: "Diana — Hindi audiobook (F)", group: "Indian" },
  { id: "Sm1seazb4gs7RSlUVw7c", label: "Anika — Hindi friendly (F)", group: "Indian" },
  { id: "wlmwDR77ptH6bKHZui0l", label: "Riya Rao — Hindi care (F)", group: "Indian" },
  { id: "gHu9GtaHOXcSqFTK06ux", label: "Anjali — Hindi smooth (F)", group: "Indian" },
  { id: "ZeK6O9RfGNGj0cJT2HoJ", label: "Shanaya — Indian care (F)", group: "Indian" },
  { id: "vPjsEi0sIN5vI8PwSqer", label: "Tejaswini — Indian conversational (F)", group: "Indian" },
  { id: "90ipbRoKi4CpHXvKVtl0", label: "Anika — Customer care (F)", group: "Indian" },
  // Other premade / popular English voices
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Sarah — news (F)", group: "Other" },
  { id: "FGY2WhTYpPnrIDTdsKH5", label: "Laura — social (F)", group: "Other" },
  { id: "XrExE9yKIg1WjnnlVkGX", label: "Matilda — narration (F)", group: "Other" },
  { id: "cgSgspJ2msm6clMCkdW9", label: "Jessica — conversational (F)", group: "Other" },
  { id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel — narration (F)", group: "Other" },
  { id: "pFZP5JQG7iQjIQuC4Bku", label: "Lily — narration (F)", group: "Other" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", label: "Alice — news (F)", group: "Other" },
  { id: "XB0fDUnXU5powFXDhCwa", label: "Charlotte — characters (F)", group: "Other" },
  { id: "MF3mGyEYCl7XYWbV9V6O", label: "Elli — narration (F)", group: "Other" },
  { id: "AZnzlk1XvdvUeBnXmlld", label: "Domi — narration (F)", group: "Other" },
  { id: "oWAxZDx7w5VEj9dCyTzz", label: "Grace — audiobook (F)", group: "Other" },
  { id: "jBpfuIE2acCO8z3wKNLl", label: "Gigi — animation (F)", group: "Other" },
  { id: "JBFqnCBsd6RMkjVDRZzb", label: "George — narration (M)", group: "Other" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", label: "Liam — narration (M)", group: "Other" },
  { id: "onwK4e9ZLuTAKqWW03F9", label: "Daniel — news (M)", group: "Other" },
  { id: "nPczCjzI2devNBz1zQrb", label: "Brian — narration (M)", group: "Other" },
  { id: "pNInz6obpgDQGcFmaJgB", label: "Adam — narration (M)", group: "Other" },
  { id: "ErXwobaYiN019PkySvjV", label: "Antoni — narration (M)", group: "Other" },
  { id: "TxGEqnHWrfWFTfGW9XjX", label: "Josh — narration (M)", group: "Other" },
  { id: "VR6AewLTigWG4xSOukaG", label: "Arnold — narration (M)", group: "Other" },
  { id: "iP95p4xoKVk53GoZ742B", label: "Chris — conversational (M)", group: "Other" },
  { id: "cjVigY5qzO86Huf0OWal", label: "Eric — conversational (M)", group: "Other" },
  { id: "bIHbv24MWmeRgasZH58o", label: "Will — social (M)", group: "Other" },
  { id: "IKne3meq5aSn9XLyUdCD", label: "Charlie — conversational (M)", group: "Other" },
  { id: "N2lVS1w4EtoT3dr4eOWO", label: "Callum — characters (M)", group: "Other" },
  { id: "pqHfZKP75CvOlQylNhV4", label: "Bill — narration (M)", group: "Other" },
  { id: "yoZ06aMxZJJ28mfd3POQ", label: "Sam — narration (M)", group: "Other" },
];

export function elevenLabsVoiceGroups(): { group: "Indian" | "Other"; voices: typeof ELEVENLABS_VOICES }[] {
  return (["Indian", "Other"] as const).map((group) => ({
    group,
    voices: ELEVENLABS_VOICES.filter((v) => v.group === group),
  }));
}

// Deepgram Aura-2 voices (English only — Hindi/Hinglish words get an English accent).
export const DEEPGRAM_VOICES = [
  { id: "aura-2-thalia-en", label: "Thalia — clear, energetic (F)" },
  { id: "aura-2-andromeda-en", label: "Andromeda — casual, expressive (F)" },
  { id: "aura-2-helena-en", label: "Helena — caring, friendly (F)" },
  { id: "aura-2-asteria-en", label: "Asteria — clear, confident (F)" },
  { id: "aura-2-luna-en", label: "Luna — friendly, natural (F)" },
  { id: "aura-2-athena-en", label: "Athena — calm, professional (F)" },
  { id: "aura-2-apollo-en", label: "Apollo — confident, casual (M)" },
  { id: "aura-2-arcas-en", label: "Arcas — natural, smooth (M)" },
  { id: "aura-2-orion-en", label: "Orion — approachable (M)" },
  { id: "aura-2-zeus-en", label: "Zeus — deep, trustworthy (M)" },
  { id: "aura-2-hermes-en", label: "Hermes — expressive (M)" },
  { id: "aura-2-draco-en", label: "Draco — British, warm (M)" },
];

export type VoiceProvider = "edge" | "lovable" | "elevenlabs" | "deepgram" | "google_cloud";

/** Google Cloud Text-to-Speech voices (4M free chars/month on Standard/WaveNet/Neural2). */
export const GOOGLE_CLOUD_VOICES = [
  { id: "hi-IN-Neural2-A", label: "Hindi — Female A (Neural2)" },
  { id: "hi-IN-Neural2-D", label: "Hindi — Female D (Neural2)" },
  { id: "hi-IN-Neural2-B", label: "Hindi — Male B (Neural2)" },
  { id: "hi-IN-Neural2-C", label: "Hindi — Male C (Neural2)" },
  { id: "hi-IN-Wavenet-A", label: "Hindi — Female A (WaveNet)" },
  { id: "hi-IN-Wavenet-B", label: "Hindi — Male B (WaveNet)" },
  { id: "en-IN-Neural2-A", label: "Indian English — Female A (Neural2)" },
  { id: "en-IN-Neural2-D", label: "Indian English — Female D (Neural2)" },
  { id: "en-IN-Neural2-B", label: "Indian English — Male B (Neural2)" },
  { id: "en-IN-Neural2-C", label: "Indian English — Male C (Neural2)" },
  { id: "en-US-Neural2-F", label: "US English — Female F (Neural2)" },
  { id: "en-US-Neural2-H", label: "US English — Female H (Neural2)" },
  { id: "en-US-Neural2-D", label: "US English — Male D (Neural2)" },
  { id: "en-US-Neural2-J", label: "US English — Male J (Neural2)" },
  { id: "en-GB-Neural2-A", label: "UK English — Female A (Neural2)" },
  { id: "en-GB-Neural2-B", label: "UK English — Male B (Neural2)" },
];

export function voicesFor(provider: VoiceProvider): { id: string; label: string; group?: string }[] {
  return provider === "edge" ? EDGE_VOICES : provider === "google_cloud" ? GOOGLE_CLOUD_VOICES : provider === "deepgram" ? DEEPGRAM_VOICES : provider === "elevenlabs" ? ELEVENLABS_VOICES : LOVABLE_VOICES;
}

export function voiceProviderLabel(provider: string) {
  return provider === "edge" ? "Microsoft (free)" : provider === "google_cloud" ? "Google Cloud" : provider === "deepgram" ? "Deepgram" : provider === "elevenlabs" ? "ElevenLabs" : "Built-in";
}

/** Short voice name for cards, e.g. "Neerja" from "en-IN-NeerjaNeural". */
export function voiceShortName(id: string) {
  return id.replace(/^aura-2-|-en$/g, "").replace(/^[a-z]{2,3}-[A-Za-z]{2,}(-[a-z]+)?-/, "").replace(/Neural$/, "");
}

export const INTERVIEWER_PERSONALITIES = [
  "Professional HR",
  "Senior Technical Interviewer",
  "Strict Technical Expert",
  "Friendly Podcast Host",
  "AI Researcher",
  "Curious Journalist",
];

export const CANDIDATE_PERSONALITIES = [
  "Junior Developer",
  "Mid-Level Developer",
  "Senior Developer",
  "Software Architect",
  "AI Engineer",
  "Technical Researcher",
  "Industry Expert",
];

export const RESPONSE_STYLES = [
  { value: "conversational", label: "Conversational" },
  { value: "detailed", label: "Detailed" },
  { value: "concise", label: "Concise" },
  { value: "storytelling", label: "Storytelling" },
  { value: "socratic", label: "Socratic" },
];

export const INTERVIEW_STYLES = [
  { value: "balanced", label: "Balanced" },
  { value: "friendly", label: "Friendly" },
  { value: "rigorous", label: "Rigorous" },
  { value: "rapid-fire", label: "Rapid-fire" },
];

export const LEVELS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export function topicLabel(topic: string, custom?: string | null) {
  return topic === "Custom Topic" && custom ? custom : topic;
}

export function formatLabel(v: string) {
  return FORMATS.find((f) => f.value === v)?.label ?? v;
}

export function modelLabel(id: string) {
  return AGENT_MODELS.find((m) => m.id === id)?.label ?? id;
}
