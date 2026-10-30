"use client";
import * as React from "react";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Confirmer", danger, onConfirm, withComment, commentLabel = "Commentaire (optionnel)", loading }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; confirmLabel?: string; danger?: boolean;
  onConfirm: (comment: string) => void | Promise<void>; withComment?: boolean; commentLabel?: string; loading?: boolean;
}) {
  const [comment, setComment] = React.useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description}>
        {withComment ? <label className="block"><span className="mb-1.5 block text-[13px] font-medium text-fg-2">{commentLabel}</span><Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} /></label> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button variant={danger ? "danger" : "primary"} loading={loading} onClick={async () => { await onConfirm(comment); setComment(""); }}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
