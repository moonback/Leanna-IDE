# Video Intelligence — conception et plan d'implémentation

**Branche :** `feat/notebook-video-intelligence-gemini`  
**Périmètre produit :** YouTube, TikTok, Instagram Reels et Vimeo  
**Moteur :** Gemini uniquement

## État de cette première passe

Cette branche introduit les primitives partagées de Video Intelligence :
- reconnaissance stricte des domaines et normalisation des URL des quatre plateformes ;
- extraction d'identifiants quand le format d'URL en expose un ;
- transcription d'un buffer audio ou vidéo déjà obtenu, via Gemini multimodal ;
- acceptation des fichiers vidéo MP4, WebM et MOV dans l'upload Notebook (limite upload existante de 10 Mio) ;
- passage de ces fichiers par la queue commune, puis création d'une source de type `video` indexée dans le RAG ;
- validation de la signature de conteneur MP4/MOV (ISO BMFF) et WebM (EBML), en plus de l'extension et du MIME ;
- conservation des segments horodatés et des locuteurs dans `source.metadata.videoTranscript` (maximum 5 000 segments) ;
- refus explicite des URL TikTok/Instagram/Vimeo non encore raccordées, avec indication du parcours upload au lieu d'une tentative d'extraction de page trompeuse ;
- segments horodatés, langue, locuteur facultatif et texte concaténé ;
- validation du MIME, de la taille, du format JSON et des timestamps.

L'import d'un fichier vidéo fourni par l'utilisateur est maintenant raccordé au pipeline Notebook. Cette passe **ne prétend toujours pas télécharger l'audio des plateformes depuis une URL**. Une URL publique, un oEmbed ou une page HTML ne garantit pas l'accès au flux média. Il ne faut pas contourner les contrôles d'accès, les contenus privés, les protections techniques ou les conditions des plateformes.

## Architecture cible

```text
Notebook SourcePanel
  -> POST /:notebookId/sources/video
  -> parseVideoUrl (allowlist stricte)
  -> PlatformAdapter (YouTube / TikTok / Instagram / Vimeo)
  -> Media acquisition autorisée OU upload utilisateur
  -> extraction audio (worker isolé / FFmpeg si installé)
  -> transcribeAudioWithGemini
  -> normalisation des segments
  -> SourceIngester.buildSource / chunks RAG
  -> persistance + indexation Notebook
  -> SourceViewer (transcription + navigation temporelle)
```

## Contrats à préserver

- Réutiliser `enqueueSourceIngestion` et `sourceProcessingQueue` pour ne pas bloquer les routes HTTP pendant les traitements longs.
- Ne jamais accepter une URL arbitraire comme cible de téléchargement. Résoudre les redirections, DNS/IP privés, ports et protocoles avant toute requête sortante pour prévenir SSRF.
- Préférer les API officielles, les sous-titres publics ou un média fourni par l'utilisateur. Une URL sans média accessible doit produire une erreur explicite avec proposition d'upload.
- Stocker les segments et la provenance dans les métadonnées de la source ; garder le texte complet dans `rawText` pour le RAG.
- Ne pas envoyer de vidéo complète en base64 dans une requête texte standard. Pour les gros médias, utiliser l'API Files Gemini avec suppression du fichier distant après traitement, ou découper l'audio en segments bornés.
- Gemini est forcé explicitement avec `forceProvider: "gemini"` : aucune bascule OpenRouter ne doit être silencieuse.

## Étapes restantes

1. Ajouter l'adaptateur URL TikTok basé uniquement sur des sous-titres publics/accès autorisé ; sinon proposer explicitement l'import du fichier vidéo.
2. Implémenter les adaptateurs metadata/oEmbed pour TikTok, Instagram et Vimeo, sans considérer oEmbed comme un accès média.
3. Choisir un mécanisme de récupération autorisé par plateforme et définir les limites de durée/taille.
4. Étendre le parcours upload vidéo (durée/taille) et vérifier le support natif vidéo Gemini ; basculer vers extraction audio FFmpeg uniquement si nécessaire.
5. Étendre `Source` avec les métadonnées vidéo/segments et le type `video`.
6. Ajouter route URL + queue, progression par étapes, annulation et erreurs récupérables.
7. Ajouter l'UI d'import multi-plateforme et le lecteur/transcript synchronisé.
8. Ajouter tests d'intégration avec fixtures locales ; les tests unitaires ne doivent pas appeler les plateformes ni Gemini.

## Matrice de tests attendue

| Domaine | Cas |
|---|---|
| URL | domaines supportés, short links, paramètres de tracking, URL malformées, domaines usurpés |
| Sécurité | protocoles non HTTP(S), credentials, redirections vers IP privées, DNS rebinding, tailles excessives |
| Gemini | MIME audio accepté/refusé, audio vide, JSON mal formé, timestamps invalides, locuteurs absents |
| Queue | progression, annulation, timeout, retry, erreurs plateforme |
| RAG | texte horodaté indexé, citations vers source, déduplication |
| UI | collage URL, état en cours, erreur exploitable, fallback upload |

## Vérification

À exécuter depuis le clone local :
- `npm test`
- `npm run typecheck`
- `npm run lint:eslint -- server/notebooks/videoIntelligence.ts server/notebooks/videoIntelligence.test.ts`

Les exécutions locales ne sont pas disponibles via l'édition distante GitHub ; les résultats doivent être confirmés avant merge.


## Affichage de la transcription dans Notebook

La route de contenu d'une source vidéo expose maintenant `metadata.videoTranscript` au panneau SourceViewer. Celui-ci affiche la langue, le nombre de segments, les locuteurs lorsqu'ils sont fournis et chaque segment avec son timestamp formaté. La transcription est filtrable par texte/intervenant et copiable avec ses horodatages. Les timestamps sont consultables visuellement, mais ne pilotent pas encore un lecteur : le fichier vidéo original n'est pas conservé dans le modèle de source. L'étape suivante du lecteur synchronisé nécessite une persistance média dédiée, un endpoint de streaming avec contrôle d'accès notebook/source et une politique de suppression des fichiers.
