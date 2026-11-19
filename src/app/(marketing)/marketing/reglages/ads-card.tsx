"use client";
import * as React from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { setAgencyAdAccountAction, syncAgencyAdsAction } from "@/lib/actions/marketing";
import { cn } from "@/lib/utils";
import { BTN, BTN_LIGHT, Notice, Panel, Pill, SELECT } from "./kit";

export interface AdsInfo {
  demo: boolean;
  choices: Array<{ integration_id: string; label: string }>;
  current: string | null;
  account: string | null;
  lastSync: string | null;
  lastError: string | null;
}

/**
 * Administrateur : le compte Meta Ads de l'agence (reprise de l'ancienne page Publicité). On le choisit parmi les comptes
 * déjà connectés dans Studio, puis sa dépense est lue toutes les six heures ; « Synchroniser » relance la lecture tout de suite.
 * Sans compte choisi, le Tableau de bord affiche « Dépense publicitaire non connectée ».
 */
export function AdsCard({ info }: { info: AdsInfo }) {
  const { exec, pending } = useAction();
  const [value, setValue] = React.useState(info.current ?? "");
  const state = !info.current ? "aucun compte choisi" : info.lastError ? "en erreur" : info.lastSync ? "connecté" : "pas encore lu";
  const tone = !info.current || info.lastError ? "warn" : info.lastSync ? "success" : "neutral";
  const save = () => exec(() => setAgencyAdAccountAction(value || null), { success: value ? "Compte de l'agence enregistré. Première lecture lancée." : "Compte retiré." });
  const sync = () => exec(() => syncAgencyAdsAction(), { success: "Dépenses relues." });
  return (
    <Panel title={<>Publicité Meta Ads<Pill tone={tone}>{state}</Pill></>}
      description={<>Le compte publicitaire de l&apos;agence. Sa dépense est lue par campagne et par jour, toutes les six heures. Elle sert au coût par lead et au coût par rendez-vous du Tableau de bord.</>}>
      {info.demo ? (
        <Notice>Choisir un compte demande une base reliée.</Notice>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect aria-label="Compte Meta Ads de l'agence" value={value} onChange={(e) => setValue(e.target.value)} className={cn(SELECT, "w-full sm:w-80")}>
              <option value="">Aucun compte choisi</option>
              {info.choices.map((c) => <option key={c.integration_id} value={c.integration_id}>{c.label}</option>)}
            </NativeSelect>
            <Button className={BTN} loading={pending} disabled={value === (info.current ?? "")} onClick={save}>Enregistrer</Button>
            <Button variant="outline" className={BTN_LIGHT} loading={pending} disabled={!info.current} onClick={sync}><RefreshCw />Synchroniser</Button>
          </div>
          <p className="text-[14px] text-mk-text">
            {info.account ? <>Compte lu : <b className="font-semibold text-mk-strong">{info.account}</b> · </> : null}
            Dernière lecture : <b className="font-semibold text-mk-strong">{info.lastSync ?? "jamais"}</b>
            {info.lastError ? <span className="mt-0.5 block text-[13px] text-mk-warn">La dernière lecture a échoué : {info.lastError}</span> : null}
          </p>
          <p className="text-[13px] text-mk-sub">
            {info.choices.length ? "Le compte de l'agence n'est pas dans la liste ? Connecte-le d'abord" : "Aucun compte Meta n'est connecté pour l'instant. Connecte d'abord celui de l'agence"} dans
            Studio (tableau de bord, carte « Connexions Meta Ads »), sur une fiche client au nom de l&apos;agence.
          </p>
        </div>
      )}
    </Panel>
  );
}
