/**
 * NotesPanel — Gestion des notes d'un notebook
 */

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Pin, Trash2, Edit3, Save, X } from 'lucide-react';
import { useToast } from '../ui/Toast';

interface NoteItem {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  notebookId: string;
  notes: NoteItem[];
  onRefresh: () => void;
}

export function NotesPanel({ notebookId, notes, onRefresh }: Props) {
  const { success, error: toastError } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const handleCreate = useCallback(async () => {
    if (!title.trim()) return;
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), content: content.trim() }),
      });
      if (!res.ok) throw new Error();
      success('Note créée');
      setTitle('');
      setContent('');
      setShowForm(false);
      onRefresh();
    } catch {
      toastError('Erreur');
    }
  }, [title, content, notebookId, success, toastError, onRefresh]);

  const handleUpdate = useCallback(async (noteId: string) => {
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/notes/${noteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), content: content.trim() }),
      });
      if (!res.ok) throw new Error();
      success('Note mise à jour');
      setEditingId(null);
      setTitle('');
      setContent('');
      onRefresh();
    } catch {
      toastError('Erreur');
    }
  }, [title, content, notebookId, success, toastError, onRefresh]);

  const handleDelete = useCallback(async (noteId: string) => {
    try {
      await fetch(`/api/notebooks/${notebookId}/notes/${noteId}`, { method: 'DELETE' });
      success('Note supprimée');
      onRefresh();
    } catch {
      toastError('Erreur');
    }
  }, [notebookId, success, toastError, onRefresh]);

  const handleTogglePin = useCallback(async (noteId: string, pinned: boolean) => {
    try {
      await fetch(`/api/notebooks/${notebookId}/notes/${noteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: !pinned }),
      });
      onRefresh();
    } catch { /* ignore */ }
  }, [notebookId, onRefresh]);

  const startEdit = (note: NoteItem) => {
    setEditingId(note.id);
    setTitle(note.title);
    setContent(note.content);
  };

  // Trier : pinnées d'abord, puis par date
  const sorted = [...notes].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-5 lg:p-7 space-y-4">
      {/* Add button */}
      <button
        onClick={() => { setShowForm(true); setEditingId(null); setTitle(''); setContent(''); }}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95"
        style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}
      >
        <Plus className="w-3.5 h-3.5" />
        Nouvelle note
      </button>

      {/* Create/Edit Form */}
      <AnimatePresence>
        {(showForm || editingId) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 rounded-2xl border space-y-3"
              style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Titre de la note..."
                className="w-full px-4 py-2 rounded-xl text-xs outline-none"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
              />
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Contenu..."
                rows={5}
                className="w-full px-4 py-3 rounded-xl text-xs outline-none resize-none"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => editingId ? handleUpdate(editingId) : handleCreate()}
                  disabled={!title.trim()}
                  className="flex items-center gap-1 px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-40 transition active:scale-95"
                  style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}
                >
                  <Save className="w-3 h-3" />
                  {editingId ? 'Mettre à jour' : 'Créer'}
                </button>
                <button
                  onClick={() => { setShowForm(false); setEditingId(null); setTitle(''); setContent(''); }}
                  className="px-3 py-2 rounded-xl text-xs"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notes List */}
      {sorted.length === 0 && !showForm ? (
        <p className="text-xs text-center py-8" style={{ color: 'var(--text-dimmed)' }}>
          Aucune note. Créez des notes pour organiser vos idées et annotations.
        </p>
      ) : (
        <div className="space-y-3">
          {sorted.map((note) => (
            <div
              key={note.id}
              className="group p-4 rounded-2xl border"
              style={{ backgroundColor: 'var(--bg-panel)', borderColor: note.pinned ? 'var(--accent-primary)' : 'var(--border-base)' }}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {note.pinned && <Pin className="w-3 h-3 inline mr-1" style={{ color: 'var(--accent-primary)' }} />}
                    {note.title}
                  </p>
                  {note.content && (
                    <p className="text-[10px] mt-1 whitespace-pre-wrap line-clamp-4" style={{ color: 'var(--text-muted)' }}>
                      {note.content}
                    </p>
                  )}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button onClick={() => handleTogglePin(note.id, note.pinned)} className="p-1 rounded hover:bg-white/5">
                    <Pin className="w-3 h-3" style={{ color: note.pinned ? 'var(--accent-primary)' : 'var(--text-dimmed)' }} />
                  </button>
                  <button onClick={() => startEdit(note)} className="p-1 rounded hover:bg-white/5">
                    <Edit3 className="w-3 h-3" style={{ color: 'var(--text-dimmed)' }} />
                  </button>
                  <button onClick={() => handleDelete(note.id)} className="p-1 rounded hover:bg-red-500/10">
                    <Trash2 className="w-3 h-3" style={{ color: 'var(--color-error)' }} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
