# 📓 Roadmap Notebooks — Jarvis OS

> Plan d'amélioration complet pour le système de Notebooks.
> Chaque section est priorisée : 🔴 Critique • 🟠 Important • 🟡 Nice-to-have

---

## 1. Architecture & Bonnes Pratiques

### 1.1 Structure des composants

| Pratique | État actuel | Cible |
|----------|-------------|-------|
| Séparation logique/UI | Logique dans les composants | Extraire dans des hooks custom (`useNotebookChat`, `useNotebookSources`) |
| Types partagés | ~~Interfaces dupliquées entre fichiers~~ | ✅ Fichier `types/notebook.ts` centralisé |
| State management | `useState` local partout | Zustand store dédié `useNotebookStore` |
| Error boundaries | Aucun | Wrapper par onglet pour éviter les crashs globaux |
| Lazy loading | Tous les onglets chargés | `React.lazy()` par onglet (Chat, Generate, Audio) |

### 1.2 Conventions de code

- **Nommage** : PascalCase composants, camelCase hooks/utils, UPPER_CASE constantes
- **Fichiers** : 1 composant exporté par fichier, max ~300 lignes (extraire les sous-composants)
- **Props** : Typer explicitement, éviter `any` (remplacer les `any[]` dans `NotebookData`)
- **Styles** : Utiliser exclusivement les CSS variables du design system (`--bg-panel`, `--accent-primary`, etc.)
- **Animations** : Framer Motion pour les transitions d'état, pas de CSS animations custom sauf spinner
- **Accessibilité** : `aria-label` sur tous les boutons icon-only, `role="status"` sur les loaders

### 1.3 Performance

- Mémoiser les listes longues avec `React.memo` + `useMemo`
- Virtualiser les messages du chat si > 50 messages (`react-window` ou `@tanstack/virtual`)
- Debouncer les appels API dans la recherche/suggestions (300ms)
- `AbortController` pour annuler les requêtes streaming quand l'utilisateur quitte l'onglet

---

## 2. Onglet Sources — Améliorations

### 🔴 Critique

- [ ] **Preview des sources** — Pouvoir lire/visualiser le contenu d'une source directement dans le panel (lecteur PDF intégré, rendu markdown, iframe pour les URL)
- [ ] **Drag & drop multi-fichiers** — Améliorer l'UX d'upload avec progress bar par fichier et retry automatique
- [ ] **Gestion d'erreurs** — Afficher clairement pourquoi un parsing a échoué (fichier corrompu, trop lourd, format non supporté)

### 🟠 Important

- [ ] **Recherche dans les sources** — Barre de recherche full-text à travers toutes les sources du notebook
- [ ] **Tags et catégories** — Permettre d'organiser les sources par tags custom
- [ ] **Sources depuis Google Drive / OneDrive / Notion** — Connecteurs pour import direct
- [ ] **Détection de doublons** — Alerter si une source similaire existe déjà (hash ou similarité sémantique)
- [ ] **Re-processing** — Bouton pour re-indexer une source (utile après mise à jour du modèle d'embeddings)

### 🟡 Nice-to-have

- [ ] **Source depuis clipboard** — Coller du texte directement comme source
- [ ] **Source audio/vidéo** — Transcription automatique via Whisper avant indexation
- [ ] **Statistiques par source** — Nombre de fois citée dans le chat, pertinence moyenne
- [ ] **Export de la bibliographie** — Exporter les métadonnées des sources en BibTeX/APA

---

## 3. Onglet Chat — Améliorations

### 🔴 Critique

- [ ] **Conversations multiples** — Pouvoir créer plusieurs threads de chat dans un même notebook
- [x] **Retry / Regenerate** — Bouton pour régénérer une réponse de l'assistant ✅
- [x] **Edit du message utilisateur** — Pouvoir modifier un message envoyé et régénérer la suite ✅
- [x] **Copy to clipboard** — Bouton copier sur chaque réponse (code blocks inclus) ✅

### 🟠 Important

- [ ] **Mode focus sur sources** — Sélectionner manuellement quelles sources utiliser pour une question
- [ ] **Historique des conversations** — Liste des threads passés avec recherche
- [ ] **Réponses avec images** — Support des diagrammes générés (déjà Mermaid, ajouter PlantUML, graphviz)
- [ ] **Feedback thumbs up/down** — Permettre de noter les réponses pour améliorer le RAG
- [x] **Streaming cancel** — Bouton stop pendant le streaming d'une réponse ✅
- [ ] **Contexte de conversation** — Afficher combien de tokens restent dans la fenêtre de contexte

### 🟡 Nice-to-have

- [ ] **Mode examen** — L'assistant pose des questions à l'utilisateur (quiz interactif)
- [ ] **Partage de conversation** — Générer un lien partageable ou exporter en PDF
- [ ] **Personnalités** — Choisir le ton de l'assistant (académique, vulgarisateur, concis, détaillé)
- [ ] **Plugins de chat** — Permettre des commandes slash (`/résume`, `/compare`, `/quiz`)
- [ ] **Voice input** — Reconnaissance vocale pour dicter les questions (Web Speech API)
- [ ] **Annotations inline** — Surligner du texte dans une réponse pour ajouter un commentaire

---

## 4. Onglet Notes — Améliorations

### 🔴 Critique

- [ ] **Éditeur rich-text** — Remplacer le textarea basique par un éditeur (Tiptap ou Lexical) avec formatage
- [ ] **Lier notes et sources** — Associer une note à une ou plusieurs sources spécifiques
- [x] **Tri et filtres** — Trier par date, recherche full-text dans les notes ✅

### 🟠 Important

- [ ] **Notes auto-générées** — Créer des notes automatiquement à partir des highlights du chat
- [ ] **Templates de notes** — Modèles prédéfinis (Cornell, résumé, to-do, meeting notes)
- [ ] **Export multiple** — Exporter toutes les notes en un seul fichier Markdown/PDF
- [ ] **Collaboration** — Notes partagées entre utilisateurs (si multi-user un jour)

### 🟡 Nice-to-have

- [ ] **Canvas / Whiteboard** — Vue spatiale des notes (type Obsidian canvas)
- [ ] **Backlinks** — Détection automatique des liens entre notes
- [ ] **Versioning** — Historique des modifications d'une note

---

## 5. Onglet Générer — Améliorations

### 🔴 Critique

- [ ] **Preview avant sauvegarde** — Afficher le document généré en preview avant de le sauver
- [ ] **Régénérer avec instructions** — Pouvoir donner un prompt custom pour affiner le résultat
- [ ] **Export PDF/DOCX** — Exporter les documents générés dans des formats standards

### 🟠 Important

- [ ] **Nouveaux types** : Flashcards (Anki-compatible), Tableau comparatif, Argumentaire, Rapport d'analyse
- [ ] **Custom templates** — Permettre à l'utilisateur de créer ses propres templates de génération
- [ ] **Génération incrémentale** — Streaming du document pendant la génération
- [ ] **Multi-langue** — Générer dans une langue différente de celle des sources

### 🟡 Nice-to-have

- [ ] **Présentation auto** — Générer des slides (reveal.js ou Marp)
- [ ] **Infographies** — Générer des visuels résumant les données
- [ ] **Scheduled generation** — Régénérer automatiquement quand de nouvelles sources sont ajoutées

---

## 6. Onglet Audio — Améliorations

### 🔴 Critique

- [ ] **Qualité vocale** — Utiliser une API TTS premium (ElevenLabs, Azure TTS) au lieu du navigateur
- [ ] **Player amélioré** — Contrôles play/pause/seek, vitesse variable, barre de progression
- [ ] **Download audio** — Télécharger le fichier MP3/WAV généré

### 🟠 Important

- [ ] **Voix multiples** — Dialogue à deux voix pour le format podcast (comme NotebookLM)
- [ ] **Chapitres** — Diviser l'audio en sections avec des marqueurs temporels
- [ ] **Transcription synchronisée** — Afficher le texte en surbrillance pendant la lecture (karaoké)
- [ ] **Sélection de sources** — Choisir quelles sources inclure dans l'overview audio

### 🟡 Nice-to-have

- [ ] **Podcast RSS** — Générer un flux RSS pour écouter dans un lecteur podcast
- [ ] **Musique de fond** — Option d'ajouter un fond sonore ambient
- [ ] **Multilangue** — Générer l'audio dans plusieurs langues

---

## 7. UX Globale & Design

### 🔴 Critique

- [ ] **Responsive mobile** — Adapter les notebooks pour tablette/mobile (navigation bottom tabs)
- [ ] **Loading states** — Skeletons cohérents pour chaque onglet au lieu de simples spinners
- [x] **Raccourcis clavier** — `Ctrl+1-5` pour les onglets, `Ctrl+N` nouvelle note, `Ctrl+Enter` envoyer ✅

### 🟠 Important

- [ ] **Thème par notebook** — Couleur accent personnalisable par notebook (déjà le champ `color`)
- [ ] **Barre de progression globale** — Indicateur du nombre de sources indexées / en cours
- [ ] **Onboarding** — Guide interactif pour les nouveaux utilisateurs (tooltip tour)
- [ ] **Mode split-view** — Afficher deux onglets côte à côte (ex: Sources + Chat)
- [ ] **Breadcrumb navigation** — Fil d'Ariane pour la navigation Notebooks > Mon Notebook > Chat

### 🟡 Nice-to-have

- [ ] **Mode sombre/clair par notebook** — Override du thème global
- [ ] **Animations de transition** — Page transitions plus fluides entre notebooks
- [ ] **Gamification** — Badges/streaks pour encourager l'utilisation régulière

---

## 8. Backend & Infrastructure

### 🔴 Critique

- [ ] **Rate limiting** — Protéger les endpoints d'embedding et de chat contre les abus
- [ ] **Gestion de la mémoire** — Limiter la taille des embeddings en RAM, pagination des chunks
- [ ] **Backup automatique** — Sauvegarder les notebooks périodiquement (JSON + embeddings)

### 🟠 Important

- [ ] **Queue de processing** — File d'attente pour le traitement des sources (Bull/BullMQ)
- [ ] **Multi-model support** — Switcher entre OpenAI, Claude, Gemini, Ollama local pour le chat
- [ ] **Caching intelligent** — Cache des réponses pour les questions fréquentes/similaires
- [ ] **Webhooks** — Notifier des services externes quand un notebook est mis à jour

### 🟡 Nice-to-have

- [ ] **Sync cloud** — Synchronisation des notebooks entre appareils
- [ ] **API publique** — REST/GraphQL pour interagir avec les notebooks programmatiquement
- [ ] **Plugin system** — Architecture extensible pour ajouter de nouveaux types de sources/outputs

---

## 9. Sécurité & Données

- [ ] **Chiffrement des sources** — Chiffrer les données au repos (AES-256)
- [ ] **Contrôle d'accès** — Permissions par notebook si multi-utilisateur
- [ ] **Audit log** — Tracer qui a fait quoi (ajout source, suppression, génération)
- [ ] **RGPD** — Export de toutes les données utilisateur, suppression complète
- [ ] **Sanitization** — Vérifier que le contenu uploadé ne contient pas de scripts malicieux

---

## 10. Métriques & Analytics

- [ ] **Usage tracking** — Nombre de questions posées, sources ajoutées, documents générés
- [ ] **Qualité RAG** — Score moyen de pertinence des citations
- [ ] **Temps de réponse** — Latence du chat (P50, P95)
- [ ] **Sources populaires** — Quelles sources sont les plus citées
- [ ] **Dashboard insights** — Vue d'ensemble de l'utilisation des notebooks

---

## Planning Suggéré

| Phase | Durée | Focus |
|-------|-------|-------|
| **Phase 1** — Fondations | 2-3 semaines | Architecture (hooks, store, types), Copy/Retry chat, Rich editor notes |
| **Phase 2** — Core UX | 3-4 semaines | Conversations multiples, Preview sources, Export PDF, Raccourcis clavier |
| **Phase 3** — Intelligence | 2-3 semaines | Multi-model, Focus sources, Feedback loop, Caching |
| **Phase 4** — Audio & Génération | 2-3 semaines | TTS premium, Podcast dual-voice, Nouveaux templates |
| **Phase 5** — Polish | 2 semaines | Mobile responsive, Onboarding, Skeletons, Tests E2E |

---

## Bonnes Pratiques Récapitulatif

1. **Toujours typer** — Zéro `any`, interfaces explicites pour toutes les API responses
2. **Tester les composants critiques** — Chat streaming, upload sources, génération (Vitest + Testing Library)
3. **Accessibilité first** — Chaque interaction doit être navigable au clavier
4. **Optimistic UI** — Afficher immédiatement les changements (ajout note, suppression source) avant confirmation serveur
5. **Error recovery** — Toujours proposer un retry, jamais un dead-end
6. **Progressive enhancement** — Les features avancées (TTS, voice input) sont optionnelles et ne cassent pas le flow de base
7. **Composants réutilisables** — Extraire tout ce qui est utilisé > 2 fois dans `src/components/ui/`
8. **Documentation inline** — JSDoc sur chaque composant exporté et hook custom
9. **Feature flags** — Gater les features expérimentales derrière des flags pour rollback facile
10. **Performance budget** — Aucun onglet ne doit prendre > 200ms au premier rendu
