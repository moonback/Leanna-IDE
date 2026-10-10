/**
 * contractNetConfig — Réglages du contract-net en production
 *
 * Lecture PARESSEUSE de `process.env` (à chaque appel) : les tests, ou un
 * rechargement de configuration, peuvent donc surcharger l'environnement sans
 * redémarrer le processus.
 *
 * Variables :
 *   - LEANNA_CONTRACT_NET             off | shadow | on        (défaut: on)
 *   - CONTRACT_NET_BIDDING_WINDOW_MS  plafond de la fenêtre    (défaut: 500, 20..5000)
 *   - CONTRACT_NET_SWITCH_MARGIN      marge de préférence      (défaut: 0.10, 0..1)
 *   - CONTRACT_NET_MIN_EVIDENCE       appels min. avant note   (défaut: 3, 1..100)
 */
import { createLogger } from "../utils/logger.js";

const log = createLogger("ContractNetConfig");

/** off = routage statique ; shadow = enchère loggée sans effet ; on = gagnant utilisé. */
export type ContractNetMode = "off" | "shadow" | "on";

export interface ContractNetConfig {
  mode: ContractNetMode;
  /** Plafond de la fenêtre d'enchères (ms). La clôture anticipée la raccourcit. */
  biddingWindowMs: number;
  /** Écart de score en deçà duquel le rôle préféré garde la tâche. */
  switchMargin: number;
  /** Nombre minimal d'appels avant qu'une note par rôle soit jugée fiable. */
  minEvidence: number;
}

export const DEFAULT_CONTRACT_NET_CONFIG: Readonly<ContractNetConfig> = Object.freeze({
  mode: "on",
  biddingWindowMs: 500,
  switchMargin: 0.1,
  minEvidence: 3,
});

const MIN_WINDOW_MS = 20;
const MAX_WINDOW_MS = 5000;

/** Mémorise les valeurs invalides déjà signalées pour ne pas spammer les logs. */
const warned = new Set<string>();

function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  log.warn(message);
}

function parseNumber(
  name: string,
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    warnOnce(`${name}=${raw}`, `${name}="${raw}" invalide — valeur par défaut ${fallback} utilisée`);
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function parseMode(raw: string | undefined): ContractNetMode {
  if (raw === undefined || raw.trim() === "") return DEFAULT_CONTRACT_NET_CONFIG.mode;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "off" || normalized === "shadow" || normalized === "on") return normalized;
  warnOnce(
    `LEANNA_CONTRACT_NET=${raw}`,
    `LEANNA_CONTRACT_NET="${raw}" invalide (off|shadow|on) — mode "${DEFAULT_CONTRACT_NET_CONFIG.mode}" utilisé`
  );
  return DEFAULT_CONTRACT_NET_CONFIG.mode;
}

/** Lit la configuration courante depuis l'environnement. */
export function getContractNetConfig(env: NodeJS.ProcessEnv = process.env): ContractNetConfig {
  return {
    mode: parseMode(env.LEANNA_CONTRACT_NET),
    biddingWindowMs: Math.round(
      parseNumber(
        "CONTRACT_NET_BIDDING_WINDOW_MS",
        env.CONTRACT_NET_BIDDING_WINDOW_MS,
        DEFAULT_CONTRACT_NET_CONFIG.biddingWindowMs,
        MIN_WINDOW_MS,
        MAX_WINDOW_MS
      )
    ),
    switchMargin: parseNumber(
      "CONTRACT_NET_SWITCH_MARGIN",
      env.CONTRACT_NET_SWITCH_MARGIN,
      DEFAULT_CONTRACT_NET_CONFIG.switchMargin,
      0,
      1
    ),
    minEvidence: Math.round(
      parseNumber(
        "CONTRACT_NET_MIN_EVIDENCE",
        env.CONTRACT_NET_MIN_EVIDENCE,
        DEFAULT_CONTRACT_NET_CONFIG.minEvidence,
        1,
        100
      )
    ),
  };
}
