# Audio Overview — podcast conversationnel à deux voix

## Objectif

L'Audio Overview produit un épisode audio continu à partir des sources du Notebook. Leanna et son co-animateur disposent de deux identités vocales distinctes. Le script reste le conducteur éditorial, mais le résultat attendu est un fichier audio final, et non une succession de fragments joués uniquement dans le navigateur.

## Architecture livrée dans cette branche

### 1. Génération éditoriale

- Le script est produit à partir des sources du Notebook et conserve le RAG existant.
- Le prompt impose deux personnalités, un échange naturel, des réactions, des relances et des transitions.
- Les noms configurés sont conservés dans le podcast.
- Les anciens scripts Alex/Sam restent interprétables.

### 2. Rendu audio serveur

- `server/notebooks/PodcastAudioRenderer.ts` analyse les répliques et identifie leur intervenant.
- La voix de l'hôte et celle du co-hôte sont synthétisées séparément avec deux identifiants distincts (`ff_siwis` et `am_adam` par défaut).
- Le routage TTS conserve les mécanismes de cache, de retry et de fallback existants. Les voix Kokoro distinctes sont mappées vers Aoede et Charon si le fallback Gemini est utilisé.
- Les segments PCM sont assemblés côté serveur dans un unique conteneur WAV PCM 16 bits, mono, 24 kHz, avec une courte respiration entre les tours de parole.
- Le fichier final est écrit de façon atomique dans `<sandbox>/podcasts/<overviewId>.wav`. Un rendu existant est réutilisé au lieu de refaire les appels TTS.
- Une erreur sur une réplique empêche la publication d'un fichier partiel.

### 3. API

- `POST /api/notebooks/:id/audio-overviews/:overviewId/audio-track` génère ou réutilise la piste et renvoie ses métadonnées.
- `GET /api/notebooks/:id/audio-overviews/:overviewId/audio-track` sert le fichier WAV.
- `GET .../audio-track?download=1` télécharge le fichier.
- Les routes sont protégées par le contrôle de notebook/workspace déjà appliqué au routeur Audio Overview.

### 4. Lecture et interface

- `useTtsPlayer` demande le rendu au serveur, puis lit un seul fichier audio via le lecteur natif du navigateur.
- La progression et la mise en évidence du script suivent la position de lecture de la piste.
- Le changement d'épisode arrête la lecture précédente.
- Le lecteur permet d'écouter, d'arrêter, de régler la vitesse et de télécharger le WAV ou le script Markdown.
- Le bouton de téléchargement génère la piste si elle n'existe pas encore.

## Voix par défaut

| Intervenant | Voix TTS | Fallback Gemini |
|---|---|---|
| Leanna | `ff_siwis` | Aoede |
| Co-animateur | `am_adam` | Charon |

Ces voix sont deux identités vocales différentes. Elles restent configurables via les paramètres transmis à l'API.

## Séparation avec le mode conversationnel Live

Le podcast pré-généré est une piste audio finalisée à deux voix. La session Notebook Live reste une fonctionnalité séparée destinée à permettre à l'utilisateur d'intervenir en direct. Le transport Live actuel ne fournit pas deux voix indépendantes simultanées ; cette branche ne prétend donc pas transformer la conversation Live en dialogue multi-voix.

## Vérifications locales requises

Depuis la racine du dépôt :

```bash
npm run typecheck
npm run lint:eslint:notebooks
npm run test
npm run test:ui
```

Scénarios manuels :
1. Générer un nouvel épisode en français avec Leanna et Noah.
2. Écouter et confirmer que les deux voix sont audiblement distinctes.
3. Vérifier que la piste continue sans requêtes TTS depuis le navigateur pendant la lecture.
4. Télécharger le WAV, l'ouvrir dans un lecteur externe et vérifier sa durée.
5. Relancer la lecture : le rendu existant doit être réutilisé.
6. Changer d'épisode pendant la lecture : l'ancien audio doit s'arrêter.
7. Tester un ancien script Alex/Sam.
8. Simuler un échec TTS sur une réplique : aucun WAV incomplet ne doit être servi.

## Limites et points de vigilance

- Le rendu actuel produit du WAV PCM. MP3 pourra être ajouté ensuite avec un encodeur disponible dans le runtime, sans imposer de dépendance native non vérifiée.
- Les segments sont générés séquentiellement afin de respecter l'ordre du dialogue et les limites de débit TTS. Une file de rendu durable avec reprise après redémarrage pourra être ajoutée si les épisodes longs le nécessitent.
- Les tests et le typecheck doivent être exécutés dans l'environnement local du dépôt avant fusion.
