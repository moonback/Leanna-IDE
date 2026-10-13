import { describe, it, expect } from 'vitest';
import { buildHomeInsights } from './homeInsights.js';

const at = (h: number) => new Date(2026, 9, 13, h, 0, 0);

describe('buildHomeInsights', () => {
  it('priorise la revue des modifications git non commitées', () => {
    const out = buildHomeInsights({ now: at(14), changedFiles: 3, branch: 'main', recentFiles: [], workspaceName: 'app' });
    expect(out[0].id).toBe('git-review');
    expect(out[0].title).toBe('3 fichiers modifiés à relire');
    expect(out[0].prompt).toContain('main');
  });

  it('propose de reprendre le dernier fichier récent seulement s\'il date de moins de 3 jours', () => {
    const now = at(14);
    const fresh = buildHomeInsights({ now, changedFiles: null, recentFiles: [{ path: 'src/a/b.ts', openedAt: now.getTime() - 3600_000 }] });
    expect(fresh.some(i => i.id === 'resume-file' && i.title.includes('b.ts'))).toBe(true);

    const stale = buildHomeInsights({ now, changedFiles: null, recentFiles: [{ path: 'src/a/b.ts', openedAt: now.getTime() - 5 * 86_400_000 }] });
    expect(stale.some(i => i.id === 'resume-file')).toBe(false);
  });

  it('adapte le rituel au moment de la journée', () => {
    const base = { changedFiles: 0, recentFiles: [], workspaceName: 'app' };
    expect(buildHomeInsights({ ...base, now: at(9) }).map(i => i.id)).toContain('plan-day');
    expect(buildHomeInsights({ ...base, now: at(19) }).map(i => i.id)).toContain('recap-day');
    expect(buildHomeInsights({ ...base, now: at(14) }).map(i => i.id)).toContain('audit');
  });

  it('ne renvoie jamais plus de 3 suggestions', () => {
    const now = at(9);
    const out = buildHomeInsights({ now, changedFiles: 40, branch: 'dev', recentFiles: [{ path: 'x.ts', openedAt: now.getTime() }], workspaceName: 'app' });
    expect(out.length).toBeLessThanOrEqual(3);
    expect(out[0].title).toContain("s'accumulent");
  });
});
