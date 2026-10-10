import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Globe, Zap, Check, AlertCircle, Search, Filter, X } from 'lucide-react';
import { useProfile } from '../../context/UserProfileContext.js';
import { Section, Field, SecretInput } from './SettingsPrimitives.js';
import type { AIProvider } from '../../context/UserProfileContext.js';

// ─── Tous les modèles gratuits OpenRouter ────────────────────────────────────
// Source : openrouter.ai/api/v1/models — vérifié le 03/08/2026

export const OPENROUTER_MODELS = [
  // ── Coding agents & modèles généralistes ────────────────────────────────
  {
    id: 'openai/gpt-6-luna-decisions',
    name: 'GPT-6 Luna Decisions',
    provider: 'OpenAI',
    free: false,
    desc: 'Modèle multimodal de décision et de classification, jusqu’à 1,05M tokens. Retourne des décisions structurées et des probabilités ; ce n’est pas un modèle de génération de code classique.'
  },
  {
    id: 'openai/gpt-5.6-luna',
    name: 'GPT-5.6 Luna',
    provider: 'OpenAI',
    free: false,
    desc: 'Modèle rapide et économique pour le chat, la classification et les tâches agentiques légères. Raisonnement, appels d’outils et contexte de 1,05M tokens.'
  },
  {
    id: 'z-ai/glm-5.3-flash',
    name: 'GLM 5.3 Flash',
    provider: 'Z.ai',
    free: false,
    desc: 'Modèle multimodal texte, image et vidéo, optimisé pour le code et les agents autonomes sur des tâches longues. Architecture à attention sparse et linéaire, contexte de 1,31M tokens.'
  },
  {
    id: 'deepseek/deepseek-v4.1-flash',
    name: 'DeepSeek V4.1 Flash',
    provider: 'DeepSeek',
    free: false,
    desc: 'MoE de 552B paramètres, avec 8B actifs en entrée et 16B en sortie. Compréhension des images, programmation, terminal, computer-use et tâches agentiques longues. Contexte de 1,05M tokens.'
  },
  {
    id: 'minimax/minimax-m3',
    name: 'MiniMax M3',
    provider: 'MiniMax',
    free: false,
    desc: 'Modèle multimodal texte, image et vidéo, fondé sur la Sparse Attention MSA. Contexte de 1,05M tokens, adapté au code et aux workflows longs. Vérifier la prise en charge des outils selon le fournisseur.'
  },

  // ── NVIDIA Nemotron : raisonnement et orchestration ─────────────────────
  {
    id: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    name: 'Nemotron 3 Ultra',
    provider: 'NVIDIA',
    free: true,
    desc: 'MoE de 550B paramètres, dont 55B actifs. Raisonnement multiétape, planification, recherche approfondie et orchestration d’agents. Contexte annoncé jusqu’à 1M tokens selon la variante.'
  },
  {
    id: 'nvidia/nemotron-3-super-120b-a12b:free',
    name: 'Nemotron 3 Super',
    provider: 'NVIDIA',
    free: true,
    desc: 'MoE de 120B paramètres, dont 12B actifs. Optimisé pour les systèmes multi-agents, le raisonnement complexe et la planification sur de longs contextes.'
  },
  {
    id: 'nvidia/nemotron-3-nano-30b-a3b:free',
    name: 'Nemotron 3 Nano 30B',
    provider: 'NVIDIA',
    free: true,
    desc: 'MoE ouvert de 30B paramètres, dont 3B actifs. Modèle compact pour les agents spécialisés, le raisonnement et les tâches à faible coût d’inférence.'
  },
  {
    id: 'nvidia/nemotron-3-nano-omni-30b-a3b:free',
    name: 'Nemotron 3 Nano Omni',
    provider: 'NVIDIA',
    free: true,
    desc: 'Modèle multimodal ouvert 30B-A3B acceptant texte, images, vidéo et audio. Adapté à la perception multimodale et au raisonnement dans les architectures agentiques.'
  },
  {
    id: 'nvidia/nemotron-nano-12b-v2-vl:free',
    name: 'Nemotron Nano 12B VL',
    provider: 'NVIDIA',
    free: true,
    desc: 'Modèle vision-langage pour analyser des images et des documents visuels. Vérifier les capacités vidéo et la fenêtre de contexte de l’endpoint choisi.'
  },
  {
    id: 'nvidia/nemotron-nano-9b-v2:free',
    name: 'Nemotron Nano 9B',
    provider: 'NVIDIA',
    free: true,
    desc: 'Modèle compact de raisonnement pour les tâches générales et les agents légers. Vérifier la référence exacte, le contexte et les capacités de raisonnement exposées par OpenRouter.'
  },
  {
    id: 'nvidia/nemotron-3.5-content-safety:free',
    name: 'Nemotron 3.5 Content Safety',
    provider: 'NVIDIA',
    free: true,
    desc: 'Modèle de sécurité multimodal de 4B paramètres. Classe les prompts et réponses comme sûrs ou dangereux, identifie les catégories de risque et aide à construire des garde-fous IA. Contexte jusqu’à 128K.'
  },

  // ── Modèles à poids ouverts ─────────────────────────────────────────────
  {
    id: 'openai/gpt-oss-20b:free',
    name: 'GPT-OSS 20B',
    provider: 'OpenAI',
    free: true,
    desc: 'Modèle à poids ouverts de 21B paramètres, dont 3,6B actifs, sous licence Apache 2.0. Raisonnement configurable, appels d’outils et sorties structurées. Contexte de 131K tokens.'
  },

  // ── InclusionAI ─────────────────────────────────────────────────────────
  {
    id: 'inclusionai/ling-3.0-flash:free',
    name: 'Ling 3.0 Flash',
    provider: 'InclusionAI',
    free: true,
    desc: 'MoE de 124B paramètres avec environ 5,1B actifs par token. Conçu pour une inférence agentique efficace, avec un bon compromis entre latence, consommation de tokens et coût. Contexte de 262K tokens.'
  }
];

// ─── Modèles de génération d'images disponibles via OpenRouter ────────────────

export const OPENROUTER_IMAGE_MODELS = [
  { id: 'google/gemini-3.6-flash-image',       name: 'Gemini 2.5 Flash Image',    free: true,  desc: 'Google — génération d\'images rapide et gratuite' },
  { id: 'google/gemini-3.1-flash-image-preview',         name: 'Gemini 3.1 Flash Image Preview',      free: false, desc: 'Google — qualité supérieure, détails fins' },
  { id: 'bytedance-seed/seedream-4.5',         name: 'SeedReam 4.5',              free: true,  desc: 'ByteDance — haute qualité, rapide' },
  { id: 'black-forest-labs/flux-schnell',      name: 'FLUX Schnell',              free: true,  desc: 'Black Forest Labs — ultra-rapide, léger' },
  { id: 'black-forest-labs/flux-1.1-pro',      name: 'FLUX 1.1 Pro',              free: false, desc: 'Black Forest Labs — qualité pro' },
  { id: 'stabilityai/stable-diffusion-xl',     name: 'Stable Diffusion XL',       free: false, desc: 'Stability AI — SDXL, polyvalent' },
  { id: 'openai/dall-e-3',                     name: 'DALL·E 3',                  free: false, desc: 'OpenAI — compréhension textuelle avancée' },
];

export function OpenRouterSection() {
  const { profile, setField } = useProfile();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [freeOnly, setFreeOnly] = useState(false);

  const filteredModels = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return OPENROUTER_MODELS.filter(m => {
      if (freeOnly && !m.free) return false;
      return (
        m.name.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q)
      );
    });
  }, [searchQuery, freeOnly]);

  // Le modèle sélectionné ne figure pas dans la liste prédéfinie → modèle « custom ».
  const isCustomModel = useMemo(
    () => !OPENROUTER_MODELS.some(m => m.id === profile.openrouterModel),
    [profile.openrouterModel],
  );

  const freeCount = useMemo(() => OPENROUTER_MODELS.filter(m => m.free).length, []);

  // Réinitialise le résultat du test quand la clé ou le modèle change.
  useEffect(() => { setTestResult(null); }, [profile.openrouterApiKey, profile.openrouterModel]);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/openrouter/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: profile.openrouterApiKey,
          model: profile.openrouterModel,
        }),
      });
      const data = await res.json();
      setTestResult(data.status === 'success' ? 'success' : 'error');
    } catch {
      setTestResult('error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <Section icon={Globe} title="Multi-Modèle (OpenRouter)" description="Sélectionnez votre provider et modèle pour les requêtes texte/chat">
      {/* Provider Toggle */}
      <Field label="Provider de texte actif" hint="Gemini = Live voice + texte. OpenRouter = accès à 300+ modèles pour le texte.">
        <div className="grid grid-cols-2 gap-2">
          {([
            { id: 'gemini' as AIProvider, label: '🔮 Gemini', desc: 'Google AI (Live voice)' },
            { id: 'openrouter' as AIProvider, label: '🌐 OpenRouter', desc: '300+ modèles' },
          ]).map(p => {
            const active = profile.textProvider === p.id;
            return (
              <motion.button
                key={p.id}
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setField('textProvider', p.id)}
                className="flex flex-col items-center p-3 rounded-xl text-xs font-semibold transition-all duration-200"
                style={{
                  backgroundColor: active ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                  border: `1.5px solid ${active ? 'var(--accent-primary)' : 'var(--border-base)'}`,
                  color: active ? 'var(--accent-primary)' : 'var(--text-muted)',
                  boxShadow: active ? '0 2px 8px color-mix(in srgb, var(--accent-primary) 15%, transparent)' : 'none',
                }}
              >
                <span className="text-base mb-1">{p.label}</span>
                <span className="text-xs opacity-70 font-normal">{p.desc}</span>
              </motion.button>
            );
          })}
        </div>
      </Field>

      {/* OpenRouter Config */}
      <AnimatePresence>
        {profile.textProvider === 'openrouter' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden flex flex-col gap-4"
          >
            {/* API Key */}
            <Field label="Clé API OpenRouter" hint="Obtenez votre clé sur openrouter.ai/keys — les modèles gratuits fonctionnent sans crédit.">
              <div className="flex gap-2">
                <div className="flex-1">
                  <SecretInput
                    value={profile.openrouterApiKey}
                    onChange={v => setField('openrouterApiKey', v)}
                    placeholder="sk-or-v1-..."
                  />
                </div>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={testConnection}
                  disabled={testing || !profile.openrouterApiKey}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: testResult === 'success' ? 'var(--color-success)' : testResult === 'error' ? 'var(--color-error)' : 'var(--accent-primary)' }}
                >
                  {testing ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8 }} className="h-3 w-3 rounded-full border-2 border-white border-t-transparent" />
                  ) : testResult === 'success' ? (
                    <><Check size={12} /> OK</>
                  ) : testResult === 'error' ? (
                    <><AlertCircle size={12} /> Erreur</>
                  ) : (
                    'Tester'
                  )}
                </motion.button>
              </div>
            </Field>

            {/* Model Selector */}
            <Field label="Modèle" hint="Les modèles gratuits sont marqués ⚡. Les modèles payants nécessitent des crédits OpenRouter.">
              {/* Search + filtre gratuit */}
              <div className="mb-2 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--text-dimmed)' }} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Rechercher un modèle..."
                    className="w-full rounded-lg pl-8 pr-7 py-2 text-xs outline-none transition-all duration-200"
                    style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100"
                      style={{ color: 'var(--text-muted)' }}
                      aria-label="Effacer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setFreeOnly(f => !f)}
                  title={`Afficher uniquement les modèles gratuits (${freeCount})`}
                  className="flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition hover:opacity-80"
                  style={{
                    borderColor: freeOnly ? 'var(--color-success)' : 'var(--border-base)',
                    backgroundColor: freeOnly ? 'color-mix(in srgb, var(--color-success) 12%, transparent)' : 'var(--bg-secondary)',
                    color: freeOnly ? 'var(--color-success)' : 'var(--text-secondary)',
                  }}
                >
                  {freeOnly ? <Zap className="h-3.5 w-3.5" /> : <Filter className="h-3.5 w-3.5" />}
                  Gratuits
                </button>
              </div>

              <p className="mb-1.5 text-xs" style={{ color: 'var(--text-dimmed)' }}>
                {filteredModels.length} modèle{filteredModels.length > 1 ? 's' : ''} · {freeCount} gratuit{freeCount > 1 ? 's' : ''}
              </p>

              {/* Model Grid */}
              <div className="grid grid-cols-1 gap-1.5 max-h-[280px] overflow-y-auto custom-scrollbar pr-1">
                {filteredModels.length === 0 && (
                  <p className="py-4 text-center text-xs" style={{ color: 'var(--text-dimmed)' }}>
                    Aucun modèle ne correspond. Essayez un ID personnalisé ci-dessous.
                  </p>
                )}
                {filteredModels.map(model => {
                  const active = profile.openrouterModel === model.id;
                  return (
                    <motion.button
                      key={model.id}
                      type="button"
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setField('openrouterModel', model.id)}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200"
                      style={{
                        backgroundColor: active ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                        border: `1.5px solid ${active ? 'var(--accent-primary)' : 'var(--border-base)'}`,
                        boxShadow: active ? '0 0 0 2px color-mix(in srgb, var(--accent-primary) 10%, transparent)' : 'none',
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold truncate" style={{ color: active ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                            {model.name}
                          </span>
                          {model.free && (
                            <span className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-bold"
                              style={{ backgroundColor: 'color-mix(in srgb, var(--color-success) 15%, transparent)', color: 'var(--color-success)' }}>
                              <Zap size={8} /> GRATUIT
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>{model.provider}</span>
                          <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>•</span>
                          <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>{model.desc}</span>
                        </div>
                      </div>
                      {active && (
                        <Check size={14} style={{ color: 'var(--accent-primary)' }} />
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </Field>

            {/* Custom Model ID */}
            <Field label="Ou entrez un ID de modèle personnalisé" hint="Consultez openrouter.ai/models pour la liste complète.">
              <input
                type="text"
                value={profile.openrouterModel}
                onChange={e => setField('openrouterModel', e.target.value)}
                placeholder="ex: anthropic/claude-sonnet-4"
                className="w-full rounded-lg px-3 py-2 text-xs font-mono outline-none transition-all duration-200"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent-primary)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-base)'; }}
              />
              {isCustomModel && profile.openrouterModel.trim() && (
                <span className="mt-1 flex items-center gap-1 text-xs" style={{ color: 'var(--accent-primary)' }}>
                  <Check className="h-3 w-3" />
                  Modèle personnalisé actif (hors liste)
                </span>
              )}
            </Field>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Info */}
      <div className="mt-2 rounded-xl p-3" style={{ backgroundColor: 'color-mix(in srgb, var(--accent-primary) 5%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-primary) 15%, transparent)' }}>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          💡 <strong>Note :</strong> La voix Live utilise toujours Gemini. Le provider texte contrôle les requêtes de chat écrites et l'analyse de code.
        </p>
      </div>

      {/* Image Model for Infographics */}
      <Field label="🖼️ Modèle d'infographie" hint="Modèle OpenRouter utilisé pour la génération d'images/infographies dans les notebooks.">
        <div className="grid grid-cols-1 gap-1.5 max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
          {OPENROUTER_IMAGE_MODELS.map(model => {
            const active = profile.openrouterImageModel === model.id;
            return (
              <motion.button
                key={model.id}
                type="button"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setField('openrouterImageModel', model.id)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200"
                style={{
                  backgroundColor: active ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                  border: `1.5px solid ${active ? 'var(--accent-primary)' : 'var(--border-base)'}`,
                  boxShadow: active ? '0 0 0 2px color-mix(in srgb, var(--accent-primary) 10%, transparent)' : 'none',
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold truncate" style={{ color: active ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                      {model.name}
                    </span>
                    {model.free && (
                      <span className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-bold"
                        style={{ backgroundColor: 'color-mix(in srgb, var(--color-success) 15%, transparent)', color: 'var(--color-success)' }}>
                        <Zap size={8} /> GRATUIT
                      </span>
                    )}
                  </div>
                  <span className="text-xs mt-0.5 block" style={{ color: 'var(--text-dimmed)' }}>{model.desc}</span>
                </div>
                {active && <Check size={14} style={{ color: 'var(--accent-primary)' }} />}
              </motion.button>
            );
          })}
        </div>
        <input
          type="text"
          value={profile.openrouterImageModel}
          onChange={e => setField('openrouterImageModel', e.target.value)}
          placeholder="ex: google/gemini-3.6-flash-image"
          className="mt-2 w-full rounded-lg px-3 py-2 text-xs font-mono outline-none transition-all duration-200"
          style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent-primary)'; }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-base)'; }}
        />
      </Field>
    </Section>
  );
}
