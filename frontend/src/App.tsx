import { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import './App.css';

// ---------------------------------------------------------------------------
// Types (mirroring the backend Pydantic schemas)
// ---------------------------------------------------------------------------
interface VerificationChecks {
  code_executed: boolean;
  result_present: boolean;
  data_valid: boolean;
  reproducible: boolean;
  independent_check: boolean;
}

interface VerificationResult {
  status: 'PASS' | 'FAIL' | 'SKIP';
  generated_result?: number | string;
  verified_result?: number | string;
  difference?: number;
  checks: VerificationChecks;
  reason?: string;
}

interface ExecutionResult {
  status: 'success' | 'failed' | 'timeout' | 'unsafe';
  stdout: string;
  stderr: string;
  exit_code: number;
  execution_time_ms: number;
  result_value?: string;
  error?: string;
}

interface AttemptRecord {
  attempt_number: number;
  plan: {
    answerable: boolean;
    reason?: string;
    datasets: string[];
    operations: string[];
    required_columns: string[];
  };
  generated_code?: string;
  execution?: ExecutionResult;
  verification?: VerificationResult;
  replan_reason?: string;
}

interface ProofEvidence {
  columns: string[];
  filters: string[];
  datasets_used: string[];
}

interface ProofPackage {
  question: string;
  answer?: string;
  status: string;
  datasets_used: string[];
  calculation_code?: string;
  execution?: ExecutionResult;
  verification?: VerificationResult;
  evidence?: ProofEvidence;
  attempts: AttemptRecord[];
  refusal_reason?: string;
}

interface AnalysisResponse {
  status: 'VERIFIED' | 'UNANSWERABLE' | 'FAILED' | 'ERROR';
  answer?: string;
  reason?: string;
  proof?: ProofPackage;
  attempts: number;
  pipeline_events: string[];
}

interface DemoScenario {
  id: string;
  name: string;
  files: string[];
  suggested_question: string;
  category: string;
  expected: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const API_BASE = 'http://localhost:8000/api/v1';

const PIPELINE_STEPS = [
  { key: 'DATA_INSPECTION_COMPLETE', label: 'Data inspected', icon: '🔍' },
  { key: 'PLAN_CREATED', label: 'Analysis plan created', icon: '📋' },
  { key: 'CODE_GENERATED', label: 'Code generated', icon: '⚙️' },
  { key: 'CODE_SAFETY_PASSED', label: 'Code safety validated', icon: '🛡️' },
  { key: 'CODE_EXECUTED', label: 'Code executed', icon: '▶️' },
  { key: 'VERIFICATION_PASSED', label: 'Verification passed', icon: '✅' },
  { key: 'ANSWER_GENERATED', label: 'Answer generated', icon: '💡' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProofSection({
  title,
  icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="proof-section">
      <button className="proof-toggle" onClick={() => setOpen((v) => !v)} id={`toggle-${title.replace(/\s+/g, '-')}`}>
        <span>{icon} {title}</span>
        <span className={`toggle-arrow ${open ? 'open' : ''}`}>▼</span>
      </button>
      {open && <div className="proof-content">{children}</div>}
    </div>
  );
}

function VerificationDisplay({ ver }: { ver: VerificationResult }) {
  const checks = ver.checks;
  const items = [
    { label: 'Code executed', ok: checks.code_executed },
    { label: 'Result present', ok: checks.result_present },
    { label: 'Data valid', ok: checks.data_valid },
    { label: 'Reproducible', ok: checks.reproducible },
    { label: 'Independent check', ok: checks.independent_check },
  ];
  return (
    <div>
      <div className="verify-grid">
        {items.map((it) => (
          <div key={it.label} className={`verify-item ${it.ok ? 'pass' : 'fail'}`}>
            {it.ok ? '✓' : '✗'} {it.label}
          </div>
        ))}
      </div>
      {(ver.generated_result !== undefined || ver.verified_result !== undefined) && (
        <div className="verify-numbers">
          {ver.generated_result !== undefined && (
            <div className="verify-num-item">
              <span className="verify-num-label">Generated</span>
              <span className="verify-num-value">{String(ver.generated_result)}</span>
            </div>
          )}
          {ver.verified_result !== undefined && (
            <div className="verify-num-item">
              <span className="verify-num-label">Verified</span>
              <span className="verify-num-value">{String(ver.verified_result)}</span>
            </div>
          )}
          {ver.difference !== undefined && (
            <div className="verify-num-item">
              <span className="verify-num-label">Difference</span>
              <span className="verify-num-value">{ver.difference.toFixed(6)}</span>
            </div>
          )}
        </div>
      )}
      {ver.reason && (
        <p style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>{ver.reason}</p>
      )}
    </div>
  );
}

function AttemptDisplay({ attempts }: { attempts: AttemptRecord[] }) {
  return (
    <div>
      {attempts.map((a) => (
        <div key={a.attempt_number} className="attempt-record">
          <div className="attempt-header">Attempt #{a.attempt_number}</div>
          {a.plan && (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
              <strong>Plan:</strong> {a.plan.operations.join(' → ') || '(none)'}
            </p>
          )}
          {a.execution && (
            <p style={{ fontSize: 12, color: a.execution.status === 'success' ? 'var(--success)' : 'var(--danger)' }}>
              Execution: {a.execution.status} | {a.execution.execution_time_ms.toFixed(0)}ms
            </p>
          )}
          {a.verification && (
            <p style={{ fontSize: 12, color: a.verification.status === 'PASS' ? 'var(--success)' : 'var(--warn)' }}>
              Verification: {a.verification.status}
            </p>
          )}
          {a.replan_reason && (
            <p style={{ fontSize: 11, color: 'var(--warn)', marginTop: 4 }}>
              ⚠ Replan: {a.replan_reason}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function PipelineProgress({
  events,
  loading,
}: {
  events: string[];
  loading: boolean;
}) {
  const hasReplan = events.some((e) => e.startsWith('REPLAN'));

  return (
    <div className="card">
      <div className="card-label">⚡ Analysis Pipeline</div>
      <div className="pipeline">
        {PIPELINE_STEPS.map((step) => {
          const done = events.includes(step.key);
          const isVerifyFail =
            step.key === 'VERIFICATION_PASSED' &&
            events.includes('VERIFICATION_FAILED') &&
            !done;
          const cls = done ? 'done' : isVerifyFail ? 'warn' : 'idle';
          return (
            <div key={step.key} className={`pipeline-step ${cls}`}>
              <span className="step-icon">{done ? step.icon : isVerifyFail ? '⚠' : '○'}</span>
              <span>{step.label}</span>
            </div>
          );
        })}
        {hasReplan && !events.includes('VERIFICATION_PASSED') && (
          <div className="pipeline-step warn">
            <span className="step-icon">↻</span>
            <span>Re-planning analysis…</span>
          </div>
        )}
        {loading && (
          <div className="pipeline-step active">
            <span className="step-icon"><span className="spinner" /></span>
            <span>Analyzing…</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------
export default function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [question, setQuestion] = useState('');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('pcda_api_key') || '');
  const [showConfig, setShowConfig] = useState(false);
  const [demos, setDemos] = useState<DemoScenario[]>([]);
  const [loadingDemos, setLoadingDemos] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [dragover, setDragover] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load demo list
  useEffect(() => {
    axios.get<{ demos: DemoScenario[] }>(`${API_BASE}/demos`)
      .then((res) => setDemos(res.data.demos || []))
      .catch(() => {});
  }, []);

  const saveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('pcda_api_key', key);
  };

  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    const allowed = ['.csv', '.xlsx', '.xls', '.json', '.parquet'];
    const valid = Array.from(incoming).filter((f) =>
      allowed.some((ext) => f.name.toLowerCase().endsWith(ext))
    );
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...valid.filter((f) => !names.has(f.name))];
    });
  }, []);

  const removeFile = (name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragover(false);
    addFiles(e.dataTransfer.files);
  };

  const loadDemoScenario = async (demo: DemoScenario) => {
    setLoadingDemos(true);
    try {
      const loadedFiles: File[] = [];
      for (const fname of demo.files) {
        const res = await axios.get(`${API_BASE}/demos/${fname}`, { responseType: 'blob' });
        const file = new File([res.data], fname, { type: 'text/csv' });
        loadedFiles.push(file);
      }
      setFiles(loadedFiles);
      setQuestion(demo.suggested_question);
      setResult(null);
      setEvents([]);
    } catch (err) {
      console.error('Failed to load demo scenario', err);
    } finally {
      setLoadingDemos(false);
    }
  };

  const handleAnalyze = async () => {
    if (!question.trim() || files.length === 0) return;
    setLoading(true);
    setResult(null);
    setEvents([]);

    const fd = new FormData();
    fd.append('question', question.trim());
    if (apiKey.trim()) {
      fd.append('api_key', apiKey.trim());
    }
    files.forEach((f) => fd.append('files', f));

    try {
      const headers: Record<string, string> = { 'Content-Type': 'multipart/form-data' };
      if (apiKey.trim()) {
        headers['X-OpenAI-API-Key'] = apiKey.trim();
      }

      const res = await axios.post<AnalysisResponse>(`${API_BASE}/analyze`, fd, {
        headers,
        onUploadProgress: () => {
          setEvents(['DATA_INSPECTION_STARTED']);
        },
      });
      setResult(res.data);
      setEvents(res.data.pipeline_events || []);
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.detail || err.message
        : String(err);
      setResult({
        status: 'ERROR',
        answer: undefined,
        reason: msg,
        attempts: 0,
        pipeline_events: [],
      });
    } finally {
      setLoading(false);
    }
  };

  const canAnalyze = files.length > 0 && question.trim().length > 0 && !loading;

  return (
    <div className="app-layout">
      {/* Header */}
      <header className="app-header">
        <div className="header-badge">
          <span className="dot" />
          Proof-Carrying · HNX26PSI08
        </div>
        <h1>Data Analyst</h1>
        <p>
          Every answer is backed by executable code, real execution results,
          and independent verification. No guessing.
        </p>
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => setShowConfig((v) => !v)}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              fontSize: 12,
              padding: '4px 10px',
              borderRadius: 20,
              cursor: 'pointer',
            }}
          >
            ⚙️ {apiKey ? 'API Key Configured' : 'Configure OpenAI Key (Optional)'}
          </button>
        </div>
        {showConfig && (
          <div className="api-key-bar" style={{ maxWidth: 480, margin: '14px auto 0' }}>
            <input
              type="password"
              placeholder="sk-... (OpenAI Key, or leave empty for offline demo mode)"
              value={apiKey}
              onChange={(e) => saveApiKey(e.target.value)}
              className="api-key-input"
            />
            {apiKey && (
              <button
                onClick={() => saveApiKey('')}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                }}
              >
                Clear
              </button>
            )}
          </div>
        )}
      </header>

      {/* Demo Quick Start Scenarios */}
      {demos.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-label">🚀 Demo Scenarios & Trap Tests</div>
          <div className="demo-grid">
            {demos.map((d) => {
              const isTrap = d.category.includes('Refusal') || d.category.includes('Sources');
              return (
                <div
                  key={d.id}
                  className="demo-card"
                  onClick={() => loadDemoScenario(d)}
                  title="Click to load files and suggested question"
                >
                  <div className="demo-card-title">
                    <span>{d.name}</span>
                    <span className={`demo-card-badge ${isTrap ? 'trap' : ''}`}>{d.category}</span>
                  </div>
                  <div className="demo-card-desc">"{d.suggested_question}"</div>
                  <div className="demo-card-expected">Expected: {d.expected}</div>
                </div>
              );
            })}
          </div>
          {loadingDemos && (
            <p style={{ fontSize: 12, color: 'var(--accent-light)', marginTop: 8 }}>
              Loading scenario files…
            </p>
          )}
        </div>
      )}

      {/* Upload */}
      <div className="card">
        <div className="card-label">📁 Upload Datasets</div>
        <div
          className={`upload-zone ${dragover ? 'dragover' : ''}`}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
          onDragLeave={() => setDragover(false)}
          onClick={() => fileInputRef.current?.click()}
          id="upload-zone"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".csv,.xlsx,.xls,.json,.parquet"
            onChange={(e) => addFiles(e.target.files)}
            style={{ display: 'none' }}
            id="file-input"
          />
          <span className="upload-icon">📊</span>
          <p>
            <strong>Drop files here</strong> or click to browse<br />
            <span style={{ fontSize: 12 }}>CSV · Excel · JSON · Parquet</span>
          </p>
        </div>
        {files.length > 0 && (
          <div className="file-chips">
            {files.map((f) => (
              <span key={f.name} className="file-chip">
                📄 {f.name}
                <button onClick={(e) => { e.stopPropagation(); removeFile(f.name); }} title="Remove">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Question */}
      <div className="card">
        <div className="card-label">❓ Ask a Question</div>
        <textarea
          id="question-input"
          className="question-input"
          placeholder="e.g. Which product had the highest profit margin in Q2?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAnalyze();
          }}
        />
        <button
          id="analyze-btn"
          className="analyze-btn"
          onClick={handleAnalyze}
          disabled={!canAnalyze}
        >
          {loading ? (
            <>
              <span className="spinner" />
              Analyzing…
            </>
          ) : (
            '⚡ Analyze with Proof'
          )}
        </button>
      </div>

      {/* Pipeline progress */}
      {(loading || events.length > 0) && (
        <PipelineProgress events={events} loading={loading} />
      )}

      {/* Result */}
      {result && !loading && (
        <div className={`result-panel ${result.status.toLowerCase()}`} id="result-panel">
          <div className="result-status">
            <span className={`status-badge ${result.status.toLowerCase()}`}>
              {result.status === 'VERIFIED' && '🟢'}
              {result.status === 'UNANSWERABLE' && '🔴'}
              {result.status === 'FAILED' && '🟡'}
              {result.status === 'ERROR' && '⚪'}
              {' '}{result.status === 'UNANSWERABLE' ? 'CANNOT DETERMINE' : result.status}
            </span>
          </div>

          {result.status === 'VERIFIED' && result.answer && (
            <div className="result-answer" id="answer-text">{result.answer}</div>
          )}

          {(result.status === 'UNANSWERABLE' || result.status === 'FAILED' || result.status === 'ERROR') && (
            <>
              <div className="result-answer" style={{ fontSize: 16, color: 'var(--text-secondary)' }}>
                {result.status === 'UNANSWERABLE' ? 'Cannot Determine Answer' : 'Analysis Failed'}
              </div>
              <div className="result-reason">{result.reason}</div>
            </>
          )}

          {result.attempts > 0 && (
            <div className="attempt-badge">
              Completed in {result.attempts} attempt{result.attempts > 1 ? 's' : ''}
            </div>
          )}

          {/* Expandable proof sections */}
          {result.proof && (
            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>

              {result.proof.datasets_used?.length > 0 && (
                <ProofSection title="Datasets Used" icon="📁">
                  <div className="tag-list">
                    {result.proof.datasets_used.map((d) => (
                      <span key={d} className="tag">📄 {d}</span>
                    ))}
                  </div>
                </ProofSection>
              )}

              {result.proof.calculation_code && (
                <ProofSection title="Generated Code" icon="⚙️" defaultOpen={true}>
                  <pre className="code-block">{result.proof.calculation_code}</pre>
                </ProofSection>
              )}

              {result.proof.execution && (
                <ProofSection title="Execution Result" icon="▶️" defaultOpen={true}>
                  <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: 13 }}>
                    <span style={{ color: result.proof.execution.status === 'success' ? 'var(--success)' : 'var(--danger)' }}>
                      Status: {result.proof.execution.status}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {result.proof.execution.execution_time_ms.toFixed(0)}ms
                    </span>
                  </div>
                  {result.proof.execution.stdout && (
                    <pre className="code-block">stdout: {result.proof.execution.stdout}</pre>
                  )}
                  {result.proof.execution.stderr && (
                    <pre className="code-block" style={{ color: 'var(--danger)', marginTop: 8 }}>
                      stderr: {result.proof.execution.stderr}
                    </pre>
                  )}
                </ProofSection>
              )}

              {result.proof.verification && (
                <ProofSection title="Verification" icon="🛡️" defaultOpen={result.status === 'VERIFIED'}>
                  <VerificationDisplay ver={result.proof.verification} />
                </ProofSection>
              )}

              {result.proof.evidence && (
                <ProofSection title="Evidence" icon="🔎">
                  {result.proof.evidence.columns.length > 0 && (
                    <>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Columns used:</p>
                      <div className="tag-list">
                        {result.proof.evidence.columns.map((c) => (
                          <span key={c} className="tag">{c}</span>
                        ))}
                      </div>
                    </>
                  )}
                  {result.proof.evidence.filters.length > 0 && (
                    <>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '10px 0 6px' }}>Filters applied:</p>
                      <div className="tag-list">
                        {result.proof.evidence.filters.map((f) => (
                          <span key={f} className="tag">🔽 {f}</span>
                        ))}
                      </div>
                    </>
                  )}
                </ProofSection>
              )}

              {result.proof.attempts.length > 0 && (
                <ProofSection title={`Analysis Attempts (${result.proof.attempts.length})`} icon="📊">
                  <AttemptDisplay attempts={result.proof.attempts} />
                </ProofSection>
              )}

            </div>
          )}
        </div>
      )}
    </div>
  );
}
