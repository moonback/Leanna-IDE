import { useEffect, useState } from 'react';
import type { MissionActivity, MissionEventLog } from './activity.js';

const MISSION_LOG_MAX = 12;

/**
 * Agrège les événements `Leanna-mission-event` en un état de missions enrichi
 * (confiance, objectif courant, compteurs, journal des derniers événements).
 */
export function useMissionActivity(): MissionActivity[] {
  const [missions, setMissions] = useState<MissionActivity[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!d || d.type !== 'mission_event') return;
      const now = Date.now();
      const pushLog = (m: MissionActivity, label: string, confidence?: number): MissionEventLog[] =>
        [...m.log, { at: now, event: d.event, label, confidence }].slice(-MISSION_LOG_MAX);

      setMissions(prev => {
        const existing = prev.find(m => m.missionId === d.missionId);
        switch (d.event) {
          case 'mission_started':
            if (existing) return prev;
            return [...prev, {
              missionId: d.missionId, title: d.title ?? 'Mission', status: 'in_progress', confidence: 0.5,
              startedAt: now, updatedAt: now, goalsCompleted: 0, actionsCompleted: 0,
              log: [{ at: now, event: d.event, label: 'Mission démarrée' }],
            }];
          case 'goal_started':
            return prev.map(m => m.missionId === d.missionId ? {
              ...m, currentGoal: d.goalTitle ?? d.goalId, updatedAt: now,
              log: pushLog(m, `Objectif : ${d.goalTitle ?? d.goalId}`),
            } : m);
          case 'goal_completed':
            return prev.map(m => m.missionId === d.missionId ? {
              ...m, goalsCompleted: m.goalsCompleted + 1, updatedAt: now,
              log: pushLog(m, `Objectif terminé : ${d.goalTitle ?? d.goalId ?? ''}`.trim()),
            } : m);
          case 'action_completed':
            return prev.map(m => m.missionId === d.missionId ? {
              ...m,
              confidence: d.confidence ?? m.confidence,
              lastAction: d.skill,
              actionsCompleted: m.actionsCompleted + 1,
              updatedAt: now,
              log: pushLog(m, d.skill ? `Action : ${d.skill}` : 'Action terminée', d.confidence),
            } : m);
          case 'mission_completed':
          case 'mission_cancelled':
          case 'mission_failed':
            return prev.map(m => m.missionId === d.missionId ? {
              ...m, status: d.success ? 'completed' : 'failed', updatedAt: now,
              log: pushLog(m, d.success ? 'Mission terminée' : 'Mission interrompue'),
            } : m);
          default:
            return prev;
        }
      });
    };
    window.addEventListener('Leanna-mission-event', handler);
    return () => window.removeEventListener('Leanna-mission-event', handler);
  }, []);

  return missions;
}
