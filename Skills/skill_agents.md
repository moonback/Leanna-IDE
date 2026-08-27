# Skill : Agents (`server/skills/agents.ts`)

Ce skill permet à l'IA principale d'interagir avec le système multi-agents de Jarvis OS. Il expose des outils pour déléguer des tâches, orchestrer des collaborations complexes et surveiller l'activité des agents.

## Outils Exposés

| Nom de l'outil | Description |
| :--- | :--- |
| `agent_list_definitions` | Liste les rôles d'agents disponibles (ex: Architecte, Développeur, Testeur). |
| `agent_delegate_task` | Délègue une tâche spécifique à un agent. |
| `agent_collaborate` | Lance un pattern de collaboration prédéfini entre plusieurs agents. |
| `agent_list_collaboration_patterns` | Liste les patterns de collaboration disponibles. |
| `agent_orchestrate` | Planifie et exécute un plan d'orchestration complexe. |
| `agent_list_tasks` | Liste les tâches en cours ou terminées. |
| `agent_get_bus_history` | Récupère l'historique des messages échangés sur le bus. |
| `agent_get_logs` | Récupère les logs du système d'agents. |

## Autonomie

Ce skill est crucial pour l'autonomie car il permet à l'IA de ne pas tout faire elle-même et de s'appuyer sur des spécialistes.

**Pistes d'amélioration pour l'autonomie :**
*   Permettre aux agents de se redéléguer des tâches entre eux de manière plus fluide en cas d'échec.
*   Enrichir l'historique du bus pour que l'IA puisse mieux comprendre le raisonnement des agents.
