# Audit du système Notebooks — fonctionnalités, évolutions et améliorations

> **Périmètre :** audit documentaire des modules Notebooks de Leanna-IDE, à partir des fichiers serveur, des routes API et des composants d'interface inspectés.  
> **Statut :** analyse et propositions — ce document ne signifie pas que les fonctionnalités proposées sont déjà implémentées.  
> **Branche de travail :** `docs/notebooks-audit-20-features-20-improvements`

## 1. Objectifs

Le système Notebooks doit devenir un espace de connaissance fiable et exploitable : collecter des sources, les organiser, interroger leur contenu avec traçabilité, produire des livrables, puis transformer les résultats en connaissances et actions réutilisables.

Cet audit distingue :
- **Fonctionnalités repérées** : capacités visibles dans les modules et composants examinés.
- **Points à vérifier** : capacités déclarées par les types ou l'interface dont le parcours complet n'a pas été confirmé.
- **Nouvelles fonctionnalités** : propositions qui nécessitent une conception et une implémentation.
- **Améliorations** : renforcements des mécanismes existants.

## 2. Architecture examinée

| Domaine | Modules principaux | Responsabilité |
|---|---|---|
| Gestion | `NotebookManager.ts`, `types.ts` | Modèle, cycle de vie et persistance des notebooks |
| Ingestion | `SourceIngester.ts` | Import, extraction, normalisation et découpage des sources |
| Recherche | `EmbeddingStore.ts`, `RAGEngine.ts` | Embeddings, recherche hybride et récupération de passages |
| Conversation | `GroundedChat.ts` | Chat fondé sur les sources, citations et historique |
| Génération | `ContentGenerator.ts` | Création de contenus à partir du corpus |
| Traitement | `ProcessingQueue.ts` | File de tâches, priorités, progression et reprises |
| Cache | `ResponseCache.ts` | Mise en cache des réponses et résultats de recherche |
| Sauvegarde | `BackupService.ts` | Sauvegarde et restauration |
| Interface | `NotebooksView.tsx`, `NotebookDetail.tsx`, `NotebookList.tsx`, `SourceViewer.tsx` | Liste, consultation, studio et navigation |
| API | Routes notebooks, sources, chat, notes, contenu, audio, backup, queue, embeddings et cache | Exposition des opérations du système |

Les noms et responsabilités ci-dessus décrivent les modules examinés ; ils ne constituent pas à eux seuls une preuve de robustesse opérationnelle ou de couverture de tests.

## 3. Inventaire des fonctionnalités existantes repérées

### 3.1 Gestion des notebooks
1. Création et suppression de notebooks.
2. Modification du titre et de la description.
3. Personnalisation par couleur et icône.
4. Métadonnées de création et de dernière modification.
5. Association à un workspace.
6. Filtrage par workspace.
7. Recherche dans la liste.
8. Tri par date de modification, titre ou nombre de sources.
9. Affichage en liste ou en grille.
10. Statistiques et nombre de sources.
11. Sélection et ouverture d'un notebook.
12. Gestion d'un notebook par défaut / point d'entrée associé.

### 3.2 Sources et ingestion
13. Import de fichiers PDF, TXT, Markdown et HTML via le parcours d'ingestion inspecté.
14. Ajout de contenu textuel manuel.
15. Import depuis une URL.
16. Import de vidéos YouTube et extraction de leur contenu textuel lorsque disponible.
17. Import de dépôts GitHub avec exploration et extraction de fichiers.
18. Import ou analyse d'un codebase.
19. Métadonnées de source : nom, type, taille et informations associées.
20. Extraction de texte et préparation du contenu.
21. Découpage en chunks avec chevauchement.
22. Conservation d'informations de page ou de section lorsque disponibles.
23. Génération de résumé, mots-clés et langue.
24. Indexation et suivi de progression.
25. Suppression d'une source.
26. Réindexation d'une source.
27. Consultation du contenu d'une source.
28. Filtrage/sélection des sources pour certaines opérations.

### 3.3 Recherche, RAG et conversation
29. Questions-réponses ancrées dans le contenu du notebook.
30. Récupération de passages pertinents.
31. Recherche sémantique par embeddings.
32. Recherche lexicale de type TF-IDF.
33. Fusion des résultats sémantiques et lexicaux (RRF).
34. Réordonnancement de candidats par modèle.
35. Expansion de requête et génération de sous-questions.
36. Citations vers les sources et extraits utilisés.
37. Affichage d'informations de pertinence associées aux passages.
38. Filtrage des sources utilisées dans une conversation.
39. Historique et fils de conversation.
40. Personnalités / modes de conversation.
41. Suggestions de questions et relances.
42. Réponses en streaming et possibilité d'interrompre une génération.
43. Condensation/résumé du contexte conversationnel.
44. Modes d'analyse approfondie (*Deep Dive*).
45. Comparaison de sources et extraction d'insights.
46. Retour utilisateur sur les réponses.
47. Export Markdown des conversations.
48. Enregistrement de messages dans le workspace.
49. Navigation depuis une citation vers la source correspondante.

> Paramètres observés dans le code RAG examiné : pondération par défaut de la recherche hybride, nombre de chunks/candidats, limite de sous-questions, dimension d'embedding et seuil de pertinence. Ces valeurs sont des paramètres d'implémentation, pas des garanties de qualité. Elles doivent être évaluées sur un corpus de référence.

### 3.4 Notes et espace visuel
50. Création, lecture, modification et suppression de notes.
51. Épinglage de notes.
52. Références entre notes et sources.
53. Conversion d'une note en source indexable.
54. Canvas spatial avec déplacement des éléments.
55. Zoom, déplacement de la vue et remise à zéro.
56. Prévisualisation et édition du contenu.
57. Détection de liens internes basée sur des correspondances de titres.

### 3.5 Studio de génération
58. Génération de résumés.
59. Génération de FAQ.
60. Guides d'étude et glossaires.
61. Briefings, plans et rapports.
62. Chronologies et cartes mentales.
63. Analyses SWOT, risques et synthèses.
64. Contenus business, marché, technique et concurrentiel.
65. Contenus financiers, marketing, produit et exécutifs.
66. Roadmaps et contenus de projet.
67. Visualisations, graphiques et analyses de données.
68. Analyses comparatives et rapports de synthèse.
69. Sélection des sources et instructions personnalisées.
70. Paramètres de langue et de format selon le type de contenu.
71. Génération en streaming avec aperçu.
72. File de génération, progression, annulation et reprise selon le traitement.
73. Export ou transfert de contenus vers le workspace.
74. Conversion de certains contenus générés en sources.
75. Génération de présentations / diapositives et export HTML repérés dans le périmètre examiné.

### 3.6 Audio
76. Préparation de scripts audio à partir d'un notebook.
77. Formats de présentation à plusieurs intervenants.
78. Paramètres de longueur et de ton.
79. Sélection/mappage de voix TTS.
80. Export Markdown du script.
81. Enregistrement du script dans le workspace.
82. Assistant vocal associé au notebook.
83. Questions-réponses vocales fondées sur les connaissances du notebook.

### 3.7 Persistance et exploitation
84. Persistance locale basée sur des données JSON.
85. Écriture différée / debouncing.
86. Chargement des notebooks au démarrage.
87. Sauvegardes automatiques et manuelles.
88. Politique de rétention des sauvegardes.
89. Restauration totale ou sélective selon les opérations disponibles.
90. Prise en compte des embeddings dans les mécanismes de sauvegarde.
91. File de traitement avec priorités.
92. Contrôle de concurrence.
93. Mécanismes de retry avec backoff.
94. Annulation de tâches.
95. Cache des réponses et résultats RAG.
96. Invalidation et éviction de cache.
97. Statistiques de cache et d'embeddings.

### 3.8 Navigation de l'interface
- Vue liste/grille des notebooks, recherche et tri.
- Espace de détail organisé autour des sources, de la discussion/consultation et du Studio.
- Onglets ou espaces repérés pour génération, notes, historique et audio.
- Raccourcis clavier repérés : `Ctrl/Cmd+2` discussion, `+3` notes, `+4` génération, `+5` audio, `+6` historique.
- Maintien de certains panneaux montés lors du changement d'onglet afin de préserver leur état local.

## 4. Points de vigilance et limites à confirmer

1. **Isolation workspace :** la liste peut être filtrée par workspace alors qu'un accès par identifiant peut effectuer une recherche globale. Vérifier systématiquement l'autorisation et le workspace sur chaque lecture, modification, suppression, restauration et route API. Il s'agit d'un axe d'audit prioritaire, pas d'une vulnérabilité exploitée démontrée.
2. **Durabilité à l'arrêt :** vérifier que le flush des écritures asynchrones est réellement attendu avant la fermeture du processus.
3. **Persistance monolithique :** si sources, chunks, conversations et contenus sont stockés dans un même document JSON, les gros notebooks peuvent provoquer réécritures coûteuses et risques de contention.
4. **Validation des données :** un parsing JSON suivi d'un simple cast TypeScript ne remplace pas une validation de schéma à l'exécution.
5. **Récupération de queue :** vérifier la reprise après crash/redémarrage, pas seulement les retries dans une session active.
6. **Canvas :** les positions semblent gérées localement dans l'interface ; confirmer leur persistance après fermeture et réouverture.
7. **Backlinks :** une correspondance de titre peut produire des liens accidentels ; les relations explicites sont plus fiables.
8. **Formats annoncés :** DOCX et audio apparaissent dans certains types ou éléments de visualisation, mais le parcours standard d'upload examiné ne les autorise pas tous. Ne pas les présenter comme formats entièrement pris en charge avant validation de bout en bout.
9. **Qualité RAG :** les paramètres techniques ne suffisent pas ; il faut des jeux d'évaluation, des métriques et des tests de citations.
10. **Cohérence cache/index :** les changements de source, d'embeddings, de prompt ou de modèle doivent invalider les résultats dépendants.
11. **Gros volumes :** mesurer mémoire, temps d'extraction, taille des chunks et concurrence sur des corpus réalistes.
12. **Observabilité :** chaque opération longue doit avoir un identifiant, un statut durable, des erreurs exploitables et une durée mesurable.

## 5. Les 20 nouvelles fonctionnalités proposées

Chaque proposition est une évolution à concevoir ; aucune n'est considérée comme déjà livrée.

### F01 — Graphe de connaissances
Construire automatiquement un graphe d'entités, concepts, personnes, produits, événements et relations extraits des sources. Permettre d'explorer les relations, d'ouvrir les preuves et de filtrer par source/date.

### F02 — Recherche multi-notebooks
Interroger plusieurs notebooks simultanément avec filtres par workspace, notebook, date, type de source et niveau de confiance. Fournir des citations qui identifient sans ambiguïté le notebook d'origine.

### F03 — Détecteur de contradictions
Repérer les affirmations incompatibles entre sources, présenter les deux passages, leur date et leur provenance, puis laisser l'utilisateur qualifier le conflit.

### F04 — Vérificateur de faits
Extraire les affirmations d'une réponse ou d'un document et les classer : étayée, partiellement étayée, non étayée ou contredite. Chaque verdict doit pointer vers les preuves.

### F05 — Détecteur de lacunes de connaissance
À partir d'une question ou d'un objectif, identifier les informations manquantes, les hypothèses non vérifiées et les sources nécessaires pour compléter le dossier.

### F06 — Recherche web assistée et sourcée
Autoriser une recherche externe contrôlée depuis un notebook, avec collecte des URL, dates de consultation, extraits, détection de doublons et validation avant import.

### F07 — Surveillance des sources évolutives
Surveiller les URL et dépôts GitHub connectés, détecter les changements, comparer les versions et proposer une réindexation ciblée avec historique des différences.

### F08 — Centre de veille
Définir des sujets, mots-clés et sources suivis ; produire un digest périodique des nouveautés, changements, contradictions et signaux importants.

### F09 — Timeline probante
Construire des chronologies à partir des dates extraites, en distinguant date de publication, date de l'événement et date d'import. Chaque événement doit conserver sa preuve.

### F10 — Exploration associative
Proposer des concepts, sources et questions connexes à partir du contexte consulté, sans mélanger les suggestions avec les résultats factuels.

### F11 — Agent de recherche multi-étapes
Planifier une recherche, décomposer l'objectif, interroger les sources, identifier les lacunes, recommencer si nécessaire et produire un rapport avec journal des étapes et citations.

### F12 — Workflows de recherche réutilisables
Créer des pipelines configurables : collecte → extraction → analyse → vérification → synthèse → export. Ajouter déclencheurs, paramètres, reprises et approbations.

### F13 — Centre d'apprentissage
Générer flashcards, quiz adaptatifs, examens blancs et parcours de révision à partir du corpus, avec réponses reliées aux passages sources.

### F14 — Éditeur documentaire avancé
Éditer les rapports générés dans un éditeur structuré avec commentaires, versions, comparaison, blocs réutilisables et liens bidirectionnels vers les sources.

### F15 — Présentations natives
Créer des présentations éditables avec plan, diapositives, notes orateur, graphiques et citations ; exporter en PPTX et PDF en conservant les références.

### F16 — Intelligence vidéo
Analyser les vidéos avec chapitres, transcription horodatée, intervenants lorsque possible, extraits et navigation vers le bon instant.

### F17 — Intelligence visuelle
Extraire et interroger tableaux, diagrammes, captures et images ; conserver la page, la zone et la source de chaque élément interprété.

### F18 — Data Intelligence
Importer CSV/XLSX, profiler les colonnes, détecter anomalies et tendances, produire des analyses reproductibles et relier chaque résultat aux données d'origine.

### F19 — Collaboration et partage contrôlé
Ajouter commentaires, annotations, partage par notebook, rôles, droits par source et historique des modifications. Les notebooks privés doivent rester isolés par défaut.

### F20 — Agent autonome du notebook
Permettre de déléguer un objectif à un agent qui planifie, recherche, synthétise et prépare des actions. Afficher le plan, les sources, les coûts et les opérations ; exiger une approbation pour les actions sensibles ou externes.

## 6. Les 20 améliorations proposées

### A01 — Écritures atomiques et gestion des conflits
Remplacer les écritures JSON fragiles par des écritures atomiques, verrouillage ou contrôle de version, détection de conflits et stratégie de récupération après interruption.

### A02 — Versionnement de schéma et migrations
Ajouter `schemaVersion`, migrations déterministes, validation runtime et sauvegarde préalable aux migrations. Refuser proprement les versions incompatibles.

### A03 — Sauvegardes vérifiables
Ajouter checksum, manifeste, aperçu de restauration, vérification d'intégrité, sauvegardes incrémentales et tests réguliers de restauration.

### A04 — Isolation et autorisations par notebook
Centraliser une politique d'accès appliquée à chaque route et opération. Tester les accès croisés entre workspaces, y compris via identifiants devinés, tâches différées et restauration.

### A05 — Ingestion idempotente et déduplication
Calculer un hash de contenu normalisé, détecter les doublons, distinguer même fichier/même contenu et permettre une mise à jour sans réimport complet.

### A06 — États d'ingestion explicites
Définir des états durables par source : en attente, extraction, découpage, embedding, indexée, partielle, échouée, annulée. Exposer les erreurs et une reprise ciblée.

### A07 — Workers isolés et limites de ressources
Déporter les traitements lourds dans des workers, limiter mémoire/CPU/concurrence et appliquer des timeouts par type de source. Éviter qu'un import bloque l'interface ou les autres notebooks.

### A08 — Chunking adaptatif
Découper selon la structure documentaire : titres, paragraphes, tableaux, code, pages et horodatages. Préserver le contexte parent et éviter les chunks qui coupent une unité logique.

### A09 — Réconciliation de l'EmbeddingStore
Détecter les embeddings manquants, obsolètes ou orphelins ; réindexer de façon incrémentale ; suivre les versions de modèle et dimension ; fournir une réparation ciblée.

### A10 — Recherche hybride adaptative
Ajuster la pondération lexicale/sémantique selon le type de requête, la langue et le corpus. Ajouter filtres métadonnées, déduplication des passages et seuils calibrés.

### A11 — Évaluation continue du RAG
Créer un corpus de questions/réponses de référence et mesurer Recall@k, MRR/nDCG, précision des citations, exactitude, taux d'abstention, latence et coût. Comparer les régressions entre versions.

### A12 — Validation automatique des citations
Vérifier que chaque citation existe, correspond au passage, soutient réellement l'affirmation et n'est pas hors contexte. Signaler les affirmations sans preuve.

### A13 — Gestion de l'incertitude et abstention
Distinguer absence de preuve, preuve faible et contradiction. Autoriser le système à demander une précision ou à répondre qu'il ne sait pas plutôt que d'inventer.

### A14 — Deep Dive traçable
Afficher le plan de recherche, les sous-questions, les sources consultées, les passages retenus, les étapes terminées et les raisons d'arrêt. Rendre le processus annulable et reprenable.

### A15 — Persistance du Canvas
Stocker les coordonnées, dimensions, zoom, liens et état du canvas dans le modèle de données ; restaurer exactement la disposition à la réouverture et gérer les migrations.

### A16 — Relations explicites entre notes
Remplacer ou compléter les backlinks par des relations typées et persistées : référence, contradiction, dépendance, synthèse, suite logique. Prévoir suppression et renommage sans liens cassés.

### A17 — Génération robuste et versionnée
Limiter la concurrence, rendre les jobs reprenables, conserver les versions, comparer deux sorties, gérer les erreurs partielles et permettre de relancer uniquement les étapes échouées.

### A18 — Audio synchronisé
Associer script, transcription et audio avec timestamps, chapitres, navigation synchronisée, reprise de lecture et liens vers les sources citées.

### A19 — Cache versionné et cohérent
Inclure dans les clés de cache les versions du corpus, des sources, des embeddings, des prompts et du modèle. Invalider précisément les dépendances modifiées.

### A20 — UX unifiée et accessible
Harmoniser les états de chargement, erreurs et vides ; rendre les panneaux redimensionnables ; mémoriser les préférences ; améliorer navigation clavier, focus, accessibilité et responsive desktop.

## 7. Priorisation recommandée

| Priorité | Chantiers | Pourquoi |
|---|---|---|
| P0 — Fiabilité et sécurité | A01, A02, A03, A04, A06 | Éviter corruption, pertes de données et accès inter-workspaces |
| P1 — Qualité de connaissance | A05, A08, A09, A10, A11, A12, A13 | Rendre les réponses vérifiables et la recherche mesurable |
| P2 — Expérience utilisateur | A15, A16, A17, A18, A20 | Fiabiliser les parcours quotidiens |
| P3 — Intelligence avancée | F01, F03, F04, F05, F09, F10 | Transformer les sources en connaissances structurées |
| P4 — Recherche et automatisation | F02, F06, F07, F08, F11, F12, F20 | Accroître la portée et l'autonomie avec contrôle |
| P5 — Production multimodale | F13, F14, F15, F16, F17, F18, F19 | Étendre les usages d'apprentissage, de production et de collaboration |

## 8. Plan d'exécution suggéré

### Passe 1 — Audit de sûreté et de durabilité
- Cartographier toutes les routes et tous les accès à un notebook par ID.
- Vérifier l'isolation workspace et les permissions.
- Tester fermeture brutale pendant une écriture, restauration et migration.
- Documenter les formats réellement supportés de bout en bout.

### Passe 2 — Solidifier le pipeline d'ingestion
- Définir un contrat d'état par source.
- Ajouter hash, idempotence, reprise et erreurs partielles.
- Mesurer les limites de ressources.
- Tester PDF longs, HTML malformé, dépôts volumineux et fichiers invalides.

### Passe 3 — Mesurer et améliorer le RAG
- Constituer un jeu d'évaluation représentatif et multilingue.
- Mesurer retrieval, qualité de réponse et fidélité des citations.
- Ajuster chunking, fusion, reranking et seuils sur les résultats.
- Mettre en place des tests de non-régression.

### Passe 4 — Fiabiliser les outils de production
- Persister le Canvas et les relations.
- Rendre génération et audio reprenables.
- Versionner les contenus générés et leurs sources.
- Harmoniser les états UI et l'accessibilité.

### Passe 5 — Ajouter l'intelligence différenciante
- Graphe de connaissances.
- Vérification des faits et contradictions.
- Recherche multi-notebooks.
- Workflows et agent de recherche avec journal d'exécution et approbations.

## 9. Critères d'acceptation transverses

Toute nouvelle fonctionnalité Notebook doit respecter les critères suivants :

- **Traçabilité :** chaque résultat généré à partir des sources conserve sa provenance.
- **Isolation :** aucune donnée ne traverse un workspace sans autorisation explicite.
- **Durabilité :** les opérations longues et les changements critiques survivent à un redémarrage.
- **Reprise :** une erreur partielle ne force pas à recommencer tout le traitement.
- **Observabilité :** statut, durée, erreurs et identifiants de corrélation sont accessibles.
- **Performance :** les traitements volumineux sont bornés et ne bloquent pas le thread UI.
- **Sécurité :** les entrées externes sont considérées comme non fiables ; les actions sensibles sont soumises à autorisation.
- **Qualité :** tests unitaires, intégration et non-régression couvrent les parcours critiques.
- **Accessibilité :** navigation clavier, focus, libellés et états d'erreur sont cohérents.
- **Documentation :** chaque capacité indique clairement ses formats supportés, limites et dépendances.

## 10. Matrice de tests à construire

| Domaine | Scénarios minimaux |
|---|---|
| Gestion | Création, renommage, suppression, workspace invalide, notebook absent |
| Permissions | Lecture/écriture inter-workspaces, ID forgé, tâche différée, restauration |
| Ingestion | Format invalide, fichier vide, doublon, gros fichier, extraction partielle, annulation |
| Indexation | Embedding manquant, modèle changé, réindexation, index orphelin |
| RAG | Aucune preuve, sources contradictoires, citation invalide, langue différente, corpus vide |
| Queue | Crash, redémarrage, retry, annulation, saturation, job bloqué |
| Sauvegarde | Backup interrompu, checksum incorrect, restauration partielle, migration |
| Canvas | Déplacement, fermeture/réouverture, suppression de note, liens cassés |
| Génération | Échec modèle, streaming interrompu, retry, versions concurrentes |
| Audio | Voix indisponible, script vide, interruption, synchronisation timestamps |

## 11. Indicateurs de succès

Établir une baseline avant optimisation, puis suivre :
- taux de réussite d'ingestion par format ;
- taux de reprise réussie après erreur ou redémarrage ;
- temps médian et P95 d'ingestion et d'indexation ;
- Recall@k et MRR du retrieval ;
- précision des citations et taux d'affirmations non étayées ;
- taux d'abstention appropriée ;
- latence et coût moyen d'une réponse ;
- taux de restauration réussie ;
- nombre de défauts d'isolation détectés par les tests ;
- taux de réussite des parcours UI critiques.

## 12. Conclusion

La base Notebook couvre déjà un périmètre riche : gestion de corpus, ingestion, RAG, conversations, notes, génération, audio, sauvegarde et traitement asynchrone. Le meilleur investissement immédiat n'est pas d'ajouter davantage de boutons : il faut d'abord garantir l'isolation, la durabilité, la reprise des traitements et la qualité mesurée des réponses.

**Ordre recommandé :** sécuriser les données → fiabiliser ingestion et indexation → mesurer le RAG → améliorer les parcours → développer le graphe de connaissances, la vérification des faits et l'agent de recherche.

---

*Document d'audit et de roadmap — à mettre à jour après chaque passe d'implémentation et chaque validation par tests.*


---

## 10. État d'implémentation — branche `fix/notebooks-data-integrity-persistence`

Cette section suit les corrections effectivement apportées après l'audit. Elle ne vaut pas validation d'exécution : les tests TypeScript et les tests automatisés doivent encore être lancés dans un clone local.

### Corrections appliquées

| Référence audit | État | Implémentation |
|---|---|---|
| A01 — Écritures atomiques | Partiel | `NotebookManager` écrit d'abord dans un fichier temporaire puis publie par renommage atomique. Le flush immédiat est réellement synchrone, donc `flushAll()` ne retourne plus avant la fin de ses écritures. |
| A03 — Sauvegardes vérifiables | Partiel | Les nouveaux backups incluent les SHA-256 des notebooks et index d'embeddings. La restauration vérifie les sommes avant de remplacer les fichiers. Les anciens backups sans checksum restent acceptés. |
| A04 — Isolation workspace | Appliqué sur les routes HTTP notebook | Middleware de contrôle du workspace actif sur CRUD, sources, chat, audio, contenu, notes et embeddings ; export contrôlé ; accès WebSocket notebook et statistiques globales limités au workspace. |
| A09 — Cohérence EmbeddingStore | Partiel | Écritures d'index via fichier temporaire + renommage ; numéro de génération empêchant une écriture asynchrone ancienne d'écraser un flush plus récent ; invalidation des écritures en vol lors de la suppression d'un notebook. |
| A02 — Validation runtime | Partiel | Validation structurelle et cohérence entre identifiant du fichier et identifiant du notebook au chargement. Les migrations versionnées ne sont pas encore implémentées. |

### Points restant à traiter

- Ajouter un véritable système `schemaVersion` et des migrations versionnées.
- Garantir la durabilité des écritures avec synchronisation disque adaptée et gestion des erreurs remontée à l'appelant.
- Étendre la politique workspace aux autres points d'entrée internes non HTTP et valider le cycle de vie complet des WebSockets.
- Ajouter des tests automatisés : accès inter-workspaces, notebooks historiques/corrompus, interruption pendant écriture, suppression pendant flush, checksum invalide et restauration de backups historiques.
- Vérifier la restauration coordonnée notebook + embeddings et le comportement si une des deux publications échoue.
- Exécuter `tsc --noEmit`, les tests ciblés et la suite notebooks complète dans l'environnement du dépôt.

**Important :** l'isolation appliquée compare le `workspaceId` du notebook à `SELF_ROOT`. Les notebooks historiques sans workspace sont donc volontairement masqués lorsqu'un workspace actif est défini ; leur migration ou réaffectation doit être prévue avant déploiement si ces données doivent rester accessibles.


### Deuxième passe — migrations et reprise de file

| Sujet | État | Détail |
|---|---|---|
| A02 — Versionnement du schéma | Partiel renforcé | Ajout de `schemaVersion` et migration v0 → v1 au chargement. Les champs historiques facultatifs sont normalisés ; une version future inconnue est refusée sans réécriture destructive. |
| Queue de traitement | Partiel | La file des sources persiste atomiquement les tâches en attente ainsi que celles en backoff de retry, puis les recharge au démarrage. Les payloads Buffer sont sérialisés via JSON et restent compatibles avec `Buffer.from`. Les tâches en backoff reprennent comme tâches pending après redémarrage. |

**Limite de reprise volontaire :** seules les tâches encore en attente sont restaurées. Une tâche déjà en cours au moment du crash n'est pas rejouée automatiquement, car son effet peut être partiellement appliqué (ingestion, indexation ou ajout de source). La rejouer sans clé d'idempotence durable pourrait créer des doublons. La reprise exactement-une-fois nécessite une clé d'ingestion persistée de bout en bout et une transaction coordonnant source, embeddings et état de tâche.

### Validation locale complémentaire

- Vérifier la migration v0 → v1 sur des fixtures issues de notebooks réels.
- Vérifier la persistance et l’annulation d’une tâche pendant son délai de retry.
- Vérifier le refus d'un `schemaVersion` supérieur sans modification du fichier d'origine.
- Redémarrer le serveur avec des tâches pending et vérifier leur reprise.
- Simuler un arrêt avec une tâche processing et confirmer qu'elle n'est pas silencieusement rejouée.
- Vérifier le chemin de stockage dans Electron et en mode serveur.


### Troisième passe — réconciliation des embeddings

| Sujet | État | Détail |
|---|---|---|
| A09 — Propriété des vecteurs | Corrigé dans le chemin d'indexation | Un chunk déjà présent n'est ignoré que si son embedding appartient au même notebook et à la même source. Un propriétaire incohérent est supprimé puis recalculé. |
| A09 — Suppression ciblée | Renforcé | La suppression d'une source ne retire désormais que les vecteurs appartenant à cette source ET au notebook ciblé. |
| A09 — Réparation du corpus | Implémenté | Nouvelle méthode `EmbeddingStore.reconcileNotebook()` : compare les chunks attendus aux embeddings existants, supprime les vecteurs orphelins/mal attribués, indexe les chunks manquants et retourne un rapport (`expected`, `before`, `removed`, `indexed`, `missing`). |
| A09 — API de maintenance | Implémenté | Nouvelle route `POST /:id/embeddings/reconcile`, protégée par le middleware workspace existant. Un résultat `partial` signale les embeddings qui restent indisponibles après tentative de réparation. |

**Limites à valider :** la réconciliation s'appuie sur les sources déjà présentes dans le fichier notebook ; elle ne restaure pas une source perdue. Les embeddings sont persistés avec le mécanisme asynchrone existant. `embedTexts()` convertit actuellement les erreurs de batch en vecteurs vides : le rapport `missing` les rend visibles, mais une politique de retry avec backoff et un statut durable par chunk restent à construire. Aucun test automatisé dédié à cette passe n'a encore été exécuté.

### Quatrième passe — ingestion idempotente et ordre de persistance

| Sujet | État | Détail |
|---|---|---|
| Empreinte de contenu | Implémenté | `Source.contentHash` reçoit une empreinte SHA-256 du texte extrait. Les anciens enregistrements sont compatibles : l'empreinte est recalculée à la comparaison. |
| Déduplication des imports | Implémenté | `NotebookManager.addSource()` compare le type, l'origine normalisée et l'empreinte. Un import identique conserve l'identifiant de la source et ses IDs de chunks au lieu d'ajouter un doublon. |
| Ordre source → embeddings | Corrigé | `SourceIngester` n'indexe plus les embeddings. `addSource()` écrit d'abord le notebook de façon atomique, puis déclenche l'indexation. Si l'écriture échoue, la source est retirée de la mémoire et l'indexation n'est pas lancée. |
| Réparation au nouvel import | Renforcé | Un import reconnu comme doublon relance l'indexation des chunks canoniques : cela peut réparer un index partiellement absent sans dupliquer la source. |

**Limites :** une source modifiée à la même origine est actuellement enregistrée comme une nouvelle entrée (pas de remplacement/versionnement de l'entrée précédente). La déduplication dépend du texte extrait et du couple type/origine ; elle ne détecte pas les fichiers identiques sous des noms ou origines différents. Les appels concurrents identiques peuvent encore lancer deux tentatives d'embedding, même si une seule source canonique est conservée. L'indexation reste asynchrone et sa reprise après crash repose sur `reconcileNotebook()` ; aucun test automatisé ni typecheck n'a été exécuté dans cette session.

### Contrôle des routes statiques

Le middleware d'isolation est placé avant les routes métier. Les segments réservés `stats`, `sandbox` et `embeddings` sont explicitement laissés aux endpoints statiques correspondants (`/stats/global`, `/sandbox/folders`, `/embeddings/memory`) afin que le garde workspace ne les interprète pas comme des identifiants de notebook.


### Cinquième passe — remplacement d'une source modifiée à origine constante

| Sujet | État | Détail |
|---|---|---|
| Remplacement plutôt que doublon | Implémenté | Lorsqu'un import partage le même type et la même origine normalisée, une empreinte identique conserve la source existante ; une empreinte différente remplace son contenu dans la même entrée et conserve son ID. |
| Identité des chunks | Renouvelée | Les chunks du nouveau contenu reçoivent de nouveaux IDs et pointent vers l'ID canonique de la source. Les anciens IDs ne peuvent donc pas être pris pour des embeddings valides du nouveau texte. |
| Publication durable | Ordonnée | Le notebook contenant la nouvelle version est écrit atomiquement avant la suppression des vecteurs de l'ancienne version et le lancement de la nouvelle indexation. En cas d'échec du flush, l'objet source précédent est restauré en mémoire. |
| Indexations concurrentes | Protégées | EmbeddingStore suit une génération par couple notebook/source. Toute indexation ayant commencé avant un remplacement est invalidée et ne peut pas publier ses vecteurs après son appel réseau. |
| Réparation après interruption | Partielle | Si le processus s'arrête après publication de la source et avant la fin de l'indexation, reconcileNotebook() peut supprimer les vecteurs orphelins et indexer les nouveaux chunks au prochain passage. |

**Limites et validation requise :** le remplacement conserve l'identifiant de source, mais les IDs de chunks changent volontairement. La suppression puis l'indexation des embeddings restent deux opérations locales distinctes ; une interruption entre les deux laisse temporairement un index incomplet, réparable par la réconciliation. Les métadonnées dérivées (résumé, mots-clés, taille, langue) sont celles du nouvel import. La normalisation d'origine reste volontairement simple : elle ne fusionne pas les URL équivalentes avec paramètres ou redirections différents. Les imports concurrents du même emplacement peuvent encore faire travailler deux extracteurs en parallèle ; le dernier remplacement durable gagne. Aucun test automatisé ni typecheck n'a été exécuté dans cette session.

Tests locaux à ajouter/exécuter avant de retirer le statut draft :
- même type/origine + même hash : un seul enregistrement, ID source/chunks conservés ;
- même type/origine + hash différent : ID source conservé, contenu/chunks renouvelés, une seule source ;
- flush du notebook en erreur : ancienne source restaurée et aucune indexation du nouveau contenu ;
- indexation ancienne retardée : ses vecteurs ne sont pas publiés après remplacement ;
- réconciliation après interruption entre publication source et indexation : aucun ancien chunk restant, nouveaux chunks indexés ;
- même origine avec un type différent : comportement d'ajout distinct inchangé.


### Sixième passe — état durable et reprise de l'indexation des sources

| Sujet | État | Détail |
|---|---|---|
| État d'indexation | Implémenté | Chaque source peut persister `indexingStatus` (`pending`, `indexed`, `partial`, `failed`), `indexingUpdatedAt` et une erreur bornée. Les anciens notebooks restent compatibles : ces champs sont facultatifs. |
| Ordre durable | Renforcé | L'état `pending` est écrit dans le notebook avant l'appel d'embedding. L'état final n'est publié qu'après le résultat de l'indexation. |
| Reprise au démarrage | Implémenté | Au chargement du NotebookManager, les sources explicitement `pending`, `partial` ou `failed` sont reprises séquentiellement. Les tâches ne sont pas rejouées aveuglément : seule l'indexation vectorielle, conçue comme idempotente par ID de chunk, est relancée. |
| Nettoyage de version | Renforcé | Avant une réindexation, les embeddings déjà attribués à la source sont supprimés. Cela retire également les anciens IDs de chunks si le processus s'est arrêté après la publication du remplacement mais avant le nettoyage des vecteurs. |
| Visibilité opérationnelle | Implémenté côté modèle | L'état et la dernière erreur sont persistés avec la source ; l'interface et les endpoints de statut ne sont pas encore raccordés à ces champs. |
| Courses concurrentes | Protégées | Un numéro d'exécution local et l'empreinte de contenu empêchent une indexation ancienne de modifier l'état d'une version plus récente ou d'une reprise concurrente. |

**Limites :** les embeddings et le notebook restent deux fichiers distincts, sans transaction disque commune. Une interruption pendant la suppression/réindexation laisse la source en `pending` et sera réparée au prochain démarrage. Les reprises sont séquentielles et peuvent ralentir le démarrage avec un grand nombre de sources en attente. Une erreur d'embedding batch qui retourne des vecteurs vides produit un état `partial`, puis sera retentée au prochain démarrage ; aucun backoff persistant ni compteur de tentatives dédié par source n'est encore ajouté. Les notebooks historiques dont le champ d'état est absent ne sont pas automatiquement réindexés, afin d'éviter un coût massif inattendu ; un import identique ou une réconciliation manuelle peut déclencher la réparation. Aucun test automatisé ni typecheck n'a été exécuté dans cette session.

Validation locale recommandée :
- créer une source et vérifier que `pending` est durable avant l'appel embedding puis `indexed` après succès ;
- simuler un crash avec `pending` et vérifier la reprise au redémarrage ;
- simuler un remplacement interrompu après flush source mais avant suppression vectorielle, puis vérifier l'absence des anciens chunk IDs après reprise ;
- simuler une réponse embedding partielle et vérifier `partial`, puis le retry ;
- vérifier qu'une source historique sans état n'est pas réindexée automatiquement.


### Septième passe — supervision API et retry borné de l'indexation

| Sujet | État | Détail |
|---|---|---|
| Métadonnées de retry | Implémenté | Chaque source persiste le nombre de tentatives et la date de la prochaine tentative. Les notebooks existants restent compatibles avec des champs facultatifs. |
| Backoff exponentiel | Implémenté | Retry automatique après 5 s, 10 s, 20 s, etc., plafonné à 5 minutes et limité à 5 tentatives. L'échéance est enregistrée afin de restaurer le délai après redémarrage. |
| Reprise au démarrage | Renforcée | Une opération restée `pending` au crash est reprise ; les états `failed` et `partial` attendent leur échéance persistée et ne sont pas relancés avant celle-ci. Les échecs ayant épuisé le budget attendent une action manuelle. |
| Supervision API | Implémentée | `GET /:id/embeddings/indexing-status` retourne les compteurs et les états par source sans exposer le texte brut. |
| Retry manuel | Implémenté | `POST /:id/embeddings/sources/:sourceId/retry` remet à zéro le budget de retry et relance une seule source. |
| Réindexation globale | Centralisée | `POST /:id/embeddings/reindex` déclenche maintenant le pipeline de source central et répond HTTP 202 avec le nombre de sources acceptées, au lieu de contourner les statuts durables. |
| Déduplication des indexations | Corrigée | Suppression d'un ancien appel direct à `EmbeddingStore.indexChunks()` qui doublonnait l'indexation lorsqu'un import identique était détecté. |

**Limites :** le centre de supervision est exposé par API, mais aucun panneau UI n'est encore ajouté. Les retries sont gérés par timers en mémoire et réhydratés à partir de `indexingNextRetryAt` au redémarrage ; il n'existe pas encore de file durable dédiée par chunk. Le retry relance toute la source après nettoyage des vecteurs. Le système n'a pas été exécuté dans cette session : typecheck, tests et vérification runtime restent nécessaires.

Validation locale à ajouter :
- statut agrégé sur un notebook vide, indexé, partiel et en échec ;
- progression des tentatives et échéances 5/10/20 secondes, plafond à 5 minutes ;
- arrêt/redémarrage avant échéance puis reprise exactement à l'échéance ;
- aucune tentative automatique après 5 échecs, puis succès après retry manuel ;
- retry d'une source n'affectant pas les autres sources ;
- import identique ne déclenchant qu'une seule indexation ;
- réindexation globale passant par le pipeline et les statuts durables.


### Huitième passe — panneau UI de supervision de l'indexation

| Sujet | État | Détail |
|---|---|---|
| Intégration UI | Implémentée | Nouveau panneau `IndexingMonitor` intégré comme onglet « Indexation » du Studio Notebook, sans ajouter une page de navigation distincte. |
| Données réelles | Implémentées | Le panneau consomme `GET /:id/embeddings/indexing-status` et affiche les compteurs agrégés et l'état de chaque source. |
| Actualisation | Implémentée | Rafraîchissement périodique toutes les 5 secondes, avec bouton d'actualisation manuelle et nettoyage du timer au démontage. |
| Retry individuel | Implémenté | Le bouton « Réessayer » appelle uniquement l'endpoint de retry de la source sélectionnée ; l'action affiche son état occupé et les erreurs API. |
| Réindexation globale | Implémentée | Action explicite « Réindexer toutes les sources », désactivée si le notebook est vide ou si une demande est déjà en cours. |
| Diagnostic | Implémenté | Affichage du statut, du type, du nombre de tentatives, de la dernière erreur, de la dernière mise à jour et de la prochaine échéance lorsqu'elle existe. |
| Tests UI | Ajoutés | Test de caractérisation des compteurs, de l'affichage d'une erreur et du retry ciblé sans relance d'une source déjà indexée. |

**Limites fonctionnelles à ne pas masquer :**
- Le backend ne fournit actuellement que le statut d'indexation vectorielle. Le panneau ne prétend donc pas mesurer l'extraction, le découpage ou la génération de résumé.
- Il n'existe pas encore d'historique durable de toutes les tentatives : seule la dernière erreur, le compteur et les échéances courantes sont exposés.
- Le rafraîchissement est un polling HTTP toutes les 5 secondes, pas un flux temps réel WebSocket/SSE.
- Les sources historiques sans statut sont affichées « Non vérifiée » ; elles ne sont pas automatiquement considérées comme indexées.
- La réindexation globale relance le pipeline de toutes les sources. Elle peut entraîner un coût d'embedding et doit rester une action volontaire.

Validation locale requise :
- `npm run typecheck`
- `npm run test:ui -- src/components/notebooks/IndexingMonitor.test.tsx`
- `npm run lint:eslint:notebooks`
- vérifier le polling, le démontage du composant, les réponses 202, les erreurs 4xx/5xx et le comportement sur notebook vide.
- vérifier visuellement l'onglet sur largeur standard et étroite du panneau Studio.

## Huitième passe — panneau UI de supervision de l'indexation

- Ajout/intégration du panneau `IndexingMonitor` dans le Studio du notebook, avec raccourci `Ctrl/Cmd+7`.
- Lecture de l'endpoint `GET /:id/embeddings/indexing-status` et actualisation automatique toutes les 5 secondes, avec arrêt du timer au démontage.
- Vue agrégée : nombre total de sources, indexées, en attente, partielles, en échec, couverture par nombre de sources et tentatives cumulées.
- Vue par source : type, état, nombre de tentatives, dernière mise à jour, prochaine reprise et dernière erreur.
- Actions de retry individuel et réindexation groupée via les endpoints existants ; confirmation du nombre de sources mises en file.
- Correction : les sources historiques avec état `unknown` peuvent également être relancées individuellement. Elles n'étaient pas indexées automatiquement lors de la migration afin d'éviter un coût inattendu, mais doivent rester réparables depuis l'interface.

### Limites fonctionnelles explicites

- La progression affichée est celle de l'indexation vectorielle par source ; elle ne mesure pas un pourcentage interne d'appel d'embedding.
- L'extraction, le chunking et la génération de résumé ne disposent pas encore d'événements d'étape persistés. Le panneau ne les présente donc pas comme des étapes suivies.
- L'historique multi-tentatives n'est pas encore conservé : seules la dernière erreur, la date de mise à jour, le compteur et la prochaine échéance sont disponibles.
- Le panneau est intégré au Studio desktop large ; son accessibilité dans une disposition étroite/mobile reste à examiner.
- Les tests UI, le typecheck et les tests serveur doivent être exécutés localement avant de considérer cette passe comme validée.

### Dixième passe — raccordement des uploads à la queue persistée

- Les routes d'upload simple et multiple passent désormais par `sourceProcessingQueue` au lieu d'appeler directement `SourceIngester`.
- Le contrat HTTP des uploads existants est conservé : la route attend la fin du traitement et renvoie les métadonnées de source habituelles. Le lot multiple utilise la concurrence configurée de la queue et conserve un résultat individuel par fichier.
- Ajout de `waitForTask()` dans `ProcessingQueue` pour attendre un état terminal sans rater une tâche terminée entre l'enqueue et l'abonnement.
- Ajout d'une route de consultation `GET /:id/sources/tasks/:taskId` pour les tâches encore présentes dans le registre en mémoire, notamment celles créées par `upload-queued`.
- Le handler de queue retourne les métadonnées nécessaires à la compatibilité des réponses upload.
- Le handler vérifie à nouveau l'appartenance du notebook au workspace actif avant d'exécuter une tâche restaurée.
- Les échéances de retry sont maintenant persistées dans `nextAttemptAt` et respectées après redémarrage au lieu de relancer immédiatement tous les backoffs.
- Tests unitaires ajoutés pour `waitForTask()` et le respect de l'échéance de backoff restaurée.

**Limites restantes :**

- Les entrées URL, texte collé, conversion de notes et documents générés n'utilisent pas encore toutes la queue ; l'intégration de cette passe couvre les uploads de fichiers simple/multiple et l'endpoint upload-queued déjà existant.
- `waitForTask()` conserve le comportement HTTP synchrone pour ne pas casser les clients existants. Un client perdant sa connexion lors d'un redémarrage devra consulter le notebook après reprise ; la réponse terminale de tâche n'est pas encore conservée dans un journal durable.
- `GET /:id/sources/tasks/:taskId` expose le statut en mémoire ; il ne constitue pas un historique durable des tâches terminées.
- Les tâches en cours au moment d'un crash ne sont pas rejouées automatiquement, car leur effet peut être partiel. Seules les tâches pending/retrying persistées sont restaurées.
- La queue est partagée globalement par le processus ; l'isolation workspace est revalidée à l'exécution, mais un modèle de queue partitionnée par workspace reste préférable si plusieurs espaces doivent être traités simultanément.
- Les commandes `npm run typecheck`, les tests ciblés et `npm run lint:eslint:notebooks` restent à exécuter localement.

Compléments de la dixième passe :
- Une tâche n'est pas acceptée si l'écriture atomique initiale de la queue échoue.
- Les buffers sont sérialisés en base64 plutôt qu'en tableaux JSON d'octets, puis restaurés en véritables `Buffer`.
- Les erreurs permanentes (validation et 4xx) ne consomment plus de tentatives automatiques ; les erreurs réseau usuelles, timeouts et HTTP 408/425/429/5xx sont retentées.
- La persistance des transitions après acceptation initiale reste best-effort et les tâches `processing` ne sont pas récupérées après crash : ces limites sont explicites dans le compte rendu de passe.

### Onzième passe — pipeline d'ingestion unifié et historique durable

- Centralisation des soumissions via `enqueueSourceIngestion()` ; les imports URL, texte collé, codebase, conversion de notes et promotion de documents générés rejoignent désormais la queue commune, comme les uploads simple/multiple.
- Le handler central traite les payloads URL ou buffer, revalide le workspace actif, ajoute la source et invalide les caches.
- Persistance version 2 avec compatibilité lecture version 1 ; conservation des 200 derniers résultats terminaux et restauration au redémarrage.
- Les payloads terminés ne conservent que `notebookId` afin de garder le contrôle d'accès au statut sans archiver le contenu des sources.
- Test ajouté pour la restauration d'un résultat terminal après redémarrage.
- Limites : tâches `processing` toujours non récupérées après crash ; endpoints HTTP encore synchrones ; historique borné ; progression non détaillée par sous-étape ; queue globale au processus.


### Douzième passe — ergonomie adaptative du workspace Notebook

| Sujet | État | Détail |
|---|---|---|
| Largeur des panneaux | Implémenté | Les colonnes Sources et Studio sont redimensionnables à la souris avec des bornes de sécurité (Sources : 220–420 px ; Studio : 260–480 px). |
| Préférences locales | Implémenté | Les largeurs choisies sont conservées dans le stockage local du client. Une préférence absente, invalide ou illisible revient aux valeurs par défaut sans bloquer le Notebook. |
| Accessibilité des séparateurs | Implémenté | Les séparateurs sont exposés comme séparateurs verticaux focalisables et peuvent être ajustés au clavier avec les flèches ; Maj augmente le pas. |
| Mode Focus | Implémenté | Une action dans l'en-tête replie simultanément Sources et Studio pour donner la priorité à la discussion ; l'action inverse restaure les deux panneaux. Raccourci Ctrl/Cmd+0. |
| État d'indexation des sources | Implémenté | La liste compacte affiche les états réellement persistés : indexé, en attente, partiel, échec ou non vérifié pour les anciennes sources. L'erreur est accessible dans l'infobulle lorsqu'elle existe. |
| Compatibilité historique | Préservée | L'absence de indexingStatus reste neutre : aucun état de succès n'est inventé pour les sources historiques. |

**Validation restante :** le code a été poussé sur une branche dédiée, mais le typecheck, les tests UI, le lint et la vérification visuelle Electron doivent encore être exécutés dans l'environnement local. Vérifier en particulier le redimensionnement souris/tactile, les raccourcis sous Windows/macOS, le repli indépendant des panneaux, le comportement à 1024 px et la persistance après redémarrage.


### Treizième passe — Studio de génération orienté intention

| Sujet | État | Détail |
|---|---|---|
| Organisation par intention | Implémenté | Les formats rapides sont regroupés en catégories Comprendre, Apprendre, Analyser et Organiser ; les rapports spécialisés disposent de la catégorie Explorer. |
| Recherche de formats | Implémenté | Recherche locale sur le nom et la description des générateurs, sans nouvel appel API. Effacement et remise à zéro des filtres disponibles. |
| Découverte des formats | Implémenté | Les cartes affichent une description courte, conservent les infobulles détaillées et exposent un libellé accessible. |
| Rapports spécialisés | Préservé | La carte ouvre le ReportModal existant et ses 12 modèles ; aucune nouvelle logique de génération ni route API n'a été créée. La recherche reconnaît les noms des modèles de rapports. |
| Générations existantes | Préservées | Les actions continuent d'utiliser `handleGenerate`, la file d'attente, les modales d'infographie et les indicateurs de tâches actifs déjà présents. |
| État sans résultat | Implémenté | Un état vide explique qu'aucun format ne correspond et permet de réinitialiser les filtres. |

**Validation restante :** exécuter `npm run typecheck`, `npm run lint:eslint:notebooks` et `npm run test:ui` dans l'environnement local, puis vérifier visuellement la densité des cartes, la navigation clavier, les catégories et la recherche sur les formats et rapports.


### Quatorzième passe — diagnostic d'indexation visible dans les sources

- Le badge d'état est désormais toujours présent dans la liste compacte : les sources historiques sans champ d'état sont explicitement marquées « Non vérifiée » plutôt que de laisser croire qu'elles sont indexées.
- Les états `pending`, `indexed`, `partial` et `failed` reflètent les champs durables déjà stockés par `NotebookManager` ; aucun statut n'est déduit du nombre de chunks.
- L'infobulle rassemble le statut, le nombre de tentatives, la dernière mise à jour, la prochaine tentative planifiée et l'erreur éventuelle.
- Les horodatages sont validés avant formatage afin d'éviter d'afficher `Invalid Date` si une ancienne donnée est mal formée.
- Les types UI sont alignés sur les champs du modèle serveur (`indexingStatus`, `indexingAttempts`, `indexingError`, `indexingUpdatedAt`, `indexingNextRetryAt`).

**Validation CI observée :** une exécution GitHub Actions associée au commit précédent est remontée en `startup_failure`, sans job créé ; aucun résultat de typecheck/test/lint n'est disponible. Cela ne permet pas de conclure à un échec du code ni à une réussite. Refaire les validations dans l'environnement local et vérifier le démarrage de l'action GitHub.
