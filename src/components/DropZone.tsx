import { useRef, useState, type DragEvent } from 'react';
import { preloadDrive } from '../lib/drive';

export interface DriveControl {
  onPick: () => void;
  status: 'idle' | 'busy' | 'error';
  label?: string;
  progress?: number;
  message?: string;
}

interface Props {
  onFile: (file: File) => void;
  compact?: boolean;
  fileName?: string | undefined;
  /** Present only when the build has Google Drive credentials. */
  drive?: DriveControl | undefined;
}

function DriveButton({ drive, compact }: { drive: DriveControl; compact: boolean }) {
  const busy = drive.status === 'busy';
  return (
    <button
      type="button"
      className={`btn btn--drive${compact ? ' btn--ghost' : ''}`}
      onClick={drive.onPick}
      // Google's scripts load only once someone reaches for the button, never for local-only use.
      onPointerEnter={preloadDrive}
      onFocus={preloadDrive}
      onPointerDown={preloadDrive}
      disabled={busy}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="btn__icon">
        <path d="M8.2 3h7.6l6.2 10.8-3.8 6.6H5.8L2 13.8z M8.2 3l5.6 10.8H2 M15.8 3 9.9 13.8l-4.1 6.6 M13.8 13.8H22" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      {compact ? 'Drive' : 'Open from Google Drive'}
    </button>
  );
}

function DriveStatus({ drive }: { drive: DriveControl }) {
  if (drive.status === 'error') return <p className="dropzone__error" role="alert">{drive.message}</p>;
  if (drive.status !== 'busy') return null;
  return (
    <div className="dropzone__drive-status" role="status">
      <span>{drive.label}</span>
      {drive.progress !== undefined && (
        <progress max={1} value={drive.progress} aria-label="Download progress" />
      )}
    </div>
  );
}

function pickMedia(files: FileList | null): File | null {
  if (!files) return null;
  return Array.from(files).find((f) => f.type.startsWith('video/') || f.type.startsWith('audio/') || !f.type) ?? null;
}

export function DropZone({ onFile, compact = false, fileName, drive }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState(false);

  const accept = (files: FileList | null) => {
    const file = pickMedia(files);
    setRejected(!file);
    if (file) onFile(file);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    accept(e.dataTransfer.files);
  };

  return (
    <div
      className={`dropzone${compact ? ' dropzone--compact' : ''}${over ? ' is-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <input
        ref={input}
        type="file"
        accept="video/*,audio/*,.mkv,.mov,.mxf"
        hidden
        onChange={(e) => {
          accept(e.target.files);
          e.target.value = '';
        }}
      />
      {compact ? (
        <>
          <span className="dropzone__file" title={fileName}>
            {fileName}
          </span>
          <div className="dropzone__actions">
            {drive && <DriveButton drive={drive} compact />}
            <button type="button" className="btn btn--ghost" onClick={() => input.current?.click()}>
              Replace file
            </button>
          </div>
        </>
      ) : (
        <>
          <svg className="dropzone__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5h16v14H4z M10 9l5 3-5 3z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          <p className="dropzone__title">Drop a video here</p>
          <p className="dropzone__hint">
            or{' '}
            <button type="button" className="link" onClick={() => input.current?.click()}>
              choose a file
            </button>
            . It never leaves your device.
          </p>
          {drive && (
            <div className="dropzone__drive">
              <DriveButton drive={drive} compact={false} />
              <p className="dropzone__hint">Streams straight from Drive to this browser.</p>
            </div>
          )}
        </>
      )}
      {drive && <DriveStatus drive={drive} />}
      {rejected && <p className="dropzone__error">That doesn’t look like a video or audio file.</p>}
    </div>
  );
}
