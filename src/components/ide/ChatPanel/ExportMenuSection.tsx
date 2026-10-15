import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, ChevronRight, FileText, FileJson, Printer } from 'lucide-react';
import type { ExportFormat } from './exportConversation.js';

// ─── Entrée « Exporter » du menu, avec sous-menu de formats ──────────────────
// Extraite de ChatHeader pour garder ce dernier lisible. Gère son propre état
// de dépliage ; délègue l'export réel au parent via onExport(format).

/** Ligne de choix de format dans le sous-menu « Exporter » (indentée). */
function ExportFormatItem({
  icon, label, hint, onClick,
}: { icon: React.ReactNode; label: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 w-full pl-7 pr-3 py-2 text-sm transition-colors text-left hover:bg-[var(--bg-hover)]"
      style={{ color: 'var(--text-primary)' }}
    >
      {icon}
      <span className="flex-1">{label}</span>
      <span
        className="text-xs font-mono px-1.5 py-0.5 rounded"
        style={{ color: 'var(--text-dimmed)', backgroundColor: 'color-mix(in srgb, var(--text-dimmed) 10%, transparent)' }}
      >
        {hint}
      </span>
    </button>
  );
}

export interface ExportMenuSectionProps {
  onExport: (format: ExportFormat) => void;
}

export function ExportMenuSection({ onExport }: ExportMenuSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-3 w-full px-3 py-2 text-sm transition-colors text-left hover:bg-[var(--bg-hover)]"
        style={{ color: 'var(--text-primary)' }}
        aria-expanded={open}
        title="Exporter la conversation en rapport technique"
      >
        <Download size={13} style={{ color: 'var(--accent-primary)' }} />
        <span className="flex-1">Exporter</span>
        <ChevronRight
          size={13}
          style={{
            color: 'var(--text-dimmed)',
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s',
          }}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
            style={{ backgroundColor: 'color-mix(in srgb, var(--text-dimmed) 6%, transparent)' }}
          >
            <ExportFormatItem
              icon={<FileText size={13} style={{ color: 'var(--accent-primary)' }} />}
              label="Markdown" hint=".md"
              onClick={() => onExport('markdown')}
            />
            <ExportFormatItem
              icon={<Printer size={13} style={{ color: 'var(--accent-primary)' }} />}
              label="PDF" hint="impression"
              onClick={() => onExport('pdf')}
            />
            <ExportFormatItem
              icon={<FileJson size={13} style={{ color: 'var(--accent-primary)' }} />}
              label="JSON" hint=".json"
              onClick={() => onExport('json')}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
