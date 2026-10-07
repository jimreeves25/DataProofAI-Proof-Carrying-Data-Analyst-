'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useDatasets, useAnalyses, useProofs, useAuditLog } from '@/lib/hooks';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { LogoMark } from '@/components/logo';
import { supabase } from '@/lib/supabase';
import { computeDataQuality } from '@/lib/data-processing';
import {
  Database, Upload, ScanLine, FileSearch, ShieldCheck, FileText,
  Plug, Plus, Activity, Shield, CheckCircle2, AlertTriangle,
  TrendingUp, Clock, ArrowRight, BarChart3, Zap,
} from 'lucide-react';

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const { datasets, loading: datasetsLoading } = useDatasets();
  const { analyses, loading: analysesLoading } = useAnalyses();
  const { proofs, loading: proofsLoading } = useProofs();
  const { logs } = useAuditLog();
  const [healthScores, setHealthScores] = useState<Record<string, number>>({});

  useEffect(() => {
    if (datasets.length > 0) {
      const scores: Record<string, number> = {};
      for (const ds of datasets) {
        const quality = computeDataQuality(ds.columns, ds.rows);
        scores[ds.id] = quality.overallScore;
      }
      setHealthScores(scores);
    }
  }, [datasets]);

  const totalRows = datasets.reduce((sum, ds) => sum + ds.row_count, 0);
  const verifiedProofs = proofs.filter((p) => p.match).length;
  const failedProofs = proofs.filter((p) => !p.match).length;
  const verifiedRate = proofs.length > 0 ? Math.round((verifiedProofs / proofs.length) * 100) : 0;
  const avgHealth =
    Object.values(healthScores).length > 0
      ? Math.round(Object.values(healthScores).reduce((a, b) => a + b, 0) / Object.values(healthScores).length)
      : 0;

  const recentAnalyses = analyses.slice(0, 5);
  const recentProofs = proofs.slice(0, 5);
  const recentLogs = logs.slice(0, 8);

  const hasData = datasets.length > 0;

  const quickActions = [
    { label: 'New Analysis', href: '/app/analysis/new', icon: FileSearch, color: 'bg-blue-600' },
    { label: 'Upload Data', href: '/app/data', icon: Upload, color: 'bg-emerald-600' },
    { label: 'Scan Paper', href: '/app/scan', icon: ScanLine, color: 'bg-purple-600' },
    { label: 'Prove a Result', href: '/app/verification', icon: ShieldCheck, color: 'bg-amber-600' },
    { label: 'Create Report', href: '/app/reports', icon: FileText, color: 'bg-rose-600' },
    { label: 'Connect Source', href: '/app/integrations', icon: Plug, color: 'bg-cyan-600' },
  ];

  if (datasetsLoading && analysesLoading && proofsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-pulse">
          <LogoMark size={48} />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Welcome back, {profile?.full_name?.split(' ')[0] || 'Analyst'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {hasData
              ? `${datasets.length} dataset${datasets.length > 1 ? 's' : ''} connected · ${totalRows.toLocaleString()} total records`
              : 'No datasets connected yet. Connect a data source to begin.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/app/data">
            <Button variant="outline" size="sm">
              <Upload className="h-4 w-4" />
              <span className="ml-1">Upload</span>
            </Button>
          </Link>
          <Link href="/app/analysis/new">
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4" />
              <span className="ml-1">New Analysis</span>
            </Button>
          </Link>
        </div>
      </div>

      {!hasData ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white py-20">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
            <Database className="h-8 w-8 text-blue-600" />
          </div>
          <h2 className="mt-4 text-xl font-semibold text-slate-900">No datasets connected yet</h2>
          <p className="mt-2 max-w-md text-center text-sm text-slate-500">
            Connect a dataset to begin analyzing and verifying your data. Upload a CSV file, connect a data source, or scan paper documents.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/app/data">
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Upload className="h-4 w-4" />
                <span className="ml-2">Upload Data</span>
              </Button>
            </Link>
            <Link href="/app/integrations">
              <Button variant="outline">
                <Plug className="h-4 w-4" />
                <span className="ml-2">Connect Data Source</span>
              </Button>
            </Link>
            <Link href="/app/scan">
              <Button variant="outline">
                <ScanLine className="h-4 w-4" />
                <span className="ml-2">Scan Paper</span>
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {quickActions.map((action) => (
              <Link key={action.label} href={action.href}>
                <Card className="group cursor-pointer border-slate-200 transition-all hover:border-blue-300 hover:shadow-md">
                  <CardContent className="flex flex-col items-center gap-2 p-4">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${action.color} text-white transition-transform group-hover:scale-110`}>
                      <action.icon className="h-5 w-5" />
                    </div>
                    <span className="text-xs font-medium text-slate-700">{action.label}</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-slate-200">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Total Records</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{totalRows.toLocaleString()}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                    <Database className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">{datasets.length} dataset{datasets.length !== 1 ? 's' : ''}</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Verified Proofs</p>
                    <p className="mt-1 text-2xl font-bold text-emerald-600">{verifiedProofs}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
                    <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {proofs.length > 0 ? `${verifiedRate}% verification rate` : 'No proofs yet'}
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Avg Data Health</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{avgHealth}<span className="text-lg text-slate-400">/100</span></p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
                    <Activity className="h-5 w-5 text-amber-600" />
                  </div>
                </div>
                <Progress value={avgHealth} className="mt-2 h-1.5" />
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Analyses Run</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{analyses.length}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50">
                    <BarChart3 className="h-5 w-5 text-purple-600" />
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">{failedProofs} verification failure{failedProofs !== 1 ? 's' : ''}</p>
              </CardContent>
            </Card>
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Recent Analyses */}
            <Card className="border-slate-200 lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Recent Analyses</CardTitle>
                <Link href="/app/analysis/history">
                  <Button variant="ghost" size="sm">View all <ArrowRight className="ml-1 h-3 w-3" /></Button>
                </Link>
              </CardHeader>
              <CardContent>
                {recentAnalyses.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <FileSearch className="h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-sm text-slate-500">No analyses yet</p>
                    <Link href="/app/analysis/new" className="mt-3">
                      <Button size="sm" className="bg-blue-600 hover:bg-blue-700">Start your first analysis</Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recentAnalyses.map((analysis) => (
                      <Link
                        key={analysis.id}
                        href={`/app/analysis/${analysis.id}`}
                        className="flex items-center justify-between rounded-lg border border-slate-100 p-3 transition-colors hover:bg-slate-50"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                            <FileSearch className="h-4 w-4 text-blue-600" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-900 truncate max-w-md">{analysis.question}</p>
                            <p className="text-xs text-slate-500">{new Date(analysis.created_at).toLocaleString()}</p>
                          </div>
                        </div>
                        <Badge variant={analysis.status === 'verified' ? 'default' : 'secondary'} className="ml-2">
                          {analysis.status}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Proofs */}
            <Card className="border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Recent Proofs</CardTitle>
                <Link href="/app/proofs">
                  <Button variant="ghost" size="sm">View all</Button>
                </Link>
              </CardHeader>
              <CardContent>
                {recentProofs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <Shield className="h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-sm text-slate-500">No proofs yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recentProofs.map((proof) => (
                      <Link
                        key={proof.id}
                        href={`/app/proofs/${proof.id}`}
                        className="flex items-center justify-between rounded-lg border border-slate-100 p-3 transition-colors hover:bg-slate-50"
                      >
                        <div className="flex items-center gap-3">
                          {proof.match ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                          ) : (
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                          )}
                          <div>
                            <p className="text-xs font-mono font-medium text-blue-600">{proof.proof_id_serial}</p>
                            <p className="text-xs text-slate-500 truncate max-w-[200px]">{proof.question}</p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Data sources + Activity */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Datasets */}
            <Card className="border-slate-200 lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Connected Datasets</CardTitle>
                <Link href="/app/data">
                  <Button variant="ghost" size="sm">Manage <ArrowRight className="ml-1 h-3 w-3" /></Button>
                </Link>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {datasets.slice(0, 5).map((ds) => (
                    <Link
                      key={ds.id}
                      href={`/app/data/${ds.id}`}
                      className="flex items-center justify-between rounded-lg border border-slate-100 p-3 transition-colors hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                          <Database className="h-4 w-4 text-slate-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-900">{ds.name}</p>
                            {ds.is_sample && (
                              <Badge variant="outline" className="text-[10px] text-amber-600">SAMPLE</Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">{ds.row_count.toLocaleString()} rows · {ds.column_count} columns</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-xs text-slate-500">Health</p>
                          <p className={`text-sm font-semibold ${healthScores[ds.id] >= 80 ? 'text-emerald-600' : healthScores[ds.id] >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                            {healthScores[ds.id] || '—'}/100
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Activity */}
            <Card className="border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Activity</CardTitle>
                <Link href="/app/audit">
                  <Button variant="ghost" size="sm">View all</Button>
                </Link>
              </CardHeader>
              <CardContent>
                {recentLogs.length === 0 ? (
                  <div className="py-10 text-center">
                    <Clock className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-sm text-slate-500">No activity yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentLogs.map((log) => (
                      <div key={log.id} className="flex items-start gap-3">
                        <div className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-700">{log.action}</p>
                          <p className="text-xs text-slate-400">{new Date(log.created_at).toLocaleTimeString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
