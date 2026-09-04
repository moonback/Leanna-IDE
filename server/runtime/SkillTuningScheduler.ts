import type { SkillTuningStore } from "./SkillTraceStore.js";
import { generateSkillTuningProposals } from "./SkillTuning.js";

export interface SkillTuningScheduler {
  start(): void;
  stop(): void;
  runNow(): Promise<void>;
}

export function createSkillTuningScheduler(
  store: SkillTuningStore | undefined,
  intervalMs: number,
): SkillTuningScheduler {
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;

  async function runNow(): Promise<void> {
    if (!store || running) return;
    running = true;
    try {
      const proposals = await generateSkillTuningProposals(store);
      if (proposals.length > 0) {
        console.log(`[SkillTuning] ${proposals.length} proposition(s) generee(s) automatiquement.`);
      }
    } catch (error) {
      console.warn("[SkillTuning] Analyse periodique echouee:", error);
    } finally {
      running = false;
    }
  }

  return {
    start(): void {
      if (!store || timer || !Number.isFinite(intervalMs) || intervalMs <= 0) return;
      timer = setInterval(() => { void runNow(); }, intervalMs);
      void runNow();
    },
    stop(): void {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
    runNow,
  };
}
