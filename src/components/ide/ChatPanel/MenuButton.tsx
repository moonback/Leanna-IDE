export interface MenuButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  /** Raccourci clavier affiché à droite (ex. "⌘E"). */
  shortcut?: string;
}

/** Entrée de menu générique (menu « Plus d'options »). */
export function MenuButton({ icon, label, onClick, danger = false, shortcut }: MenuButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 w-full px-3 py-2 text-sm transition-colors text-left hover:bg-[var(--bg-hover)]"
      style={{ color: danger ? 'var(--color-error)' : 'var(--text-primary)' }}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {shortcut && (
        <kbd
          className="text-xs font-mono px-1.5 py-0.5 rounded"
          style={{ color: 'var(--text-dimmed)', backgroundColor: 'color-mix(in srgb, var(--text-dimmed) 10%, transparent)' }}
        >
          {shortcut}
        </kbd>
      )}
    </button>
  );
}
