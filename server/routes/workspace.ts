import { Router, Request, Response } from 'express';
import { existsSync } from 'node:fs';
import { isSandboxActive, getSandboxRoot } from '../utils/sandbox';
import { SELF_ROOT } from '../utils/selfRoot';

export function createWorkspaceRouter(getWorkspaceRoot: () => string): Router {
  const router = Router();

  router.get('/workspace', (_req: Request, res: Response) => {
    const root = getWorkspaceRoot();
    const exists = existsSync(root);
    res.json({ workspace: root, exists, selfReferential: true, sandbox: isSandboxActive() });
  });

  return router;
}
