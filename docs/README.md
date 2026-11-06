# Documentation Leanna — index et statut

> Revue documentaire : 2026-11-06 · Branche : `main`.
> Les audits datés sont des photographies du commit indiqué ; ils ne sont pas des preuves
> automatiques de l'état courant. Les fichiers de code et les tests restent la source de vérité.

## Références d'architecture actuelles

| Document | Statut | Utilisation |
|---|---|---|
| [AUTONOMY_RUNTIME_MAP.md](AUTONOMY_RUNTIME_MAP.md) | Actualisé 2026-11-06 | Carte des chemins mission / agent et des contrôles conditionnels |
| [AGENTIC_RUNTIME.md](AGENTIC_RUNTIME.md) | Actualisé 2026-11-06 | Détails de la boucle agentique et de ses budgets |
| [TOOL_OWNERSHIP_MATRIX.md](TOOL_OWNERSHIP_MATRIX.md) | Actualisé 2026-11-06 | Méthode de résolution et d'audit dynamique des attributions |
| [AUTONOMY_CONTRACT.md](AUTONOMY_CONTRACT.md) | Contrat, note de configuration ajoutée | Ce que l'autonomie peut faire ; vérifier les options activées |
| [prompt_injection_guardrails.md](prompt_injection_guardrails.md) | Référence technique | Portée et limites du garde-fou heuristique |
| [plan_securisation_secrets.md](plan_securisation_secrets.md) | Actualisé 2026-11-06 | État de la validation Zod et dette restante sur les variables d'environnement |

## Audits et preuves historiques à conserver

Ces documents sont conservés volontairement : ils retracent des constats datés, des défauts
reproduits et des décisions. Ne pas réutiliser leurs nombres ou verdicts comme mesures actuelles
sans relancer les vérifications sur le commit courant.

- [ANALYSE_AGENTS.md](ANALYSE_AGENTS.md) — photographie antérieure de l'architecture des agents.
- [AUTONOMOUS_AGENT_AUDIT.md](AUTONOMOUS_AGENT_AUDIT.md) — audit du 2026-09-23.
- [AUTONOMY_AUDIT.md](AUTONOMY_AUDIT.md) — audit historique v1.4.0.
- [AUTONOMY_MASTER_AUDIT](LEANNA_AUTONOMY_MASTER_AUDIT.md) et
  [rapport d'implémentation](LEANNA_AUTONOMY_IMPLEMENTATION_REPORT.md) — chantier d'apprentissage inter-missions.
- [LEANNA_EXECUTION_REALITY_AUDIT.md](LEANNA_EXECUTION_REALITY_AUDIT.md) — état antérieur à la migration agentique.
- [LEANNA_EXECUTION_AUDIT_2026-10-15.md](LEANNA_EXECUTION_AUDIT_2026-10-15.md) — constats d'exécution datés du 15 octobre.
- [LEANNA_TOKEN_TELEMETRY_AUDIT_2026-10-15.md](LEANNA_TOKEN_TELEMETRY_AUDIT_2026-10-15.md) — audit télémétrie daté du 15 octobre.
- [AUDIT_PROJECT_INDEXER_KNOWLEDGE_GRAPH.md](AUDIT_PROJECT_INDEXER_KNOWLEDGE_GRAPH.md) — audit statique du 16 octobre ; remesurer les performances avant de conclure.
- [audit-evidence/](audit-evidence/) — script et résultat de reproduction d'une baseline historique ; ne pas exécuter sur le code courant sans vérifier ses hypothèses.
- [TEST-NOTEBOOKS-MANUEL.md](TEST-NOTEBOOKS-MANUEL.md) — procédure manuelle de recette notebooks, à confirmer avec l'UI et les routes actuelles.
- [test-missions-agents.md](test-missions-agents.md) — scénarios de recette agents, à exécuter sur l'installation visée.

## Plans et backlogs encore utiles

Un plan décrit un travail proposé, pas une fonctionnalité livrée. Vérifier les fichiers de code
avant de transformer une case ou une proposition en statut « terminé ».

- [P0_ARCHITECTURE_PLAN.md](P0_ARCHITECTURE_PLAN.md) — plan historique des composants du noyau ; options d'activation précisées en tête.
- [RICH_DOCUMENTS_IMPROVEMENT_PLAN.md](RICH_DOCUMENTS_IMPROVEMENT_PLAN.md) — backlog de tri, pagination, export et interactions des documents riches.
- [orb-roadmap.md](orb-roadmap.md) — backlog produit Orb Live ; les fonctionnalités doivent être vérifiées individuellement avant d'être déclarées livrées.
- [LIVE_TOOL_EXECUTION.md](LIVE_TOOL_EXECUTION.md) — référence des modes d'exécution Live ; vérifier les variables et le fournisseur de la version déployée.
- [superpowers/plans/](superpowers/plans/) et [superpowers/specs/](superpowers/specs/) — plans et spécifications conservés comme historique ; les pages Agent Lead et panneau Impact portent maintenant un statut d'implémentation.

## Politique de maintenance

1. Ajouter une date et un commit de référence aux audits ponctuels.
2. Distinguer explicitement **implémenté**, **opt-in**, **backlog**, **historique** et **non vérifié**.
3. Ne jamais affirmer qu'un test, un typecheck, un rollback ou une sécurité est exécuté si son appelant réel n'a pas été vérifié.
4. Ne pas supprimer les preuves historiques de reproduction lorsqu'elles permettent de comprendre un correctif.
5. Mettre à jour les liens et chemins lors des renommages ; supprimer un document seulement s'il est redondant, trompeur ou sans valeur historique.
6. Ne pas inscrire de secrets, de valeurs de configuration privées ou de données utilisateur dans la documentation.
