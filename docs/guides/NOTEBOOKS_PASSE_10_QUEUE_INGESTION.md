# Passe 10 — raccordement de la queue d'ingestion Notebook

Branche : `fix/notebooks-data-integrity-persistence`  
PR : https://github.com/moonback/Leanna-IDE/pull/133

## Modifications

- Upload simple et upload multiple routés via `sourceProcessingQueue`.
- Préservation du contrat JSON des routes synchrones existantes ; l'API attend le résultat terminal de la tâche.
- Upload multiple soumis à la concurrence configurée de la queue et traité avec un résultat par fichier.
- Nouvelle méthode `waitForTask()` qui gère les fins de traitement rapides sans perdre les événements.
- Nouvelle route `GET /:id/sources/tasks/:taskId` pour consulter les tâches encore présentes en mémoire.
- Handler de queue enrichi avec les métadonnées de source nécessaires aux réponses HTTP.
- Vérification du workspace actif dans le handler, y compris pour les tâches restaurées.
- Ajout de `nextAttemptAt` : les tâches en backoff conservent leur échéance lors d'un redémarrage au lieu de repartir immédiatement.
- Tests ajoutés pour l'attente d'une tâche terminée/en échec, le respect du backoff restauré, le refus d'une tâche si l'écriture initiale échoue et la restauration des buffers.\n- Une tâche n'est plus acceptée si sa première persistance atomique échoue. Les buffers sont sérialisés en base64 plutôt qu'en tableaux JSON d'octets.\n- Les erreurs définitives (validation/4xx) ne déclenchent plus de retries automatiques ; les erreurs réseau usuelles, timeouts, 408/425/429 et 5xx restent retentables.

## Limites connues

- URL, texte collé, note convertie et document généré ne sont pas encore tous raccordés à la queue.
- Le contrat HTTP reste synchrone pour préserver la compatibilité. La réponse terminale n'est pas encore écrite dans un journal durable ; après une déconnexion/crash, le client doit consulter le notebook après reprise.
- La route de statut lit le registre en mémoire et ne constitue pas un historique durable des tâches terminées.
- Une tâche au statut processing au moment du crash n'est pas rejouée automatiquement : son effet peut être partiel.
- La queue est globale au processus. Le handler revalide le workspace, mais une partition explicite par workspace reste souhaitable en cas de traitement multi-workspace.\n- La persistance des changements d'état après l'acceptation initiale reste best-effort : les erreurs sont journalisées, mais les transitions de retry ne font pas encore échouer/mettre en quarantaine la tâche si leur écriture disque échoue.

## Validation locale

```powershell
npm run typecheck
node --import tsx --import ./scripts/test-isolation.mjs --test server/notebooks/ProcessingQueue.persistence.test.ts
npm run lint:eslint:notebooks
```

Les commandes ci-dessus n'ont pas été exécutées depuis cette session. La PR reste en draft et n'a pas été fusionnée.
