"use server";
import { submitPublicBooking } from "@/lib/marketing/public";

/** Soumission de la réservation publique (sans session). Validation, anti-robots et débit gérés côté serveur. */
export async function submitBooking(input: { slot_start: string; name: string; email: string; phone?: string; website?: string }) {
  return submitPublicBooking(input);
}
