Plan de perfectionnement — Jarvis Notebooks
1. RAG & Qualité des réponses (priorité haute)
Amélioration	Impact	Effort
<!-- Embeddings Gemini — Remplacer TF-IDF par les embeddings API (text-embedding-004) pour une vraie recherche sémantique	⭐⭐⭐	Moyen
Chunking intelligent — Découper par sections/paragraphes sémantiques plutôt que par taille fixe (respect des headers markdown, pages PDF)	⭐⭐⭐	Moyen -->
Re-ranking — Après le TF-IDF, re-scorer les top 20 chunks avec un appel LLM court ("ce passage est-il pertinent pour la question ?")	⭐⭐	Faible
Hybrid search — Combiner TF-IDF (rappel) + embeddings (sémantique) en score fusionné	⭐⭐⭐	Moyen
Expansion de requête — Reformuler la question via LLM avant la recherche (décomposer en sous-questions)	⭐⭐	Faible
2. Sources & Ingestion
Amélioration	Impact	Effort
YouTube transcripts — Intégrer l'API YouTube Data + whisper/captions pour extraire la transcription	⭐⭐⭐	Moyen
Google Docs / Drive — Import direct via OAuth	⭐⭐	Élevé
OCR images — Utiliser Gemini vision pour extraire le texte des images/screenshots	⭐⭐	Faible
Multi-fichier upload — Drag & drop de plusieurs fichiers simultanément	⭐⭐	Faible
Refresh/re-sync URLs — Re-crawl périodique des URLs pour détecter les changements	⭐	Moyen
3. Chat & UX
Amélioration	Impact	Effort
Streaming — Réponses en streaming (SSE) pour un feedback immédiat	⭐⭐⭐	Moyen
Follow-up automatique — Après chaque réponse, proposer 3 questions de suivi contextuelles	⭐⭐	Faible
Mode "deep dive" — Un mode qui explore un sujet en profondeur avec plusieurs requêtes RAG enchaînées	⭐⭐	Moyen
Citation hover — Au survol d'une citation, afficher le passage complet de la source	⭐⭐	Faible
Export chat — Exporter une conversation en Markdown/PDF	⭐	Faible
4. Audio Overview (podcast)
Amélioration	Impact	Effort
TTS réel — Convertir le script en audio via Gemini TTS ou une API TTS (ElevenLabs, Google TTS)	⭐⭐⭐	Moyen
Personnalisation des hôtes — Choix du ton (académique, casual, humoristique) et des noms	⭐	Faible
Chapitrage — Découper le podcast en sections avec timestamps	⭐	Faible
5. Intelligence & Automatisation
Amélioration	Impact	Effort
Auto-linking — Détecter automatiquement les relations entre sources (termes communs, citations croisées)	⭐⭐	Moyen
Alertes de contradiction — Signaler quand des sources se contredisent	⭐⭐	Moyen
Mise à jour incrémentale — Quand une source est modifiée, ne re-chunker que les parties changées	⭐	Élevé
Templates de notebooks — Notebooks pré-configurés (recherche académique, veille techno, prépa examen)