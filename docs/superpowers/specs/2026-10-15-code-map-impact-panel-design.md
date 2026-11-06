> **Statut au 2026-11-06 : implémentation présente.** Le panneau d'impact et son hook sont
> présents dans le dépôt. Cette spec est conservée comme décision de conception historique,
> pas comme fonctionnalité encore à créer.
>
> ---
>
# Panneau d'impact de la cartographie du code — Design

- **Date** : 2026-10-15
- **Statut** : validé en conversation, en relecture
- **Sous-projet** : 1/3 de l'« UI/UX complète » de la cartographie du code
  1. **Panneau d'impact dans l'IDE** ← ce document
  2. Explorateur d'architecture (graphe navigable) — spec séparée
  3. Suivi des agents sur la carte (surcouches) — spec séparée, réutilise 1 et 2

## 1. Intention

**Ce qui a été demandé** : une UI couvrant trois usages de la cartographie
(modifier en sécurité, explorer l'architecture, suivre les agents), livrée par
étapes, en commençant par l'usage « avant de modifier ».

**Objectif de ce sous-projet** : quand on travaille sur un fichier ou un symbole
dans l'IDE, voir immédiatement ce qu'une modification risque de casser — qui en
dépend, à quelle distance, avec quel niveau de risque, et quels tests relancer.

**Critères de réussite**
- Ouvrir un fichier `.ts` et le panneau affiche son impact en moins d'une seconde
  (après le délai d'attente), sans action supplémentaire.
- Clic droit sur un symbole › « Analyser l'impact » cible ce symbole précis.
- Chaque fichier impacté et chaque test est cliquable et ouvre le fichier.
- Les cas sans code, sans dépendant, en erreur ou tronqués sont explicites.

**Hypothèses (non dites explicitement)**
- Lecture seule : aucune modification serveur nécessaire, l'API existante suffit.
- Le panneau s'adresse à l'humain ; les agents utilisent déjà
  `knowledge_code_map_impact`.

## 2. Contexte existant

- **API** (`server/routes/knowledge/impactRouter.ts`, déjà en place) :
  - `POST /api/knowledge/code-map/impact` `{ targets: string[], depth?: number }`
    → `{ status, report: CodeMapImpactReport }`
  - `GET /api/knowledge/code-map/symbol?q=…&limit=…` (non utilisée en v1)
- **Format de cible** accepté par `CodeMap.resolveRef` : `chemin/fichier.ts`,
  `chemin/fichier.ts#Symbole`, `chemin/fichier.ts#Classe.méthode`. Si le nom
  exact n'existe pas, `findSymbolIn` retombe sur le dernier segment.
- **Rapport** (`CodeMapImpactReport`, `server/knowledge/CodeMap.ts`) : `targets`,
  `unresolved`, `ambiguous`, `impacted`, `impactedFiles` (`filePath`,
  `distance`, `symbols`, `isTest`), `testsToRun`, `untestedFiles`, `risk`
  (`low|medium|high|critical`), `riskScore`, `warnings`, `maxDepthReached`,
  `truncated`, `summary`.
- **Zone droite** : `RightDock` affiche un seul panneau à la fois ;
  l'exclusivité est gérée par `openRightPanel(RightPanelName)` dans
  `src/views/IdeView.tsx`.
- **Éditeur** : Monaco ; `IdeView` suit déjà le curseur
  (`onDidChangeCursorPosition` → `cursorPosition`) et enregistre des actions de
  menu contextuel (`editor.addAction`, ex. « Envoyer à l'IA »).
- **Auth** : les appels `fetch` ajoutent `x-Leanna-token` depuis
  `localStorage['Leanna_api_token']` (cf. `StatusBar.handleReindex`).
- **Tests front** : Vitest + jsdom (`npm run test:ui`, `src/**/*.test.{ts,tsx}`).

## 3. Approche retenue

Panneau « Impact » dans le `RightDock`, piloté par l'éditeur (approche A),
avec un point d'entrée par clic droit qui ouvre le panneau sur un symbole.

Écartées : CodeLens Monaco (bruyant, une requête par symbole visible — à
reconsidérer plus tard en complément) ; modale à la demande (pas de suivi
continu, contraire à l'usage « avant de modifier »).

## 4. Comportement

### 4.1 Points d'entrée
| Point d'entrée | Effet |
|---|---|
| Bouton « Impact » dans `StatusBar` (`onToggleImpact`) | ouvre/ferme le panneau, cible = fichier actif |
| Palette de commandes : « Analyser l'impact du fichier » | ouvre le panneau, cible = fichier actif |
| Menu contextuel Monaco : « Analyser l'impact » | ouvre le panneau, cible = `fichier#mot sous le curseur`, épinglée |

### 4.2 Cible
- **Mode suivi** (par défaut) : la cible suit `fileSystem.activePath`.
- **Mode épinglé** : la cible reste fixe même si on change d'onglet. Activé
  automatiquement par le menu contextuel, ou par le bouton d'épinglage. Le
  désépinglage revient au fichier actif.
- Le chemin est normalisé en chemin relatif au workspace, avec des `/`.
- Le symbole sous le curseur vient de `model.getWordAtPosition(position)` ;
  cible envoyée : `<chemin>#<mot>`.
- Fichier non-code (extension hors `ts|tsx|js|jsx|mjs|cjs|mts|cts`) : aucune
  requête, état « Pas de code à analyser ».

### 4.3 Structure du panneau (haut → bas)
1. **En-tête** : nom de la cible (fichier ou `Symbole`), type (`file`,
   `function`, `class`…) d'après `report.targets[0].kind`, puce de risque
   colorée (FAIBLE / MOYEN / ÉLEVÉ / CRITIQUE) + score, sélecteur de profondeur
   (1–5, défaut 3), bouton d'épinglage, bouton fermer.
2. **Résumé** : `report.summary` + 3 compteurs : fichiers impactés (hors
   tests), tests à relancer, fichiers non couverts.
3. **Fichiers impactés** groupés par `distance` : « Direct » (1),
   « Niveau 2 », « Niveau 3 »… Chaque ligne : chemin (dossier atténué, nom en
   clair), symboles touchés (max 3 puis « +N »), badge « test » si `isTest`.
   Clic → ouvre le fichier ; à la ligne du symbole si `impacted` fournit une
   `line` pour ce fichier.
4. **Tests à relancer** : liste cliquable + bouton « Copier la commande »
   (`node --import tsx --import ./scripts/test-isolation.mjs --test <fichiers…>`
   pour les tests serveur — même isolation que `npm test` ;
   `npx vitest run <fichiers…>` pour ceux sous `src/`).
5. **Alertes** (repliable) : `warnings`, `untestedFiles`, `ambiguous`
   (« Plusieurs symboles nommés X — tous retenus »), `truncated` /
   `maxDepthReached` (« Résultat partiel : augmente la profondeur ou cible un
   symbole »).

### 4.4 États
| État | Affichage |
|---|---|
| Aucun fichier ouvert | « Ouvre un fichier de code pour voir son impact » |
| Fichier non-code | « Pas de code à analyser dans ce fichier » |
| Chargement | squelette (en-tête + 4 lignes) ; l'ancien rapport reste visible atténué s'il existe |
| Cible non résolue (`unresolved` non vide, `targets` vide) | « Ce fichier/symbole n'est pas encore dans la cartographie » + bouton « Réindexer » (`POST /api/knowledge/reindex`) |
| Aucun dépendant | puce FAIBLE + « Aucun dépendant : modification sans effet de bord connu » |
| Erreur réseau/serveur | message + bouton « Réessayer » |

### 4.5 Accessibilité
- Panneau = `<section aria-label="Impact de la modification">`.
- Puce de risque : texte + couleur (jamais la couleur seule).
- Lignes cliquables = `<button>` ; navigation clavier ↑/↓ dans la liste,
  Entrée pour ouvrir.
- Couleurs via les variables CSS existantes (`--text-muted`, `--border-base`,
  `--accent-primary`…) ; risques mappés sur les tokens de statut de
  `src/DESIGN_TOKENS.md`.

## 5. Architecture

### 5.1 Unités
| Fichier | Rôle | Dépend de |
|---|---|---|
| `src/hooks/useCodeMapImpact.ts` | requête `POST /code-map/impact`, délai 300 ms, annulation (`AbortController`), cache LRU (20 entrées, clé `target|depth`), `refresh()` | `fetch` |
| `src/components/knowledge/impactModel.ts` | fonctions pures : `groupByDistance(report)`, `buildTestCommand(files)`, `isCodeFile(path)`, `toWorkspacePath(path, root)`, `riskLabel(risk)` | types du rapport |
| `src/components/knowledge/ImpactPanel.tsx` | rendu des sections et états ; props `{ target, pinned, onPin, onUnpin, onOpenFile(path, line?), onClose }` | hook + modèle |
| `src/types/codeMap.ts` | copie front des types `CodeMapImpactReport`, `ImpactedFile`, `ImpactedNode`, `CodeMapRisk` | — |

Le hook ne connaît pas l'UI ; `impactModel` ne connaît ni React ni `fetch`.

### 5.2 Intégration dans `IdeView.tsx`
- `RightPanelName` += `'impact'` ; nouvel état `showImpact` remis à jour par
  `openRightPanel`, et ajouté à la condition `open` du `RightDock`.
- État `impactTarget: { ref: string; pinned: boolean } | null`.
  Effet : si non épinglé, `ref = toWorkspacePath(fileSystem.activePath)`.
- `editor.addAction({ id: 'Leanna-analyze-impact', label: "Analyser l'impact",
  contextMenuGroupId: 'navigation', contextMenuOrder: 1.6, run })` : lit le mot
  sous le curseur, fixe `impactTarget = { ref: path#mot, pinned: true }`, puis
  `openRightPanel('impact')`.
- `onOpenFile` réutilise `openFileAt(filePath, line?)` (déjà utilisé par
  `GlobalSearch`).
- `StatusBar` : nouvelle prop `onToggleImpact`, bouton à côté des autres
  bascules de panneau.
- Palette de commandes (`src/components/ide/CommandPalette.tsx`) : entrée
  `{ id: 'analyze-impact', label: "Analyser l'impact du fichier", category:
  'Fichier' }` appelant une nouvelle prop `onAnalyzeImpact`.

### 5.3 Flux de données
```
activePath / clic droit ─► impactTarget ─► useCodeMapImpact(ref, depth)
                                              │ (300 ms, abort, cache)
                                              ▼
                             POST /api/knowledge/code-map/impact
                                              ▼
                     report ─► impactModel ─► ImpactPanel ─► openFileAt
```

## 6. Gestion des erreurs
- Réponse non-2xx ou `status !== 'success'` → état erreur avec le message
  serveur (`error`) s'il existe.
- Requête annulée (changement de cible) → ignorée silencieusement.
- Réponse arrivant pour une cible périmée → ignorée (comparaison de clé).
- Pas de nouvelle tentative automatique ; bouton « Réessayer » = `refresh()`
  qui contourne le cache.

## 7. Tests (Vitest)
- `impactModel.test.ts` : regroupement par distance et ordre ; exclusion des
  tests du compteur « fichiers impactés » ; commande de test serveur vs `src/` ;
  `isCodeFile` ; `toWorkspacePath` (antislashs Windows, chemin absolu sous la
  racine).
- `useCodeMapImpact.test.ts` (fetch simulé, timers simulés) : délai 300 ms ;
  une seule requête après plusieurs changements rapides ; annulation de la
  précédente ; réponse périmée ignorée ; cache utilisé ; `refresh` contourne le
  cache ; état d'erreur.
- `ImpactPanel.test.tsx` : chaque état du §4.4 ; clic sur un fichier appelle
  `onOpenFile(path, line)` ; puce de risque porte un libellé texte.
- Vérification manuelle dans l'app : fichier, symbole par clic droit,
  épinglage, fichier Markdown, fichier inconnu.

## 8. Hors périmètre
- Graphe visuel (sous-projet 2) et surcouches agents (sous-projet 3).
- CodeLens / décorations inline dans Monaco.
- Toute modification de `CodeMap` ou de l'API serveur.
- Lancement des tests depuis le panneau (on copie la commande seulement).
