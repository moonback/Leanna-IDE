/**
 * TopBar — barre supérieure du shell v3 : recherche globale (Ctrl+K),
 * statut système, agents actifs, thème, rail droit et profil.
 */
import { useNavigate } from 'react-router-dom';
import { Search, Moon, Sun, PanelRight, Bot } from 'lucide-react';
import { BarButton } from '../components/ui/BarButton.js';
import { useProfile } from '../context/UserProfileContext.js';
import { ROUTES } from '../config/navigation.js';
import { OPEN_COMMAND_PALETTE_EVENT } from '../components/GlobalCommandPalette.js';

export interface TopBarProps {
  /** null tant que le premier sondage n'a pas répondu. */
  online: boolean | null;
  activeAgents: number;
  railOpen: boolean;
  onToggleRail: () => void;
}

export function TopBar({ online, activeAgents, railOpen, onToggleRail }: TopBarProps) {
  const navigate = useNavigate();
  const { profile, setField } = useProfile();
  const isLight = profile.theme === 'light';
  const statusText = online === null ? 'Connexion…' : online ? 'Système actif' : 'Serveur injoignable';
  const statusKind = online === null ? 'pending' : online ? 'ok' : 'down';
  const initial = (profile.userName || '?').trim().charAt(0).toUpperCase();

  return (
    <header className="nb-topbar" aria-label="Barre du cockpit">
      <BarButton
        className="nb-topbar__search"
        icon={<Search className="h-4 w-4" />}
        label="Rechercher une vue, une commande…"
        showLabel
        shortcut="Ctrl K"
        onClick={() => window.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE_EVENT))}
      />

      <div className="nb-topbar__spacer" />

      <span className="nb-pill" data-kind={statusKind} role="status">
        <span className="nb-pill__dot" aria-hidden="true" />
        {statusText}
      </span>

      <BarButton
        icon={<Bot className="h-4 w-4" />}
        label={activeAgents === 0 ? 'Aucun agent actif' : `${activeAgents} agent${activeAgents > 1 ? 's' : ''} actif${activeAgents > 1 ? 's' : ''}`}
        showLabel
        pressed={activeAgents > 0}
        onClick={() => navigate(`${ROUTES.pilotage}?tab=swarm`)}
      />

      <BarButton
        icon={isLight ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        label={isLight ? 'Passer en thème sombre' : 'Passer en thème clair'}
        onClick={() => setField('theme', isLight ? 'dark' : 'light')}
      />

      <BarButton
        icon={<PanelRight className="h-4 w-4" />}
        label={railOpen ? 'Masquer le panneau Agents & missions' : 'Afficher le panneau Agents & missions'}
        pressed={railOpen}
        onClick={onToggleRail}
      />

      <BarButton
        className="nb-topbar__profile"
        icon={<span className="nb-avatar">{initial}</span>}
        label={profile.userName ? `Profil de ${profile.userName}` : 'Profil'}
        showLabel={Boolean(profile.userName)}
        onClick={() => navigate(`${ROUTES.settings}?section=profile-settings`)}
      />
    </header>
  );
}
