"use client";
import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useAction } from "@/lib/hooks/use-action";
import { cancelAppointment } from "@/lib/actions/marketing";

export function CancelAppt({ id }: { id: string }) {
  const { exec, pending } = useAction();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="icon-sm" variant="ghost" aria-label="Annuler le rendez-vous" onClick={() => setOpen(true)}><X /></Button>
      <ConfirmDialog open={open} onOpenChange={setOpen} loading={pending} danger title="Annuler ce rendez-vous ?" description="Les rappels programmés seront annulés."
        confirmLabel="Annuler le RDV" onConfirm={() => { void exec(() => cancelAppointment(id), { success: "Rendez-vous annulé.", onSuccess: () => setOpen(false) }); }} />
    </>
  );
}
