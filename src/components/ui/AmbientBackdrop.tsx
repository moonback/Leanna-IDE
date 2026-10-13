/**
 * AmbientBackdrop — halos d'accent flous qui dérivent lentement derrière l'app.
 *
 * Purement décoratif : aria-hidden, aucun pointeur, animé en CSS (transform
 * seulement, voir styles/motion-pro.css §3). Masqué automatiquement en
 * prefers-reduced-motion et dans le thème high-contrast.
 *
 * Doit être le premier enfant de `.app-layout` (contexte d'empilement isolé)
 * pour passer sous le contenu.
 */
import React from 'react';

export const AmbientBackdrop = React.memo(function AmbientBackdrop() {
  return (
    <div className="lea-ambient" aria-hidden="true">
      <span className="lea-ambient__blob lea-ambient__blob--a" />
      <span className="lea-ambient__blob lea-ambient__blob--b" />
      <span className="lea-ambient__blob lea-ambient__blob--c" />
    </div>
  );
});
