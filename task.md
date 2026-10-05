J'ai analysé les 17 composants (≈12 300 lignes de TSX) et `audit.md`. Cet audit est statique : j'ai mesuré le code et lu ses zones sensibles, mais je n'ai ni profilé ni exécuté l'application. Les points marqués « à vérifier » demandent donc une mesure.

`audit.md` porte sur le backend Leanna (runtime agentique), pas sur l'UI. Son diagnostic est le même que le mien ici : trop de moteurs parallèles et pas de chemin d'exécution canonique. Côté front, `NotebookChat`, `GeneratePanel`, `AudioOverviewPanel` et `SourcePanel` ont chacun leur propre boucle de streaming.

## 1. Diagnostic

### Structure : le point faible principal

| Fichier | Lignes | `useState` | `fetch` | Inline styles |
|---|---|---|---|---|
| NotebookChat | 2 629 | 33 | 18 | 133 |
| GeneratePanel | 2 217 | 25 | 5 | 173 |
| SourcePanel | 1 406 | 24 | 12 | 93 |
| GitHubRepositoryImportModal | 1 401 | 32 | 9 | 2 |
| AudioOverviewPanel | 875 | 15 | 5 | 50 |

- **Composants monolithiques.** Cinq fichiers pèsent 8 500 lignes, soit 70 % du module. Chacun mélange UI, appels réseau, streaming et état.
- **Aucune couche API.** Il y a une cinquantaine de `fetch(` directs dans les composants.
- **Code dupliqué :**
  - `json().catch(() => ({ error: 'Erreur' }))` apparaît 12 fois.
  - 7 lecteurs de flux (`getReader`) ont chacun leur parsing SSE.
  - `timeAgo` existe en 3 copies, et les constantes `SPRING_*` sont redéfinies par fichier.
- **Typage faible.** Il y a environ 55 `any`, dont `NotebookData.sources: any[]`, `notes: any[]` et `chatHistory: any[]`.
- **Fichier mort.** `ImportToNotebookExample.tsx` est un exemple laissé dans le code de production.

### Bugs et incohérences

1. **`GeneratePanel`, lignes 833-845 :** `setGenerationQueue` est appelé dans l'updater de `setGenerationProgresses`. Un updater doit être pur. En StrictMode il s'exécute deux fois, et l'intervalle de 500 ms met à jour deux états dans un composant de 2 200 lignes.
2. **Authentification incohérente.** Seul `handleImportToWorkspace` envoie `x-Leanna-token` (lu dans `localStorage`). Les autres `fetch` ne l'envoient pas. Selon l'auth réelle, cela donne soit des 401, soit un token stocké de façon exposable au XSS.
3. **`NotebookChat`, lignes 1113 et 1129 :** `setTimeout(() => handleSend(...), 50)` est un contournement de closure périmée.
4. **`AudioOverviewPanel` :**
   - `handleRegenerate` supprime l'ancien overview avant de savoir si la nouvelle génération réussit. En cas d'échec, l'utilisateur perd les deux.
   - Une erreur de suppression est seulement loguée.
   - `onClose` est déclaré dans les props mais jamais utilisé.
   - L'en-tête annonce un téléchargement `.md`, alors que seule la sauvegarde en sandbox existe.
   - La lecture TTS rappelle l'API à chaque lecture, sans cache.
5. **`MermaidDiagram` :** le commentaire dit « gère le thème clair/sombre », mais le code force `theme: 'dark'`.
6. **Synchronisation entre onglets via `localStorage`** dans `NotebookChat` (lignes 375-470). C'est le symptôme d'une génération qui vit côté client alors qu'elle devrait être un job serveur.

### Performance

- **Streaming.** Chaque chunk fait un `setStreamingText` dans un composant de 2 600 lignes. L'état de génération est aussi sérialisé en `localStorage` par un effet, probablement à chaque chunk (à vérifier au Profiler).
- **Mémoïsation quasi absente.** On compte 23 `useMemo`, et `React.memo` n'est utilisé que dans Mermaid. `messages.map` rend des éléments inline, donc tout l'historique est re-rendu à chaque token.
- **Aucune virtualisation.** Messages, sources, notes et arborescence de fichiers GitHub (jusqu'à des milliers d'entrées) sont rendus en entier.
- **Pas de découpage du bundle.** `mermaid` et `marked` sont importés statiquement, et `NotebookDetail` importe tous les panneaux d'un coup.
- **Animations.** Environ 200 usages de `motion.*`, souvent par item de liste.
- **Timers sans nettoyage** visibles dans `SourcePanel` (l. 189) et `GeneratePanel`. L'annulation des `fetch` à l'unmount n'est visible que pour le TTS (à vérifier).

### Design et accessibilité

- **Styles.** Environ 740 `style={{…}}` coexistent avec Tailwind et `notebooklm.css`, donc trois systèmes de style. La plupart ne servent qu'à lire des variables CSS (`var(--text-primary)`).
- **Modales.** Seulement 8 occurrences de `role="dialog"` ou `aria-modal` pour au moins 5 modales. Escape n'est géré que dans 2 fichiers, et je n'ai pas vu de focus trap.
- **Boutons.** Il y a plus de 160 `<button>` pour environ 50 attributs `aria-*` ou `role`. Les boutons-icônes sont probablement sans nom accessible (à confirmer avec axe).
- **Responsive.** `NotebookDetail` utilise des rails `hidden md:flex` et `hidden lg:flex`. Le comportement mobile est à tester.
- **i18n.** Toutes les chaînes sont codées en dur en français.

### Points forts à conserver

- Le HTML injecté passe par `sanitizeMarkdownHtml`, et Mermaid est en `securityLevel: 'strict'`.
- L'iframe de `SourceViewer` est en `sandbox` sans `allow-scripts`.
- `useReducedMotion` est respecté.
- L'architecture 3 colonnes (sources, chat, studio) est claire.

## 2. Plan d'action

### Phase 0 : filet de sécurité (jours 1-3)

- Mesurer l'état initial : `vite-bundle-visualizer`, React Profiler sur un chat de 200 messages en streaming, Lighthouse et axe.
- Ajouter des règles ESLint : `react-hooks/exhaustive-deps`, `no-explicit-any`, `jsx-a11y`, `max-lines` à 400.
- Écrire des tests de caractérisation sur les flux critiques (envoi de message, génération, import de source) avant tout découpage.

**Quick wins du même sprint :**
- Corriger le setState imbriqué de `GeneratePanel`.
- Rendre `handleRegenerate` atomique : générer d'abord, supprimer ensuite.
- Faire suivre le thème à Mermaid.
- Supprimer `ImportToNotebookExample.tsx`.
- Centraliser `timeAgo` et `SPRING_*` dans `notebooks/utils.ts` et `notebooks/motion.ts`.

### Phase 1 : couche données (semaine 1-2)

```ts
// notebooks/api/client.ts
export async function api<T>(path: string, init?: RequestInit & { signal?: AbortSignal }): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers } });
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  return res.json();
}
```

- Un `streamRequest()` / hook `useSSE` unique remplace les 7 lecteurs de flux. Il gère l'abort, le parsing, les erreurs et la reconnexion.
- Les données (notebook, sources, notes) passent par TanStack Query, avec cache, invalidation et mises à jour optimistes. Cela supprime les `onRefresh` en cascade.
- Des types partagés avec le backend (zod ou OpenAPI) éliminent les `any`.

### Phase 2 : découpage des composants (semaines 2-4)

Cible : aucun fichier au-dessus de 400 lignes, avec la logique dans des hooks et le rendu dans des composants purs.

- **NotebookChat** devient `ChatContainer`, `MessageList` (virtualisé), `MessageItem` (`memo`), `Composer`, `useChatStream` et `useChatHistory`.
- **GeneratePanel** devient `DocTypePicker`, `GenerationQueue`, `GenerationCard`, un store de file de tâches (`useReducer` ou zustand) et `useGenerationTask`.
- **SourcePanel** devient `SourceList`, `UploadZone`, `UploadQueue` et `useSourceUpload`.
- **GitHubRepositoryImportModal** devient un assistant en 3 étapes (repo, filtres, import), avec un arbre de fichiers virtualisé.
- **AudioOverviewPanel** sépare `AudioGenerator` et `AudioPlayer`, avec un hook `useTtsPlayer` testable isolément.

Procédez fichier par fichier, avec des PR de moins de 500 lignes et les tests de la phase 0 qui restent verts.

### Phase 3 : performance (semaines 3-5)

- **Streaming.** Regrouper les chunks par `requestAnimationFrame` ou `useDeferredValue`. N'écrire dans `localStorage` qu'à la fin de la génération, ou en debounce.
- **Rendu.** Utiliser `React.memo` sur les items, des clés stables au lieu de `key={index}` (14 occurrences) et `react-virtuoso` pour les listes.
- **Chargement.** Mettre en `React.lazy` : `mermaid` (import dynamique au premier diagramme), `marked`, `GeneratePanel`, `AudioOverviewPanel`, `SlidePreviewModal` et `GitHubRepositoryImportModal`.
- **Animations.** N'animer que `transform` et `opacity`, supprimer les animations par item sur les longues listes et factoriser dans un wrapper unique.
- **Nettoyage.** Ajouter un cleanup systématique des `setTimeout` et un `AbortController` à l'unmount.

**Objectifs :** bundle initial réduit d'au moins 30-40 %, INP inférieur à 200 ms pendant le streaming, un seul sous-arbre re-rendu par chunk.

### Phase 4 : design system (semaines 4-6)

- Définir des tokens (couleurs, espacements, rayons, ombres) dans une source unique, et migrer les ~740 inline styles vers des classes. Un composant `Surface` ou `Card` couvre l'essentiel.
- Créer un composant `Modal` partagé (Radix Dialog ou équivalent) qui gère focus trap, Escape, `aria-modal`, scroll lock et retour du focus. Migrer les 5 modales.
- Créer `IconButton` avec `aria-label` obligatoire (typé), et des composants `EmptyState`, `ErrorState` et `Skeleton` homogènes.
- Valider le comportement mobile : navigation par onglets en dessous de `md`, zones tactiles de 44 px minimum, `safe-area`.
- Contrôler les contrastes en clair et en sombre, puis lancer axe en CI.

### Phase 5 : fonctionnalités (semaines 5-8)

1. **Générations en jobs serveur.** `POST` renvoie un `jobId`, puis un flux SSE ou du polling suit l'avancement. La génération survit au rechargement, à la fermeture d'onglet et au changement de page, et la synchronisation via `localStorage` disparaît. C'est le même principe que l'unification du chemin d'exécution décrite dans `audit.md`.
2. **Audio.**
   - Mettre en cache l'audio synthétisé (côté serveur ou Blob).
   - Ajouter le téléchargement `.md` annoncé et un export audio.
   - Corriger la vitesse de lecture en cours de lecture.
   - Gérer la compatibilité `AudioContext({ sampleRate })` sur Safari.
3. **Annuler la suppression** (toast avec « Annuler » au lieu de supprimer directement), pour les sources, notes et overviews.
4. **Recherche transversale** dans les sources, notes et documents générés.
5. **Raccourcis clavier** (envoyer, changer d'onglet, fermer un panneau) et **i18n** (`react-i18next`, avec le français comme langue par défaut).
6. **Citations cliquables** dans le chat vers le passage de `SourceViewer`, si ce n'est pas déjà le cas.

### Phase 6 : sécurité et qualité (en continu, bouclé semaine 8)

- Remplacer le token en `localStorage` par un cookie httpOnly, ou au minimum passer toutes les requêtes par le client unique de la phase 1.
- Passer le SVG de Mermaid dans DOMPurify avant `dangerouslySetInnerHTML`, ajouter une CSP et des tests sur `sanitizeMarkdownHtml` (payloads XSS connus).
- Vérifier l'attribut `sandbox` de l'iframe de `SlidePreviewModal`, que je n'ai pas contrôlé.
- Mettre en place des tests Playwright sur 5 parcours : créer un notebook, ajouter une source, discuter, générer un document, écouter l'audio.
- Ajouter en CI des budgets de bundle, axe et ESLint.

## 3. Indicateurs de réussite

| Indicateur | Aujourd'hui | Cible |
|---|---|---|
| Fichier le plus gros | 2 629 lignes | < 400 |
| `any` | ~55 | 0 |
| `fetch` dans les composants | ~50 | 0 (client unique) |
| Inline styles | ~740 | < 50 |
| Modales accessibles | ~1 sur 5 | toutes |
| Violations axe critiques | à mesurer | 0 |
| Bundle initial | à mesurer | -30 à -40 % |

## 4. Ordre de priorité

1. **Phase 0 et quick wins** : le plus de valeur pour le moins d'effort.
2. **Phases 1 et 2** : elles débloquent tout le reste.
3. **Phase 3 et jobs serveur** : le gain perçu par l'utilisateur est le plus visible.
4. **Phases 4 et 5**, puis consolidation en phase 6.

