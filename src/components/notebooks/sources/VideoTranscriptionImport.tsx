import { useRef, useState } from "react";
import { Film, Loader2 } from "lucide-react";

interface Props {
  notebookId: string;
  onImported: () => void;
  onError: (message: string) => void;
}

const ACCEPT = ".mp4,.webm,.mov,.mkv,.mpeg,.mpg,video/mp4,video/webm,video/quicktime,video/x-matroska,video/mpeg";

export function VideoTranscriptionImport({ notebookId, onImported, onError }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function importVideo(file?: File) {
    if (!file) return;
    if (file.size > 18 * 1024 * 1024) {
      onError("La vidéo doit peser au maximum 18 Mio.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setBusy(true);
    setStatus("Transcription avec Gemini…");
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`/api/notebooks/${encodeURIComponent(notebookId)}/sources/video-transcribe`, {
        method: "POST",
        body,
      });
      const data = await response.json();
      if (!response.ok || data.status !== "success") throw new Error(data.error || "La transcription a échoué.");
      setStatus("Transcription ajoutée au Notebook.");
      onImported();
    } catch (error) {
      onError(error instanceof Error ? error.message : "La transcription a échoué.");
      setStatus("");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        disabled={busy}
        onChange={event => void importVideo(event.target.files?.[0])}
        aria-label="Sélectionner une vidéo à transcrire"
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="notebook-chip inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
        title="Importer une vidéo locale et transcrire son contenu parlé avec Gemini"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Film className="h-3.5 w-3.5" aria-hidden />}
        {busy ? "Transcription…" : "Vidéo + transcription"}
      </button>
      {status && <span className="text-xs text-[var(--text-muted)]" role="status">{status}</span>}
      <p className="basis-full text-xs text-[var(--text-muted)]">
        Vidéos locales jusqu’à 18 Mio. Les liens de plateformes et contenus protégés ne sont pas extraits.
      </p>
    </div>
  );
}
