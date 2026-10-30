"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/actions/result";

/**
 * Exécute une server action avec transition, toast et rafraîchissement.
 *   const { exec, pending } = useAction();
 *   exec(() => createTask(data), { success: "Tâche créée" })
 */
export function useAction() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function exec<T>(action: () => Promise<ActionResult<T>>, opts: { success?: string; onSuccess?: (data: T) => void; refresh?: boolean } = {}) {
    return new Promise<ActionResult<T>>((resolve) => {
      startTransition(async () => {
        const res = await action();
        if (res.ok) {
          if (opts.success) toast.success(opts.success);
          opts.onSuccess?.(res.data);
          if (opts.refresh !== false) router.refresh();
        } else toast.error(res.error);
        resolve(res);
      });
    });
  }
  return { exec, pending };
}
