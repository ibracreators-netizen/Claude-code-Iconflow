"use client";
import * as React from "react";
import { useRouter } from "next/navigation";

/** Anciens liens vers une carte de l'ancienne page Réglages (« /marketing/reglages#publicite ») : ouverts dans leur rubrique. */
const MOVED: Record<string, string> = { "#publicite": "/marketing/reglages/integrations#publicite" };

export function HashRedirect() {
  const router = useRouter();
  React.useEffect(() => {
    const to = MOVED[window.location.hash];
    if (to) router.replace(to);
  }, [router]);
  return null;
}
