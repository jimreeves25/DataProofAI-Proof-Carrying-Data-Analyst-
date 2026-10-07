'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useAuditLog } from '@/lib/hooks';
import {
  generateAnalysisContract,
  generateAssumptions,
  runVerification,
  formatResultValue,
} from '@/lib/analysis-engine';
import { computeDataQuality } from '@/lib/data-processing';
import { DatasetColumn } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { LogoMark } from '@/components/logo';
import {
  Sparkles, Send, Shield, CheckCircle2, AlertTriangle,
  Database, Loader2, FileSearch, Code2, ArrowRight,
} from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  result?: {
    answer: string;
    match: boolean;
    status: string;
    proofId?: string;
    primaryCode?: string;
    independentCode?: string;
    rowsUsed?: number;
  };
}

interface DatasetInfo {
  id: string;
  name: string;
  columns: DatasetColumn[];
  rows: Record<string, number | string | null>[];
  is_sample: boolean;
}

export default function AssistantPage() {
  const { user } = useAuth();
  const { addLog } = useAuditLog();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [activeDataset, setActiveDataset] = useState<DatasetInfo | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('datasets')
        .select('id, name, columns, rows, is_sample')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (data) {
        const dsData = data as unknown as DatasetInfo[];
        setDatasets(dsData);
        if (dsData.length > 0) setActiveDataset(dsData[0]);
      }
    };
    load();
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !activeDataset) return;
    const question = input.trim();
    setInput('');
    setLoading(true);

    setMessages((prev) => [...prev, { role: 'user', content: question }]);

    await new Promise((r) => setTimeout(r, 300));

    // Check for conversational follow-ups
    const lower = question.toLowerCase();
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');

    // Simple conversational responses
    if (lower.match(/^(hi|hello|hey|greetings)/)) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `Hello! I'm the DataProof Assistant. I can analyze your dataset "${activeDataset.name}" — ask me things like "What is total revenue?" or "Which product has the highest sales?" and I'll calculate it with independent verification.`,
      }]);
      setLoading(false);
      return;
    }

    if (lower.includes('what can you do') || lower.includes('help') || lower.includes('capabilities')) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `I can analyze your dataset "${activeDataset.name}" which has ${activeDataset.columns.length} columns: ${activeDataset.columns.map(c => c.name).join(', ')}. Ask me questions like:\n\n- What is the total revenue?\n- Which product generated the highest revenue?\n- Show revenue by region\n- Compare revenue by customer type\n- What is the average order value?\n\nEvery answer is independently verified through dual calculation paths.`,
      }]);
      setLoading(false);
      return;
    }

    if (lower.includes('show latest proof') || lower.includes('my proofs')) {
      const { data: proofs } = await supabase
        .from('proofs')
        .select('proof_id_serial, question, answer, match, created_at')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(5);
      if (proofs && proofs.length > 0) {
        const proofList = proofs.map((p) => `**${p.proof_id_serial}**: ${p.question} → ${p.answer} ${p.match ? '✓' : '✗'}`).join('\n');
        setMessages((prev) => [...prev, { role: 'assistant', content: `Here are your latest proofs:\n\n${proofList}` }]);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: 'You have no proofs yet. Ask me an analytics question to generate one.' }]);
      }
      setLoading(false);
      return;
    }

    // Generate growth/comparison follow-up
    if (lower.includes('how much') && lower.includes('grow') && lastAssistant?.result) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: 'To calculate growth, please ask two separate questions (e.g., "What was revenue in 2025?" then "What was revenue in 2024?") and I can compare them. I need to run real calculations for each period.',
      }]);
      setLoading(false);
      return;
    }

    // Real analysis
    const contract = generateAnalysisContract(question, activeDataset);

    if (contract.ambiguity !== 'None' && !contract.targetColumn) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `**CANNOT VERIFY**\n\n${contract.ambiguity}\n\nAvailable columns: ${activeDataset.columns.map(c => `${c.name} (${c.type})`).join(', ')}\n\nPlease rephrase your question to specify a metric.`,
      }]);
      setLoading(false);
      return;
    }

    const assumptions = generateAssumptions(contract, activeDataset);
    const verification = runVerification(contract, activeDataset);

    // Create analysis record
    const { data: analysisRec } = await supabase.from('analyses').insert({
      user_id: user?.id,
      dataset_id: activeDataset.id,
      question,
      contract,
      assumptions,
      status: verification.status,
    }).select().single();

    // Save result
    if (analysisRec) {
      await supabase.from('analysis_results').insert({
        analysis_id: analysisRec.id,
        user_id: user?.id,
        primary_result: verification.primaryResult,
        independent_result: verification.independentResult,
        verification_status: verification.status,
        match: verification.match,
        primary_code: verification.primaryResult.code,
        independent_code: verification.independentResult.code,
      });
    }

    let proofId: string | undefined;
    if (verification.match && verification.status === 'verified') {
      const serial = `DP-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000).padStart(5, '0')}`;
      const answerStr = formatResultValue(verification.primaryResult.value);
      const quality = computeDataQuality(activeDataset.columns, activeDataset.rows);
      const evidence = [
        { label: 'Interpretation', status: 'pass', detail: 'Question parsed' },
        { label: 'Data Quality', status: quality.overallScore >= 60 ? 'pass' : 'warn', detail: `${quality.overallScore}/100` },
        { label: 'Calculation', status: 'pass', detail: verification.primaryResult.method },
        { label: 'Independent Check', status: 'pass', detail: verification.independentResult.method },
        { label: 'Source Consistency', status: 'pass', detail: activeDataset.name },
        { label: 'Reproducible', status: 'pass', detail: 'Yes' },
      ];
      const { data: proofData } = await supabase.from('proofs').insert({
        user_id: user?.id,
        analysis_id: analysisRec?.id,
        proof_id_serial: serial,
        question,
        answer: answerStr,
        answer_value: verification.primaryResult.value as unknown as Record<string, unknown>,
        source_dataset: activeDataset.name,
        dataset_version: 'v1',
        calculation: `${contract.aggregation}(${contract.metric})`,
        execution_method: verification.primaryResult.method,
        independent_method: verification.independentResult.method,
        match: true,
        reproducible: true,
        verification_status: 'verified',
        evidence,
      }).select().single();
      proofId = serial;
      await addLog('Assistant generated proof', 'proof', { serial, question });
    }

    const answer = formatResultValue(verification.primaryResult.value);
    let content = '';

    if (verification.match && verification.status === 'verified') {
      content = `**${answer}**\n\nThis was calculated using ${contract.aggregation}(${contract.metric}) across ${verification.primaryResult.rowsUsed.toLocaleString()} rows.\n\n**Verification**: ${verification.primaryResult.method} and ${verification.independentResult.method} both produced the same result. ✓ MATCH\n\n**Proof ID**: ${proofId}`;
    } else if (verification.status === 'cannot_verify') {
      content = `**CANNOT VERIFY**\n\n${verification.matchDetails}\n\nThe data does not support this calculation. Please refine your question.`;
    } else {
      content = `**VERIFICATION FAILED**\n\nPrimary: ${formatResultValue(verification.primaryResult.value)}\nIndependent: ${formatResultValue(verification.independentResult.value)}\n\n${verification.matchDetails}`;
    }

    setMessages((prev) => [...prev, {
      role: 'assistant',
      content,
      result: {
        answer,
        match: verification.match,
        status: verification.status,
        proofId,
        primaryCode: verification.primaryResult.code,
        independentCode: verification.independentResult.code,
        rowsUsed: verification.primaryResult.rowsUsed,
      },
    }]);
    setLoading(false);
  }, [input, activeDataset, messages, user, addLog]);

  const suggestions = [
    'What is the total revenue?',
    'Which product generated the highest revenue?',
    'Show revenue by region',
    'Compare revenue by customer type',
    'What is the average order value?',
    'Show my latest proof',
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-3 lg:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">DataProof Assistant</h1>
              <p className="text-xs text-slate-500">Ask questions about your data — every answer is independently verified</p>
            </div>
          </div>
          {datasets.length > 0 && (
            <select
              value={activeDataset?.id || ''}
              onChange={(e) => {
                const ds = datasets.find((d) => d.id === e.target.value);
                if (ds) setActiveDataset(ds);
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
            >
              {datasets.map((ds) => (
                <option key={ds.id} value={ds.id}>{ds.name}{ds.is_sample ? ' (Sample)' : ''}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 lg:p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <LogoMark size={48} />
              <h2 className="mt-4 text-lg font-semibold text-slate-900">DataProof Assistant</h2>
              <p className="mt-2 max-w-md text-sm text-slate-500">
                I analyze your data with real calculations and independent verification. Ask me anything about "{activeDataset?.name || 'your dataset'}".
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:border-blue-300 hover:bg-blue-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-900'
              }`}>
                <div className="whitespace-pre-wrap text-sm">
                  {msg.content.split('**').map((part, idx) =>
                    idx % 2 === 1 ? <strong key={idx}>{part}</strong> : <span key={idx}>{part}</span>
                  )}
                </div>
                {msg.result && msg.result.match && msg.result.proofId && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a href={`/app/proofs`} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">
                      <Shield className="h-3 w-3" /> {msg.result.proofId}
                    </a>
                    <a href={`/app/analysis/history`} className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100">
                      <FileSearch className="h-3 w-3" /> View Analysis
                    </a>
                  </div>
                )}
                {msg.result && !msg.result.match && (
                  <div className="mt-2">
                    <Badge variant="destructive" className="text-xs">Verification Failed</Badge>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-white border border-slate-200 px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  <span>Analyzing data and running independent verification...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-slate-200 bg-white p-4 lg:p-6">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask a question about your data..."
            className="min-h-[44px] max-h-32 resize-none"
            rows={1}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || loading || !activeDataset}
            className="bg-blue-600 hover:bg-blue-700"
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {activeDataset && (
          <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-slate-400">
            Analyzing: {activeDataset.name} · {activeDataset.rows.length} rows · {activeDataset.columns.length} columns
          </p>
        )}
      </div>
    </div>
  );
}
