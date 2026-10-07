'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Shield, CheckCircle2, AlertTriangle, Database, Code2,
  GitBranch, Eye, FileSearch, Activity, Target, Loader2,
} from 'lucide-react';

export default function TrustCenterPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    analysesTotal: 0,
    verified: 0,
    refused: 0,
    needsReview: 0,
    proofsGenerated: 0,
    mismatches: 0,
    datasets: 0,
    totalRows: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      const { count: analysesCount } = await supabase.from('analyses').select('*', { count: 'exact' }).eq('user_id', user.id);
      const { count: proofsCount } = await supabase.from('proofs').select('*', { count: 'exact' }).eq('user_id', user.id);
      const { data: proofsData } = await supabase.from('proofs').select('match, verification_status').eq('user_id', user.id);
      const { count: dsCount } = await supabase.from('datasets').select('*', { count: 'exact' }).eq('user_id', user.id);
      const { data: dsData } = await supabase.from('datasets').select('row_count').eq('user_id', user.id);

      const verified = proofsData?.filter((p) => p.match).length || 0;
      const mismatches = proofsData?.filter((p) => !p.match).length || 0;
      const totalRows = dsData?.reduce((sum, d) => sum + d.row_count, 0) || 0;

      setStats({
        analysesTotal: analysesCount || 0,
        verified,
        refused: 0,
        needsReview: 0,
        proofsGenerated: proofsCount || 0,
        mismatches,
        datasets: dsCount || 0,
        totalRows,
      });
      setLoading(false);
    };
    load();
  }, [user]);

  const pillars = [
    { num: '01', label: 'Source', icon: Database, desc: 'Every number traces back to a real data source' },
    { num: '02', label: 'Data Quality', icon: Activity, desc: 'Health scores computed from actual data' },
    { num: '03', label: 'Calculation', icon: Code2, desc: 'Real code executes real computations' },
    { num: '04', label: 'Execution', icon: FileSearch, desc: 'Sandboxed execution with validation' },
    { num: '05', label: 'Independent Verification', icon: Shield, desc: 'Dual-path calculation comparison' },
    { num: '06', label: 'Evidence', icon: GitBranch, desc: 'Complete evidence chain for every result' },
    { num: '07', label: 'Proof', icon: CheckCircle2, desc: 'Reproducible proof passports' },
  ];

  const evidenceScore = stats.proofsGenerated > 0
    ? Math.round((stats.verified / stats.proofsGenerated) * 100)
    : 0;

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Trust Center</h1>
        <p className="mt-1 text-sm text-slate-500">Transparency into how DataProofAI verifies every result</p>
      </div>

      {/* Stats overview */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'Analyses', value: stats.analysesTotal, color: 'text-blue-600' },
          { label: 'Verified', value: stats.verified, color: 'text-emerald-600' },
          { label: 'Refused', value: stats.refused, color: 'text-amber-600' },
          { label: 'Proofs', value: stats.proofsGenerated, color: 'text-purple-600' },
          { label: 'Mismatches', value: stats.mismatches, color: 'text-red-600' },
          { label: 'Datasets', value: stats.datasets, color: 'text-cyan-600' },
        ].map((stat) => (
          <Card key={stat.label} className="border-slate-200">
            <CardContent className="p-4 text-center">
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="mt-1 text-xs text-slate-500">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Evidence Score */}
      {stats.proofsGenerated > 0 && (
        <Card className="mb-8 border-slate-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Overall Evidence Score</p>
                <p className="mt-1 text-4xl font-bold text-slate-900">{evidenceScore}<span className="text-xl text-slate-400">/100</span></p>
              </div>
              <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ${evidenceScore >= 80 ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                <Shield className={`h-8 w-8 ${evidenceScore >= 80 ? 'text-emerald-600' : 'text-amber-600'}`} />
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <div>
                <div className="flex justify-between text-xs"><span>Verification Rate</span><span>{evidenceScore}%</span></div>
                <Progress value={evidenceScore} className="mt-1 h-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trust Pillars */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {pillars.map((pillar) => (
          <Card key={pillar.num} className="border-slate-200 transition-all hover:shadow-md">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white flex-shrink-0">
                  <pillar.icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400">{pillar.num}</span>
                    <h3 className="text-sm font-semibold text-slate-900">{pillar.label}</h3>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{pillar.desc}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Philosophy */}
      <Card className="mt-6 border-slate-900 bg-slate-900 text-white">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <Eye className="h-6 w-6 text-blue-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold">DataProofAI does not present an answer as verified unless it can reproduce and validate the calculation.</p>
              <p className="mt-2 text-sm text-slate-300">When the available data cannot support a reliable answer, DataProofAI refuses rather than guessing.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
