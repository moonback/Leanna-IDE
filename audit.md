# Audit de sécurité Leanna — revue statique

> **Périmètre.** Analyse du code du commit `a9668316e77b1eac184c95398d2f4f4b0bd644b6` de `main`.
> Les constats proviennent d'une revue statique du code : aucun test, build ou scénario d'exploitation n'a été exécuté.
> Les risques signalés ne constituent pas des preuves d'exploitation en environnement réel.
>
> **Note de numérotation.** Les tranches proviennent d'une transcription de session : la numérotation 84–87 (journaux d'audit, configuration) et 84–94 (routes de fichiers, scaffolding) se recouvrent, puis saute à 151–155.

---

## Tranche 30–37 — Workflows, persistance des agents et isolation

### 30. Workflows : exécutions planifiées et concurrence — **P1**

**Constat : exécutions concurrentes possibles.**
Le moteur de workflows utilise des timers Node.js (`setInterval`, `setTimeout`) et conserve les exécutions actives dans une `Map` locale.

Trois problèmes relevés :

1. `executeWorkflow()` ne refuse pas un workflow déjà en cours.
2. Les exécutions planifiées par intervalle peuvent se chevaucher si une exécution dépasse la période configurée.
3. `activeRuns` ne conserve qu'un seul état par `workflowId` : une seconde exécution écrase la visibilité de la première.

Cela peut entraîner des actions répétées, des écritures concurrentes ou des résultats de suivi incohérents.

**Correction :** ajouter un verrou d'exécution par workflow, partagé entre les instances si le serveur est distribué. Prévoir une politique explicite : ignorer, mettre en file ou remplacer une exécution déjà active.

### 31. Persistance des agents : récupération incomplète après redémarrage — **P1**

**Constat : état persistant non fiable.**
`AgentPersistence` présente plusieurs faiblesses dans la synchronisation avec Supabase.

#### 31.1 Les erreurs de persistance ne remontent pas à l'exécuteur

- `saveTask()` et `updateTaskStatus()` interceptent les erreurs et les journalisent sans les transmettre à l'appelant.
- L'orchestrateur peut donc continuer à exécuter une tâche alors que son état n'a pas été sauvegardé.
- Particulièrement problématique pour les transitions `pending` → `running`, puis vers un état terminal.

#### 31.2 Le batch peut perdre des mises à jour

- `flushUpdates()` vide `pendingUpdates` **avant** d'envoyer les requêtes Supabase.
- Si une mise à jour échoue, elle est journalisée, mais n'est pas systématiquement remise dans la file. Le mécanisme de retry du `catch` ne couvre pas les erreurs retournées individuellement par Supabase.
- Conséquence : le statut enregistré peut rester ancien, même si l'exécution locale est terminée.

#### 31.3 La restauration ne reprend pas les tâches en attente

`restoreFromPersistence()` :

- recharge les 200 tâches les plus récentes ;
- marque les tâches `running` comme `failed` ;
- recharge les 50 orchestrations les plus récentes ;
- **ne relance pas** les tâches `pending`.

La documentation évoque une reprise éventuelle, mais le code examiné restaure principalement l'affichage et l'état en mémoire : c'est une récupération d'historique, pas une véritable reprise d'exécution.

#### 31.4 Les plans d'orchestration perdent leurs relations avec les tâches

Pendant la restauration, les plans sont reconstruits avec `tasks: []`. Les tâches individuelles sont bien chargées séparément, mais le plan restauré ne reconstitue pas explicitement sa liste de tâches. Les dépendances persistées restent présentes, mais l'objet d'orchestration reconstitué est incomplet.

### 32. Isolation des données agents : absence de séparation par projet — **P1**

**Constat : données agents globales.**
Le schéma SQL généré par `AgentPersistence.getMigrationSQL()` définit les tables `agent_tasks`, `agent_orchestrations`, `agent_messages`, mais :

- aucune colonne `project_id` n'est définie ;
- les politiques RLS sont commentées comme optionnelles ;
- les requêtes de chargement ne filtrent pas par projet ;
- les suppressions utilisent uniquement les identifiants des tâches.

Les agents utilisent donc une persistance partagée entre les projets qui pointent vers la même base. Avec la clé `service_role`, le backend possède un accès global à ces tables. Les titres, descriptions, fichiers de contexte, instructions, résultats et messages inter-agents peuvent ainsi être mélangés entre projets.

**Correction :** ajouter `project_id` à toutes les tables, imposer ce filtre dans chaque opération et activer des politiques RLS adaptées au modèle d'identité retenu.

### 33. Workflows : persistance et isolation — **P1**

Les workflows sont enregistrés dans une `Map` locale et dans la table Supabase `workflows`. Leur définition ne comporte pas de `project_id` dans le modèle examiné. Les opérations de création, lecture, modification et suppression sont donc globales à l'instance et à la base, plutôt que rattachées explicitement à un workspace.

Autres limites :

- `createWorkflow()` conserve le workflow en mémoire même si l'insertion Supabase échoue.
- `toggleWorkflow()` modifie l'état local avant de confirmer la mise à jour distante.
- `deleteWorkflow()` ne vérifie pas explicitement l'erreur Supabase avant de retirer l'entrée locale.
- Les timers sont locaux au processus Node.js : plusieurs instances peuvent programmer le même workflow.
- Le redémarrage dépend du chargement depuis la base pour reconstituer les timers.

Ces comportements créent des divergences possibles entre l'état affiché, l'état local et l'état réellement persistant.

### 34. Tests et validation manquants

Scénarios à couvrir par des tests d'intégration spécifiques :

| Scénario | Risque |
| --- | --- |
| Workflow plus long que son intervalle | Chevauchement |
| Deux instances exécutent le même workflow | Double exécution |
| Échec Supabase pendant un flush | Statut obsolète |
| Crash pendant une tâche agent | État incomplet |
| Tâche pending après redémarrage | Pas de reprise |
| Restauration d'une orchestration | Relations manquantes |
| Deux projets utilisent les agents | Fuite de contexte |
| Suppression depuis un projet | Suppression hors périmètre |

### 35. Bilan de la tranche

| Constat | Priorité | Confiance |
| --- | --- | --- |
| Chevauchement possible des workflows | P1 | Élevée |
| Persistance agent best-effort sans garantie | P1 | Élevée |
| Perte possible de mises à jour batch | P1 | Élevée |
| Absence de reprise des tâches pending | P1 | Élevée |
| Persistance agents sans isolation projet | P1 | Élevée |
| Restauration des orchestrations incomplète | P2 | Élevée |
| Workflows sans isolation projet | P1 | Élevée |
| Divergence mémoire / Supabase en cas d'erreur | P2 | Élevée |
| Planification locale sans coordination multi-instance | P1 | Élevée |

### 36. Synthèse globale des risques P1 découverts

Les constats suivants sont désormais les plus urgents dans l'audit :

| Domaine | Constat |
| --- | --- |
| Cloisonnement des conversations | Lecture, recherche et suppression insuffisamment limitées au projet. |
| Cloisonnement des agents | Données persistées globalement, sans `project_id`. |
| Cloisonnement des workflows | Absence de séparation explicite entre projets. |
| Idempotence | Un échec de handler peut conduire à rejouer une action dont l'effet a déjà eu lieu. |
| Journal durable | Synchronisation disque et corruption insuffisamment traitées. |
| Persistance des agents | Erreurs de sauvegarde silencieuses et récupération incomplète. |
| Planification | Absence de verrou d'exécution empêchant les chevauchements. |
| MCP | Héritage potentiel des secrets d'environnement du serveur. |
| Telegram | Attribution du chat par défaut avant vérification de la whitelist. |
| Terminal | Endpoint de fermeture qui ne ferme effectivement aucune session. |

Ces éléments sont des constats de code, avec des niveaux de confiance indiqués. Ils ne constituent pas des preuves d'exploitation en environnement réel.

### 37. Prochaine tranche (annonce)

Continuité sur les autres surfaces d'exécution autonome : automations, scheduler, boucles d'autonomie, navigateur, tâches en arrière-plan et événements Redis. Recherche prévue de doubles déclenchements, d'exécutions sans contrôle de durée, de fuites de contexte entre projets et de tâches orphelines après arrêt du serveur.

---

## Tranche 84–87 — Journaux d'audit et paramètres de sécurité

### 84. Journaux d'audit : extraits de code non expurgés — **P2**

`server/audit.ts` enregistre les diffs de fichiers sans filtrage des secrets. `generateDiffSummary()` conserve jusqu'à cinq lignes modifiées, avec un maximum de 500 caractères. Ces diffs sont ensuite exposés par `GET /api/audit/logs`, qui renvoie les vingt dernières entrées.

Le risque est concret si un fichier modifié contient une clé API, un token ou une configuration confidentielle : une partie de son contenu peut être conservée dans le journal et renvoyée par l'API.

**Correction :** filtrer les secrets avant la création des diffs, exclure les fichiers sensibles et appliquer une redaction supplémentaire à la lecture.

### 85. Paramètres de sécurité modifiables par l'API de configuration — **P2**

`POST /api/env` autorise la modification des variables déjà présentes dans `.env`, notamment :

- `LEANNA_PERMISSION_MODE` : `enforce`, `audit` ou `off` ;
- `LEANNA_AUTO_ALLOW_DANGEROUS` ;
- `LEANNA_AUTONOMY_MODE` ;
- les permissions accordées au runtime.

Ces paramètres contrôlent directement le niveau de protection des opérations agentiques. Leur modification est possible pour tout client disposant du token API, sans confirmation supplémentaire propre à ces changements ni événement d'audit dédié visible dans cette route. Ce n'est pas un contournement d'authentification : l'API est protégée. C'est une faiblesse de gouvernance des paramètres de sécurité.

**Correction :** exiger une confirmation renforcée pour désactiver les permissions ou autoriser les actions dangereuses, tracer les changements et afficher clairement leur impact.

### 86. Tests de redaction : couverture insuffisante — **P2**

`server/audit.test.ts` vérifie la création et la lecture des événements, ainsi que la génération des diffs. Aucun test identifié ne vérifie qu'un diff contenant une clé API, un mot de passe ou un token est expurgé avant persistance.

Les tests de `server/routes/env.test.ts` vérifient le masquage dans la liste générale, mais pas les scénarios sensibles suivants :

- révélation de `LEANNA_MASTER_KEY` ;
- modification de paramètres de sécurité ;
- changement de clé maîtresse avec des secrets déjà chiffrés ;
- refus d'accès sans authentification au niveau de l'application complète.

**Correction :** ajouter ces tests d'intégration au niveau du serveur Express, avec authentification réelle et fichiers de configuration temporaires.

### 87. Informations système dans le rapport d'audit — **P3**

`GET /api/audit` expose notamment :

- le chemin absolu du projet ;
- la plateforme et la version du système ;
- l'architecture, le nombre de CPU et la mémoire ;
- la version de Node.js ;
- les catégories d'outils actifs et l'état des services connectés.

L'endpoint est protégé par l'authentification globale : ce n'est donc pas une exposition publique, mais le rapport fournit davantage d'informations sur la machine que nécessaire à un simple diagnostic de disponibilité.

**Correction :** séparer les informations de santé générales des détails techniques réservés à l'administration.

### État de l'audit après cette tranche

Points à traiter en priorité :

- **P1** — permissions MCP, endpoint MCP direct et héritage des secrets des processus enfants.
- **P1** — clés OpenRouter exposées dans le profil et stockées en clair.
- **P2** — clé maîtresse révélable, repli cryptographique faible et redaction des journaux.
- **P2** — absence de garde financière globale pour certains appels IA.
- **P2** — paramètres de sécurité modifiables sans confirmation renforcée.
- **P2** — diffs d'audit persistés sans redaction.

---

## Tranche 84–94 — Routes de fichiers, uploads, imports, téléchargements, MCP, scaffolding et dépendances

> Référence conservée : commit `a9668316e77b1eac184c95398d2f4f4b0bd644b6` de `main`. Revue statique du code uniquement.

### 84. Limite de débit d'upload contournable par `X-Forwarded-For` — **P2** · confiance élevée

**Fichiers :** `server/routes/upload-document.ts`

La route choisit elle-même la clé du limiteur :

```ts
const clientIp =
  (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]
  || req.ip || 'unknown';
```

Un client peut fournir un `X-Forwarded-For` arbitraire et obtenir une nouvelle clé à chaque requête. Le plafond de 10 uploads par minute peut donc être contourné si aucun proxy de confiance ne réécrit et ne contrôle cet en-tête.

**Correction :** utiliser une adresse client déterminée par une configuration de proxy de confiance, jamais l'en-tête brut fourni par le client. Ajouter un test avec plusieurs valeurs `X-Forwarded-For`.

### 85. Limite globale des lots vérifiée après allocation mémoire — **P2** · confiance élevée

**Fichiers :** `server/routes/notebooks/sourcesRouter.ts`, `server/routes/notebooks/index.ts`, `server/utils/notebookSourceUploadValidation.ts`

Les routes multi-fichiers utilisent `multer.memoryStorage()`. Le contrôle du total de 50 Mio intervient après réception et stockage des buffers :

```ts
const totalBytes = files.reduce((total, file) => total + file.size, 0);
if (totalBytes > MAX_NOTEBOOK_BATCH_BYTES) { ... }
```

Le contrôle protège le traitement aval, mais pas la mémoire consommée pendant la réception. Un lot de fichiers individuellement autorisés peut dépasser largement le budget total avant d'être rejeté.

**Correction :** appliquer une limite agrégée pendant le streaming de l'upload, ou utiliser un stockage temporaire avec quotas. Prévoir aussi une limite de concurrence des uploads.

### 86. Contrat incohérent entre nombre de fichiers accepté et nombre annoncé — **P3** · confiance élevée

**Fichier :** `server/routes/notebooks/sourcesRouter.ts`

La route `/upload-queued` déclare `upload.array("files", 20)`, mais le middleware Multer partagé est configuré avec une limite `files: 10` dans le routeur notebooks. La limite effective est donc plus restrictive que celle annoncée par la route.

**Correction :** aligner les limites et tester les cas 10, 11 et 20 fichiers pour éviter les erreurs inattendues côté client.

### Points positifs observés

- Les uploads documents et sources notebook sont limités à 10 Mio par fichier.
- Les noms de fichiers sont normalisés et les séparateurs de chemin retirés.
- Les types MIME sont confrontés aux extensions ; les PDF et images bénéficient de contrôles de signature.
- Les fichiers texte sont contrôlés en UTF-8 et les données binaires avec octets NUL sont rejetées.
- Les routes d'export PDF/Word/HTML valident la taille du Markdown, le titre et le nom de téléchargement ; le nom final est reconstruit et échappé pour `Content-Disposition`.
- Les fichiers uploadés sont traités en mémoire et ne sont pas directement enregistrés sous le nom fourni par le client dans un chemin arbitraire.

### 87. Les configurations MCP d'un workspace peuvent lancer automatiquement des commandes locales — **P1**

**Fichiers :** `server/mcp/mcpConfig.ts`, `server/mcp/McpBridge.ts`, `server/mcp/McpClient.ts`, `server/routes/self-root.ts`

Le bridge charge `.Leanna/mcp.json` et connecte automatiquement les serveurs qui ne sont pas désactivés. Pour le transport stdio, `McpClient` lance la commande configurée avec `child_process.spawn()`. Le changement de workspace déclenche également une reconnexion du bridge après lecture de la configuration du nouveau projet.

Conséquence : une configuration MCP non fiable présente dans un workspace peut faire exécuter une commande locale avec les privilèges du processus Leanna dès l'ouverture ou le changement de projet. Ce n'est pas une injection shell démontrée ; c'est une frontière de confiance insuffisante autour de l'exécution de commandes configurées. Confiance élevée sur le comportement automatique ; impact dépendant de la provenance de la configuration.

Mesures recommandées :

- Ne jamais exécuter automatiquement une configuration MCP inconnue ou nouvellement découverte.
- Demander une approbation explicite par serveur, en affichant commande, arguments, répertoire de travail et variables d'environnement.
- Persister une liste de configurations approuvées, liée à leur empreinte.
- Re-demander l'approbation après modification de la commande ou des arguments.

### 88. Les tests ne couvrent pas la frontière de confiance des processus MCP — **P2**

Aucun test dédié `McpClient`, `McpBridge` ou `mcpConfig` n'a été retrouvé par recherche dans le dépôt. Le chemin d'initialisation automatique, le refus d'une configuration non approuvée, les arguments hostiles et l'arrêt effectif des processus ne disposent donc pas d'une couverture de test identifiable dans cette recherche.

Lacune de couverture constatée, pas preuve d'un défaut supplémentaire.

### 89. Les commandes de génération de projet exécutent des gestionnaires de paquets externes — **P2**

**Fichier :** `server/routes/self-root.ts`

La route de scaffolding utilise une liste blanche de frameworks et construit les arguments à partir d'un nom de projet normalisé : protection utile contre l'injection directe de paramètres dans la commande.

En revanche, `npm create` et `npx` téléchargent et exécutent des outils tiers (`create-vite`, `create-next-app`, `create-react-router`). L'opération est donc une exécution de code externe, avec accès aux droits de l'utilisateur et au répertoire cible. Elle doit rester une action explicitement déclenchée par l'utilisateur, avec indication claire de la provenance des paquets.

Risque de chaîne d'approvisionnement inhérent à l'opération, pas vulnérabilité d'injection confirmée.

### 90. Scaffolding sans timeout ni arrêt à la déconnexion du client — **P2** · confiance élevée

**Fichier :** `server/routes/self-root.ts`

La route `/scaffold` lance un processus `npm` ou `npx`, puis diffuse ses sorties via SSE. Dans le code examiné, ni délai maximal d'exécution, ni gestion de `req`/`res` déconnecté qui annulerait le processus. De plus, `stderrBuffer` accumule la sortie complète jusqu'à la fin du processus.

Un générateur bloqué ou excessivement bavard peut donc continuer à tourner après la fermeture de l'interface et consommer des ressources.

**Correction :** ajouter un timeout, plafonner les buffers de sortie et tuer le processus ainsi que ses descendants à l'annulation ou à la fermeture de la session SSE.

### 91. Métadonnées du verrou de dépendances désynchronisées — **P3** · confiance élevée

**Fichiers :** `package.json`, `package-lock.json`

Le manifeste déclare la version 2.5.0, tandis que la racine du lockfile déclare encore 2.4.0. Le lockfile est bien présent et utilise le format npm v3 : il fournit une base de versions verrouillées, mais ses métadonnées racine ne correspondent plus au manifeste.

**Correction :** régénérer le lockfile avec la version du manifeste, puis vérifier la reproductibilité de `npm ci`.

> `npm audit` n'a pas été exécuté : aucune conclusion sur la présence ou l'absence de vulnérabilités connues dans les versions verrouillées ne serait justifiée à ce stade.

### 92. Nettoyage du parseur PDF non garanti en cas d'exception — **P2** · confiance moyenne

**Fichiers :** `server/routes/upload-document.ts`, `server/knowledge/document-system/ContentExtractor.ts`

Les deux chemins créent un parseur PDF, appellent `getText()`, puis appellent `destroy()` uniquement après le succès de l'extraction. Si `getText()` lève une exception, le nettoyage n'est pas exécuté dans un bloc `finally`.

Un PDF malformé ou particulièrement coûteux peut ainsi laisser des ressources du parseur non libérées jusqu'au nettoyage par le runtime.

**Correction :** encadrer systématiquement le parseur par `try/finally`, ajouter une durée maximale d'extraction et tester les fichiers PDF invalides.

### 93. L'analyse de sécurité Marketplace ne constitue pas une vérification de provenance — **P2** · confiance élevée

**Fichiers :** `server/marketplace/MarketplaceRegistry.ts`, `server/routes/marketplace.ts`

Le registre calcule un niveau de confiance à partir de motifs textuels détectés dans les instructions, prompts et descriptions. La route d'installation refuse les paquets `flagged`, mais autorise aussi les niveaux `community` et `unreviewed`.

Cette analyse peut signaler des contenus suspects, mais elle ne démontre ni l'identité de l'auteur, ni l'intégrité du paquet, ni l'absence de comportement dangereux. Le registre est local/embarqué, et non un registre distant vérifié cryptographiquement.

**Correction :** présenter clairement l'analyse comme heuristique, afficher les permissions/capacités réellement demandées et exiger une confirmation distincte avant l'activation d'un agent communautaire.

### 94. Évaluation des dépendances : verrouillage présent, audit de vulnérabilités non réalisé

Le dépôt contient `package-lock.json` (format v3), ce qui permet de figer les versions transitives. Le manifeste utilise néanmoins plusieurs plages semver avec `^`, ce qui rend le lockfile important pour la reproductibilité.

Les dépendances ne peuvent être qualifiées de vulnérables ou de sûres sans exécuter une analyse de vulnérabilités sur les versions verrouillées. La présence du script `npm audit` dans `package.json` ne constitue pas un résultat d'audit.

Contrôles à effectuer dans un environnement de build :

1. `npm ci` pour vérifier la cohérence du manifeste et du lockfile.
2. `npm audit --production` pour les dépendances de production.
3. `npm audit` pour l'ensemble des dépendances.
4. Générer un SBOM et conserver le résultat de l'analyse avec le build.
5. Vérifier les dépendances transitives des composants sensibles : `puppeteer`, `pdf-parse`, `multer`, `ws`, `express`, `@google/genai`, `@supabase/supabase-js`.

### Bilan de la tranche

| Domaine | Résultat |
| --- | --- |
| Validation des uploads | Plutôt bonne |
| Limitation des uploads | À renforcer |
| Imports URL | SSRF déjà relevé dans les tranches précédentes |
| Exports et noms de fichiers | Protections satisfaisantes dans les routes examinées |
| Marketplace | Confiance et provenance à clarifier |
| Processus MCP | P1 — exécution automatique de configurations non approuvées |
| Scaffolding | P2 — timeout et annulation manquants |
| Dépendances | Lockfile présent, audit de vulnérabilités restant à faire |

Priorités de correction :

1. **P1** — demander une approbation explicite avant tout lancement d'un serveur MCP configuré par un workspace.
2. **P2** — corriger le rate limiting fondé sur `X-Forwarded-For`.
3. **P2** — imposer une limite agrégée de réception des fichiers, avant allocation mémoire excessive.
4. **P2** — ajouter timeout, annulation et plafonnement des sorties aux processus de scaffolding.
5. **P2** — garantir le nettoyage des parseurs PDF.
6. **P2** — rendre la confiance Marketplace plus explicite et vérifiable.

---

## Tranche 151–155 — Navigateurs Chromium, téléchargements et consommation mémoire

### 151. La limite de taille des pages Web est appliquée après lecture complète — **P2** · confiance élevée

**Fichier :** `server/skills/webSearchProvider.ts`

La méthode `timedFetch()` annonce une limite `maxBytes`, fixée par défaut à 2 Mo. Mais elle exécute d'abord :

```ts
const raw = await res.text();
const body = raw.length > this.maxBytes
  ? raw.slice(0, this.maxBytes)
  : raw;
```

La réponse entière est donc chargée en mémoire avant sa troncature. La limite protège la taille du texte transmis à l'extracteur, mais pas la mémoire consommée pendant le téléchargement. Une page très volumineuse peut provoquer une consommation mémoire importante.

**Correction :** lire le flux HTTP progressivement, interrompre la lecture au-delà de `maxBytes` et annuler la requête.

### 152. La lecture de plusieurs pages Web lance toutes les requêtes simultanément — **P2** · confiance élevée

**Fichier :** `server/skills/webSearchProvider.ts`

`fetchPages()` utilise :

```ts
return Promise.all(urls.map((u) => this.fetchPage(u)));
```

Il n'existe pas de limite de concurrence dans cette méthode. Le moteur de recherche appelle cette fonction pour lire les sources sélectionnées ; le nombre de requêtes simultanées dépend donc de `maxSources`.

Conséquences possibles :

- multiplication des téléchargements simultanés ;
- accumulation des réponses en mémoire ;
- saturation des connexions réseau ;
- amplification de la charge en cas de requêtes de recherche concurrentes.

**Correction :** imposer un sémaphore global, un plafond de pages par recherche et une limite de débit par session.

### 153. Le navigateur d'automatisation utilise une page Chromium globale partagée — **P1**

**Fichier :** `server/skills/automationBrowser.ts`

Le module conserve une seule instance globale :

```ts
let browser: any | null = null;
let page: any | null = null;
```

Les opérations de navigation, clic, saisie, capture et extraction utilisent cette même page. Aucun verrou de session ou de navigation n'est visible dans les handlers examinés.

Deux appels simultanés peuvent donc interférer :

1. un appel navigue vers un site ;
2. un second appel navigue vers un autre ;
3. le premier poursuit ses opérations sur la page désormais modifiée.

Cela peut produire des résultats incohérents et des interactions sur la mauvaise page. Confiance élevée sur le partage global ; impact conditionné à la concurrence.

**Correction :** isoler les pages par session/utilisateur ou sérialiser les opérations avec un verrou par session.

### 154. Le navigateur Chromium partagé pour les exports PDF n'est pas raccordé au shutdown central — **P2** · confiance élevée

**Fichiers :** `server/export/pdfExporter.ts`, `server/lifecycle.ts`

`pdfExporter.ts` conserve un navigateur Chromium dans `sharedBrowser`. Une fonction `closePdfBrowser()` existe et ferme correctement cette instance. Cependant, le gestionnaire central `setupGracefulShutdown()` ne l'appelle pas et ne reçoit pas cette dépendance.

Chaque export ferme sa page avec `page.close()`, mais le navigateur partagé reste ouvert après les exports. Chromium peut conserver ses processus et ses ressources jusqu'à l'arrêt forcé du processus Node.

**Correction :** enregistrer `closePdfBrowser()` dans le cycle de vie et attendre sa fermeture avant de terminer le serveur.

### 155. Les téléchargements binaires ne possèdent pas de plafond de taille — **P1** · confiance élevée

**Fichier :** `server/skills/automationBrowser.ts`

`handleDownloadFile()` télécharge les fichiers binaires avec :

```ts
const fileBuffer = await response.arrayBuffer();
const fileContent = Buffer.from(fileBuffer).toString('base64');
```

Aucun plafond de taille n'est appliqué avant l'allocation du buffer. Le contenu est ensuite converti en Base64, ce qui augmente encore la mémoire utilisée. Si l'enregistrement dans le sandbox est demandé, une autre copie du buffer est écrite sur disque.

Un fichier distant volumineux peut donc provoquer une forte pression mémoire, voire un arrêt du processus par manque de mémoire.

**Correction :**

- vérifier `Content-Length` lorsqu'il est disponible ;
- compter les octets réellement reçus ;
- interrompre le flux au-delà d'une limite stricte ;
- éviter la conversion Base64 pour les fichiers destinés uniquement au disque ;
- limiter la taille des contenus retournés au modèle.

### Bilan de la tranche 151–155

| N° | Constat | Priorité |
| --- | --- | --- |
| 151 | Limite Web appliquée après chargement complet | P2 |
| 152 | Requêtes Web parallèles sans sémaphore | P2 |
| 153 | Page Chromium globale partagée sans verrou | P1 |
| 154 | Chromium PDF absent du shutdown central | P2 |
| 155 | Téléchargement binaire sans limite de taille | P1 |

Priorités de correction :

1. **155** — Téléchargements : plafonner les octets avant allocation mémoire.
2. **153** — Automatisation : isoler les sessions et protéger les opérations concurrentes.
3. **151–152** — Recherche Web : lecture en flux et concurrence bornée.
4. **154** — Exports PDF : intégrer Chromium au gestionnaire de cycle de vie.

### Prochaine tranche (annonce)

Examiner les flux SSE, les connexions WebSocket, les sessions Live et les opérations réseau interrompues : déconnexion client, annulation réelle des traitements, backpressure, accumulation de buffers et nettoyage des listeners.

---

Audit statique uniquement — commit `a9668316e77b1eac184c95398d2f4f4b0bd644b6`. Aucun fichier modifié. Aucun test, build ou runtime exécuté.
