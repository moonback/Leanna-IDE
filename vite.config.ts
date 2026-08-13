import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import monacoEditorPlugin from 'vite-plugin-monaco-editor';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = env.VITE_SERVER_PORT || 5000;

  return {
    plugins: [
      react(),
      tailwindcss(),
      // Copie les workers Monaco en local — nécessaire sous Electron
      // (évite le chargement CDN qui échoue avec nodeIntegration: true)
      (monacoEditorPlugin as any).default({
        languageWorkers: ['editorWorkerService', 'typescript', 'json', 'css', 'html'],
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    // Expose monaco-editor depuis node_modules sous /monaco-editor
    publicDir: 'public',
    server: {
      // Important : ce projet embarque Vite en tant que middleware DANS
      // server.ts (npm run dev). Ne JAMAIS lancer `vite dev` séparément —
      // mais si c'est fait par erreur, on écoute SUR LE MÊME PORT que le
      // backend (5000), ce qui provoque une erreur "port already in use"
      // CLAIRE au lieu d'un proxy ECONNREFUSED silencieux vers 5000 vide.
      port: Number(process.env.VITE_SERVER_PORT) || 5000,
      strictPort: true,
      hmr: process.env.DISABLE_HMR === 'true' ? false : true,
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: [
          '**/.jarvis-profile.json',
          '**/.jarvis/sandbox/**',
          '**/ProjectMemory.json',
          '**/ProjectKnowledge.json',
        ],
      },
      proxy: {
        '/monaco-editor': {
          target: `http://localhost:${port}`,
          changeOrigin: true,
        },
        '/api': {
          target: `http://localhost:${port}`,
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('error', (err, req, res) => {
              // Si le backend est down (port refusé), retourner une réponse
              // JSON explicite plutôt qu'une page HTML d'erreur Vite illisible.
              if ((err as any).code === 'ECONNREFUSED' || (err as any).code === 'ECONNRESET') {
                const body = JSON.stringify({
                  error: 'Backend indisponible',
                  details: `Impossible de joindre http://localhost:${port}. Ce projet intègre Vite DANS server.ts — ne lancez PAS "vite dev" seul. Utilisez plutôt : npm run dev (ou npm run desktop pour Electron).`,
                  hint: `Le backend doit écouter sur localhost:${port} — exécutez "npm run dev" depuis la racine.`,
                });
                try {
                  if ((res as any).writeHead) {
                    (res as any).writeHead(503, {
                      'Content-Type': 'application/json',
                      'Content-Length': Buffer.byteLength(body),
                    });
                    (res as any).end(body);
                  }
                } catch { /* best-effort */ }
              }
            });
          },
        },
        '/live': {
          target: `ws://localhost:${port}`,
          ws: true,
          changeOrigin: true,
        },
        '/terminal': {
          target: `ws://localhost:${port}`,
          ws: true,
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-monaco': ['monaco-editor', '@monaco-editor/react'],
            'vendor-ui': ['lucide-react', 'motion', 'clsx', 'cva'],
            'vendor-ai': ['@google/genai', '@supabase/supabase-js'],
            'ide-core': [
              './src/components/UnifiedSidebar',
              './src/components/ide/FileExplorer',
              './src/components/ide/EditorTabs',
              './src/hooks/useFileSystem',
              './src/services/ideApi',
            ],
            'panels': [
              './src/components/panels/KnowledgeDashboard',
              './src/components/panels/SandboxPanel',
              './src/components/panels/AgentPanel',
              './src/components/panels/VisionPanel',
            ],
          },
        },
      },
      // Monaco workers sont copiés par vite-plugin-monaco-editor
      // Désactiver le warning de chunk size pour vendor-monaco (expected)
      chunkSizeWarningLimit: 1000,
    },
  };
});
