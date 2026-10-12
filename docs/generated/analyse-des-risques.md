# Analyse des risques — Leanna

## Périmètre et méthode

Cette analyse s’appuie exclusivement sur les éléments fournis concernant l’application desktop local-first Leanna, ses mécanismes annoncés de sécurité et d’exécution, ainsi que la configuration de la sandbox. Elle distingue les **constats explicitement présents dans les sources** des **risques potentiels déduits** de ces constats. Les niveaux de probabilité et de sévérité sont des appréciations qualitatives, et non des mesures issues de données d’incidents.

La documentation décrit des protections prévues — permissions, Safety Gate configurable, approbation humaine, checkpoints, ledger d’idempotence, preuves observables et rollback — mais précise également que les fonctionnalités présentent différents niveaux de maturité. Les éléments fournis ne permettent pas d’établir que chaque protection est active, correctement configurée ou testée dans l’environnement concerné.

### Barème utilisé

- **Probabilité** : faible (1), moyenne (2), élevée (3).
- **Sévérité / impact** : faible (1), moyenne (2), critique (3).
- **Score** = probabilité × sévérité :
  - **1–2 : faible**
  - **3–4 : modéré**
  - **6 : élevé**
  - **9 : critique**

Ce barème est une convention d’analyse destinée à hiérarchiser les risques ; ce n’est pas un barème indiqué dans les sources.

---

## 1. 📋 Synthèse des risques

Neuf risques sont recensés. La classification ci-dessous attribue chaque risque à une catégorie principale afin d’éviter les doubles comptes.

| Catégorie principale | Nombre | Principaux sujets |
|---|---:|---|
| Sécurité et configuration des accès | 3 | Identifiants exposés, clé maître déclarée deux fois, permissions d’exécution et de réseau |
| Confidentialité et flux réseau | 1 | Risque de sortie de données dans une configuration disposant d’un accès réseau |
| Intégrité de l’exécution et des données | 3 | Rejeu d’actions destructives, vérification insuffisante, échec du rollback ou de la récupération |
| Gouvernance et maturité des fonctionnalités | 1 | Écart possible entre les mécanismes annoncés et leur niveau réel de maturité |
| Maintenabilité et connaissance de l’architecture | 1 | Décalage potentiel du graphe Graphify après modification du code |

**Niveau de risque global : élevé.**  
Un risque est classé **critique** : des identifiants et clés sensibles semblent renseignés dans le fichier `.env` et doivent, selon les sources, être considérés comme compromis. Les sources ne permettent pas d’évaluer leur portée, leur utilisation effective ou l’existence d’une exploitation. La présence de permissions étendues et l’incertitude sur la maturité de certaines protections renforcent la priorité de traitement.

### Constats déterminants

1. Le contenu de `.env` est signalé comme contenant des secrets apparemment renseignés, contrairement au modèle `.env.example`. La source demande de les révoquer ou de les renouveler.
2. `Leanna_MASTER_KEY` apparaît dans deux déclarations ; la valeur effectivement retenue peut dépendre du chargeur d’environnement.
3. La configuration active de nombreux mécanismes d’autonomie et d’exécution d’outils, avec des permissions comprenant l’exécution et le réseau.
4. Le produit se fonde sur des garanties transactionnelles et des contrôles humains, mais les sources signalent des niveaux de maturité différents et ne détaillent pas l’état de déploiement de chaque protection.

---

## 2. ⚠️ Inventaire des risques

Les mesures proposées sont des recommandations d’analyse. Les rôles et délais sont des propositions de gouvernance, car les sources ne désignent ni responsables nominatifs ni calendrier de remédiation.

| ID | Risque et description | Impact potentiel | Probabilité | Sévérité | Score |
|---|---|---|---|---|---:|
| R1 | **Secrets présents dans `.env`** : des identifiants et clés sensibles y sont apparemment renseignés, tandis que le modèle `.env.example` les laisse vides. Les sources demandent de les traiter comme compromis. | Accès non autorisé possible aux ressources associées aux secrets, exposition de données ou utilisation abusive de services. La portée réelle est inconnue. | Élevée | Critique | **9 — critique** |
| R2 | **Déclaration dupliquée de `Leanna_MASTER_KEY`** : deux déclarations peuvent rendre la valeur effective ambiguë selon le chargeur d’environnement. | Utilisation d’une clé inattendue, incohérence de configuration ou difficulté à vérifier quelle clé protège effectivement les opérations concernées. | Moyenne | Critique | **6 — élevé** |
| R3 | **Permissions étendues dans un système autonome** : la configuration inclut des permissions d’exécution et de réseau, dans une application conçue pour planifier et agir via des agents et des outils. | Une action indésirable ou mal cadrée pourrait avoir des effets sur l’environnement d’exécution ou communiquer via le réseau. Les sources ne décrivent pas les limites exactes de ces permissions. | Moyenne | Critique | **6 — élevé** |
| R4 | **Sortie réseau de données ou de contexte** : Leanna est présentée comme local-first et indique que rien ne quitte la machine sans action explicite, mais la configuration sandbox comprend une permission réseau. | Transmission non souhaitée de données, de contexte de projet ou de résultats d’exécution si une action réseau est autorisée ou déclenchée. Aucune exfiltration n’est signalée dans les sources. | Moyenne | Critique | **6 — élevé** |
| R5 | **Rejeu d’une action destructive après interruption** : le produit vise à survivre aux crashs sans rejouer une action destructive, grâce notamment à un ledger d’idempotence et à des états persistés. | Modification répétée, duplication d’une opération ou dommage difficile à inverser si la protection échoue ou n’est pas disponible dans le cas concerné. | Faible | Critique | **3 — modéré** |
| R6 | **Résultat incorrect considéré comme réussi** : l’architecture insiste sur une vérification indépendante par preuve, car un retour `ok: true` ne suffit pas. | Validation d’une modification ou d’une mission incorrecte ; décision de commit fondée sur une preuve incomplète ou inadaptée. | Moyenne | Critique | **6 — élevé** |
| R7 | **Échec de checkpoint, rollback ou récupération** : ces mécanismes sont centraux dans le cycle d’exécution, mais leur comportement en cas de panne ou leur couverture ne sont pas détaillés dans les sources. | Perte de l’état antérieur, reprise incohérente ou incapacité à revenir à une situation vérifiée après une action échouée. | Faible | Critique | **3 — modéré** |
| R8 | **Écart entre protections annoncées et maturité effective** : le README distingue différents niveaux de maturité et indique que la plupart des composants marqués comme réalisés sont couverts par des tests, sans préciser les composants, scénarios ni résultats. | Dépendance opérationnelle à un contrôle supposé disponible, mais incomplet, non configuré ou insuffisamment vérifié. | Moyenne | Critique | **6 — élevé** |
| R9 | **Graphe d’architecture potentiellement obsolète** : les consignes Graphify demandent une mise à jour après les modifications de code ; l’outil décrit une extraction AST. | Analyse ou modification reposant sur une représentation dépassée ou partielle des relations entre composants. Les sources ne signalent pas de décalage effectivement constaté. | Faible | Moyenne | **2 — faible** |

### Précisions sur les évaluations

- Pour **R1**, la probabilité est élevée parce que la source qualifie explicitement les valeurs de compromettables et demande leur renouvellement. Cela ne signifie pas qu’une compromission ou une exploitation a été observée.
- Pour **R5** et **R7**, la probabilité est évaluée comme faible en l’absence d’incident documenté. Leur sévérité potentielle est néanmoins critique, car les opérations autonomes peuvent modifier des fichiers ou exécuter des actions et parce que le produit fait de la durabilité et de la récupération des propriétés centrales.
- Pour **R8**, le risque porte sur l’incertitude de maturité, non sur la preuve d’une défaillance. La source indique que certains mécanismes disposent de preuves identifiables dans le code et que la plupart sont couverts par des tests, sans permettre d’en vérifier l’étendue.

---

## 3. 📊 Matrice de risques

### Matrice probabilité × impact

L’impact correspond ici à la sévérité : faible, moyenne ou critique.

| Probabilité \ Impact | Faible | Moyenne | Critique |
|---|---|---|---|
| **Élevée** | — | — | **R1** |
| **Moyenne** | — | — | **R2, R3, R4, R6, R8** |
| **Faible** | — | **R9** | **R5, R7** |

### Classification par priorité

| Priorité | Risques | Justification |
|---|---|---|
| **P0 — action immédiate** | **R1** | Les secrets du `.env` sont explicitement à traiter comme compromis ; les sources demandent leur révocation ou leur renouvellement. |
| **P1 — traitement prioritaire** | **R2, R3, R4, R6, R8** | Risques liés à l’ambiguïté des clés, aux permissions, aux flux réseau, à la preuve de succès et à la maturité effective des protections. |
| **P2 — contrôle technique planifié** | **R5, R7** | Risques à fort impact potentiel liés à la reprise, à l’idempotence et au rollback ; les sources ne signalent pas de défaillance observée. |
| **P3 — amélioration continue** | **R9** | Risque de qualité de l’analyse technique, conditionné au maintien à jour du graphe. |

### Risques critiques nécessitant une action immédiate

**R1 est le seul risque classé critique par son score et par la présence d’un constat concret.** Il convient de révoquer ou renouveler les secrets concernés, puis de vérifier si d’autres copies existent dans la configuration ou dans les artefacts concernés. L’existence de ces copies et leur emplacement ne sont pas précisés dans les sources.

Les risques **R2 à R4, R6 et R8** justifient une action prioritaire, mais les sources ne permettent pas d’affirmer qu’ils correspondent à une vulnérabilité exploitée. Il faut d’abord clarifier la configuration effective et les preuves de fonctionnement des contrôles.

---

## 4. 🛡️ Plans de mitigation

### Plan par risque

| ID | Actions préventives | Plan de contingence | Responsable proposé / délai |
|---|---|---|---|
| **R1** | Révoquer ou renouveler immédiatement tous les identifiants et clés renseignés dans `.env`. Remplacer les valeurs par des paramètres gérés séparément du modèle `.env.example`. Vérifier les usages associés aux secrets, dans la limite des informations disponibles. | Si un accès non autorisé est détecté ou suspecté, révoquer les secrets concernés sans attendre, remplacer les valeurs, puis examiner les accès aux ressources associées. Les moyens de journalisation disponibles ne sont pas documentés. | **Responsable sécurité ou administrateur des secrets proposé. Immédiat, avant toute nouvelle utilisation de la sandbox.** |
| **R2** | Supprimer la déclaration dupliquée de `Leanna_MASTER_KEY`. Définir une seule source de vérité et vérifier, avec le chargeur utilisé, la valeur effectivement chargée. Documenter la procédure de rotation. | Si la valeur active ne peut pas être déterminée de manière fiable, considérer la configuration comme non maîtrisée, corriger les déclarations puis renouveler la clé selon les mécanismes disponibles. | **Responsable configuration proposé. Avant la prochaine exécution dépendant de cette clé.** |
| **R3** | Examiner les permissions réellement nécessaires aux missions. Limiter les permissions d’exécution et de réseau au besoin établi. Vérifier le fonctionnement du Safety Gate, des approbations humaines et des restrictions par outil ou mission. | En cas d’action inattendue, interrompre la mission si possible, révoquer ou réduire les permissions utilisées et appliquer un rollback lorsque celui-ci est disponible et vérifié. | **Responsable produit/runtime proposé, avec validation sécurité. Avant usage opérationnel de missions sensibles.** |
| **R4** | Clarifier quelles opérations réseau sont permises et quelles données peuvent être transmises. S’assurer que l’action réseau correspond à une action explicite et contrôlée, conformément à la promesse local-first décrite. | En cas de transfert inattendu suspecté, suspendre les permissions réseau concernées et examiner les actions de mission disponibles. Les sources ne précisent pas les capacités d’audit ou d’interruption. | **Responsable sécurité et responsable runtime proposés. Avant toute mission nécessitant le réseau.** |
| **R5** | Tester le ledger d’idempotence et les scénarios d’interruption pour les actions susceptibles d’être destructives. Confirmer les conditions empêchant leur rejeu et les critères de reprise. | Si un rejeu est constaté, arrêter la mission, préserver l’état observable, examiner le checkpoint et appliquer une récupération ou un rollback uniquement si sa validité est confirmée. | **Responsable runtime proposé. Avant mise en production ou exécution de missions destructives ; ensuite à chaque changement pertinent.** |
| **R6** | Définir des critères de succès explicites pour chaque mission et s’assurer que la preuve est indépendante de l’affirmation du modèle. Selon le README, des exemples de vérification comprennent hash de fichier, typecheck et tests, lorsque ces contrôles sont adaptés. | Si une vérification échoue ou ne fournit pas de preuve suffisante, ne pas considérer la mission comme réussie ; privilégier rollback ou récupération bornée et replanification. | **Responsable qualité/produit proposé, avec responsable de mission. À définir avant les missions à impact élevé.** |
| **R7** | Tester les séquences snapshot, exécution, vérification, commit, rollback et reprise après crash. Documenter les limites connues des checkpoints et états persistés. | Si la reprise est incohérente, suspendre les missions concernées et éviter tout nouveau commit jusqu’à réconciliation de l’état observable. | **Responsable runtime proposé. Lors des tests de version et après changement du noyau transactionnel.** |
| **R8** | Établir un inventaire des composants par niveau de maturité et des tests associés. Ne pas traiter une fonctionnalité comme garantie sans preuve identifiable et scénario de test pertinent. | Si un contrôle attendu n’est pas démontré, réduire l’autonomie ou désactiver la fonction correspondante jusqu’à vérification. | **Responsable produit et responsable qualité proposés. À réaliser avant l’élargissement des usages autonomes.** |
| **R9** | Appliquer la consigne fournie : après modification de fichiers de code, exécuter `graphify update .`. Pour les questions d’architecture, utiliser d’abord les requêtes Graphify lorsque le graphe existe. | Si la fraîcheur ou la couverture du graphe est douteuse, ne pas s’y fier seul ; vérifier les fichiers et composants pertinents. | **Développeur ou mainteneur proposé. Après chaque modification de code concernée.** |

### Ordre recommandé des interventions

1. **Assainir les secrets** : action immédiate, sans attendre une revue générale.
2. **Éliminer l’ambiguïté de la clé maître**, puis confirmer la configuration chargée.
3. **Revoir les permissions d’exécution et réseau**, en les reliant aux usages effectivement nécessaires.
4. **Établir les preuves de fonctionnement** des contrôles de sécurité, de vérification et de reprise.
5. **Intégrer les tests de crash, d’idempotence, de rollback et de vérification indépendante** au cycle de validation.

---

## 5. 📈 Suivi et monitoring

Les sources ne fournissent ni indicateurs opérationnels existants, ni journaux disponibles, ni fréquence de revue. Les indicateurs ci-dessous sont donc des propositions de suivi, à confirmer selon les capacités de l’application.

### Indicateurs d’alerte précoce proposés

| Domaine | Indicateur à suivre | Signal d’alerte |
|---|---|---|
| Secrets | Présence de valeurs de secrets dans `.env` ou d’une différence non maîtrisée avec `.env.example` | Toute valeur active non approuvée ; toute clé présumée compromise non renouvelée |
| Configuration | Nombre de déclarations de `Leanna_MASTER_KEY` et valeur effectivement chargée | Déclarations multiples ou valeur active impossible à établir |
| Permissions | Permissions d’exécution et réseau activées par mission ou par configuration | Permission active sans justification documentée pour la mission |
| Approbations | Actions à risque exécutées avec ou sans approbation humaine, selon la politique applicable | Action sensible sans approbation attendue ou sans trace de décision |
| Vérification | Proportion de missions terminées avec preuve indépendante correspondant à un critère explicite | Mission marquée réussie sans preuve suffisante ou vérification échouée |
| Reprise | Résultats des tests de crash, de reprise, d’idempotence et de rollback | Rejeu d’une action destructive, état incohérent ou rollback non vérifiable |
| Maturité | Composants utilisés, niveau de maturité documenté et tests disponibles | Utilisation d’une fonction dont le niveau de maturité ou la couverture de test est inconnu |
| Graphify | Date de dernière mise à jour du graphe après modification du code | Modifications de code sans mise à jour du graphe lorsque celle-ci est requise |

### Fréquence de réévaluation proposée

- **Immédiatement** : suivi de la révocation et du renouvellement des secrets, puis vérification de la déclaration de la clé maître.
- **Avant chaque mission à risque élevé** : examen des permissions, des approbations attendues, des critères de succès et des moyens de récupération.
- **À chaque changement du noyau transactionnel, du Safety Gate, des outils ou de la configuration** : tests ciblés de vérification, d’idempotence et de rollback.
- **Après une modification de code** : mise à jour du graphe conformément aux consignes Graphify fournies.
- **Périodiquement** : revue de la maturité des fonctions réellement utilisées et de l’adéquation des contrôles. La fréquence précise est [Information non disponible dans les sources].

### Processus d’escalade proposé

1. **Détection** d’un secret exposé, d’une permission inattendue, d’une action non approuvée ou d’une preuve de succès absente.
2. **Confinement** : suspendre l’usage du secret ou de la permission concernés ; interrompre la mission si cette option existe.
3. **Évaluation** : déterminer les missions, fichiers, ressources et états potentiellement concernés à partir des éléments observables disponibles.
4. **Récupération** : renouveler les secrets ou revenir à un checkpoint uniquement si la procédure est disponible et validée.
5. **Reprise contrôlée** : reprendre l’exécution après vérification de la configuration et des preuves attendues.
6. **Revue** : documenter la cause et actualiser les tests ou procédures concernés.

La disponibilité de journaux d’audit, de mécanismes de suspension immédiate ou d’alertes automatiques est [Information non disponible dans les sources].

---

## 6. 💡 Recommandations

### Actions prioritaires

1. **Traiter en premier les secrets présents dans `.env`** : les révoquer ou les renouveler et éviter leur réutilisation. Ce point est le constat de sécurité le plus explicite des sources.
2. **Supprimer la double déclaration de `Leanna_MASTER_KEY`** et vérifier la valeur effectivement chargée avant tout usage dépendant de cette clé.
3. **Réduire et justifier les permissions** d’exécution et de réseau. La configuration doit être examinée au regard des missions réellement autorisées et du principe local-first annoncé.
4. **Vérifier la cohérence entre les protections annoncées et leur maturité réelle** : Safety Gate, approbation humaine, ledger d’idempotence, checkpoints, preuves et rollback.
5. **Exiger une preuve observable avant de déclarer une mission réussie**, conformément à la distinction faite dans le README entre retour `ok: true` et vérification indépendante.
6. **Valider les scénarios de panne et de reprise**, en particulier lorsqu’une action peut être destructive ou difficile à inverser.

### Investissements de protection recommandés

Les sources ne fournissent ni budgets, ni produits à acquérir, ni estimations de coûts. Aucun montant ne peut donc être recommandé de manière factuelle. Les efforts à prioriser portent sur :

- la gestion et la rotation des secrets ;
- la revue des permissions et du réseau ;
- les tests ciblés des mécanismes transactionnels ;
- la documentation des niveaux de maturité et des preuves disponibles ;
- le suivi de l’état des missions et de leurs résultats vérifiés.

### Acceptation du risque résiduel

Un risque résiduel ne devrait être accepté que lorsqu’il est **identifié, limité et compensé par une mesure vérifiable**. En particulier :

- **R1 ne devrait pas être accepté en l’état** : les sources demandent explicitement la révocation ou le renouvellement des secrets.
- **R2 ne devrait pas être accepté tant que la valeur effective de la clé est ambiguë.**
- **R3 et R4** peuvent être réévalués après clarification des permissions et des flux réseau autorisés ; l’usage de l’autonomie ne doit pas être assimilé à une garantie de sécurité.
- **R5 à R8** restent à requalifier après examen des tests et de la maturité des mécanismes effectivement déployés.
- **R9** peut être accepté temporairement si le graphe n’est pas utilisé comme source unique pour une décision technique et si les fichiers pertinents sont vérifiés.

L’identité des personnes habilitées à accepter le risque, les seuils de tolérance et la procédure formelle d’acceptation sont [Information non disponible dans les sources].

## Conclusion

Leanna est conçue avec des mécanismes visant à contrôler l’autonomie, vérifier les résultats et récupérer après échec. Ces principes constituent des mesures de réduction du risque, mais les sources ne suffisent pas à confirmer leur couverture opérationnelle. À court terme, la priorité est donc double : **assainir les secrets de la sandbox** et **rendre vérifiables la configuration effective, les permissions et les mécanismes de preuve et de récupération**. Le niveau de risque pourra être réévalué une fois ces actions réalisées et leurs résultats documentés.