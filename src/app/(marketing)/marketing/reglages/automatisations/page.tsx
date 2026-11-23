import { leaveRetiredPage } from "../retired";

/**
 * Ancienne page « Automatisations » : retirée de l'interface, les leads arrivent maintenant dans GoHighLevel.
 * automations-client.tsx reste : la fiche d'un prospect s'en sert (validation du client après une signature).
 */
export default async function Page() { return leaveRetiredPage(); }
