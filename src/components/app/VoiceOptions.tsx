import { SelectContent, SelectGroup, SelectItem, SelectLabel } from "@/components/ui/select";
import { elevenLabsVoiceGroups, type VoiceProvider } from "@/lib/constants";

/** Grouped voice items for Select — ElevenLabs shows Indian / Other. */
export function VoiceSelectItems({
  provider,
  options,
}: {
  provider: VoiceProvider;
  options: { id: string; label: string; group?: string }[];
}) {
  if (provider === "elevenlabs") {
    return (
      <>
        {elevenLabsVoiceGroups().map((g) => (
          <SelectGroup key={g.group}>
            <SelectLabel>{g.group === "Indian" ? "Indian / Hindi" : "Other voices"}</SelectLabel>
            {g.voices.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </>
    );
  }
  return (
    <>
      {options.map((v) => (
        <SelectItem key={v.id} value={v.id}>
          {v.label}
        </SelectItem>
      ))}
    </>
  );
}
