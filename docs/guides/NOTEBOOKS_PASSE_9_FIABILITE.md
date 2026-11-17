# Passe 9 — fiabilité opérationnelle des Notebooks

Branche : `fix/notebooks-data-integrity-persistence`  
PR : https://github.com/moonback/Leanna-IDE/pull/133

## Modifications

- Historique durable des 10 dernières tentatives par source : numéro, date, résultat, catégorie d’erreur, durée et message.
- Classification des erreurs : les erreurs réseau usuelles, timeouts et HTTP 408/425/429/5xx sont temporaires ; les erreurs non reconnues sont considérées permanentes par défaut.
- Les erreurs permanentes ne sont plus automatiquement retentées au redémarrage. Le retry manuel reste possible.
- Single-flight par couple notebook/source. Les appels identiques partagent l’exécution active.
- Un remplacement explicite pendant une indexation est sérialisé après l’exécution courante, afin que la nouvelle version soit traitée sans exécution concurrente.
- Suppression d’une source ou d’un notebook : annulation du timer de retry et invalidation du résultat de l’exécution obsolète.
- Le panneau Indexation affiche l’historique, le résultat, la catégorie, la date, la durée et le message.
- Un test UI couvre l’affichage de l’historique.

## Limites connues

1. Le verrou single-flight est local au processus Node. Il ne protège pas plusieurs processus partageant le même répertoire.
2. L’historique est borné aux 10 dernières tentatives ; il ne constitue pas un journal d’audit longue durée.
3. Les erreurs de fournisseur encapsulées sans statut/code peuvent être classées permanentes par défaut. La classification doit être affinée avec les erreurs réellement observées.
4. L’extraction, le chunking et le résumé ne sont pas présentés comme une progression, car ces étapes précèdent la publication durable de la source. Leur instrumentation fiable nécessite un identifiant de job d’ingestion et un état distinct.
5. Le statut `indexed` ne prouve pas à lui seul que tous les vecteurs sont toujours présents sur disque. La réconciliation notebook/chunks/embeddings reste le contrôle d’intégrité.
6. La file ProcessingQueue existante n’est pas encore raccordée au cycle d’indexation des sources ; les retries de cette dernière utilisent toujours des échéances persistées et des timers réhydratés au démarrage.

## Validation à exécuter localement

```powershell
npm run typecheck
npm run test:ui -- src/components/notebooks/IndexingMonitor.test.tsx
npm run lint:eslint:notebooks
```

Ajouter/exécuter les scénarios serveur suivants :

- deux imports identiques simultanés : une seule indexation effective ;
- remplacement pendant une indexation : la version finale correspond au dernier hash durable ;
- suppression pendant une indexation ou un backoff : aucun retry orphelin ni statut réécrit ;
- erreur temporaire : historique et retry avec backoff ;
- erreur permanente : pas de retry automatique après redémarrage ;
- retry manuel après erreur permanente ;
- redémarrage avec une source en attente et une source en échec permanent.

**État de validation :** aucune commande locale n’a été exécutée depuis cette session. La PR reste en brouillon et n’a pas été fusionnée.
