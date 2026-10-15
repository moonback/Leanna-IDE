import { Router, Request, Response } from 'express';
import os from 'os';

/**
 * GET /api/system/metrics — métriques machine légères pour le shell v3
 * (jauges « Ressources » du rail droit).
 *
 * CPU : pourcentage d'occupation moyen de tous les cœurs entre deux appels
 * (os.loadavg() renvoie toujours 0 sous Windows, d'où le calcul par delta
 * des compteurs os.cpus()). Le premier appel mesure depuis le chargement du
 * module.
 */

interface CpuSample { idle: number; total: number }

function sampleCpu(): CpuSample {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    const t = cpu.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.irq + t.idle;
  }
  return { idle, total };
}

/** Occupation CPU en % entre deux échantillons (bornée à [0, 100]). */
export function cpuPercent(prev: CpuSample, next: CpuSample): number {
  const total = next.total - prev.total;
  const idle = next.idle - prev.idle;
  if (total <= 0) return 0;
  const pct = (1 - idle / total) * 100;
  return Math.round(Math.min(100, Math.max(0, pct)) * 10) / 10;
}

let lastSample = sampleCpu();

const router = Router();

router.get('/metrics', (_req: Request, res: Response) => {
  const next = sampleCpu();
  const cpu = cpuPercent(lastSample, next);
  lastSample = next;

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  res.json({
    cpu: { percent: cpu, cores: os.cpus().length },
    memory: {
      totalMB: Math.round(totalMem / 1024 / 1024),
      usedMB: Math.round(usedMem / 1024 / 1024),
      percent: totalMem > 0 ? Math.round((usedMem / totalMem) * 1000) / 10 : 0,
    },
    process: {
      rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
      uptimeSeconds: Math.round(process.uptime()),
    },
    queriedAt: new Date().toISOString(),
  });
});

export default router;
