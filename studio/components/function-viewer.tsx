'use client';

import { useState, useEffect, useRef } from 'react';
import { RefreshCw, Play, Eye, EyeOff } from 'lucide-react';
import { TimeRangePicker, toStartTime, toEndTime, type TimeRange } from './time-range-picker';

type FnConfig = {
  functionName: string;
  runtime: string;
  handler: string;
  memorySize: number;
  timeout: number;
  lastModified: string;
  codeSize: number;
  description: string;
  environment: Record<string, string>;
};

type LogEvent = {
  timestamp: number;
  message: string;
  logStreamName: string;
};

type InvokeResult = {
  statusCode: number;
  functionError?: string;
  payload: unknown;
};

function formatBytes(bytes: number) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function logColor(msg: string) {
  if (msg.includes('ERROR')) return 'text-red-400';
  if (msg.includes('WARN')) return 'text-yellow-400';
  if (msg.includes('START') || msg.includes('END') || msg.includes('REPORT')) return 'text-[var(--tx-3)]';
  return 'text-green-300';
}

export function FunctionViewer({ functionName, initialTab = 'logs', tabs }: { functionName: string; initialTab?: 'logs' | 'config' | 'invoke'; tabs?: ('logs' | 'config' | 'invoke')[] }) {
  const [fnConfig, setFnConfig] = useState<FnConfig | null>(null);
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [invokePayload, setInvokePayload] = useState('{"httpMethod":"GET","path":"/","headers":{}}');
  const [invokeResult, setInvokeResult] = useState<InvokeResult | null>(null);
  const [invoking, setInvoking] = useState(false);
  const [tab, setTab] = useState<'logs' | 'config' | 'invoke'>(initialTab);
  const [revealedEnvVars, setRevealedEnvVars] = useState<Set<string>>(new Set());
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>({ type: 'relative', minutes: 30 });
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  async function loadConfig() {
    setLoadingConfig(true);
    try {
      const res = await fetch('/api/lambda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'config', functionName }),
      });
      setFnConfig(await res.json());
    } finally {
      setLoadingConfig(false);
    }
  }

  async function loadLogs() {
    setLoadingLogs(true);
    try {
      const res = await fetch('/api/lambda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logs', functionName, startTime: toStartTime(timeRange), endTime: toEndTime(timeRange) }),
      });
      const data = await res.json();
      setLogs(data.events || []);
    } finally {
      setLoadingLogs(false);
    }
  }

  async function handleInvoke() {
    setInvoking(true);
    try {
      let payload;
      try { payload = JSON.parse(invokePayload); } catch { payload = invokePayload; }
      const res = await fetch('/api/lambda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'invoke', functionName, payload }),
      });
      setInvokeResult(await res.json());
    } finally {
      setInvoking(false);
    }
  }

  useEffect(() => { loadConfig(); }, [functionName]);
  useEffect(() => { if (tab === 'logs') loadLogs(); }, [tab, timeRange, functionName]);

  useEffect(() => {
    if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    if (autoRefresh && tab === 'logs') {
      autoRefreshRef.current = setInterval(loadLogs, 30_000);
    }
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [autoRefresh, tab, timeRange, functionName]);
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--bd)]">
        {(tabs ?? (['logs', 'config', 'invoke'] as const)).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-sm capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-white text-[var(--tx-1)]'
                : 'border-transparent text-[var(--tx-3)] hover:text-[var(--tx-2)]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Logs tab */}
      {tab === 'logs' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <TimeRangePicker value={timeRange} onChange={setTimeRange} />
            <div className="flex items-center gap-3">
              <button
                onClick={() => setAutoRefresh(v => !v)}
                className={`flex items-center gap-1.5 text-xs transition-colors ${autoRefresh ? 'text-[var(--orange)]' : 'text-[var(--tx-3)] hover:text-[var(--tx-2)]'}`}
              >
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-[var(--orange)] animate-pulse' : 'bg-[var(--tx-3)]'}`} />
                {autoRefresh ? 'Live' : 'Auto-refresh'}
              </button>
              <button
                onClick={loadLogs}
                disabled={loadingLogs}
                className="flex items-center gap-1.5 text-xs text-[var(--tx-3)] hover:text-[var(--tx-2)] transition-colors"
              >
                <RefreshCw size={12} className={loadingLogs ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </div>

          <div className="bg-[var(--bg-subtle)] border border-[var(--bd)] rounded-lg p-4 h-96 overflow-auto font-mono text-xs">
            {loadingLogs && logs.length === 0 && (
              <div className="text-[var(--tx-3)]">Loading logs...</div>
            )}
            {!loadingLogs && logs.length === 0 && (
              <div className="text-[var(--tx-3)]">No log events in the selected time range.</div>
            )}
            {logs.map((e, i) => (
              <div key={i} className="flex gap-3 leading-5">
                <span className="text-gray-700 shrink-0">
                  {new Date(e.timestamp).toLocaleTimeString()}
                </span>
                <span className={logColor(e.message ?? '')}>{e.message}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>

          <p className="text-xs text-[var(--tx-3)]">{logs.length} events</p>
        </div>
      )}

      {/* Config tab */}
      {tab === 'config' && (
        <div>
          {loadingConfig ? (
            <div className="text-sm text-[var(--tx-3)]">Loading...</div>
          ) : fnConfig ? (
            <div className="space-y-4">
              <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {[
                      ['Runtime', fnConfig.runtime],
                      ['Handler', fnConfig.handler],
                      ['Memory', `${fnConfig.memorySize} MB`],
                      ['Timeout', `${fnConfig.timeout}s`],
                      ['Code size', formatBytes(fnConfig.codeSize)],
                      ['Last modified', fnConfig.lastModified],
                      ['Description', fnConfig.description || '—'],
                    ].map(([label, value], i, arr) => (
                      <tr key={label} className={i < arr.length - 1 ? 'border-b border-[var(--bd)]' : ''}>
                        <td className="px-4 py-2.5 text-xs text-[var(--tx-3)] w-36">{label}</td>
                        <td className="px-4 py-2.5 text-[var(--tx-2)] font-mono text-xs">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {Object.keys(fnConfig.environment).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[var(--tx-3)] uppercase tracking-widest mb-2">
                    Environment Variables
                  </p>
                  <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-lg overflow-hidden">
                    <table className="w-full text-xs font-mono">
                      <tbody>
                        {Object.entries(fnConfig.environment).map(([k, v], i, arr) => {
                          const revealed = revealedEnvVars.has(k);
                          return (
                            <tr key={k} className={i < arr.length - 1 ? 'border-b border-[var(--bd)]' : ''}>
                              <td className="px-4 py-2 text-[var(--tx-2)] w-64">{k}</td>
                              <td className="px-4 py-2 text-[var(--tx-3)] max-w-xs">
                                <div className="flex items-center gap-2">
                                  <span className="truncate">{revealed ? v : '••••••••'}</span>
                                  <button
                                    onClick={() => setRevealedEnvVars(prev => {
                                      const next = new Set(prev);
                                      revealed ? next.delete(k) : next.add(k);
                                      return next;
                                    })}
                                    className="shrink-0 text-[var(--tx-3)] hover:text-[var(--tx-2)] transition-colors"
                                  >
                                    {revealed ? <EyeOff size={12} /> : <Eye size={12} />}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-red-400">Failed to load function config.</div>
          )}
        </div>
      )}

      {/* Invoke tab */}
      {tab === 'invoke' && (
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold text-[var(--tx-3)] uppercase tracking-widest mb-2">Payload (JSON)</p>
            <textarea
              value={invokePayload}
              onChange={e => setInvokePayload(e.target.value)}
              rows={6}
              className="w-full bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-2)] rounded-lg p-3 font-mono text-xs focus:outline-none focus:border-[var(--orange)] resize-none"
            />
          </div>
          <button
            onClick={handleInvoke}
            disabled={invoking}
            className="flex items-center gap-2 text-sm bg-[var(--orange)] hover:opacity-90 disabled:opacity-50 text-[var(--orange-fg)] rounded px-3 py-1.5 transition-opacity"
          >
            <Play size={13} />
            {invoking ? 'Invoking...' : 'Invoke'}
          </button>

          {invokeResult && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--tx-3)]">Status:</span>
                <span className={`text-xs font-mono ${invokeResult.functionError ? 'text-red-400' : 'text-green-400'}`}>
                  {invokeResult.statusCode}
                  {invokeResult.functionError && ` · ${invokeResult.functionError}`}
                </span>
              </div>
              <pre className="bg-[var(--bg-subtle)] border border-[var(--bd)] rounded-lg p-4 text-xs text-[var(--tx-2)] font-mono overflow-auto max-h-64">
                {JSON.stringify(invokeResult.payload, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
