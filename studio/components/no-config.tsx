export function NoConfig() {
  return (
    <div className="flex items-center justify-center h-full min-h-[400px]">
      <div className="max-w-md text-center space-y-4">
        <div className="text-5xl">🐍</div>
        <h2 className="text-lg font-semibold text-[var(--tx-1)]">No BOA config found</h2>
        <p className="text-sm text-[var(--tx-2)]">
          BOA Studio could not find a <code className="text-[var(--tx-2)] bg-[var(--bg-surface)] px-1 rounded">.boa/config.json</code> file.
          This file is created when you bootstrap a BOA backend.
        </p>
        <div className="text-left bg-[var(--bg-surface)] rounded-lg p-4 space-y-3">
          <p className="text-xs font-semibold text-[var(--tx-2)] uppercase tracking-widest">Get started</p>
          <ol className="space-y-2 text-sm text-[var(--tx-2)] list-decimal list-inside">
            <li>
              Run{' '}
              <code className="text-green-400 bg-[var(--bg-base)] px-1.5 py-0.5 rounded text-xs">
                boa init my-app
              </code>{' '}
              to create a backend
            </li>
            <li>
              Or paste the path to an existing config in the topbar above
            </li>
            <li>
              Reload — the dashboard will pick up your config automatically
            </li>
          </ol>
        </div>
        <p className="text-xs text-[var(--tx-3)]">
          You can also set{' '}
          <code className="text-[var(--tx-3)]">BOA_CONFIG_PATH</code> as an env variable.
        </p>
      </div>
    </div>
  );
}
