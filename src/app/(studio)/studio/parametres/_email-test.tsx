"use client";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendTestEmail } from "@/lib/actions/emails";
import { useAction } from "@/lib/hooks/use-action";

/** Bouton « M'envoyer un email de test » de la carte Emails (Paramètres, administrateur). */
export function EmailTestButton() {
  const { exec, pending } = useAction();
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={pending}
      onClick={() => exec(() => sendTestEmail(), {
        refresh: false,
        onSuccess: (r) => toast.success(
          r.provider === "resend" ? `Email de test envoyé à ${r.to}.` : `Lien de connexion envoyé à ${r.to} par Supabase.`,
          { description: r.provider === "resend" ? "Regarde ta boîte mail (et les spams)." : "S'il n'arrive pas, le service par défaut de Supabase est sans doute à sa limite." },
        ),
      })}
    >
      <Send />M&apos;envoyer un email de test
    </Button>
  );
}
