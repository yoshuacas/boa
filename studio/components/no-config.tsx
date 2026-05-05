export function NoConfig() {
  return (
    <div className="flex items-center justify-center h-full min-h-[400px]">
      <div className="max-w-md text-center space-y-4">
        <div className="text-5xl">🐍</div>
        <h2 className="text-lg font-semibold text-white">No BOA config found</h2>
        <p className="text-sm text-gray-400">
          BOA Studio could not find a <code className="text-gray-300 bg-[#1c1c21] px-1 rounded">.boa/config.json</code> file.
          This file is created when you bootstrap a BOA backend.
        </p>
        <div className="text-left bg-[#1c1c21] rounded-lg p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Get started</p>
          <ol className="space-y-2 text-sm text-gray-300 list-decimal list-inside">
            <li>
              Run{' '}
              <code className="text-green-400 bg-[#0f1117] px-1.5 py-0.5 rounded text-xs">
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
        <p className="text-xs text-gray-600">
          You can also set{' '}
          <code className="text-gray-500">BOA_CONFIG_PATH</code> as an env variable.
        </p>
      </div>
    </div>
  );
}
