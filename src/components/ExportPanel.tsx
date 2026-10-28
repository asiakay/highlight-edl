import { useMemo, useState } from 'react';
import {
  CMX3600_MAX_EVENTS,
  type ExportOptions,
  type ExportSource,
  buildEdl,
  buildManifest,
  exportFileBase,
} from '../lib/export';
import type { Marker } from '../state/markers';

type Format = 'json' | 'edl';

interface Props {
  markers: Marker[];
  source: ExportSource;
  options: ExportOptions;
  onOptions: (o: ExportOptions) => void;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API needs a secure context and focus; fall back to a hidden textarea.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function download(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportPanel({ markers, source, options, onOptions }: Props) {
  const [format, setFormat] = useState<Format>('json');
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);

  const output = useMemo(
    () =>
      format === 'json'
        ? JSON.stringify(buildManifest(markers, source, options, new Date()), null, 2)
        : buildEdl(markers, source, options),
    [format, markers, source, options],
  );

  const base = exportFileBase(source.name);
  const tooMany = format === 'edl' && markers.length > CMX3600_MAX_EVENTS;

  return (
    <section className="panel export" aria-label="Export">
      <header className="panel__head">
        <h2>Export</h2>
        <div className="seg" role="tablist" aria-label="Export format">
          {(['json', 'edl'] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={format === f}
              className={format === f ? 'is-on' : ''}
              onClick={() => setFormat(f)}
            >
              {f === 'json' ? 'JSON manifest' : 'CMX3600 EDL'}
            </button>
          ))}
        </div>
      </header>

      <div className="export__opts">
        <label>
          Title
          <input type="text" value={options.title} onChange={(e) => onOptions({ ...options, title: e.target.value })} />
        </label>
        {format === 'edl' && (
          <>
            <label>
              Record start
              <input
                type="text"
                className="tc"
                value={options.recordStart}
                onChange={(e) => onOptions({ ...options, recordStart: e.target.value })}
              />
            </label>
            <label>
              Reel
              <input
                type="text"
                maxLength={8}
                value={options.reel}
                onChange={(e) => onOptions({ ...options, reel: e.target.value })}
              />
            </label>
            <label>
              Tracks
              <select value={options.tracks} onChange={(e) => onOptions({ ...options, tracks: e.target.value })}>
                <option value="AA/V">AA/V (video + 2 audio)</option>
                <option value="V">V (video only)</option>
                <option value="AA">AA (audio only)</option>
              </select>
            </label>
          </>
        )}
      </div>

      {tooMany && (
        <p className="warn">
          CMX3600 allows {CMX3600_MAX_EVENTS} events; you have {markers.length}. Most NLEs will truncate the list.
        </p>
      )}

      <textarea className="export__out" readOnly value={output} spellCheck={false} aria-label="Export output" onFocus={(e) => e.currentTarget.select()} />

      <div className="export__actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={markers.length === 0}
          onClick={async () => {
            setCopied((await copyText(output)) ? 'ok' : 'fail');
            setTimeout(() => setCopied(null), 1600);
          }}
        >
          {copied === 'ok' ? 'Copied ✓' : copied === 'fail' ? 'Copy failed' : 'Copy to clipboard'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={markers.length === 0}
          onClick={() =>
            format === 'json'
              ? download(output, `${base}.highlights.json`, 'application/json')
              : download(output, `${base}.edl`, 'text/plain')
          }
        >
          Download .{format}
        </button>
      </div>
    </section>
  );
}
