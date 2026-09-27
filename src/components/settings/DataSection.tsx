import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2 } from 'lucide-react';
import { Section, Field } from './SettingsPrimitives.js';

export function DataSection() {
  const [clearing, setClearing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [clearingMemory, setClearingMemory] = useState(false);
  const [confirmMemory, setConfirmMemory] = useState(false);
  const [memoryResult, setMemoryResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [clearingAll, setClearingAll] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [allResult, setAllResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleClear = async () => {
    setClearing(true); setResult(null);
    try {
      const res = await fetch('/api/conversations/all', { method: 'DELETE' });
      const data = await res.json();
      if (data.status === 'success') setResult({ type: 'success', message: `${data.deleted} conversation(s) supprimée(s)` });
      else setResult({ type: 'error', message: data.error || 'Erreur inconnue' });
    } catch (e: any) { setResult({ type: 'error', message: e.message || 'Erreur réseau' }); }
    finally { setClearing(false); setConfirmOpen(false); }
  };

  const handleClearMemory = async () => {
    setClearingMemory(true); setMemoryResult(null);
    try {
      const res = await fetch('/api/memories/all', { method: 'DELETE' });
      const data = await res.json();
      if (data.status === 'success') setMemoryResult({ type: 'success', message: `${data.deleted} mémoire(s) supprimée(s)` });
      else setMemoryResult({ type: 'error', message: data.error || 'Erreur inconnue' });
    } catch (e: any) { setMemoryResult({ type: 'error', message: e.message || 'Erreur réseau' }); }
    finally { setClearingMemory(false); setConfirmMemory(false); }
  };

  const handleClearAll = async () => {
    setClearingAll(true); setAllResult(null);
    try {
      const res = await fetch('/api/data/all', { method: 'DELETE' });
      const data = await res.json();
      if (data.status === 'success') {
        setAllResult({ type: 'success', message: `Base de données vidée · ${data.deleted} enregistrement(s) supprimé(s)` });
      } else if (data.status === 'partial') {
        const failed = Object.keys(data.errors || {}).join(', ');
        setAllResult({ type: 'error', message: `Purge partielle · ${data.deleted} supprimé(s). Échecs : ${failed}` });
      } else {
        setAllResult({ type: 'error', message: data.error || 'Erreur inconnue' });
      }
    } catch (e: any) { setAllResult({ type: 'error', message: e.message || 'Erreur réseau' }); }
    finally { setClearingAll(false); setConfirmAll(false); }
  };

  return (
    <Section icon={Trash2} title="Gestion des données" description="Supprimez les données stockées dans Supabase (conversations, mémoire, agents, missions…)">
      <div className="flex flex-col gap-4">
        <Field label="Historique des conversations" hint="Supprime toutes les conversations de manière définitive.">
          {!confirmOpen ? (
            <motion.button type="button" onClick={() => setConfirmOpen(true)} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold transition-all duration-200"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-error) 30%, transparent)', color: 'var(--color-error)' }}>
              <Trash2 className="h-3.5 w-3.5" /> Vider l'historique des conversations
            </motion.button>
          ) : (
            <div className="rounded-xl p-4" style={{ backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, var(--bg-secondary))', border: '1px solid color-mix(in srgb, var(--color-error) 25%, transparent)' }}>
              <p className="mb-3 text-xs font-medium" style={{ color: 'var(--color-error)' }}>⚠️ Toutes les conversations seront supprimées définitivement.</p>
              <div className="flex gap-2">
                <motion.button type="button" onClick={handleClear} disabled={clearing} whileTap={{ scale: 0.97 }}
                  className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" style={{ backgroundColor: 'var(--color-error)' }}>
                  {clearing ? 'Suppression…' : 'Confirmer'}
                </motion.button>
                <motion.button type="button" onClick={() => { setConfirmOpen(false); setResult(null); }} disabled={clearing} whileTap={{ scale: 0.97 }}
                  className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
                  style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-muted)' }}>
                  Annuler
                </motion.button>
              </div>
            </div>
          )}
        </Field>
        <AnimatePresence>
          {result && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              className="rounded-lg px-3 py-2 text-xs font-medium"
              style={{ backgroundColor: result.type === 'success' ? 'color-mix(in srgb, var(--color-success) 10%, transparent)' : 'color-mix(in srgb, var(--color-error) 10%, transparent)', color: result.type === 'success' ? 'var(--color-success)' : 'var(--color-error)' }}>
              {result.type === 'success' ? '✓' : '✗'} {result.message}
            </motion.div>
          )}
        </AnimatePresence>

        <Field label="Mémoire long-terme" hint="Supprime toutes les mémoires stockées dans Supabase. Irréversible.">
          {!confirmMemory ? (
            <motion.button type="button" onClick={() => setConfirmMemory(true)} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold transition-all duration-200"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-warning) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)', color: 'var(--color-warning)' }}>
              <Trash2 className="h-3.5 w-3.5" /> Vider la mémoire
            </motion.button>
          ) : (
            <div className="rounded-xl p-4" style={{ backgroundColor: 'color-mix(in srgb, var(--color-warning) 8%, var(--bg-secondary))', border: '1px solid color-mix(in srgb, var(--color-warning) 25%, transparent)' }}>
              <p className="mb-3 text-xs font-medium" style={{ color: 'var(--color-warning)' }}>⚠️ Toutes les mémoires seront supprimées définitivement.</p>
              <div className="flex gap-2">
                <motion.button type="button" onClick={handleClearMemory} disabled={clearingMemory} whileTap={{ scale: 0.97 }}
                  className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" style={{ backgroundColor: 'var(--color-warning)' }}>
                  {clearingMemory ? 'Suppression…' : 'Confirmer'}
                </motion.button>
                <motion.button type="button" onClick={() => { setConfirmMemory(false); setMemoryResult(null); }} disabled={clearingMemory} whileTap={{ scale: 0.97 }}
                  className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
                  style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-muted)' }}>
                  Annuler
                </motion.button>
              </div>
            </div>
          )}
        </Field>
        <AnimatePresence>
          {memoryResult && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              className="rounded-lg px-3 py-2 text-xs font-medium"
              style={{ backgroundColor: memoryResult.type === 'success' ? 'color-mix(in srgb, var(--color-success) 10%, transparent)' : 'color-mix(in srgb, var(--color-error) 10%, transparent)', color: memoryResult.type === 'success' ? 'var(--color-success)' : 'var(--color-error)' }}>
              {memoryResult.type === 'success' ? '✓' : '✗'} {memoryResult.message}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="my-1 h-px w-full" style={{ backgroundColor: 'var(--border-base)' }} />

        <Field label="Vider toute la base de données" hint="Supprime TOUT : conversations, mémoire, agents, missions, workflows, tâches planifiées, skills personnalisés et listes. Irréversible.">
          {!confirmAll ? (
            <motion.button type="button" onClick={() => setConfirmAll(true)} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold transition-all duration-200"
              style={{ backgroundColor: 'var(--color-error)', color: '#fff' }}>
              <Trash2 className="h-3.5 w-3.5" /> Tout vider (base complète)
            </motion.button>
          ) : (
            <div className="rounded-xl p-4" style={{ backgroundColor: 'color-mix(in srgb, var(--color-error) 12%, var(--bg-secondary))', border: '1px solid color-mix(in srgb, var(--color-error) 40%, transparent)' }}>
              <p className="mb-3 text-xs font-medium" style={{ color: 'var(--color-error)' }}>⚠️ TOUTES les données (conversations, mémoire, agents, missions, workflows, tâches planifiées, skills, listes) seront supprimées définitivement. Action irréversible.</p>
              <div className="flex gap-2">
                <motion.button type="button" onClick={handleClearAll} disabled={clearingAll} whileTap={{ scale: 0.97 }}
                  className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" style={{ backgroundColor: 'var(--color-error)' }}>
                  {clearingAll ? 'Suppression…' : 'Oui, tout supprimer'}
                </motion.button>
                <motion.button type="button" onClick={() => { setConfirmAll(false); setAllResult(null); }} disabled={clearingAll} whileTap={{ scale: 0.97 }}
                  className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
                  style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-muted)' }}>
                  Annuler
                </motion.button>
              </div>
            </div>
          )}
        </Field>
        <AnimatePresence>
          {allResult && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              className="rounded-lg px-3 py-2 text-xs font-medium"
              style={{ backgroundColor: allResult.type === 'success' ? 'color-mix(in srgb, var(--color-success) 10%, transparent)' : 'color-mix(in srgb, var(--color-error) 10%, transparent)', color: allResult.type === 'success' ? 'var(--color-success)' : 'var(--color-error)' }}>
              {allResult.type === 'success' ? '✓' : '✗'} {allResult.message}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Section>
  );
}
