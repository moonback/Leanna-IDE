import { Router, Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import { requestConfirmation } from '../utils/confirmationBridge';

export function createSelfRootRouter(getWss: () => WebSocketServer | null): Router {
  const router = Router();

  // GET /api/self-root/status
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      // SELF_ROOT est lu dynamiquement (peut avoir changé depuis le démarrage)
      const { SELF_ROOT, hasProject } = await import('../utils/selfRoot');

      if (!hasProject()) {
        return res.json({
          rootPath: null,
          locked: false,
          noProject: true,
          gitBranch: '—',
          gitStatus: 'unknown',
          lastCommit: '—',
          lastCommitDate: '—',
          aheadBehind: { ahead: 0, behind: 0 },
        });
      }

      const { execSync } = await import('child_process');
      const execOpts = { cwd: SELF_ROOT, encoding: 'utf-8' as const, timeout: 5000 };
      let gitBranch = '—';
      let gitStatus: 'clean' | 'dirty' | 'unknown' = 'unknown';
      let lastCommit = '—';
      let lastCommitDate = '—';
      let ahead = 0;
      let behind = 0;

      // Utiliser le cache git_status s'il est disponible (évite un spawn)
      try {
        const { gitStatusCache } = await import('../skills/git');
        const cached = gitStatusCache.get(SELF_ROOT);
        if (cached && cached.branch) {
          gitBranch = cached.branch;
          gitStatus = (cached.files?.length ?? 0) === 0 ? 'clean' : 'dirty';
        } else {
          try { gitBranch = execSync('git rev-parse --abbrev-ref HEAD', execOpts).trim(); } catch {}
          try {
            const statusOutput = execSync('git status --porcelain', execOpts).trim();
            gitStatus = statusOutput.length === 0 ? 'clean' : 'dirty';
          } catch {}
        }
      } catch {
        try { gitBranch = execSync('git rev-parse --abbrev-ref HEAD', execOpts).trim(); } catch {}
        try {
          const statusOutput = execSync('git status --porcelain', execOpts).trim();
          gitStatus = statusOutput.length === 0 ? 'clean' : 'dirty';
        } catch {}
      }
      try {
        lastCommit = execSync('git log -1 --pretty=format:%s', execOpts).trim();
        lastCommitDate = execSync('git log -1 --pretty=format:%cr', execOpts).trim();
      } catch {}
      try {
        const abOutput = execSync(`git rev-list --left-right --count origin/${gitBranch}...HEAD`, execOpts).trim();
        const parts = abOutput.split(/\s+/);
        if (parts.length === 2) { behind = parseInt(parts[0], 10) || 0; ahead = parseInt(parts[1], 10) || 0; }
      } catch {}
      res.json({ rootPath: SELF_ROOT, locked: true, gitBranch, gitStatus, lastCommit, lastCommitDate, aheadBehind: { ahead, behind } });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Erreur interne' });
    }
  });

  // POST /api/self-root/change
  router.post('/change', async (req: Request, res: Response) => {
    try {
      const ChangeSchema = z.object({
        path: z.string().min(1, 'Le chemin est requis.'),
        userConfirmed: z.boolean().optional(),
      });
      const parsed = ChangeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Paramètres invalides.' });
      }
      const { path: newPath, userConfirmed } = parsed.data;

      // Si la demande vient de l'UI Settings (confirmation locale déjà affichée),
      // on bypass la confirmation WS qui nécessite une session vocale active.
      let approved: boolean;
      if (userConfirmed === true) {
        console.log(`[SelfRoot] Changement pré-confirmé par l'UI : ${newPath.trim()}`);
        approved = true;
      } else {
        approved = await requestConfirmation(
          newPath.trim(), 'modify',
          (data) => {
            const wss = getWss();
            if (wss) {
              wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                  try { client.send(JSON.stringify(data)); } catch {}
                }
              });
            }
          },
          `Changement du SELF_ROOT vers : ${newPath.trim()}`
        );
      }
      if (!approved) return res.status(403).json({ error: 'Changement refusé par l\'utilisateur.' });

      const { switchSandboxProject } = await import('../utils/sandbox');

      // La transition verrouille synchroniquement les écritures, recopie le
      // sandbox, redémarre le watcher, puis seulement publie l'état READY.
      const newRoot = await switchSandboxProject(newPath.trim());
      console.log(`[Sandbox] Sandbox READY pour le nouveau projet: ${newRoot}`);

      // 3. Recharger et réindexer le Knowledge System pour le nouveau projet
      try {
        const { knowledgeGraph } = await import('../knowledge/KnowledgeGraph');
        const { projectMemory } = await import('../knowledge/ProjectMemory');
        const { projectIndexer } = await import('../knowledge/ProjectIndexer');
        knowledgeGraph.load();
        projectMemory.load();
        projectIndexer.scanAll().catch(() => {});
        console.log(`[KnowledgeGraph] Rechargement pour: ${newRoot}`);
      } catch { /* silent */ }

      res.json({ status: 'success', newRoot });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/self-root/clear — effacer le projet persisté (pour re-sélection)
  router.post('/clear', async (_req: Request, res: Response) => {
    try {
      const { resetSelfRoot } = await import('../utils/selfRoot');
      resetSelfRoot();
      // Désactiver le sandbox
      try {
        const { deactivateSandbox } = await import('../utils/sandbox');
        deactivateSandbox();
      } catch { /* silent */ }
      res.json({ status: 'success' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/self-root/new — créer un projet vierge et l'activer
  router.post('/new', async (req: Request, res: Response) => {
    try {
      const NewProjectSchema = z.object({
        path: z.string().optional(),
        name: z.string().optional(),
      }).refine(data => !!(data.path?.trim() || data.name?.trim()), {
        message: 'Un chemin ou un nom de projet est requis.',
      });
      const parsed = NewProjectSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Paramètres invalides.' });
      }
      const { path: projectPath, name } = parsed.data;

      const fsModule = await import('fs');
      const pathModule = await import('path');
      const os = await import('os');

      // Déterminer le chemin final du nouveau projet
      let finalPath: string;
      if (projectPath?.trim()) {
        finalPath = pathModule.default.resolve(projectPath.trim());
      } else {
        // Si seulement un nom est fourni, créer dans le dossier Documents de l'utilisateur
        const docsDir = pathModule.default.join(os.default.homedir(), 'Documents', 'Jarvis-Projects');
        finalPath = pathModule.default.join(docsDir, name!.trim().replace(/[^a-zA-Z0-9_\-. ]/g, '_'));
      }

      // Créer le dossier s'il n'existe pas
      if (fsModule.default.existsSync(finalPath)) {
        // Le dossier existe déjà — on l'accepte si vide ou non
        console.log(`[SelfRoot/new] Dossier existant réutilisé: ${finalPath}`);
      } else {
        fsModule.default.mkdirSync(finalPath, { recursive: true });
        console.log(`[SelfRoot/new] Dossier créé: ${finalPath}`);
      }

      // Créer un fichier README.md minimal dans le projet vierge
      const readmePath = pathModule.default.join(finalPath, 'README.md');
      if (!fsModule.default.existsSync(readmePath)) {
        const projectName = pathModule.default.basename(finalPath);
        fsModule.default.writeFileSync(
          readmePath,
          `# ${projectName}\n\nProjet créé avec Jarvis-OS.\n`,
          'utf-8'
        );
      }

      // Activer le nouveau projet (même flux que /change)
      const { switchSandboxProject } = await import('../utils/sandbox');

      const newRoot = await switchSandboxProject(finalPath);
      console.log(`[Sandbox] Sandbox READY pour le nouveau projet: ${newRoot}`);

      // Recharger le Knowledge System pour le nouveau projet (vide)
      try {
        const { knowledgeGraph } = await import('../knowledge/KnowledgeGraph');
        const { projectMemory } = await import('../knowledge/ProjectMemory');
        const { projectIndexer } = await import('../knowledge/ProjectIndexer');
        knowledgeGraph.load();
        projectMemory.load();
        projectIndexer.scanAll().catch(() => {});
      } catch { /* silent */ }

      res.json({ status: 'success', newRoot });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/self-root/scaffold — Scaffolde un projet React/Next/etc. avec logs
  // Utilise Server-Sent Events (SSE) pour streamer les logs en temps réel.
  // ─────────────────────────────────────────────────────────────────────────────
  router.post('/scaffold', async (req: Request, res: Response) => {
    type Framework = 'react-vite' | 'react-vite-js' | 'next' | 'react-router';
    interface FwConfig { bin: string; args: (n: string) => string[]; label: string; }

    const FRAMEWORKS: Record<Framework, FwConfig> = {
      'react-vite':    { bin: 'npm',  args: (n) => ['create', 'vite@latest', n, '--', '--template', 'react-ts'], label: 'React + Vite (TypeScript)' },
      'react-vite-js': { bin: 'npm',  args: (n) => ['create', 'vite@latest', n, '--', '--template', 'react'],    label: 'React + Vite (JavaScript)' },
      'next':          { bin: 'npx',  args: (n) => ['create-next-app@latest', n, '--typescript', '--eslint', '--tailwind', '--no-src-dir', '--app', '--import-alias', '@/*'], label: 'Next.js (TypeScript + App Router)' },
      'react-router':  { bin: 'npx',  args: (n) => ['create-react-router@latest', n, '--no-git-init'], label: 'React Router v7 (TypeScript)' },
    };

    const { spawn } = await import('child_process');
    const fsModule   = await import('fs');
    const pathModule = await import('path');
    const osModule   = await import('os');

    const {
      framework: rawFramework = 'react-vite',
      name: rawName,
      parent_path: rawParent,
    } = req.body as { framework?: string; name?: string; parent_path?: string };

    // ── Setup SSE ─────────────────────────────────────────────────────────────
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const sendEvent = (type: string, data: Record<string, unknown>) => {
      if (res.writableEnded) return;
      try { res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`); } catch { /* client gone */ }
    };
    const sendLog = (message: string, level: 'info' | 'warn' | 'error' = 'info') =>
      sendEvent('log', { level, message: message.trimEnd() });
    const finish = () => { try { if (!res.writableEnded) res.end(); } catch { /* ignore */ } };

    // ── Validation ────────────────────────────────────────────────────────────
    if (!rawName?.trim()) { sendEvent('error', { error: 'Le paramètre "name" est requis.' }); return finish(); }
    const projectName = rawName.trim().replace(/[^a-zA-Z0-9_\-]/g, '-').toLowerCase();

    const framework = rawFramework.trim() as Framework;
    if (!FRAMEWORKS[framework]) {
      sendEvent('error', { error: `Framework inconnu: "${framework}". Valeurs: ${Object.keys(FRAMEWORKS).join(', ')}.` });
      return finish();
    }
    const fwConfig = FRAMEWORKS[framework];

    let parentDir: string;
    if (rawParent?.trim()) {
      parentDir = pathModule.default.resolve(rawParent.trim());
    } else {
      parentDir = pathModule.default.join(osModule.default.homedir(), 'Documents', 'Jarvis-Projects');
    }

    const projectPath = pathModule.default.join(parentDir, projectName);

    if (fsModule.default.existsSync(projectPath)) {
      sendEvent('error', { error: `Le dossier "${projectName}" existe déjà dans ${parentDir}.` });
      return finish();
    }
    try {
      fsModule.default.mkdirSync(parentDir, { recursive: true });
    } catch (e: any) {
      sendEvent('error', { error: `Impossible de créer le dossier parent: ${e.message}` });
      return finish();
    }

    // ── Lancer le scaffolding ─────────────────────────────────────────────────
    // FIX: Sur Windows on utilise shell:true avec le nom de commande simple (npm/npx).
    // Ne jamais utiliser shell:false + .cmd sur Windows — spawn échoue ou crash.
    const isWin = osModule.default.platform() === 'win32';
    const args  = fwConfig.args(projectName);

    sendLog(`🚀 Scaffolding "${projectName}" avec ${fwConfig.label}…`);
    sendLog(`📁 Destination: ${projectPath}`);
    sendLog(`⚙️  Commande: ${fwConfig.bin} ${args.join(' ')}`);
    sendLog(`─────────────────────────────────────────`);

    let child: import('child_process').ChildProcess;
    try {
      child = spawn(fwConfig.bin, args, {
        cwd: parentDir,
        // FIX: shell:true est obligatoire sur Windows pour trouver npm/npx
        // (ce sont des scripts .cmd qui ne peuvent pas être exécutés directement).
        shell: isWin,
        env: {
          ...process.env,
          CI: 'true',
          npm_config_yes: 'true',
          FORCE_COLOR: '0',
          NO_COLOR: '1',
        },
      });
    } catch (spawnErr: any) {
      sendLog(`❌ Impossible de lancer ${fwConfig.bin}: ${spawnErr.message}`, 'error');
      sendEvent('error', { error: spawnErr.message });
      return finish();
    }

    let stderrBuffer = '';
    let stdoutBuf = '';
    let stderrBuf = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString('utf-8');
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop() ?? '';
      lines.forEach(l => { if (l.trim()) sendLog(l, 'info'); });
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf    += chunk.toString('utf-8');
      stderrBuffer += chunk.toString('utf-8');
      const lines = stderrBuf.split('\n');
      stderrBuf = lines.pop() ?? '';
      lines.forEach(l => { if (l.trim()) sendLog(l, 'warn'); });
    });

    child.on('error', (err) => {
      sendLog(`❌ Erreur de lancement: ${err.message}`, 'error');
      sendEvent('error', { error: err.message });
      finish();
    });

    // FIX: Le handler async DOIT être intégralement wrappé dans un try/catch.
    // Sans ça, toute erreur dans le bloc async devient une unhandled promise rejection
    // qui crash le process tsx et coupe toutes les connexions actives.
    child.on('close', (code) => {
      (async () => {
        try {
          // Vider les buffers résiduels
          if (stdoutBuf.trim()) sendLog(stdoutBuf, 'info');
          if (stderrBuf.trim()) sendLog(stderrBuf, 'warn');
          sendLog(`─────────────────────────────────────────`);

          if (code !== 0 || !fsModule.default.existsSync(projectPath)) {
            const errMsg = `Scaffolding échoué (code: ${code ?? 'inconnu'}).`;
            sendLog(`❌ ${errMsg}`, 'error');
            if (stderrBuffer.trim()) sendLog(stderrBuffer.slice(-1500), 'error');
            sendEvent('error', { error: errMsg });
            return;
          }

          sendLog(`✅ Projet créé avec succès !`);
          sendLog(`🔌 Activation du workspace…`);

          try {
            const { switchSandboxProject } = await import('../utils/sandbox');

            const newRoot = await switchSandboxProject(projectPath);
            sendLog(`📦 Sandbox READY: ${newRoot}`);

            try {
              const { knowledgeGraph } = await import('../knowledge/KnowledgeGraph');
              const { projectMemory }  = await import('../knowledge/ProjectMemory');
              const { projectIndexer } = await import('../knowledge/ProjectIndexer');
              knowledgeGraph.load();
              projectMemory.load();
              projectIndexer.scanAll().catch(() => {});
              sendLog(`🧠 Knowledge System rechargé.`);
            } catch { /* silent */ }

            sendLog(`🎉 Workspace basculé sur: ${newRoot}`);
            sendLog(`👉 Lancez maintenant : npm install && npm run dev`);
            sendEvent('done', { status: 'success', newRoot });
          } catch (activateErr: any) {
            sendLog(`⚠️  Scaffolding OK mais activation échouée: ${activateErr.message}`, 'warn');
            sendEvent('error', { error: activateErr.message });
          }
        } catch (outerErr: any) {
          // Filet de sécurité : aucune erreur ne doit sortir de ce handler async
          console.error('[SelfRoot/scaffold] Erreur inattendue dans close handler:', outerErr);
          try { sendEvent('error', { error: outerErr?.message ?? String(outerErr) }); } catch { /* ignore */ }
        } finally {
          finish();
        }
      })().catch((e) => {
        // Double filet — si même l'IIFE throw, loguer et fermer proprement
        console.error('[SelfRoot/scaffold] IIFE échoué:', e);
        finish();
      });
    });

    // FIX: Ne tuer le child que si la réponse est déjà terminée.
    // Sinon, une reconnexion HMR de Vite tuerait le scaffold en cours.
    req.on('close', () => {
      if (res.writableEnded && !child.killed) {
        child.kill();
        console.log('[SelfRoot/scaffold] Client déconnecté — process tué.');
      }
    });
  });

  return router;
}

