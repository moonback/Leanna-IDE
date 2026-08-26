/**
 * Routeur sandbox complet — remplace les routes inline de server.ts.
 * Inclut : status, init, activate, deactivate, verify-exit-code,
 *          validate, sync, accept-file, reject-file, discard, reset,
 *          diff, file-diff.
 * Extrait de server.ts (Sprint 1 — découpage).
 */

import { Router, Request, Response } from 'express';
import path from 'path';
import {
  activateSandbox,
  deactivateSandbox,
  discardSandbox,
  initSandbox,
  getSandboxDiff,
  getSandboxStatus,
  isSandboxActive,
  getSandboxRoot,
  validateSandbox,
  syncToMain,
  acceptFile,
  rejectFile,
  resetSandbox,
} from '../utils/sandbox';
import { startWatching, stopWatching } from '../utils/sandboxWatcher';
import { appendAuditEvent } from '../audit';
import { SELF_ROOT } from '../utils/selfRoot';

export function createSandboxRouter(): Router {
  const router = Router();

  // GET /api/sandbox/status
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      res.json({ status: 'success', sandbox: getSandboxStatus() });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/sandbox/init
  router.post('/init', async (_req: Request, res: Response) => {
    try {
      const result = await initSandbox();
      res.json({ status: 'success', ...result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/sandbox/activate
  router.post('/activate', async (_req: Request, res: Response) => {
    try {
      activateSandbox();
      startWatching();
      res.json({ status: 'success', active: true, path: getSandboxRoot() });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/verify-exit-code — vérifie le code de sécurité sans désactiver
  // NOTE: monté séparément sur /api/verify-exit-code dans server.ts
  router.post('/verify-exit-code', (req: Request, res: Response): void => {
    const { code } = req.body || {};
    const exitCode = process.env.SANDBOX_EXIT_CODE;

    if (!exitCode || exitCode.length !== 6) {
      res.status(403).json({ status: 'error', error: 'Code non configuré' });
      return;
    }
    if (!code || code !== exitCode) {
      res.status(403).json({ status: 'error', error: 'Code incorrect' });
      return;
    }
    res.json({ status: 'success' });
  });

  // POST /api/sandbox/deactivate (code de sécurité requis)
  router.post('/deactivate', async (req: Request, res: Response): Promise<void> => {
    try {
      const { code } = req.body || {};
      const exitCode = process.env.SANDBOX_EXIT_CODE;

      if (!exitCode || exitCode.length !== 6) {
        res.status(403).json({
          status: 'error',
          error: 'SANDBOX_EXIT_CODE non configuré ou invalide dans .env (6 chiffres requis)',
        });
        return;
      }
      if (!code || code !== exitCode) {
        res.status(403).json({
          status: 'error',
          error: 'Code de sécurité incorrect. 6 chiffres requis pour désactiver le sandbox.',
        });
        return;
      }

      deactivateSandbox();
      stopWatching();
      res.json({ status: 'success', active: false });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/sandbox/validate — validation TypeScript du sandbox
  router.post('/validate', async (_req: Request, res: Response): Promise<void> => {
    try {
      if (!isSandboxActive()) {
        res.status(400).json({
          status: 'error',
          error: "Sandbox inactif. Activez-le d'abord via /api/sandbox/activate.",
        });
        return;
      }
      const validation = await validateSandbox();
      res.json({
        status: validation.valid ? 'success' : 'validation_failed',
        valid: validation.valid,
        errorCount: validation.errorCount,
        warningCount: validation.warningCount,
        diagnostics: validation.diagnostics,
        errorsByFile: validation.errorsByFile,
        exitCode: validation.exitCode,
        stdout: validation.stdout,
        stderr: validation.stderr,
        signal: validation.signal,
        timedOut: validation.timedOut,
        globalDiagnostics: validation.globalDiagnostics,
        rawOutput: validation.rawOutput,
      });
    } catch (e: any) {
      res.status(500).json({ status: 'error', error: e.message || 'Erreur interne pendant la validation' });
    }
  });

  // POST /api/sandbox/sync — synchronise sandbox → repo principal
  router.post('/sync', async (_req: Request, res: Response): Promise<void> => {
    try {
      const validation = await validateSandbox();
      if (!validation.valid && validation.errorCount > 0) {
        res.json({
          status: 'validation_failed',
          valid: false,
          errorCount: validation.errorCount,
          warningCount: validation.warningCount,
          diagnostics: validation.diagnostics,
          errorsByFile: validation.errorsByFile,
          exitCode: validation.exitCode,
          stdout: validation.stdout,
          stderr: validation.stderr,
          signal: validation.signal,
          timedOut: validation.timedOut,
          globalDiagnostics: validation.globalDiagnostics,
          rawOutput: validation.rawOutput,
          errors: validation.rawOutput,
        });
        return;
      }
      const result = await syncToMain();
      res.json({ status: 'success', ...result });
    } catch (e: any) {
      res.status(500).json({ status: 'error', error: e.message });
    }
  });

  // POST /api/sandbox/accept-file — accepte un fichier (sandbox → principal)
  router.post('/accept-file', async (req: Request, res: Response): Promise<void> => {
    try {
      const filePath = req.body?.path;
      if (!filePath) {
        res.status(400).json({ error: 'path requis' });
        return;
      }
      const result = await acceptFile(filePath);
      let postValidation = null;
      if (isSandboxActive()) {
        try { postValidation = await validateSandbox(); } catch { /* ignore */ }
      }
      res.json({
        status: result.applied ? 'success' : 'not_found',
        ...result,
        postValidation: postValidation ? {
          valid: postValidation.valid,
          errorCount: postValidation.errorCount,
          warningCount: postValidation.warningCount,
          diagnostics: postValidation.diagnostics,
          errorsByFile: postValidation.errorsByFile,
          rawOutput: postValidation.rawOutput,
        } : undefined,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/sandbox/reject-file — rejette un fichier (restaure l'original)
  router.post('/reject-file', async (req: Request, res: Response): Promise<void> => {
    try {
      const filePath = req.body?.path;
      if (!filePath) {
        res.status(400).json({ error: 'path requis' });
        return;
      }
      const result = await rejectFile(filePath);
      let postValidation = null;
      if (isSandboxActive()) {
        try { postValidation = await validateSandbox(); } catch { /* ignore */ }
      }
      res.json({
        status: result.reverted ? 'success' : 'not_found',
        ...result,
        postValidation: postValidation ? {
          valid: postValidation.valid,
          errorCount: postValidation.errorCount,
          warningCount: postValidation.warningCount,
          diagnostics: postValidation.diagnostics,
          errorsByFile: postValidation.errorsByFile,
          rawOutput: postValidation.rawOutput,
        } : undefined,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/sandbox/discard — abandonne les modifications du sandbox
  router.post('/discard', async (_req: Request, res: Response) => {
    try {
      await discardSandbox();
      res.json({ status: 'success' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/sandbox/reset — réinitialise le sandbox (code de sécurité requis)
  router.post('/reset', async (req: Request, res: Response): Promise<void> => {
    try {
      const { code } = req.body || {};
      const exitCode = process.env.SANDBOX_EXIT_CODE;

      if (!exitCode || exitCode.length !== 6) {
        res.status(403).json({
          status: 'error',
          error: 'SANDBOX_EXIT_CODE non configuré ou invalide dans .env (6 chiffres requis)',
        });
        return;
      }
      if (!code || code !== exitCode) {
        res.status(403).json({
          status: 'error',
          error: 'Code de sécurité incorrect. 6 chiffres requis pour réinitialiser le sandbox.',
        });
        return;
      }

      const result = await resetSandbox();
      await appendAuditEvent({
        action: 'sandbox.reset',
        target: 'sandbox',
        details: JSON.stringify({ filesCopied: result.filesCopied }),
      });
      res.json({ status: 'success', ...result });
    } catch (e: any) {
      await appendAuditEvent({
        action: 'sandbox.reset',
        target: 'sandbox',
        details: JSON.stringify({ error: e.message }),
      });
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/sandbox/diff — diff entre sandbox et principal
  router.get('/diff', async (_req: Request, res: Response) => {
    try {
      const diffs = await getSandboxDiff();
      res.json({ status: 'success', diffs });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/sandbox/file-diff?path=relative/path — contenu avant/après pour un fichier
  router.get('/file-diff', async (req: Request, res: Response): Promise<void> => {
    try {
      const filePath = typeof req.query.path === 'string' ? req.query.path : '';
      if (!filePath) {
        res.status(400).json({ error: 'path requis' });
        return;
      }

      // Fichiers binaires — pas de diff texte possible
      const ext = filePath.split('.').pop()?.toLowerCase() || '';
      const binaryExts = new Set([
        'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'pdf',
        'woff', 'woff2', 'ttf', 'otf', 'eot', 'mp3', 'mp4', 'wav',
        'ogg', 'zip', 'tar', 'gz',
      ]);
      if (binaryExts.has(ext)) {
        res.json({
          status: 'success',
          path: filePath,
          binary: true,
          original: null,
          modified: '[Fichier binaire — aperçu non disponible]',
        });
        return;
      }

      const sandboxFile = path.join(getSandboxRoot(), filePath);
      const mainFile = path.join(SELF_ROOT, filePath);

      let sandboxContent: string | null = null;
      let mainContent: string | null = null;

      try { sandboxContent = await import('fs').then(fs => fs.promises.readFile(sandboxFile, 'utf-8')); } catch { /* n'existe pas */ }
      try { mainContent = await import('fs').then(fs => fs.promises.readFile(mainFile, 'utf-8')); } catch { /* n'existe pas */ }

      res.json({
        status: 'success',
        path: filePath,
        original: mainContent,
        modified: sandboxContent,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

export function createVerifyExitCodeRouter(): Router {
  const router = Router();
  router.post('/verify-exit-code', (req: Request, res: Response): void => {
    const { code } = req.body || {};
    const exitCode = process.env.SANDBOX_EXIT_CODE;

    if (!exitCode || exitCode.length !== 6) {
      res.status(403).json({ status: 'error', error: 'Code non configuré' });
      return;
    }
    if (!code || code !== exitCode) {
      res.status(403).json({ status: 'error', error: 'Code incorrect' });
      return;
    }
    res.json({ status: 'success' });
  });
  return router;
}