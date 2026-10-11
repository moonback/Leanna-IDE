Je commence par lire le fichier pour comprendre l'architecture de Leanna.J'ai lu le dump (6 Mo) en me concentrant sur `autonomy/`, `mission/AutonomyPolicy`, `knowledge/` et `lifecycle.ts`. Leanna est déjà à mi-chemin : elle sait observer et proposer, mais pas encore agir et vous prévenir de façon fiable quand vous n'êtes pas devant l'interface.

## Ce qui existe déjà

- `HeartbeatService` : battement adaptatif de 15 s / 60 s / 5 min.
- `PerceptionEngine` : classe les événements sans appeler de LLM.
- `AnticipationEngine` : détecte les outils qui échouent, les erreurs récurrentes et les tâches en échec, puis émet des propositions.
- `AutonomousExecutive` : arbitre par priorité, mémorise les échecs et escalade après 3 échecs identiques.
- `TaskManager` : file bornée, retries, circuit breaker, reprise après crash.
- `AutonomyPolicy` : niveaux suggest / ask / auto, plus `.leannaignore`.

## Ce qui l'empêche d'être autonome et proactive

1. **Les missions lancées par l'anticipation semblent ne rien faire.** `AnticipationEngine` soumet des tâches avec `metadata.anticipation`, mais `AutonomousExecutive.execute()` sort immédiatement si `metadata.event` est absent. Je n'ai pas `server.ts` (là où `LeannaCore` est instancié), donc je ne peux pas confirmer que `onTask` rattrape ce cas. C'est à vérifier en premier.
2. **Elle ne parle qu'à l'interface ouverte.** Les propositions partent en WebSocket (`autonomy_event`). `TelegramService.notify()` existe mais rien ne le relie à l'anticipation ou à l'escalade. Si vous fermez l'app, elle reste muette.
3. **L'escalade est une impasse.** Un `ESCALATE` change juste l'état du goal et émet un événement. Personne n'est contacté et il n'y a pas de demande d'approbation. Telegram sait pourtant rendre des messages d'approbation.
4. **Ses meilleurs moteurs sont en « pull » seulement.** `OpportunityEngine`, `DailyBriefing`, `ProjectDoctor` et `PredictionEngine` ne sont appelés que par des routes ou des skills. Le sweep d'anticipation n'utilise que `StrategyMemory`, `LearningEngine` et les stats runtime.
5. **Elle perçoit très peu.** `PerceptionEngine` ne gère que 5 types d'événements. `FileWatcher` ne nourrit que l'indexeur, et rien ne couvre git, la CI, les échéances ou votre inactivité.
6. **Les goals sont uniquement réactifs.** Le type prévoit `SCHEDULE`, `LEARNED` et `USER`, mais seul `EVENT` est créé. `automationScheduler` vit à part. `GoalManager` est en mémoire et perdu au redémarrage.
7. **Sa « réflexion » est un message statique** (« je réfléchis au contexte… »). Pendant les périodes calmes elle ne produit aucun travail utile.
8. **Le temps de travail est borné trop court.** Timeout de 60 s par tâche et 1 cycle concurrent par défaut, ce qui est serré pour une vraie mission.

## Plan proposé

**Phase 1, rendre l'existant réellement actif :** corriger le cas `metadata.anticipation` dans l'executive, brancher `notify()` Telegram sur les propositions importantes et sur les escalades (avec boutons approuver/refuser), puis passer `LEANNA_AUTONOMY_MODE=auto` avec un timeout adapté.

**Phase 2, proactivité réelle :** appeler `OpportunityEngine`, `ProjectDoctor` et `PredictionEngine` dans le sweep. Planifier `DailyBriefing` avec un goal `SCHEDULE`. Enrichir `PerceptionEngine` (changements de fichiers, git, tests rouges, échéances) et persister les goals.

**Phase 3, autonomie encadrée :** pendant les périodes calmes, lancer des tâches en lecture seule (diagnostic, tests, revue) plutôt qu'un message statique. Prévoir un budget (tokens, coût, actions par heure), un kill switch et un journal d'audit lisible.

Je déconseille une autonomie vraiment à 100 % sans garde-fous. Visez plutôt « autonome sur le réversible » : la sandbox `.Leanna/sandbox` et les checkpoints le permettent déjà. Gardez une approbation pour le destructif, le réseau et les dépenses, ce que `LEANNA_AUTO_ALLOW_DANGEROUS=false` fait déjà.

Pour avancer, pouvez-vous m'envoyer `server.ts` (le câblage de `LeannaCore` et de `executeMission`) ? Je pourrai alors confirmer le point 1 et vous écrire les correctifs de la phase 1 en code.