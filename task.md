# TASK.md — Fiabiliser le pipeline agent (coder) au niveau Claude Code

**Objectif** : rapprocher l'agent `coder` (et les agents dérivés `test`, `refactor`, `docs`)
du niveau de fiabilité de Claude Code sur trois axes :
1. lecture avant modification (staleness/hash),
2. édition de fichier fiable (create / modify),
3. vérification après édition (syntaxe locale + build global) réellement bouclée
   dans le tour de raisonnement de l'agent.

Le pipeline existant est déjà solide (`WorkspaceState`, `AgentRepairLoop`,
`completionReport`). Les tâches ci-dessous corrigent des écarts précis et
identifiés, pas une réécriture.

Fichiers concernés principaux :
- `server/agents/roles.ts`
- `server/agents/AgentExecutor.ts`
- `server/agents/GeneratedFileWriter.ts`
- `server/agents/WorkspaceState.ts`
- `server/agents/AgentRepairLoop.ts`
- `server/skills/codebaseWriter.ts`
- `server/skills/verify.ts`
- `server/utils/postEditValidator.ts`

---

## Priorité 1 — Function-calling natif au lieu du JSON en texte libre

**Problème.** Dans `roles.ts`, l'agent est instruit de répondre avec un objet
texte `{"tool_calls":[{"name":...,"parameters":{...}}]}`, ensuite parsé par
regex/`JSON.parse` dans `AgentExecutor.extractToolCalls()`. C'est fragile :
JSON tronqué par un `max_tokens` mal placé, JSON mélangé à de la prose,
guillemets mal échappés, etc. Claude Code n'a pas ce problème car il utilise
les blocs `tool_use` natifs de l'API (schéma validé côté provider).

**Tâches**

- [ ] Vérifier si le modèle/provider utilisé (OpenRouter ou autre, voir
      `utils/textGeneration.ts` et `skills/reasoning.ts`) supporte le
      function-calling natif (paramètre `tools`/`functions` de l'API).
- [ ] Définir un schéma JSON (type OpenAI/Anthropic `tools`) pour chaque skill
      exécutable de `EXECUTABLE_AGENT_TOOLS` (`AgentExecutor.ts` ligne ~573) :
      `read_project_file`, `read_file_outline`, `search_in_files`,
      `analyze_project_file`, `write_project_file`, `apply_patch`,
      `patch_project_file`, `modify_project_file`, `verify_file`,
      `verify_typecheck`, `verify_lint`, `verify_full`, `list_project_files`.
- [ ] Remplacer l'appel `agent_execute` texte par un appel avec `tools` natifs ;
      lire les tool calls depuis les blocs structurés retournés par l'API au
      lieu de `extractToolCalls(resultText)`.
- [ ] Garder `extractToolCalls` comme **fallback** uniquement pour les
      providers ne supportant pas le function-calling natif.
- [ ] Mettre à jour `roles.ts` : supprimer la section "FORMAT D'APPEL
      EXÉCUTABLE (OBLIGATOIRE)" du prompt du coder quand le mode natif est actif
      (le modèle n'a plus besoin de ces instructions, l'API gère le schéma).

**Critère d'acceptation.** Sur un échantillon de 50 tâches coder, 0 échec de
parsing de tool call lié à un JSON malformé/tronqué (contre le taux actuel à
mesurer en baseline avant la correction).

---

## Priorité 2 — Supprimer/restreindre le fallback texte `GeneratedFileWriter`

**Problème.** `AgentExecutor.execute()` (ligne ~669) appelle
`this.fileWriter.writeFromAgentOutput(task, resultText)`
**inconditionnellement après chaque tâche**, en plus de la boucle d'outils
structurés. Ce fallback :
- parse le texte final par regex (` ```lang:chemin/fichier.ext ` ou
  `## Fichier: chemin`),
- écrit directement via `write_project_file` **sans jamais passer par
  `WorkspaceState`** (donc aucune garantie de lecture préalable, aucun
  tracking de hash/staleness),
- encourage à recopier le fichier **entier** en texte libre plutôt qu'un diff
  ciblé,
- peut déclencher une écriture fantôme si le rapport final contient un
  exemple de code au même format (` ```ts:exemple.ts `).

**Tâches**

- [ ] Dans `AgentExecutor.execute()`, n'appeler
      `fileWriter.writeFromAgentOutput()` **que si** aucun tool call structuré
      de type écriture (`write_project_file`, `apply_patch`,
      `patch_project_file`, `modify_project_file`) n'a été exécuté avec succès
      pendant `toolExecution` (i.e. `toolExecution.filesModified.length === 0`).
- [ ] Pour les agents ayant la capability `apply_patch`/`patch_project_file`
      dans `roles.ts` (coder, test, refactor), désactiver complètement ce
      fallback (`agent.capabilities.includes("write_project_file")` ne suffit
      pas comme garde ; ajouter un flag explicite `allowTextFallbackWrite:
      false` dans `AgentDefinition`).
- [ ] Ajouter un test dans `AgentValidation.test.ts` : un rapport final
      contenant un bloc ` ```ts:example.ts ` illustratif ne doit **pas**
      produire d'écriture disque si des tool calls structurés ont déjà
      modifié des fichiers dans le même tour.

**Critère d'acceptation.** Aucune écriture via `GeneratedFileWriter` ne se
produit pour une tâche `coder` qui a utilisé `apply_patch`/`modify_project_file`
avec succès.

---

## Priorité 3 — Inverser la priorité diff unifié / recherche-remplacement exacte

**Problème.** `roles.ts` impose `apply_patch` (diff unifié `@@ -L,N +L,N @@`)
comme méthode obligatoire et interdit `modify_project_file`
(*"N'utilise jamais modify_project_file"*). C'est l'inverse de la stratégie de
Claude Code, dont l'outil principal (`str_replace`) est une recherche du
texte exact à remplacer — les LLM réussissent beaucoup mieux cet exercice que
le calcul de numéros de ligne et de hunks corrects.

**Tâches**

- [ ] Dans `roles.ts` (section coder), réécrire la procédure obligatoire :
  - Étape 3 par défaut = `modify_project_file` avec `searchText` exact
    (extrait copié depuis la lecture de l'Étape 1), pour tout changement
    localisé (1 à ~30 lignes).
  - `apply_patch` (diff unifié) réservé explicitement aux changements
    **multi-hunks** dans un même fichier (plusieurs zones non contiguës
    modifiées en une seule opération).
  - Mettre à jour la section "ERREURS FRÉQUENTES À ÉVITER" en conséquence
    (supprimer l'interdiction de `modify_project_file`).
- [ ] Répercuter ce changement de priorité dans `roles.ts` pour les agents
      `test`, `refactor`, `docs`.
- [ ] Mettre à jour les exemples `{"tool_calls":[...]}` du prompt pour
      illustrer `modify_project_file` en premier.

**Critère d'acceptation.** Sur les tâches d'édition ciblée (<30 lignes), le
taux de succès à la première tentative (sans passage par `AgentRepairLoop`)
augmente par rapport à la baseline `apply_patch`-only.

---

## Priorité 4 — Corriger l'ambiguïté de correspondance multiple dans `modify_project_file`

**Problème.** Dans `skills/codebaseWriter.ts` (`handleModifyProjectFile`,
autour de la ligne 38801) :

```ts
const occurrences = content.split(searchText).length - 1;
const newContent = replaceAll
  ? content.split(searchText).join(replaceText)
  : content.replace(searchText, () => replaceText);
```

Si `searchText` apparaît plusieurs fois et `replaceAll` n'est pas passé,
`content.replace()` remplace **silencieusement la première occurrence** sans
avertir l'agent qu'il y avait ambiguïté. Claude Code exige que `old_str` soit
unique et retourne une erreur explicite sinon.

**Tâches**

- [ ] Ajouter un garde-fou avant le remplacement dans
      `handleModifyProjectFile` :

  ```ts
  const occurrences = content.split(searchText).length - 1;
  if (occurrences > 1 && !replaceAll) {
    return {
      error: `searchText trouvé ${occurrences} fois dans "${requestedPath}". ` +
        `Précise davantage de contexte (lignes avant/après) pour le rendre ` +
        `unique, ou passe replaceAll: true si le remplacement doit ` +
        `s'appliquer à toutes les occurrences.`,
      occurrences,
    };
  }
  ```

- [ ] Ajouter un test unitaire (`skills` a déjà des `*.test.ts` pour ce
      module) : `searchText` présent 2 fois + `replaceAll` absent → doit
      retourner une erreur, pas un remplacement silencieux.
- [ ] Vérifier que le message d'erreur du hint existant (ligne ~38791-38799,
      cas "searchText introuvable") reste inchangé — seul le cas "trouvé
      plusieurs fois" est nouveau.

**Critère d'acceptation.** Un appel `modify_project_file` avec `searchText`
non unique et sans `replaceAll: true` échoue explicitement au lieu de modifier
la mauvaise occurrence.

---

## Priorité 5 — Rendre la vérification globale (typecheck complet) obligatoire et synchrone dans le tour de l'agent

**Problème.** `verify_file` (appelé automatiquement après chaque écriture
dans `AgentExecutor.executeRequestedTools`) ne vérifie que la **syntaxe du
fichier isolé** (`checkBracketBalance` + `checkTypeScriptSyntax` en mémoire,
voir `skills/verify.ts`). La vérification **projet entier**
(`tsc --noEmit`, erreurs cross-fichiers — ex. un import cassé ailleurs à
cause du renommage d'un export) passe par `utils/postEditValidator.ts`, qui
est :
- débouncée (2.5s),
- asynchrone,
- notifiée uniquement via WebSocket vers le client UI,
- **jamais réinjectée dans le tour de raisonnement de l'agent**.

Résultat : une tâche `coder` peut se terminer en `success` avec un
`verify_file` au vert alors que le build global est cassé.

**Tâches**

- [ ] Dans `AgentExecutor.collectEvidence()` / `getIncompleteReason()`,
      ajouter une exigence : pour les rôles `coder`, `refactor` (déjà dans
      `writeRequired`), si au moins un fichier `.ts`/`.tsx` a été modifié,
      un appel réussi à `verify_typecheck` **ou** `verify_full` doit
      apparaître dans `toolExecution.toolsExecuted` avant que la tâche
      puisse passer en `completed`.
- [ ] Si absent, ajouter l'erreur `"Aucune vérification typecheck globale
      (verify_typecheck/verify_full) après modification de fichier(s)
      TypeScript."` à la liste `errors` de `collectEvidence`.
- [ ] Dans `roles.ts` (coder), ajouter une étape explicite après l'Étape 4
      (VÉRIFIER) : *"Étape 5 : après la dernière modification de la tâche,
      appelle `verify_typecheck` (ou `verify_full` si des tests sont
      concernés) avant de rendre le rapport final."*
- [ ] Découpler `postEditValidator.ts` de son rôle de seule source de vérité
      pour le build global côté agent : soit le rendre appelable de façon
      synchrone par le skill `verify_full` (pas seulement en debounce UI),
      soit garder les deux mécanismes mais s'assurer que celui utilisé par
      l'agent (`verify_typecheck`/`verify_full`) attend le résultat complet
      avant de répondre au tool call (pas de debounce côté agent).

**Critère d'acceptation.** Impossible pour une tâche `coder` ayant modifié un
fichier `.ts` de se terminer en `completed` sans qu'un `verify_typecheck`/
`verify_full` réussi figure dans les preuves (`task.result.evidence`).

---

## Ordre d'exécution recommandé

1. Priorité 4 (bug ponctuel, risque faible, gain immédiat) — quick win.
2. Priorité 5 (boucler la vérification globale) — évite les régressions
   silencieuses pendant que les autres priorités sont développées.
3. Priorité 3 (inverser diff unifié / recherche-remplacement) — changement de
   prompt, peu risqué, mesurable rapidement (taux de succès 1ère tentative).
4. Priorité 2 (restreindre le fallback texte) — nécessite de vérifier
   qu'aucun agent ne dépend encore du fallback pour écrire.
5. Priorité 1 (function-calling natif) — le plus gros chantier, migration
   d'architecture ; à faire une fois les priorités 2-4 stabilisées pour
   mesurer l'amélioration sur une base propre.

## Mesure de succès globale

- [ ] Baseline avant corrections : taux de tâches `coder` terminées en
      `completed` du premier coup (sans passage par `AgentRepairLoop`), sur
      un échantillon d'au moins 30 tâches réelles.
- [ ] Même mesure après chaque priorité appliquée, pour isoler l'apport de
      chaque correction.
- [ ] Zéro écriture disque non tracée par `WorkspaceState` (vérifiable via les
      logs `[Codebase] File written/modified/patched`) après Priorité 2.
