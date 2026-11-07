/**
 * UploadToolbar — chips d'actions d'ajout de source (Uploader / URL / Texte /
 * Coller / GitHub / Codebase) et les formulaires associés (URL, Texte,
 * Codebase). Composant présentationnel piloté par le hook useSourceUpload.
 */

import type { SpringTransition, TapScaleProps } from '../motionTypes.js';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload, Globe, Type, ClipboardPaste, Github, FolderCode,
} from 'lucide-react';
import { clsx } from 'clsx';
import { ACCEPTED_EXTENSIONS } from './constants.js';
import { NbButton, NbInput, NbTextarea } from '../ui/primitives.js';
import type { useSourceUpload } from './useSourceUpload.js';

type UploadApi = ReturnType<typeof useSourceUpload>;

// Bouton des notebooks, animable (whileTap) comme les anciens motion.button.
const MotionButton = motion.create(NbButton);

/** Chip d'onglet d'ajout ; état actif aligné sur l'accent des notebooks. */
function chipClass(active = false): string {
  return clsx(
    'notebook-chip',
    active && 'notebook-chip--active !border-[var(--notebook-accent)] !bg-[var(--notebook-accent-surface)] !text-[var(--notebook-accent)]',
  );
}

/** Carte de formulaire (URL / Texte / Codebase). */
const FORM_CARD = 'notebook-card space-y-3 p-4';
const FIELD_LABEL = 'mb-1.5 block text-xs font-medium text-[var(--text-secondary)]';

interface Props {
  upload: UploadApi;
  onOpenGitHub: () => void;
  spring: SpringTransition;
  tapScale: TapScaleProps;
}

export function UploadToolbar({ upload, onOpenGitHub, spring, tapScale }: Props) {
  const {
    uploading,
    fileInputRef, handleFileInputChange, openFilePicker,
    showUrlForm, setShowUrlForm, url, setUrl, handleUrlIngest,
    showTextForm, setShowTextForm, textTitle, setTextTitle, textContent, setTextContent, handleTextAdd,
    showCodebaseForm, setShowCodebaseForm,
    codebaseTitle, setCodebaseTitle, codebaseExtensions, setCodebaseExtensions,
    codebaseIncludeDirs, setCodebaseIncludeDirs, codebaseExcludeDirs, setCodebaseExcludeDirs,
    codebaseMaxSizeKb, setCodebaseMaxSizeKb, codebaseIncludeConfig, setCodebaseIncludeConfig,
    handleCodebaseImport, handleClipboardPaste,
  } = upload;

  return (
    <>
      {/* Actions row */}
      <div className="flex flex-wrap items-center gap-2">
        <MotionButton
          {...tapScale}
          variant="primary"
          size="sm"
          icon={Upload}
          loading={uploading}
          onClick={openFilePicker}
        >
          Uploader
        </MotionButton>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS}
          onChange={handleFileInputChange}
          className="hidden"
        />

        <motion.button
          {...tapScale}
          type="button"
          onClick={() => { setShowUrlForm(!showUrlForm); setShowTextForm(false); setShowCodebaseForm(false); }}
          className={chipClass(showUrlForm)}
        >
          <Globe className="h-3.5 w-3.5" aria-hidden />
          URL
        </motion.button>

        <motion.button
          {...tapScale}
          type="button"
          onClick={() => { setShowTextForm(!showTextForm); setShowUrlForm(false); setShowCodebaseForm(false); }}
          className={chipClass(showTextForm)}
        >
          <Type className="h-3.5 w-3.5" aria-hidden />
          Texte
        </motion.button>

        <motion.button
          {...tapScale}
          type="button"
          onClick={handleClipboardPaste}
          className={chipClass()}
          title="Coller depuis le presse-papier"
        >
          <ClipboardPaste className="h-3.5 w-3.5" aria-hidden />
          Coller
        </motion.button>

        <motion.button
          {...tapScale}
          type="button"
          onClick={onOpenGitHub}
          className={chipClass()}
          title="Importer un dépôt GitHub"
        >
          <Github className="h-3.5 w-3.5" aria-hidden />
          GitHub
        </motion.button>

        <motion.button
          {...tapScale}
          type="button"
          onClick={() => { setShowCodebaseForm(!showCodebaseForm); setShowUrlForm(false); setShowTextForm(false); }}
          className={chipClass(showCodebaseForm)}
          title="Importer le codebase du workspace"
        >
          <FolderCode className="h-3.5 w-3.5" aria-hidden />
          Codebase
        </motion.button>
      </div>

      {/* URL Form */}
      <AnimatePresence>
        {showUrlForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
            className="overflow-hidden"
          >
            <div className={FORM_CARD}>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 flex-shrink-0 text-[var(--notebook-accent)]" aria-hidden />
                <p className="text-sm font-medium text-[var(--text-primary)]">Importer une URL</p>
              </div>
              <NbInput
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleUrlIngest()}
                placeholder="https://example.com/article..."
                // autoFocus justifié : le champ apparaît après sélection de
                // l'onglet URL ; focus immédiat attendu pour la saisie.
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
              <div className="flex gap-2">
                <MotionButton
                  {...tapScale}
                  variant="primary"
                  size="sm"
                  onClick={handleUrlIngest}
                  disabled={!url.trim()}
                  loading={uploading}
                >
                  {uploading ? 'Ingestion…' : 'Importer'}
                </MotionButton>
                <NbButton
                  variant="ghost"
                  size="sm"
                  onClick={() => { setShowUrlForm(false); setUrl(''); }}
                >
                  Annuler
                </NbButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Text Form */}
      <AnimatePresence>
        {showTextForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
            className="overflow-hidden"
          >
            <div className={FORM_CARD}>
              <div className="flex items-center gap-2">
                <Type className="h-4 w-4 flex-shrink-0 text-[var(--notebook-accent)]" aria-hidden />
                <p className="text-sm font-medium text-[var(--text-primary)]">Ajouter du texte</p>
              </div>
              <NbInput
                type="text"
                value={textTitle}
                onChange={e => setTextTitle(e.target.value)}
                placeholder="Titre (optionnel)"
              />
              <div className="relative">
                <NbTextarea
                  value={textContent}
                  onChange={e => setTextContent(e.target.value)}
                  placeholder="Collez votre texte ici..."
                  rows={6}
                  className="!pb-6"
                />
                {textContent && (
                  <span className="absolute bottom-2 right-3 text-xs text-[var(--text-muted)]">
                    ~{textContent.split(/\s+/).filter(Boolean).length} mots
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <MotionButton
                  {...tapScale}
                  variant="primary"
                  size="sm"
                  onClick={handleTextAdd}
                  disabled={!textContent.trim()}
                  loading={uploading}
                >
                  {uploading ? 'Ajout…' : 'Ajouter'}
                </MotionButton>
                <NbButton
                  variant="ghost"
                  size="sm"
                  onClick={() => { setShowTextForm(false); setTextTitle(''); setTextContent(''); }}
                >
                  Annuler
                </NbButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Codebase Import Form */}
      <AnimatePresence>
        {showCodebaseForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
            className="overflow-hidden"
          >
            <div className="notebook-card space-y-4 p-4">
              <div className="flex items-center gap-2">
                <FolderCode className="h-4 w-4 flex-shrink-0 text-[var(--notebook-accent)]" aria-hidden />
                <p className="text-sm font-medium text-[var(--text-primary)]">Importer le codebase du workspace</p>
              </div>
              <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                Scanne tous les fichiers texte du projet actif et les consolide en un seul document Markdown indexé dans ce notebook.
              </p>

              <NbInput
                type="text"
                value={codebaseTitle}
                onChange={e => setCodebaseTitle(e.target.value)}
                placeholder="Titre de la source (optionnel)"
              />

              <div>
                <label htmlFor="codebase-extensions" className={FIELD_LABEL}>
                  Extensions à inclure <span className="text-[var(--text-dimmed)]">(vide = toutes les extensions texte)</span>
                </label>
                <NbInput
                  id="codebase-extensions"
                  type="text"
                  value={codebaseExtensions}
                  onChange={e => setCodebaseExtensions(e.target.value)}
                  placeholder=".ts .tsx .js .py .md ..."
                  className="font-mono"
                />
              </div>

              <div>
                <label htmlFor="codebase-include-dirs" className={FIELD_LABEL}>
                  Dossiers à inclure <span className="text-[var(--text-dimmed)]">(vide = tout le workspace)</span>
                </label>
                <NbInput
                  id="codebase-include-dirs"
                  type="text"
                  value={codebaseIncludeDirs}
                  onChange={e => setCodebaseIncludeDirs(e.target.value)}
                  placeholder="src server/notebooks ..."
                  className="font-mono"
                />
              </div>

              <div>
                <label htmlFor="codebase-exclude-dirs" className={FIELD_LABEL}>
                  Dossiers à exclure <span className="text-[var(--text-dimmed)]">(en plus des exclusions par défaut)</span>
                </label>
                <NbInput
                  id="codebase-exclude-dirs"
                  type="text"
                  value={codebaseExcludeDirs}
                  onChange={e => setCodebaseExcludeDirs(e.target.value)}
                  placeholder="docs tests dist ..."
                  className="font-mono"
                />
              </div>

              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <label htmlFor="codebase-max-size" className={FIELD_LABEL}>
                    Taille max par fichier
                  </label>
                  <div className="flex items-center gap-2">
                    <NbInput
                      id="codebase-max-size"
                      type="number"
                      min={10}
                      max={500}
                      value={codebaseMaxSizeKb}
                      onChange={e => setCodebaseMaxSizeKb(Number(e.target.value))}
                      className="!w-20 text-center"
                    />
                    <span className="text-xs text-[var(--text-dimmed)]">Ko</span>
                  </div>
                </div>

                <label htmlFor="codebase-include-config" className="flex cursor-pointer select-none items-center gap-2">
                  <input
                    id="codebase-include-config"
                    type="checkbox"
                    checked={codebaseIncludeConfig}
                    onChange={e => setCodebaseIncludeConfig(e.target.checked)}
                    className="h-3.5 w-3.5 rounded accent-[var(--notebook-accent)]"
                  />
                  <span className="text-xs text-[var(--text-secondary)]">
                    Inclure les fichiers de config
                    <span className="block text-xs text-[var(--text-dimmed)]">package.json, tsconfig.json…</span>
                  </span>
                </label>
              </div>

              <div className="flex gap-2">
                <MotionButton
                  {...tapScale}
                  variant="primary"
                  size="sm"
                  icon={FolderCode}
                  onClick={handleCodebaseImport}
                  loading={uploading}
                >
                  {uploading ? 'Scan en cours…' : 'Importer le codebase'}
                </MotionButton>
                <NbButton
                  variant="ghost"
                  size="sm"
                  onClick={() => { setShowCodebaseForm(false); setCodebaseTitle(''); setCodebaseExtensions(''); setCodebaseIncludeDirs(''); setCodebaseExcludeDirs(''); }}
                >
                  Annuler
                </NbButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
