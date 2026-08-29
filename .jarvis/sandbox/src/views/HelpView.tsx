import {
  BrainCircuit, Camera, CircleHelp, Code2, Command, Cpu, Globe,
  Keyboard, Layers3, List, Lock, Mic, Monitor, Search, Settings,
  Shield, Terminal, Upload, Zap,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { ViewHeader } from '../components/ui/ViewHeader';

function Card({ icon: Icon, title, children }: { icon: typeof Cpu; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}>
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--accent-subtle)' }}>
          <Icon className="h-3.5 w-3.5" style={{ color: 'var(--accent-primary)' }} />
        </span>
        <h2 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
      </div>
      <div className="flex-1 text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        {children}
      </div>
    </section>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-block rounded border px-1.5 py-0.5 font-mono text-[10px]" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' }}>
      {children}
    </kbd>
  );
}

export default function HelpView() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      <ViewHeader
        icon={CircleHelp}
        title="Centre d'aide"
        badge="Documentation complète"
        description="Tout ce qu'il faut savoir pour utiliser Jarvis OS efficacement"
      />

      <main className="custom-scrollbar flex-1 overflow-y-auto p-5 lg:p-7">
        <div className="mx-auto max-w-6xl grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">

          {/* Démarrage rapide */}
          <Card icon={Cpu} title="Démarrage rapide">
            <ol className="list-decimal list-inside space-y-1.5">
              <li>Cliquez sur l'orbe central pour connecter Jarvis.</li>
              <li>Parlez naturellement — Jarvis vous écoute et répond par la voix.</li>
              <li>Utilisez la barre de contrôle pour activer la vision ou le partage d'écran.</li>
              <li>Explorez la sidebar pour accéder à l'éditeur, les tâches, la mémoire et les snippets.</li>
            </ol>
            <p className="mt-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>Astuce : glissez-déposez un fichier PDF, image ou texte directement sur l'interface pour que Jarvis l'analyse.</p>
          </Card>

          {/* Interaction vocale */}
          <Card icon={Mic} title="Interaction vocale">
            <ul className="list-disc list-inside space-y-1">
              <li>La connexion audio se fait via <Kbd>Espace</Kbd> ou en cliquant sur l'orbe.</li>
              <li>Jarvis utilise Gemini Live pour une conversation bidirectionnelle en temps réel.</li>
              <li>Vous pouvez changer la voix de Jarvis dans les paramètres (Aoede, Charon, Fenrir, Kore, Puck).</li>
              <li>L'orbe pulse en bleu quand Jarvis vous écoute, et en violet quand il répond.</li>
            </ul>
          </Card>

          {/* Raccourcis clavier */}
          <Card icon={Keyboard} title="Raccourcis clavier">
            <div className="space-y-1">
              <p><Kbd>Espace</Kbd> Connecter / Déconnecter audio</p>
              <p><Kbd>V</Kbd> Activer / Désactiver la vision (caméra)</p>
              <p><Kbd>P</Kbd> Partage d'écran</p>
              <p><Kbd>S</Kbd> Panneau des compétences</p>
              <p><Kbd>M</Kbd> Panneau mémoire</p>
              <p><Kbd>L</Kbd> Logs système</p>
              <p><Kbd>Escape</Kbd> Fermer tous les panneaux</p>
              <p className="mt-2 font-semibold" style={{ color: 'var(--text-primary)' }}>IDE :</p>
              <p><Kbd>Ctrl+P</Kbd> Palette de fichiers</p>
              <p><Kbd>Ctrl+Shift+P</Kbd> Palette de commandes</p>
              <p><Kbd>Ctrl+Shift+F</Kbd> Recherche globale</p>
              <p><Kbd>Ctrl+S</Kbd> Sauvegarder le fichier</p>
              <p><Kbd>Ctrl+/</Kbd> Commenter / Décommenter</p>
              <p><Kbd>F12</Kbd> Aller à la définition</p>
            </div>
          </Card>

          {/* Compétences de Jarvis */}
          <Card icon={Layers3} title="Compétences de Jarvis (Skills)">
            <p className="mb-2">Jarvis dispose de 9 compétences activables :</p>
            <ul className="space-y-1">
              <li><strong>Heure & Date</strong> — connaître l'heure et la date actuelles.</li>
              <li><strong>Météo</strong> — température et conditions par ville.</li>
              <li><strong>GitHub</strong> — informations publiques d'un profil GitHub.</li>
              <li><strong>Mémoire</strong> — sauvegarde et recherche sémantique d'informations.</li>
              <li><strong>Listes / Snippets</strong> — créer et gérer vos collections de code.</li>
              <li><strong>Système</strong> — ouvrir des apps, notifications, infos système, commandes.</li>
              <li><strong>Automatisation</strong> — navigation web, tâches planifiées, extraction.</li>
              <li><strong>Raisonnement</strong> — analyse complexe déléguée à Gemini 2.5 Pro.</li>
              <li><strong>Codebase</strong> — lire, écrire, modifier des fichiers du projet.</li>
            </ul>
          </Card>

          {/* IDE intégré */}
          <Card icon={Code2} title="Éditeur de code (IDE)">
            <ul className="list-disc list-inside space-y-1">
              <li>Éditeur Monaco (même moteur que VS Code) avec coloration syntaxique.</li>
              <li>Explorateur de fichiers avec création, renommage et suppression.</li>
              <li>Recherche globale dans le workspace avec regex.</li>
              <li>Terminal intégré (shell PTY réel).</li>
              <li>Panneau de prévisualisation live (lancez npm run dev).</li>
              <li>Palette de commandes et palette de fichiers.</li>
              <li>Jarvis peut modifier vos fichiers directement via ses compétences codebase.</li>
            </ul>
          </Card>

          {/* Vision et partage d'écran */}
          <Card icon={Camera} title="Vision & Partage d'écran">
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Vision</strong> <Kbd>V</Kbd> : active la caméra. Jarvis voit ce que vous lui montrez et peut commenter en temps réel.</li>
              <li><strong>Partage d'écran</strong> <Kbd>P</Kbd> : partage votre écran. Idéal pour du débogage visuel.</li>
              <li>Les frames sont envoyées à Gemini qui les analyse contextuellement.</li>
            </ul>
          </Card>

          {/* Mémoire */}
          <Card icon={BrainCircuit} title="Système de mémoire">
            <ul className="list-disc list-inside space-y-1">
              <li>Jarvis se souvient automatiquement des informations importantes que vous partagez.</li>
              <li>Recherche sémantique : retrouvez des souvenirs par sens, pas seulement par mots-clés.</li>
              <li>Les souvenirs similaires sont fusionnés automatiquement (seuil 80%).</li>
              <li>Gérez vos souvenirs depuis la page Mémoire (rechercher, supprimer).</li>
              <li>Requiert Supabase + Gemini Embeddings pour la persistance.</li>
            </ul>
          </Card>

          {/* Automatisation */}
          <Card icon={Zap} title="Automatisation & Tâches planifiées">
            <ul className="list-disc list-inside space-y-1">
              <li>Demandez à Jarvis de planifier des tâches récurrentes (ex : "rappelle-moi chaque jour à 9h").</li>
              <li>Automatisation web : Jarvis peut naviguer, cliquer, remplir des formulaires et extraire des données.</li>
              <li>Gérez les tâches depuis la page Automatisation : pause, reprise, exécution immédiate, suppression.</li>
              <li>Les tâches sont persistées dans Supabase et rechargées au redémarrage.</li>
            </ul>
          </Card>

          {/* Snippets */}
          <Card icon={List} title="Snippets / Listes">
            <ul className="list-disc list-inside space-y-1">
              <li>Sauvegardez des blocs de code réutilisables dans votre bibliothèque personnelle.</li>
              <li>Créez, recherchez et supprimez des snippets depuis l'interface dédiée.</li>
              <li>Jarvis peut aussi créer des snippets vocalement ("sauvegarde ce code dans mes snippets").</li>
              <li>Stockage persistant via Supabase.</li>
            </ul>
          </Card>

          {/* Upload de documents */}
          <Card icon={Upload} title="Analyse de documents">
            <ul className="list-disc list-inside space-y-1">
              <li>Glissez-déposez un fichier sur l'interface principale pour l'analyser.</li>
              <li>Formats supportés : PDF, JPEG, PNG, WebP, TXT, Markdown.</li>
              <li>Taille maximale : 10 Mo.</li>
              <li>Gemini extrait les informations clés et les résume.</li>
              <li>Limite : 10 uploads par minute.</li>
            </ul>
          </Card>

          {/* Paramètres */}
          <Card icon={Settings} title="Paramètres & Personnalisation">
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Profil</strong> : nom, rôle (contexte donné à l'IA).</li>
              <li><strong>Identité IA</strong> : nom de l'assistant, choix de voix.</li>
              <li><strong>Langue</strong> : français, anglais, espagnol, allemand, portugais.</li>
              <li><strong>Style de réponse</strong> : concis, équilibré ou détaillé.</li>
              <li><strong>Thème</strong> : sombre ou clair.</li>
              <li><strong>Couleur d'accent</strong> : 5 couleurs disponibles.</li>
              <li><strong>Workspace</strong> : dossier de travail pour l'IDE et les commandes système.</li>
            </ul>
          </Card>

          {/* Sécurité */}
          <Card icon={Shield} title="Sécurité & Confidentialité">
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Token d'accès</strong> : protégez l'accès à Jarvis via un token dans le .env.</li>
              <li><strong>Sandbox fichiers</strong> : impossible d'accéder à des fichiers hors du workspace configuré.</li>
              <li><strong>Commandes restreintes</strong> : seules les commandes dir, ls et npm sont autorisées.</li>
              <li><strong>Rate limiting</strong> : 120 req/min pour l'IDE, 10/min pour les uploads.</li>
              <li><strong>URL bloquées</strong> : pas d'accès file://, javascript:, ou métadonnées cloud.</li>
              <li><strong>Validation des entrées</strong> : tous les paramètres sont validés via Zod.</li>
            </ul>
          </Card>

          {/* Audit */}
          <Card icon={Lock} title="Journal d'audit">
            <ul className="list-disc list-inside space-y-1">
              <li>Toutes les opérations sur les fichiers (écriture, création, suppression, renommage) sont tracées.</li>
              <li>Le journal est consultable dans les paramètres ou via l'API.</li>
              <li>Rapport de santé système : CPU, RAM, uptime, état des clés API, skills actifs.</li>
              <li>Fichier local : .jarvis-audit.log (JSON lignes).</li>
            </ul>
          </Card>

          {/* Terminal */}
          <Card icon={Terminal} title="Terminal intégré">
            <ul className="list-disc list-inside space-y-1">
              <li>Shell PTY réel dans l'IDE (PowerShell sur Windows, bash/zsh sur Linux/Mac).</li>
              <li>Connecté via WebSocket pour une latence minimale.</li>
              <li>Supporte les couleurs, les curseurs et les applications interactives.</li>
              <li>Plusieurs terminaux peuvent être ouverts simultanément.</li>
            </ul>
          </Card>

          {/* Commandes système */}
          <Card icon={Monitor} title="Commandes système">
            <ul className="list-disc list-inside space-y-1">
              <li>Jarvis peut ouvrir des applications et fichiers sur votre machine.</li>
              <li>Envoyer des notifications système natives.</li>
              <li>Récupérer les infos système (CPU, RAM, OS, uptime).</li>
              <li>Exécuter des commandes npm dans votre projet (install, build, test, etc.).</li>
            </ul>
          </Card>

          {/* Recherche & Navigation web */}
          <Card icon={Globe} title="Navigation web & Extraction">
            <ul className="list-disc list-inside space-y-1">
              <li>Jarvis peut naviguer sur le web via un navigateur headless (Puppeteer).</li>
              <li>Remplir des formulaires, cliquer sur des boutons, extraire du contenu.</li>
              <li>Rechercher sur Google et YouTube depuis une commande vocale.</li>
              <li>Prendre des captures d'écran (snapshots) des pages visitées.</li>
              <li>Les tâches web peuvent être planifiées (ex : "vérifie ce site chaque heure").</li>
            </ul>
          </Card>

          {/* Recherche dans le code */}
          <Card icon={Search} title="Recherche dans le code">
            <ul className="list-disc list-inside space-y-1">
              <li>Recherche full-text dans tout le workspace (IDE ou API).</li>
              <li>Support regex et filtre par extension de fichier.</li>
              <li>Prévisualisation du contexte autour des résultats.</li>
              <li>Demandez à Jarvis : "où est utilisée la fonction handleConnect ?" et il cherchera pour vous.</li>
            </ul>
          </Card>

          {/* Palette de commandes */}
          <Card icon={Command} title="Palette de commandes (IDE)">
            <ul className="list-disc list-inside space-y-1">
              <li><Kbd>Ctrl+P</Kbd> : ouvrir un fichier rapidement par nom.</li>
              <li><Kbd>Ctrl+Shift+P</Kbd> : accéder aux commandes (formatage, thème, minimap, etc.).</li>
              <li>Recherche fuzzy sur tous les fichiers du workspace.</li>
              <li>Accès rapide aux paramètres de l'éditeur.</li>
            </ul>
          </Card>

        </div>

        <footer className="mt-10 border-t pt-5 text-center text-[10px]" style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}>
          Jarvis OS v0.1.0 · Développé par Maysson · Alimenté par Gemini & Supabase · © 2026
        </footer>
      </main>
    </div>
  );
}
