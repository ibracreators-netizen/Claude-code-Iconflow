import { Eye, Undo2 } from "lucide-react";
import { endPreview } from "@/lib/actions/auth";
import { buttonVariants } from "@/components/ui/button";

/** Démo : rappel qu'on voit le studio avec les droits d'un autre membre, et retour à son propre compte. */
export function PreviewBanner({ name }: { name: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-info/30 bg-info/10 px-4 py-2.5 text-[13.5px]" role="status">
      <Eye className="size-4 shrink-0 text-info" />
      <p className="min-w-0 flex-1">Tu vois le studio <span className="font-semibold">comme {name}</span>, avec ses droits. Rien n&apos;est modifié sur ton compte.</p>
      <form action={endPreview}><button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}><Undo2 />Revenir à mon compte</button></form>
    </div>
  );
}
