import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export type TimeRange =
  | { type: 'relative'; minutes: number }
  | { type: 'absolute'; start: number; end: number };

export function toStartTime(r: TimeRange): number {
  return r.type === 'relative' ? Date.now() - r.minutes * 60_000 : r.start;
}

export function toEndTime(r: TimeRange): number | undefined {
  return r.type === 'absolute' ? r.end : undefined;
}

function formatRange(r: TimeRange): string {
  if (r.type === 'relative') {
    const m = r.minutes;
    if (m < 60)    return `Last ${m}m`;
    if (m < 1440)  return `Last ${m / 60}h`;
    if (m < 10080) return `Last ${m / 1440}d`;
    return `Last ${m / 10080}w`;
  }
  const fmt = (ts: number) =>
    new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `${fmt(r.start)} – ${fmt(r.end)}`;
}

const QUICK: { label: string; minutes: number }[] = [
  { label: '1m',  minutes: 1 },
  { label: '5m',  minutes: 5 },
  { label: '30m', minutes: 30 },
  { label: '1h',  minutes: 60 },
  { label: '3h',  minutes: 180 },
  { label: '12h', minutes: 720 },
];

const GRID = [
  { label: 'Minutes', unit: 'minutes', mult: 1,     options: [5, 10, 15, 30, 45] },
  { label: 'Hours',   unit: 'hours',   mult: 60,    options: [1, 2, 3, 6, 8, 12] },
  { label: 'Days',    unit: 'days',    mult: 1440,  options: [1, 2, 3, 4, 5, 6] },
  { label: 'Weeks',   unit: 'weeks',   mult: 10080, options: [1, 2, 3, 4] },
];

const UNIT_MULT: Record<string, number> = { minutes: 1, hours: 60, days: 1440, weeks: 10080 };

function toDatetimeLocal(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function TimeRangePicker({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (r: TimeRange) => void;
}) {
  const [open, setOpen]               = useState(false);
  const [mode, setMode]               = useState<'relative' | 'absolute'>('relative');
  const [draft, setDraft]             = useState<TimeRange>(value);
  const [customDuration, setCustomDuration] = useState('');
  const [customUnit, setCustomUnit]   = useState('minutes');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  function openCustom() {
    setDraft(value);
    setMode(value.type === 'absolute' ? 'absolute' : 'relative');
    setOpen(v => !v);
  }

  function applyQuick(minutes: number) {
    const r: TimeRange = { type: 'relative', minutes };
    onChange(r);
    setDraft(r);
    setOpen(false);
  }

  function applyDraft() {
    onChange(draft);
    setOpen(false);
  }

  function clear() {
    const r: TimeRange = { type: 'relative', minutes: 30 };
    onChange(r);
    setDraft(r);
    setOpen(false);
  }

  const isQuickActive = (minutes: number) =>
    value.type === 'relative' && value.minutes === minutes;

  const isNonQuickActive = !QUICK.some(p => isQuickActive(p.minutes));

  const absStart = draft.type === 'absolute' ? new Date(draft.start) : new Date(Date.now() - 3_600_000);
  const absEnd   = draft.type === 'absolute' ? new Date(draft.end)   : new Date();

  return (
    <div className="relative" ref={ref}>
      {/* Quick chips + Custom button */}
      <div className="flex items-center gap-0.5">
        {QUICK.map(p => (
          <button
            key={p.label}
            onClick={() => applyQuick(p.minutes)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              isQuickActive(p.minutes)
                ? 'bg-[var(--orange)] text-[var(--orange-fg)]'
                : 'text-[var(--tx-3)] hover:text-[var(--tx-2)] hover:bg-[var(--bg-raised)]'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={openCustom}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
            isNonQuickActive || open
              ? 'text-[var(--orange)] bg-[var(--orange-dim)] border border-[var(--orange-bd)]'
              : 'text-[var(--tx-3)] hover:text-[var(--tx-2)] hover:bg-[var(--bg-raised)]'
          }`}
        >
          {isNonQuickActive ? formatRange(value) : 'Custom'}
          <ChevronDown size={10} />
        </button>
      </div>

      {/* Popover */}
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-96 bg-[var(--bg-surface)] border border-[var(--bd)] rounded-lg shadow-2xl p-4 space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-1 bg-[var(--bg-raised)] rounded-md p-0.5 w-fit">
            {(['absolute', 'relative'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1 text-xs rounded capitalize transition-colors ${
                  mode === m
                    ? 'bg-[var(--bg-surface)] text-[var(--tx-1)]'
                    : 'text-[var(--tx-3)] hover:text-[var(--tx-2)]'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {mode === 'relative' && (
            <div className="space-y-2">
              {GRID.map(({ label, mult, options }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-xs text-[var(--tx-3)] w-14 shrink-0">{label}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {options.map(n => {
                      const minutes = n * mult;
                      const active = draft.type === 'relative' && draft.minutes === minutes;
                      return (
                        <button
                          key={n}
                          onClick={() => setDraft({ type: 'relative', minutes })}
                          className={`w-9 py-1 text-xs rounded border transition-colors ${
                            active
                              ? 'border-[var(--orange)] text-[var(--orange)] bg-[var(--orange-dim)]'
                              : 'border-[var(--bd)] text-[var(--tx-2)] hover:border-[var(--orange)] hover:text-[var(--orange)]'
                          }`}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Custom duration */}
              <div className="flex items-end gap-2 pt-2 border-t border-[var(--bd)]">
                <div>
                  <p className="text-xs text-[var(--tx-3)] mb-1">Duration</p>
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    value={customDuration}
                    onChange={e => setCustomDuration(e.target.value)}
                    placeholder="e.g. 45"
                    className="w-24 bg-[var(--bg-base)] border border-[var(--bd)] text-[var(--tx-1)] text-xs rounded px-2 py-1.5 focus:outline-none focus:border-[var(--orange)]"
                  />
                  <p className="text-[10px] text-[var(--tx-3)] mt-0.5">Up to 4 digits.</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--tx-3)] mb-1">Unit of time</p>
                  <select
                    value={customUnit}
                    onChange={e => setCustomUnit(e.target.value)}
                    className="bg-[var(--bg-base)] border border-[var(--bd)] text-[var(--tx-1)] text-xs rounded px-2 py-1.5 focus:outline-none"
                  >
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                  </select>
                </div>
                <button
                  onClick={() => {
                    const n = parseInt(customDuration, 10);
                    if (n > 0) setDraft({ type: 'relative', minutes: n * UNIT_MULT[customUnit] });
                  }}
                  disabled={!customDuration || parseInt(customDuration, 10) <= 0}
                  className="px-2 py-1.5 text-xs bg-[var(--bg-raised)] text-[var(--tx-2)] rounded hover:text-[var(--tx-1)] disabled:opacity-40 transition-colors"
                >
                  Set
                </button>
              </div>
            </div>
          )}

          {mode === 'absolute' && (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-[var(--tx-3)] mb-1">Start</p>
                <input
                  type="datetime-local"
                  value={toDatetimeLocal(absStart)}
                  onChange={e => {
                    const t = new Date(e.target.value).getTime();
                    if (!isNaN(t)) setDraft({ type: 'absolute', start: t, end: draft.type === 'absolute' ? draft.end : Date.now() });
                  }}
                  className="w-full bg-[var(--bg-base)] border border-[var(--bd)] text-[var(--tx-1)] text-xs rounded px-2 py-1.5 focus:outline-none focus:border-[var(--orange)]"
                />
              </div>
              <div>
                <p className="text-xs text-[var(--tx-3)] mb-1">End</p>
                <input
                  type="datetime-local"
                  value={toDatetimeLocal(absEnd)}
                  onChange={e => {
                    const t = new Date(e.target.value).getTime();
                    if (!isNaN(t)) setDraft({ type: 'absolute', start: draft.type === 'absolute' ? draft.start : Date.now() - 3_600_000, end: t });
                  }}
                  className="w-full bg-[var(--bg-base)] border border-[var(--bd)] text-[var(--tx-1)] text-xs rounded px-2 py-1.5 focus:outline-none focus:border-[var(--orange)]"
                />
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-[var(--bd)]">
            <button
              onClick={clear}
              className="text-xs text-[var(--tx-3)] hover:text-[var(--tx-2)] transition-colors px-2 py-1 border border-[var(--bd)] rounded"
            >
              Clear
            </button>
            <div className="flex gap-2">
              <button onClick={() => setOpen(false)} className="text-xs text-[var(--tx-3)] hover:text-[var(--tx-2)] transition-colors px-2 py-1">
                Cancel
              </button>
              <button
                onClick={applyDraft}
                className="text-xs bg-[var(--orange)] text-[var(--orange-fg)] px-3 py-1 rounded hover:opacity-90 transition-opacity"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
