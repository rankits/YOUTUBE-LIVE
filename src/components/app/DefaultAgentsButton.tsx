import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { missingDefaultAgents } from "@/lib/default-agents";
import { Button } from "@/components/ui/button";

/** Adds Aria (host) and Dev (guest) with free Microsoft voices, skipping any that already exist. */
export function DefaultAgentsButton({ existingNames, variant = "outline" }: { existingNames: string[]; variant?: "outline" | "hero" }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const missing = missingDefaultAgents(existingNames);
  if (missing.length === 0) return null;

  async function add() {
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Please sign in again.");
      const { error } = await supabase.from("ai_agents").insert(missing.map((a) => ({ ...a, user_id: u.user!.id })));
      if (error) throw new Error(error.message);
      toast.success(`${missing.map((a) => a.name.split(" ")[0]).join(" & ")} added`);
      qc.invalidateQueries({ queryKey: ["agents"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the default agents");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant={variant} onClick={add} disabled={busy}>
      <Sparkles /> {busy ? "Adding…" : missing.length === 2 ? "Add default agents (Aria & Dev)" : `Add ${missing[0]!.name.split(" ")[0]}`}
    </Button>
  );
}
