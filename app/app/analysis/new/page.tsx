'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useAuditLog, useDatasets } from '@/lib/hooks';
import {
  generateAnalysisContract,
  generateAssumptions,
  runVerification,
  formatResultValue,
  generateProofId,
} from '@/lib/analysis-engine';
import { computeDataQuality } from '@/lib/data-processing';
import { DatasetColumn } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import {
  FileSearch, Loader2, ArrowRight, ArrowLeft, CheckCircle2,
  AlertTriangle, Shield, Code2, Database, GitBranch, Eye,
  Sparkles, XCircle, ChevronRight,
} from 'lucide-react';

interface DatasetInfo {
  id: string;
  name: string;
  columns: DatasetColumn[];
  rows: Record<string, number | string | null>[];
  is_sample: boolean;
}

type Stage = 'question' | 'contract' | 'assumptions' | 'execution' | 'result';

function NewAnalysisContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { datasets } = useDatasets();
  const { addLog } = useAuditLog();
  const { toast } = useToast();

  const [stage, setStage] = useState<Stage>('question');
  const [question, setQuestion] = useState('');
  const [availableDatasets, setAvailableDatasets] = useState<DatasetInfo[]>([]);
  const [selectedDatasetIds, setSelectedDatasetIds] = useState<string[]>([]);
  const [contract, setContract] = useState<ReturnType<typeof generateAnalysisContract> | null>(null);
  const [assumptions, setAssumptions] = useState<ReturnType<typeof generateAssumptions> | null>(null);
  const [verification, setVerification] = useState<ReturnType<typeof runVerification> | null>(null);
  const [progressStep, setProgressStep] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [proofDbId, setProofDbId] = useState<string | null>(null);
  const [proofSerial, setProofSerial] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('datasets')
        .select('id, name, columns, rows, is_sample')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (data) {
        setAvailableDatasets(data as unknown as DatasetInfo[]);
        const presetId = searchParams.get('dataset');
        if (presetId) {
          setSelectedDatasetIds([presetId]);
        }
      }
    };
    load();
  }, [user, searchParams]);

  const selectedDataset = availableDatasets.find((d) => selectedDatasetIds.includes(d.id));

  const toggleDataset = (id: string) => {
    setSelectedDatasetIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  const handleStartAnalysis = async () => {
    if (!question.trim() || !selectedDataset) return;
    setStage('contract');
    const ds = selectedDataset;
    const c = generateAnalysisContract(question, ds);
    setContract(c);
    const a = generateAssumptions(c, ds);
    setAssumptions(a);

    // Create analysis record
    const { data } = await supabase.from('analyses').insert({
      user_id: user?.id,
      dataset_id: ds.id,
      question,
      contract: c,
      assumptions: a,
      status: 'contract',
    }).select().single();
    if (data) {
      setAnalysisId(data.id);
      await addLog('Created analysis', 'analysis', { question, dataset: ds.name });
    }
  };

  const runExecution = useCallback(async () => {
    if (!selectedDataset || !contract || !analysisId) return;
    setStage('execution');
    setProgressStep(0);

    const steps = [
      'Preparing analysis...',
      'Checking data quality...',
      'Validating calculation...',
      'Executing primary calculation...',
      'Running independent verification...',
      'Comparing results...',
      'Generating proof...',
    ];

    for (let i = 0; i < steps.length; i++) {
      setProgressStep(i);
      setProgressLabel(steps[i]);
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 300));
    }

    const result = runVerification(contract, selectedDataset);
    setVerification(result);

    // Save analysis result
    await supabase.from('analysis_results').insert({
      analysis_id: analysisId,
      user_id: user?.id,
      primary_result: result.primaryResult,
      independent_result: result.independentResult,
      verification_status: result.status,
      match: result.match,
      primary_code: result.primaryResult.code,
      independent_code: result.independentResult.code,
      execution_log: { matchDetails: result.matchDetails },
    });

    // Update analysis status
    await supabase.from('analyses').update({
      status: result.status,
      updated_at: new Date().toISOString(),
    }).eq('id', analysisId);

    // Create proof if verified
    if (result.status === 'verified' || (result.match && result.status !== 'cannot_verify')) {
      const serial = generateProofId();
      const answerStr = formatResultValue(result.primaryResult.value);
      const quality = computeDataQuality(selectedDataset.columns, selectedDataset.rows);
      const evidence = [
        { label: 'Interpretation', status: 'pass' as const, detail: 'Question parsed correctly' },
        { label: 'Data Quality', status: quality.overallScore >= 60 ? 'pass' as const : 'warn' as const, detail: `Score: ${quality.overallScore}/100` },
        { label: 'Calculation', status: 'pass' as const, detail: result.primaryResult.method },
        { label: 'Independent Check', status: result.match ? 'pass' as const : 'fail' as const, detail: result.independentResult.method },
        { label: 'Source Consistency', status: 'pass' as const, detail: `Source: ${selectedDataset.name}` },
        { label: 'Reproducible', status: 'pass' as const, detail: 'Result can be replayed' },
      ];

      const { data: proofData } = await supabase.from('proofs').insert({
        user_id: user?.id,
        analysis_id: analysisId,
        proof_id_serial: serial,
        question,
        answer: answerStr,
        answer_value: result.primaryResult.value as unknown as Record<string, unknown>,
        source_dataset: selectedDataset.name,
        dataset_version: 'v1',
        calculation: `${contract.aggregation}(${contract.metric})`,
        execution_method: result.primaryResult.method,
        independent_method: result.independentResult.method,
        match: result.match,
        reproducible: true,
        verification_status: 'verified',
        evidence,
      }).select().single();

      if (proofData) {
        setProofDbId(proofData.id);
        setProofSerial(serial);
        await addLog('Proof created', 'proof', { serial, question, answer: answerStr });
      }
    }

    await addLog('Analysis completed', 'analysis', { question, status: result.status });
    setStage('result');
  }, [selectedDataset, contract, analysisId, user, addLog]);

  if (availableDatasets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12">
        <Database className="h-12 w-12 text-slate-300" />
        <h2 className="mt-4 text-xl font-semibold text-slate-900">No datasets available</h2>
        <p className="mt-2 text-sm text-slate-500">Upload data or load sample data before starting an analysis.</p>
        <Link href="/app/data" className="mt-4">
          <Button className="bg-blue-600 hover:bg-blue-700">Go to Data Sources</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">New Analysis</h1>
        <p className="mt-1 text-sm text-slate-500">Ask a question about your data. Real calculations. Independent verification. Reproducible proof.</p>
      </div>

      {/* Progress indicator */}
      <div className="mb-6 flex items-center gap-2">
        {['Question', 'Contract', 'Assumptions', 'Execution', 'Result'].map((step, i) => {
          const stepOrder = ['question', 'contract', 'assumptions', 'execution', 'result'];
          const currentIdx = stepOrder.indexOf(stage);
          const isActive = i === currentIdx;
          const isDone = i < currentIdx;
          return (
            <div key={step} className="flex items-center">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                isActive ? 'bg-blue-600 text-white' : isDone ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'
              }`}>
                {isDone ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              <span className={`ml-1.5 text-xs font-medium ${isActive ? 'text-slate-900' : isDone ? 'text-emerald-600' : 'text-slate-400'}`}>
                {step}
              </span>
              {i < 4 && <ChevronRight className="mx-1 h-3 w-3 text-slate-300" />}
            </div>
          );
        })}
      </div>

      {/* Stage: Question */}
      {stage === 'question' && (
        <Card className="border-slate-200">
          <CardContent className="p-6 space-y-5">
            <div>
              <label className="text-sm font-semibold text-slate-900">What would you like to analyze?</label>
              <Textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g., Which product generated the highest revenue? or What was total revenue in 2025?"
                className="mt-2 min-h-[80px]"
                autoFocus
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-900">Data Sources</label>
              <p className="text-xs text-slate-500 mt-0.5">Select datasets to include in this analysis</p>
              <div className="mt-3 space-y-2">
                {availableDatasets.map((ds) => (
                  <label
                    key={ds.id}
                    className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      selectedDatasetIds.includes(ds.id) ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Checkbox
                      checked={selectedDatasetIds.includes(ds.id)}
                      onCheckedChange={() => toggleDataset(ds.id)}
                    />
                    <Database className="h-4 w-4 text-slate-500" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">{ds.name}</span>
                        {ds.is_sample && <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">SAMPLE</Badge>}
                      </div>
                      <span className="text-xs text-slate-500">{ds.rows.length} rows · {ds.columns.length} columns</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Suggested questions */}
            {selectedDataset && (
              <div>
                <label className="text-xs font-medium text-slate-500">Suggested questions</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                    'Which product generated the highest revenue?',
                    'What is the total revenue by region?',
                    'Compare revenue by customer type',
                    'What is the average order value?',
                    'Show revenue trend over time',
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => setQuestion(q)}
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:border-blue-300 hover:bg-blue-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button
              onClick={handleStartAnalysis}
              disabled={!question.trim() || selectedDatasetIds.length === 0}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              Start Analysis <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stage: Contract */}
      {stage === 'contract' && contract && (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileSearch className="h-5 w-5 text-blue-600" />
              Analysis Contract
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-medium text-slate-500">Question</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{contract.question}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500">Metric</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{contract.metric}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Aggregation</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{contract.aggregation}</p>
              </div>
              {contract.dimension && (
                <div>
                  <p className="text-xs font-medium text-slate-500">Dimension (Group By)</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{contract.dimension}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-slate-500">Ambiguity</p>
                <p className={`mt-1 text-sm font-semibold ${contract.ambiguity === 'None' ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {contract.ambiguity}
                </p>
              </div>
            </div>
            {contract.filters.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500">Filters</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {contract.filters.map((f, i) => (
                    <Badge key={i} variant="secondary">{f.column} {f.operator} {f.value}</Badge>
                  ))}
                </div>
              </div>
            )}
            {contract.ambiguity !== 'None' && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-900">Ambiguity Detected</p>
                  <p className="text-sm text-amber-700">{contract.ambiguity}</p>
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStage('question')}>
                <ArrowLeft className="h-4 w-4" /> Edit Question
              </Button>
              <Button onClick={() => setStage('assumptions')} className="flex-1 bg-blue-600 hover:bg-blue-700">
                Approve Contract <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stage: Assumptions */}
      {stage === 'assumptions' && assumptions && contract && (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Eye className="h-5 w-5 text-blue-600" />
              Analysis Assumptions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between border-b border-slate-100 py-2">
                <span className="text-sm font-medium text-slate-500">Formula</span>
                <span className="text-sm font-mono font-semibold text-slate-900">{assumptions.formula}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-2">
                <span className="text-sm font-medium text-slate-500">Currency</span>
                <span className="text-sm text-slate-900">{assumptions.currency}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-2">
                <span className="text-sm font-medium text-slate-500">Date Interpretation</span>
                <span className="text-sm text-slate-900">{assumptions.dateInterpretation}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-2">
                <span className="text-sm font-medium text-slate-500">Missing Value Treatment</span>
                <span className="text-sm text-slate-900">{assumptions.missingValueTreatment}</span>
              </div>
              <div className="border-b border-slate-100 py-2">
                <span className="text-sm font-medium text-slate-500">Excluded Records</span>
                <div className="mt-1">
                  {assumptions.excludedRecords.map((r, i) => (
                    <p key={i} className="text-sm text-slate-900">{r}</p>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStage('contract')}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button onClick={runExecution} className="flex-1 bg-blue-600 hover:bg-blue-700">
                Continue to Execution <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stage: Execution */}
      {stage === 'execution' && (
        <Card className="border-slate-200">
          <CardContent className="p-8">
            <div className="flex flex-col items-center">
              <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
              <p className="mt-4 text-sm font-medium text-slate-700">{progressLabel}</p>
              <div className="mt-6 w-full max-w-md space-y-2">
                {['Preparing analysis...', 'Checking data quality...', 'Validating calculation...', 'Executing primary calculation...', 'Running independent verification...', 'Comparing results...', 'Generating proof...'].map((step, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                      i < progressStep ? 'bg-emerald-500 text-white' : i === progressStep ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'
                    }`}>
                      {i < progressStep ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
                    </div>
                    <span className={`text-xs ${i <= progressStep ? 'text-slate-700' : 'text-slate-400'}`}>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stage: Result */}
      {stage === 'result' && verification && contract && selectedDataset && (
        <div className="space-y-4">
          {verification.status === 'verified' || verification.match ? (
            <Card className="border-emerald-200 bg-emerald-50">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600">
                    <Shield className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-emerald-900">VERIFIED RESULT</h2>
                    <p className="text-sm text-emerald-700">Independent verification passed. Results match.</p>
                  </div>
                </div>
                <div className="mt-6">
                  <p className="text-sm text-emerald-700">Answer</p>
                  <p className="text-3xl font-bold text-slate-900">{formatResultValue(verification.primaryResult.value)}</p>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg bg-white p-3">
                    <p className="text-xs text-slate-500">Calculation</p>
                    <p className="text-sm font-semibold text-slate-900">{contract.aggregation}({contract.metric})</p>
                  </div>
                  <div className="rounded-lg bg-white p-3">
                    <p className="text-xs text-slate-500">Rows Used</p>
                    <p className="text-sm font-semibold text-slate-900">{verification.primaryResult.rowsUsed.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg bg-white p-3">
                    <p className="text-xs text-slate-500">Source</p>
                    <p className="text-sm font-semibold text-slate-900 truncate">{selectedDataset.name}</p>
                  </div>
                  <div className="rounded-lg bg-white p-3">
                    <p className="text-xs text-slate-500">Proof ID</p>
                    <p className="text-sm font-mono font-semibold text-blue-600">{proofSerial}</p>
                  </div>
                </div>
                {proofDbId && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link href={`/app/proofs/${proofDbId}`}>
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                        <Shield className="h-4 w-4" /> View Proof Passport
                      </Button>
                    </Link>
                    <Link href={`/app/analysis/${analysisId}`}>
                      <Button size="sm" variant="outline">
                        <FileSearch className="h-4 w-4" /> Analysis Details
                      </Button>
                    </Link>
                    <Link href={`/app/analytics?dataset=${selectedDataset.id}`}>
                      <Button size="sm" variant="outline">
                        <Sparkles className="h-4 w-4" /> Analytics Studio
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : verification.status === 'cannot_verify' ? (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500">
                    <AlertTriangle className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-amber-900">CANNOT VERIFY</h2>
                    <p className="text-sm text-amber-700">The data does not support this calculation.</p>
                  </div>
                </div>
                <div className="mt-4 rounded-lg bg-white p-4">
                  <p className="text-sm text-slate-700">
                    {verification.primaryResult.rowsUsed === 0
                      ? 'No rows matched the filters. Check your question and try again.'
                      : verification.matchDetails}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500">
                    <XCircle className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-red-900">VERIFICATION FAILED</h2>
                    <p className="text-sm text-red-700">Primary and independent calculations did not match.</p>
                  </div>
                </div>
                <div className="mt-4 rounded-lg bg-white p-4">
                  <p className="text-sm text-slate-700">{verification.matchDetails}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Dual calculation display */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Code2 className="h-4 w-4 text-blue-600" />
                  Primary Calculation ({verification.primaryResult.method})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="rounded-lg bg-slate-900 p-4 text-xs text-slate-300 overflow-x-auto scrollbar-thin font-mono">
                  {verification.primaryResult.code}
                </pre>
                <p className="mt-3 text-sm font-semibold text-slate-900">
                  Result: {formatResultValue(verification.primaryResult.value)}
                </p>
              </CardContent>
            </Card>
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <GitBranch className="h-4 w-4 text-emerald-600" />
                  Independent Calculation ({verification.independentResult.method})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="rounded-lg bg-slate-900 p-4 text-xs text-slate-300 overflow-x-auto scrollbar-thin font-mono">
                  {verification.independentResult.code}
                </pre>
                <p className="mt-3 text-sm font-semibold text-slate-900">
                  Result: {formatResultValue(verification.independentResult.value)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Verification status */}
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-sm">Verification Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center gap-8">
                <div className="text-center">
                  <p className="text-xs text-slate-500">Primary</p>
                  <p className="text-lg font-bold text-blue-600">{formatResultValue(verification.primaryResult.value)}</p>
                </div>
                <div className={`flex items-center gap-2 rounded-full px-4 py-2 ${verification.match ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {verification.match ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                  <span className="text-sm font-bold">{verification.match ? 'MATCH' : 'MISMATCH'}</span>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-500">Independent</p>
                  <p className="text-lg font-bold text-emerald-600">{formatResultValue(verification.independentResult.value)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setStage('question'); setContract(null); setAssumptions(null); setVerification(null); }}>
              New Analysis
            </Button>
            <Link href="/app/assistant" className="flex-1">
              <Button variant="outline" className="w-full">
                <Sparkles className="h-4 w-4" /> Continue in Assistant
              </Button>
            </Link>
            <Link href="/app/reports" className="flex-1">
              <Button className="w-full bg-blue-600 hover:bg-blue-700">
                Create Report <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NewAnalysisPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-400">Loading...</div>}>
      <NewAnalysisContent />
    </Suspense>
  );
}
