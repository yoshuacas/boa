'use client';

import { useState, useEffect, useRef } from 'react';
import { RefreshCw, Play } from 'lucide-react';

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
  if (msg.includes('START') || msg.includes('END') || msg.includes('REPORT')) return 'text-gray-500';
  return 'text-green-300';
}

export function FunctionViewer({ functionName }: { functionName: string }) {
  const [fnConfig, setFnConfig] = useState<FnConfig | null>(null);
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [invokePayload, setInvokePayload] = useState('{"httpMethod":"GET","path":"/","headers":{}}');
  const [invokeResult, setInvokeResult] = useState<InvokeResult | null>(null);
  const [invoking, setInvoking] = useState(false);
  const [tab, setTab] = useState<'logs' | 'config' | 'invoke'>('logs');
  const [sinceMinutes, setSinceMinutes] = useState(30);
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
      const startTime = Date.now() - sinceMinutes * 60 * 1000;
      const res = await fetch('/api/lambda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logs', functionName, startTime }),
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
  useEffect(() => { if (tab === 'logs') loadLogs(); }, [tab, sinceMinutes, functionName]);
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#2a2a2f]">
        {(['logs', 'config', 'invoke'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-sm capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-white text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
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
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Last</span>
              <select
                value={sinceMinutes}
                onChange={e => setSinceMinutes(Number(e.target.value))}
                className="text-xs bg-[#1c1c21] border border-[#2a2a2f] text-gray-300 rounded px-2 py-1 focus:outline-none"
              >
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={60}>1 hour</option>
                <option value={360}>6 hours</option>
                <option value={1440}>24 hours</option>
              </select>
            </div>
            <button
              onClick={loadLogs}
              disabled={loadingLogs}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              <RefreshCw size={12} className={loadingLogs ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          <div className="bg-[#0a0a0d] border border-[#2a2a2f] rounded-lg p-4 h-96 overflow-auto font-mono text-xs">
            {loadingLogs && logs.length === 0 && (
              <div className="text-gray-600">Loading logs...</div>
            )}
            {!loadingLogs && logs.length === 0 && (
              <div className="text-gray-600">No log events in the selected time range.</div>
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

          <p className="text-xs text-gray-600">{logs.length} events</p>
        </div>
      )}

      {/* Config tab */}
      {tab === 'config' && (
        <div>
          {loadingConfig ? (
            <div className="text-sm text-gray-500">Loading...</div>
          ) : fnConfig ? (
            <div className="space-y-4">
              <div className="bg-[#1c1c21] border border-[#2a2a2f] rounded-lg overflow-hidden">
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
                      <tr key={label} className={i < arr.length - 1 ? 'border-b border-[#2a2a2f]' : ''}>
                        <td className="px-4 py-2.5 text-xs text-gray-500 w-36">{label}</td>
                        <td className="px-4 py-2.5 text-gray-300 font-mono text-xs">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {Object.keys(fnConfig.environment).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-2">
                    Environment Variables
                  </p>
                  <div className="bg-[#1c1c21] border border-[#2a2a2f] rounded-lg overflow-hidden">
                    <table className="w-full text-xs font-mono">
                      <tbody>
                        {Object.entries(fnConfig.environment).map(([k, v], i, arr) => (
                          <tr key={k} className={i < arr.length - 1 ? 'border-b border-[#2a2a2f]' : ''}>
                            <td className="px-4 py-2 text-gray-400 w-64">{k}</td>
                            <td className="px-4 py-2 text-gray-600 truncate max-w-xs">{v}</td>
                          </tr>
                        ))}
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
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-2">Payload (JSON)</p>
            <textarea
              value={invokePayload}
              onChange={e => setInvokePayload(e.target.value)}
              rows={6}
              className="w-full bg-[#1c1c21] border border-[#2a2a2f] text-gray-300 rounded-lg p-3 font-mono text-xs focus:outline-none focus:border-gray-500 resize-none"
            />
          </div>
          <button
            onClick={handleInvoke}
            disabled={invoking}
            className="flex items-center gap-2 text-sm bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded px-3 py-1.5 transition-colors"
          >
            <Play size={13} />
            {invoking ? 'Invoking...' : 'Invoke'}
          </button>

          {invokeResult && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Status:</span>
                <span className={`text-xs font-mono ${invokeResult.functionError ? 'text-red-400' : 'text-green-400'}`}>
                  {invokeResult.statusCode}
                  {invokeResult.functionError && ` · ${invokeResult.functionError}`}
                </span>
              </div>
              <pre className="bg-[#0a0a0d] border border-[#2a2a2f] rounded-lg p-4 text-xs text-gray-300 font-mono overflow-auto max-h-64">
                {JSON.stringify(invokeResult.payload, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
