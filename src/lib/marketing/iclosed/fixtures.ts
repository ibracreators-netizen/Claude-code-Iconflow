/**
 * Échantillons SYNTHÉTIQUES de payloads iClosed (aucune donnée client réelle).
 * Servent uniquement aux tests locaux hors ligne. Les UUID/emails/téléphones sont fictifs.
 * ⚠️ Formes reprises du guide dev ; à confirmer avec de vrais payloads avant de figer le contrat.
 */

export const fx = {
  // Contact créé — email + téléphone présents.
  contactCreated: {
    type: "newContactCreated", hookType: "Contact created",
    id: "ct_0001", accountId: "acc_demo",
    email: "prospect@example.test", phone: "+33600000000", name: "Prospect Démo",
    updatedAt: "2026-11-06T09:00:00.000Z",
    questionsAndAnswers: [{ q: "Budget pub mensuel", a: "3000" }, { q: "CA mensuel", a: "20000" }],
    tracking: { utm_source: "meta", utm_campaign: "demo" },
    extraFieldFromProvider: "toléré et ignoré",
  },
  // Contact créé — TÉLÉPHONE SEUL (email null) : ne doit pas déclencher d'email.
  contactPhoneOnly: {
    type: "newContactCreated", hookType: "Contact created",
    id: "ct_0002", accountId: "acc_demo", email: null, phone: "+33611111111", name: null,
    updatedAt: "2026-11-06T09:05:00.000Z",
  },
  // Contact mis à jour (même ID, horodatage plus récent).
  contactUpdated: {
    type: "contactUpdated", hookType: "Contact updated",
    id: "ct_0001", accountId: "acc_demo", email: "prospect@example.test", phone: "+33600000000", name: "Prospect Démo 2",
    updatedAt: "2026-11-06T10:00:00.000Z",
  },
  // Appel réservé — attention aux 3 UUID distincts.
  callBooked: {
    type: "callBooked", hookType: "Call booked", accountId: "acc_demo",
    event: { uuid: "call_9001" },
    event_type: { uuid: "etype_vsl" },
    invitee: { uuid: "ct_0001", email: "prospect@example.test", phone: "+33600000000", name: "Prospect Démo" },
    utc_start_time: "2026-11-10T14:00:00.000Z", utc_end_time: "2026-11-10T14:45:00.000Z",
    occurred_at: "2026-11-06T11:00:00.000Z",
    questions_and_answers: [{ q: "Budget", a: "3000" }],
    tracking: { utm_source: "meta" },
  },
  // Report du MÊME appel (ancien → nouvel horaire).
  callRescheduled: {
    type: "callRescheduled", hookType: "Call rescheduled", accountId: "acc_demo",
    event: { uuid: "call_9001" }, event_type: { uuid: "etype_vsl" }, invitee: { uuid: "ct_0001" },
    old_utc_start_time: "2026-11-10T14:00:00.000Z",
    new_utc_start_time: "2026-11-12T16:00:00.000Z", new_utc_end_time: "2026-11-12T16:45:00.000Z",
    occurred_at: "2026-11-07T08:00:00.000Z",
  },
  // Annulation du même appel.
  callCancelled: {
    type: "callCancelled", hookType: "Call cancelled", accountId: "acc_demo",
    event: { uuid: "call_9001" }, invitee: { uuid: "ct_0001" },
    occurred_at: "2026-11-08T08:00:00.000Z",
  },
  // Cas limites invalides (doivent être REFUSÉS, pas devinés).
  unknownType: { type: "somethingElse", id: "ct_9999" },
  contactNoId: { type: "newContactCreated", accountId: "acc_demo", email: "x@example.test" },
  bookingNoCallId: { type: "callBooked", invitee: { uuid: "ct_0001" }, utc_start_time: "2026-11-10T14:00:00.000Z" },
  notAnObject: "oops",
} as const;
