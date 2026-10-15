import { describe, it, expect } from 'vitest';
import { buildHomeInsights } from './homeInsights.js';

const at = (h: number) => new Date(2026, 9, 13, h, 0, 0);

describe('buildHomeInsights', () => {
  it('priorise la revue des modifications git non commitées', () => {
    const out = buildHomeInsights({ now: at(14), changedFiles: 3, branch: 'main', workspaceName: 'app' });
    expect(out[0].id).toBe('git-review');
    expect(out[0].title).toBe('3 fichiers modifiés à relire');
    expect(out[0].prompt).toContain('main');
  });


  it('adapte le rituel au moment de la journée', () => {
    const base = { changedFiles: 0, workspaceName: 'app' };
    expect(buildHomeInsights({ ...base, now: at(9) }).map(i => i.id)).toContain('plan-day');
    expect(buildHomeInsights({ ...base, now: at(19) }).map(i => i.id)).toContain('recap-day');
    expect(buildHomeInsights({ ...base, now: at(14) }).map(i => i.id)).toContain('audit');
  });

  it('ne renvoie jamais plus de 3 suggestions', () => {
    const now = at(9);
    const out = buildHomeInsights({ now, changedFiles: 40, branch: 'dev', workspaceName: 'app' });
    expect(out.length).toBeLessThanOrEqual(3);
    expect(out[0].title).toContain("s'accumulent");
  });
});
