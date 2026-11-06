# Passe 11 — pipeline Notebook unifié et historique durable des tâches

Branche : `fix/notebooks-data-integrity-persistence`  
PR : https://github.com/moonback/Leanna-IDE/pull/133

## Raccordement du pipeline

Les chemins suivants soumettent maintenant leur ingestion à `sourceProcessingQueue` via `enqueueSourceIngestion()` :

- upload simple et multiple ;
- import d'une URL ;
- texte collé ;
- import d'un codebase ;
- conversion d'une note en source ;
- promotion d'un document généré en source ;
- endpoint upload-queued déjà existant.

Le handler central choisit l'ingesteur URL ou buffer, revérifie le notebook dans le workspace actif, ajoute la source une seule fois et invalide les caches RAG/chat.

Les routes HTTP historiques attendent toujours la fin de la tâche afin de conserver leur contrat de réponse. La queue contrôle la concurrence et le retry, mais ces routes ne sont pas encore des endpoints asynchrones 202 côté client.

## Historique durable des tâches

- Le format de persistance passe à la version 2 ; les fichiers version 1 restent acceptés.
- Les 200 derniers résultats terminaux (completed/failed/cancelled) sont persistés et rechargés au démarrage.
- Le résultat terminal est consultable par `getTask()` et par la route de statut des tâches.
- Les payloads des tâches terminées ne sont pas conservés ; seul `notebookId` est conservé pour appliquer le contrôle d'accès de la route de statut.
- Les buffers des tâches en attente continuent d'être sérialisés en base64.
- Test ajouté : restauration après redémarrage d'un résultat terminal sans restauration du payload source.

## Limites connues

1. Les tâches au statut `processing` lors d'un crash ne sont toujours pas automatiquement rejouées. Il faut un mécanisme de lease/recovery et une idempotence vérifiée pour éviter de dupliquer un effet partiel.
2. Les résultats terminaux sont bornés aux 200 dernières tâches ; ce n'est pas un journal d'audit illimité.
3. Les réponses HTTP restent synchrones : une déconnexion client ne stoppe pas le travail, mais l'API n'offre pas encore un contrat 202 + polling complet pour tous les clients.
4. La route de statut conserve le résultat terminal uniquement tant qu'il fait partie de la fenêtre d'historique.
5. La queue reste globale au processus ; le workspace est revérifié avant traitement, mais une partition multi-workspace serait nécessaire pour un vrai traitement simultané isolé.
6. L'étape de progression reste grossière (ingestion, ajout, fin) et ne décrit pas séparément extraction PDF/OCR, chunking, résumé et embeddings.
7. Les appels directs du sous-système Knowledge DocumentAnalyzer ne sont pas le pipeline Notebook et restent hors de cette passe.

## Validation locale

```powershell
npm run typecheck
node --import tsx --import ./scripts/test-isolation.mjs --test server/notebooks/ProcessingQueue.persistence.test.ts
npm run lint:eslint:notebooks
```

Ces commandes n'ont pas été exécutées depuis cette session. La PR reste en brouillon et n'a pas été fusionnée.
