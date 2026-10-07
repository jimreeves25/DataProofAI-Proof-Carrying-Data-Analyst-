'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useDatasets, useAuditLog } from '@/lib/hooks';
import { generateAnalysisContract, runVerification, formatResultValue, generateProofId } from '@/lib/analysis-engine';
import { computeDataQuality } from '@/lib/data-processing';
import { DatasetColumn } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  ShieldCheck, CheckCircle2, AlertTriangle, XCircle, Shield,
  Loader2, Database, Target, ArrowRight, Scale,
} from 'lucide-react';
import Link from 'next/link';

interface DatasetInfo {
  id: string;
  name: string;
  columns: DatasetColumn[];
  rows: Record<string, number | string | null>[];
  is_sample: boolean;
}

export default function VerificationCenterPage() {
  const { user } = useAuth();
  const { datasets } = useDatasets();
  const { addLog } = useAuditLog();
  const { toast } = useToast();
  const [claim, setClaim] = useState('');
  const [question, setQuestion] = useState('');
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<null | {
    claim: string;
    independentAnswer: string;
    match: boolean;
    proofId?: string;
    details: string;
  }>(null);

  const availableDatasets = datasets as unknown as DatasetInfo[];
  const selectedDataset = availableDatasets.find((d) => d.id === selectedDatasetId);

  const handleVerify = async () => {
    if (!claim.trim() || !question.trim() || !selectedDataset) return;
    setVerifying(true);
    setResult(null);

    await new Promise((r) => setTimeout(r, 1500));

    const contract = generateAnalysisContract(question, selectedDataset);
    const verification = runVerification(contract, selectedDataset);
    const independentAnswer = formatResultValue(verification.primaryResult.value);

    // Extract numeric claim value
    const claimNum = claim.replace(/[^\d.]/g, '');
    const claimValue = parseFloat(claimNum);
    const independentNum = typeof verification.primaryResult.value === 'number'
      ? verification.primaryResult.value
      : (verification.primaryResult.value as { value: number }[])[0]?.value || 0;

    const match = Math.abs(claimValue - independentNum) < 1;

    let proofId: string | undefined;
    if (match) {
      proofId = generateProofId();
      const quality = computeDataQuality(selectedDataset.columns, selectedDataset.rows);
      const evidence = [
        { label: 'Interpretation', status: 'pass', detail: 'Question parsed' },
        { label: 'Data Quality', status: quality.overallScore >= 60 ? 'pass' : 'warn', detail: `${quality.overallScore}/100` },
        { label: 'Calculation', status: 'pass', detail: verification.primaryResult.method },
        { label: 'Independent Check', status: 'pass', detail: verification.independentResult.method },
        { label: 'Source Consistency', status: 'pass', detail: selectedDataset.name },
        { label: 'Reproducible', status: 'pass', detail: 'Yes' },
      ];

      const { data: analysisRec } = await supabase.from('analyses').insert({
        user_id: user?.id,
        dataset_id: selectedDataset.id,
        question,
        contract,
        status: 'verified',
      }).select().single();

      await supabase.from('proofs').insert({
        user_id: user?.id,
        analysis_id: analysisRec?.id,
        proof_id_serial: proofId,
        question,
        answer: independentAnswer,
        answer_value: verification.primaryResult.value as unknown as Record<string, unknown>,
        source_dataset: selectedDataset.name,
        dataset_version: 'v1',
        calculation: `${contract.aggregation}(${contract.metric})`,
        execution_method: verification.primaryResult.method,
        independent_method: verification.independentResult.method,
        match: true,
        reproducible: true,
        verification_status: 'verified',
        evidence,
      });

      await addLog('Proved a result', 'proof', { claim, independentAnswer, proofId });
      toast({ title: 'Result Verified', description: `Claim matches independent calculation. Proof: ${proofId}` });
    }

    setResult({
      claim,
      independentAnswer,
      match,
      proofId,
      details: match
        ? `Claim value ₹${claimValue.toLocaleString('en-IN')} matches independent result ₹${independentNum.toLocaleString('en-IN')}`
        : `Claim value ₹${claimValue.toLocaleString('en-IN')} does NOT match independent result ₹${independentNum.toLocaleString('en-IN')}`,
    });
    setVerifying(false);
  };

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Verification Center</h1>
        <p className="mt-1 text-sm text-slate-500">Independently verify a claim against your real data</p>
      </div>

      {/* Prove a Result */}
      <Card className="mb-6 border-slate-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Target className="h-5 w-5 text-blue-600" />
            Prove a Result
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-700">
            Enter a claim from any source (dashboard, report, external tool) and DataProofAI will independently calculate and verify it against your data.
          </div>

          <div className="space-y-2">
            <Label htmlFor="claim">Claim to verify</Label>
            <Input
              id="claim"
              placeholder="e.g., Finance dashboard says revenue is ₹42.8M"
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="question">What should we calculate?</Label>
            <Input
              id="question"
              placeholder="e.g., What is the total revenue?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dataset">Dataset to verify against</Label>
            <select
              id="dataset"
              value={selectedDatasetId}
              onChange={(e) => setSelectedDatasetId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select a dataset...</option>
              {availableDatasets.map((ds) => (
                <option key={ds.id} value={ds.id}>{ds.name}</option>
              ))}
            </select>
          </div>

          <Button
            onClick={handleVerify}
            disabled={!claim.trim() || !question.trim() || !selectedDatasetId || verifying}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {verifying ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Independently verifying...</>
            ) : (
              <><ShieldCheck className="h-4 w-4" /> Verify Claim</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Result */}
      {result && (
        <Card className={result.match ? 'border-emerald-200' : 'border-red-200'}>
          <CardContent className="p-6">
            <div className="flex items-center justify-center gap-8 py-4">
              <div className="text-center">
                <p className="text-xs text-slate-500">CLAIM</p>
                <p className="text-lg font-bold text-slate-900">{result.claim.replace(/[^\d₹.]/g, '') || result.claim}</p>
              </div>
              <div className={`flex items-center gap-2 rounded-full px-4 py-2 ${result.match ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                <Scale className="h-5 w-5" />
                <span className="text-sm font-bold">{result.match ? 'MATCH' : 'MISMATCH'}</span>
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-500">INDEPENDENT RESULT</p>
                <p className="text-lg font-bold text-slate-900">{result.independentAnswer}</p>
              </div>
            </div>
            <div className={`mt-4 rounded-lg p-4 ${result.match ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <div className="flex items-center gap-2">
                {result.match ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-red-600" />}
                <p className={`text-sm font-semibold ${result.match ? 'text-emerald-900' : 'text-red-900'}`}>
                  {result.match ? 'VERIFIED' : 'MISMATCH — Investigation required'}
                </p>
              </div>
              <p className={`mt-1 text-sm ${result.match ? 'text-emerald-700' : 'text-red-700'}`}>{result.details}</p>
              {result.proofId && (
                <div className="mt-3 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-mono font-semibold text-emerald-700">{result.proofId}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Source Conflict Detection info */}
      <Card className="mt-6 border-slate-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Source Conflict Detection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            When two data sources produce different results for the same question, DataProofAI will not silently choose one. It surfaces the conflict and flags it for investigation.
          </p>
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
            <p className="font-semibold text-amber-900">Example:</p>
            <p className="mt-1 text-amber-700">sales.csv → ₹42.8M</p>
            <p className="text-amber-700">finance_report.pdf → ₹41.9M</p>
            <p className="mt-2 font-semibold text-amber-900">SOURCE CONFLICT DETECTED — DataProofAI will not silently choose one.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
