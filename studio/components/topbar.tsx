'use client';

import { useState, useEffect } from 'react';

interface TopbarProps {
  title: string;
  configPath: string;
  onConfigPathChange: (p: string) => void;
}

export function Topbar({ title, configPath, onConfigPathChange }: TopbarProps) {
  const [draft, setDraft] = useState(configPath);
  const [identity, setIdentity] = useState<string | null>(null);

  useEffect(() => {
    setDraft(configPath);
  }, [configPath]);

  function handleLoad() {
    onConfigPathChange(draft);
  }

  return (
    <header className="flex items-center justify-between h-12 px-4 border-b border-[var(--bd-subtle)] bg-[var(--bg-base)] shrink-0">
      <span className="text-sm font-medium text-[var(--tx-1)]">{title}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--tx-3)]">Config:</span>
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLoad()}
          className="text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-2)] rounded px-2 py-1 w-72 font-mono focus:outline-none focus:border-[var(--orange)]"
          placeholder=".boa/config.json"
        />
        <button
          onClick={handleLoad}
          className="text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-2)] rounded px-2 py-1 hover:bg-[var(--bg-raised)] transition-colors"
        >
          Load
        </button>
        {identity && (
          <span className="text-xs text-[var(--tx-3)] font-mono hidden lg:block truncate max-w-48">
            {identity}
          </span>
        )}
      </div>
    </header>
  );
}
