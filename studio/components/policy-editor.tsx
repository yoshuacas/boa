import { useState, useRef, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import type { editor } from 'monaco-editor';
import { parseCedar, type PolicyRule } from '@/lib/cedar-policies-client';
import { useAuth } from '@/src/context/AuthContext';

const MonacoEditor = lazy(() => import('@monaco-editor/react'));

const ACTION_COLORS: Record<string, string> = {
  select: 'text-blue-400 bg-blue-900/20 border-blue-700/30',
  insert: 'text-green-400 bg-green-900/20 border-green-700/30',
  update: 'text-yellow-400 bg-yellow-900/20 border-yellow-700/30',
  delete: 'text-red-400 bg-red-900/20 border-red-700/30',
  '*':    'text-gray-400 bg-gray-800/40 border-gray-700/30',
};

interface Props {
  initialFilename: string;
  initialContent: string;
  isNew: boolean;
}

export function PolicyEditor({ initialFilename, initialContent, isNew }: Props) {
  const navigate = useNavigate();
  const { studioMode } = useAuth();
  const cloudMode = studioMode === 'cloud';
  const [filename, setFilename] = useState(initialFilename);
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeploy, setConfirmDeploy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ message: string; variant: 'saved' | 'deployed' } | null>(null);
  const [deployedContent, setDeployedContent] = useState<{ filename: string; content: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const summary = parseCedar(content);

  const handleMount = useCallback((ed: editor.IStandaloneCodeEditor) => {
    editorRef.current = ed;
  }, []);

  const getBody = () => editorRef.current ? editorRef.current.getValue() : content;

  const getFinalName = () => {
    const fname = filename.trim();
    return fname.endsWith('.cedar') ? fname : fname + '.cedar';
  };

  const save = async () => {
    const fname = filename.trim();
    if (!fname) { setError('Filename is required'); return; }
    const finalName = getFinalName();
    const body = getBody();

    setSaving(true);
    setError(null);
    try {
      const method = isNew ? 'POST' : 'PUT';
      const url = isNew
        ? '/api/policies'
        : `/api/policies?filename=${encodeURIComponent(finalName)}`;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isNew ? { filename: finalName, content: body } : { content: body }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setStatus({ message: 'Saved — run boa deploy to apply', variant: 'saved' });
      setTimeout(() => setStatus(null), 4000);
      if (isNew) navigate(`/policies/${encodeURIComponent(finalName)}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const saveAndDeploy = async () => {
    const fname = filename.trim();
    if (!fname) { setError('Filename is required'); return; }
    const finalName = getFinalName();
    const body = getBody();

    setDeploying(true);
    setError(null);
    try {
      const res = await fetch('/api/policies/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: finalName, content: body }),
      });
      const data = await res.json() as { error?: string; functionName?: string };
      if (!res.ok) throw new Error(data.error || 'Deploy failed');
      setStatus({ message: `Deployed to ${data.functionName}`, variant: 'deployed' });
      setTimeout(() => setStatus(null), 5000);
      if (cloudMode) setDeployedContent({ filename: finalName, content: body });
      if (isNew) navigate(`/policies/${encodeURIComponent(finalName)}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeploying(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete ${filename}? This cannot be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/policies?filename=${encodeURIComponent(filename)}`, { method: 'DELETE' });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      navigate('/policies');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-4">
        {isNew ? (
          <div className="flex items-center gap-2">
            <input
              value={filename}
              onChange={e => setFilename(e.target.value)}
              placeholder="filename.cedar"
              className="bg-[#1c1c21] border border-[#2a2a2f] text-white text-sm font-mono rounded px-3 py-1.5 w-56 focus:outline-none focus:border-gray-500"
            />
          </div>
        ) : (
          <h1 className="text-base font-semibold text-white font-mono">{filename}</h1>
        )}
        <div className="flex items-center gap-3">
          {status && (
            <span className={`text-xs ${status.variant === 'deployed' ? 'text-green-400' : 'text-gray-500'}`}>
              {status.variant === 'deployed' ? '⬆ ' : ''}
              {status.message}
            </span>
          )}
          {!isNew && (
            <button
              onClick={handleDelete}
              disabled={deleting || deploying || saving}
              className="text-sm text-red-400 hover:text-red-300 px-3 py-1.5 rounded border border-red-700/30 hover:border-red-600/50 transition-colors disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          )}
          <div className="w-px h-4 bg-[#2a2a2f]" />
          <div className="flex items-center gap-1">
            {!cloudMode && (
              <button
                onClick={save}
                disabled={saving || deploying}
                title="Save to disk only — requires boa deploy to go live"
                className="text-sm bg-[#1c1c21] border border-[#2a2a2f] text-gray-300 font-medium rounded-l px-3 py-1.5 hover:bg-[#2a2a2f] hover:text-white transition-colors disabled:opacity-50 border-r-0"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            )}
            <button
              onClick={() => setConfirmDeploy(true)}
              disabled={saving || deploying}
              title={cloudMode ? 'Push to the live Lambda immediately' : 'Save and push to the live Lambda immediately'}
              className={`text-sm bg-green-800 border border-green-700 text-green-100 font-medium px-3 py-1.5 hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-1.5 ${cloudMode ? 'rounded' : 'rounded-r'}`}
            >
              {deploying ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-green-300/30 border-t-green-200 rounded-full animate-spin" />
                  Deploying…
                </>
              ) : (
                <>
                  <span className="text-green-400">⬆</span>
                  Deploy
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700/40 rounded-lg px-4 py-2.5 text-sm text-red-300">
          {error}
        </div>
      )}

      {deployedContent && (
        <div className="bg-yellow-900/10 border border-yellow-700/30 rounded-lg p-4 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-yellow-300">Change is live — not saved to your project</p>
              <p className="text-xs text-yellow-700">
                This policy was pushed directly to Lambda. It will be <span className="text-yellow-500">overwritten</span> on the next <code className="font-mono">boa deploy</code> unless you commit this file to your project.
              </p>
            </div>
            <button
              onClick={() => setDeployedContent(null)}
              className="text-yellow-700 hover:text-yellow-400 transition-colors text-lg leading-none shrink-0"
            >
              ×
            </button>
          </div>
          <div className="bg-[#0f1117] border border-[#2a2a2f] rounded p-3 relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono text-gray-500">policies/{deployedContent.filename}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(deployedContent.content);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="text-xs text-gray-500 hover:text-white transition-colors"
              >
                {copied ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
            <pre className="text-xs font-mono text-gray-400 whitespace-pre-wrap max-h-40 overflow-auto">
              {deployedContent.content}
            </pre>
          </div>
          <p className="text-xs text-yellow-800">
            To make it permanent: add the file above to <code className="font-mono text-yellow-700">policies/{deployedContent.filename}</code> in your project and run <code className="font-mono text-yellow-700">boa deploy</code>.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
        {/* Monaco editor */}
        <div className="bg-[#1c1c21] border border-[#2a2a2f] rounded-lg overflow-hidden" style={{ height: 480 }}>
          <Suspense fallback={<div className="h-full flex items-center justify-center text-gray-600 text-sm">Loading editor...</div>}>
            <MonacoEditor
              height="100%"
              language="cedar-policy"
              theme="vs-dark"
              value={content}
              onChange={v => setContent(v ?? '')}
              onMount={(ed, monaco) => {
                handleMount(ed);
                if (!monaco.languages.getLanguages().find((l: { id: string }) => l.id === 'cedar-policy')) {
                  monaco.languages.register({ id: 'cedar-policy' });
                  monaco.languages.setMonarchTokensProvider('cedar-policy', {
                    keywords: ['permit', 'forbid', 'when', 'unless', 'in', 'is', 'has', 'like', 'if', 'then', 'else', 'true', 'false'],
                    tokenizer: {
                      root: [
                        [/\/\/.*$/, 'comment'],
                        [/"[^"]*"/, 'string'],
                        [/\b(permit|forbid)\b/, 'keyword.control'],
                        [/\b(when|unless|if|then|else)\b/, 'keyword'],
                        [/\b(principal|action|resource|context)\b/, 'variable'],
                        [/\b(is|in|has|like)\b/, 'keyword'],
                        [/\bPgrestLambda::\w+/, 'type'],
                        [/[{}()\[\];,]/, 'delimiter'],
                        [/[=!<>]+/, 'operator'],
                        [/&&|\|\|/, 'operator'],
                        [/\b\d+\b/, 'number'],
                        [/\w+/, 'identifier'],
                      ],
                    },
                  });
                  monaco.editor.defineTheme('cedar-dark', {
                    base: 'vs-dark',
                    inherit: true,
                    rules: [
                      { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
                      { token: 'keyword.control', foreground: 'f472b6', fontStyle: 'bold' },
                      { token: 'keyword', foreground: 'c084fc' },
                      { token: 'variable', foreground: '60a5fa' },
                      { token: 'type', foreground: 'fb923c' },
                      { token: 'string', foreground: '4ade80' },
                      { token: 'operator', foreground: 'e2e8f0' },
                      { token: 'number', foreground: 'f59e0b' },
                    ],
                    colors: {
                      'editor.background': '#1c1c21',
                      'editor.lineHighlightBackground': '#2a2a2f',
                    },
                  });
                  monaco.editor.setTheme('cedar-dark');
                }
                ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, save);
              }}
              options={{
                fontSize: 13,
                fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                wordWrap: 'on',
                padding: { top: 12, bottom: 12 },
              }}
            />
          </Suspense>
        </div>

        {/* Live summary panel */}
        <div className="space-y-3">
          <div className="bg-[#1c1c21] border border-[#2a2a2f] rounded-lg p-4">
            <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-3">
              Rules ({summary.rules.length})
            </p>
            {summary.rules.length === 0 ? (
              <p className="text-xs text-gray-600">No rules parsed yet.</p>
            ) : (
              <div className="space-y-3">
                {summary.rules.map((rule, i) => (
                  <RuleSummaryCard key={i} rule={rule} />
                ))}
              </div>
            )}
          </div>

          <div className="bg-[#1c1c21] border border-[#2a2a2f] rounded-lg p-4">
            <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-2">
              Access matrix
            </p>
            <AccessMatrix rules={summary.rules} />
          </div>
        </div>
      </div>

      {confirmDeploy && (
        <DeployConfirmModal
          filename={getFinalName()}
          onConfirm={() => { setConfirmDeploy(false); saveAndDeploy(); }}
          onCancel={() => setConfirmDeploy(false)}
        />
      )}
    </div>
  );
}

function DeployConfirmModal({
  filename, onConfirm, onCancel,
}: {
  filename: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="bg-[#1c1c21] border border-[#2a2a2f] rounded-xl w-full max-w-md mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-white">Deploy policy?</h2>
            <p className="text-sm text-gray-400">
              This will save <span className="font-mono text-gray-200">{filename}</span> and immediately patch the live Lambda function.
            </p>
          </div>

          <div className="bg-[#0f1117] border border-[#2a2a2f] rounded-lg p-3 space-y-1.5 text-xs text-gray-500">
            <p><span className="text-gray-400">What happens:</span> The current Lambda deployment package is downloaded, the policy file is updated inside it, and the package is re-uploaded.</p>
            <p><span className="text-gray-400">Takes:</span> ~5–15 seconds while the Lambda update propagates.</p>
            <p><span className="text-gray-400">Effect:</span> New requests to your API will use the updated policy within seconds.</p>
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={onCancel}
              className="text-sm text-gray-400 hover:text-white px-3 py-1.5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="text-sm bg-green-800 hover:bg-green-700 border border-green-700 text-green-100 font-medium rounded px-4 py-1.5 transition-colors flex items-center gap-1.5"
            >
              <span className="text-green-400">⬆</span>
              Deploy now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RuleSummaryCard({ rule }: { rule: PolicyRule }) {
  return (
    <div className={`rounded border px-3 py-2 text-xs space-y-1 ${
      rule.effect === 'permit'
        ? 'border-green-800/40 bg-green-900/10'
        : 'border-red-800/40 bg-red-900/10'
    }`}>
      <div className="flex items-center justify-between">
        <span className={rule.effect === 'permit' ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
          {rule.effect}
        </span>
        <span className="text-gray-500">{rule.resource}</span>
      </div>
      <div className="text-gray-400">
        <span className="text-purple-300">{rule.principal}</span>
        {' → '}
        <span className="inline-flex gap-1 flex-wrap">
          {rule.actions.map(a => (
            <span key={a} className={`px-1.5 py-0.5 rounded border text-[10px] font-mono ${ACTION_COLORS[a] ?? ACTION_COLORS['*']}`}>
              {a}
            </span>
          ))}
        </span>
      </div>
      {rule.condition && (
        <p className="text-gray-600 font-mono text-[10px] break-all">
          when {'{' + rule.condition + '}'}
        </p>
      )}
    </div>
  );
}

const MATRIX_ACTIONS = ['select', 'insert', 'update', 'delete'];
const MATRIX_PRINCIPALS = ['Any', 'User', 'ServiceRole', 'AnonRole'];

function AccessMatrix({ rules }: { rules: PolicyRule[] }) {
  const permits = new Set<string>();
  const forbids = new Set<string>();

  for (const rule of rules) {
    const principals = rule.principal === 'Any'
      ? MATRIX_PRINCIPALS
      : [rule.principal];
    const actions = rule.actions[0] === '*'
      ? MATRIX_ACTIONS
      : rule.actions;

    for (const p of principals) {
      for (const a of actions) {
        const key = `${p}:${a}`;
        if (rule.effect === 'permit') permits.add(key);
        else forbids.add(key);
      }
    }
  }

  const activePrincipals = MATRIX_PRINCIPALS.filter(p =>
    MATRIX_ACTIONS.some(a => permits.has(`${p}:${a}`) || forbids.has(`${p}:${a}`))
  );

  if (activePrincipals.length === 0) {
    return <p className="text-xs text-gray-600">No rules to display.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-[10px] w-full">
        <thead>
          <tr>
            <th className="text-left text-gray-600 pb-1.5 pr-2"></th>
            {MATRIX_ACTIONS.map(a => (
              <th key={a} className="text-gray-500 pb-1.5 px-2 text-center font-mono">{a}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {activePrincipals.map(p => (
            <tr key={p}>
              <td className="text-gray-400 pr-2 py-0.5 font-mono">{p}</td>
              {MATRIX_ACTIONS.map(a => {
                const key = `${p}:${a}`;
                const permitted = permits.has(key);
                const forbidden = forbids.has(key);
                return (
                  <td key={a} className="text-center py-0.5 px-1">
                    {permitted && !forbidden && <span className="text-green-500">✓</span>}
                    {forbidden && <span className="text-red-500">✗</span>}
                    {!permitted && !forbidden && <span className="text-gray-700">·</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
