"use client";
import { useCallback, useSyncExternalStore } from "react";

const EVENT = "iconflow:pref";
const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }
function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = () => cb();
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, onStorage);
  return () => { listeners.delete(cb); window.removeEventListener("storage", onStorage); window.removeEventListener(EVENT, onStorage); };
}

/** Préférence locale (localStorage) lue sans décalage d'hydratation. */
export function useLocalPref(key: string, fallback: string) {
  const get = () => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
  const value = useSyncExternalStore(subscribe, get, () => fallback);
  const set = useCallback((next: string) => { try { localStorage.setItem(key, next); } catch {} emit(); }, [key]);
  return [value, set] as const;
}

/** Thème courant, synchronisé avec <html data-theme>. */
export function useTheme() {
  const get = () => (document.documentElement.dataset.theme === "light" ? "light" : "dark");
  const theme = useSyncExternalStore(subscribe, get, () => "light");
  const setTheme = useCallback((next: "dark" | "light") => {
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("iconflow-theme", next); } catch {}
    emit();
  }, []);
  return [theme as "dark" | "light", setTheme] as const;
}
