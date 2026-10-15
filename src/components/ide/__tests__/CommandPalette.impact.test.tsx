import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandPalette } from '../CommandPalette.js';

const base = {
  mode: 'commands' as const,
  openFiles: [],
  onOpenFile: vi.fn(),
  onClose: vi.fn(),
  onSave: vi.fn(),
  onFormat: vi.fn(),
  onToggleMinimap: vi.fn(),
  onToggleWordWrap: vi.fn(),
  onToggleSettings: vi.fn(),
  onShowDiff: vi.fn(),
};

describe('CommandPalette — analyse d’impact', () => {
  it('propose et déclenche « Analyser l’impact du fichier »', () => {
    const onAnalyzeImpact = vi.fn();
    render(<CommandPalette {...base} onAnalyzeImpact={onAnalyzeImpact} />);
    fireEvent.click(screen.getByText("Analyser l'impact du fichier"));
    expect(onAnalyzeImpact).toHaveBeenCalled();
    expect(base.onClose).toHaveBeenCalled();
  });

  it('n’affiche pas la commande sans gestionnaire', () => {
    render(<CommandPalette {...base} />);
    expect(screen.queryByText("Analyser l'impact du fichier")).toBeNull();
  });
});
