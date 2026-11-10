import { TAGS, type Tag } from '../state/markers';

interface Props {
  onTag: (tag: Tag) => void;
  disabled: boolean;
  preRollSec: number;
  postRollSec: number;
  onRoll: (pre: number | undefined, post: number | undefined) => void;
  lastTag: Tag | null;
}

export const TAG_KEYS: Record<Tag, string> = { '#quote': '1', '#broll': '2', '#turning-point': '3' };

export function tagClass(tag: Tag): string {
  return `tag--${tag.slice(1)}`;
}

export function TagBar({ onTag, disabled, preRollSec, postRollSec, onRoll, lastTag }: Props) {
  return (
    <section className="tagbar" aria-label="Quick tags">
      <div className="tagbar__buttons">
        {TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            className={`tagbtn ${tagClass(tag)}${lastTag === tag ? ' is-flash' : ''}`}
            onClick={() => onTag(tag)}
            disabled={disabled}
          >
            <span>{tag}</span>
            <kbd>{TAG_KEYS[tag]}</kbd>
          </button>
        ))}
      </div>
      <div className="tagbar__handles">
        <label>
          Pre-roll
          <input
            type="number"
            min={0}
            step={0.5}
            value={preRollSec}
            onChange={(e) => onRoll(Number(e.target.value) || 0, undefined)}
          />
          s
        </label>
        <label>
          Post-roll
          <input
            type="number"
            min={0}
            step={0.5}
            value={postRollSec}
            onChange={(e) => onRoll(undefined, Number(e.target.value) || 0)}
          />
          s
        </label>
      </div>
    </section>
  );
}
