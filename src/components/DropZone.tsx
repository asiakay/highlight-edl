import { useRef, useState, type DragEvent } from 'react';

interface Props {
  onFile: (file: File) => void;
  compact?: boolean;
  fileName?: string | undefined;
}

function pickMedia(files: FileList | null): File | null {
  if (!files) return null;
  return Array.from(files).find((f) => f.type.startsWith('video/') || f.type.startsWith('audio/') || !f.type) ?? null;
}

export function DropZone({ onFile, compact = false, fileName }: Props) {
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
          <button type="button" className="btn btn--ghost" onClick={() => input.current?.click()}>
            Replace file
          </button>
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
        </>
      )}
      {rejected && <p className="dropzone__error">That doesn’t look like a video or audio file.</p>}
    </div>
  );
}
