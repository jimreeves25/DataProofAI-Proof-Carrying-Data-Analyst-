'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuditLog } from '@/lib/hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Table as TableComponent } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { computeDataQuality } from '@/lib/data-processing';
import { DatasetColumn } from '@/lib/types';
import {
  ArrowLeft, Database, Search, Download, FileSearch, Shield,
  GitBranch, Wand2, Activity, AlertTriangle, CheckCircle2,
  ChevronLeft, ChevronRight, Table as TableIcon, BarChart3,
} from 'lucide-react';

interface DatasetData {
  id: string;
  name: string;
  source_type: string;
  source_label: string | null;
  row_count: number;
  column_count: number;
  columns: DatasetColumn[];
  rows: Record<string, number | string | null>[];
  is_sample: boolean;
  created_at: string;
}

export default function DatasetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { addLog } = useAuditLog();
  const { toast } = useToast();
  const [dataset, setDataset] = useState<DatasetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const pageSize = 50;

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('datasets')
        .select('*')
        .eq('id', params.id as string)
        .maybeSingle();
      if (data) {
        setDataset(data as unknown as DatasetData);
      }
      setLoading(false);
    };
    load();
  }, [params.id]);

  const quality = useCallback(() => {
    if (!dataset) return null;
    return computeDataQuality(dataset.columns, dataset.rows);
  }, [dataset]);

  const filteredRows = dataset
    ? dataset.rows.filter((row) => {
        if (!search) return true;
        return Object.values(row).some((v) =>
          String(v || '').toLowerCase().includes(search.toLowerCase())
        );
      })
    : [];

  const sortedRows = sortCol
    ? [...filteredRows].sort((a, b) => {
        const av = a[sortCol];
        const bv = b[sortCol];
        if (av === null) return 1;
        if (bv === null) return -1;
        if (typeof av === 'number' && typeof bv === 'number') {
          return sortDir === 'asc' ? av - bv : bv - av;
        }
        return sortDir === 'asc'
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      })
    : filteredRows;

  const paginatedRows = sortedRows.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(sortedRows.length / pageSize);
  const q = quality();

  const toggleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const handleDownload = () => {
    if (!dataset) return;
    const headers = dataset.columns.map((c) => c.name).join(',');
    const rows = dataset.rows.map((row) =>
      dataset.columns.map((c) => {
        const val = row[c.name];
        if (val === null) return '';
        if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
        return String(val);
      }).join(',')
    );
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dataset.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addLog('Downloaded dataset', 'dataset', { name: dataset.name });
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-pulse text-slate-400">Loading dataset...</div>
      </div>
    );
  }

  if (!dataset) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Database className="h-10 w-10 text-slate-300" />
        <p className="mt-3 text-sm text-slate-500">Dataset not found</p>
        <Link href="/app/data" className="mt-4">
          <Button variant="outline">Back to Data Sources</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">{dataset.name}</h1>
              {dataset.is_sample && (
                <Badge variant="outline" className="border-amber-300 text-amber-600">SAMPLE DATA — DEMONSTRATION ONLY</Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {dataset.row_count.toLocaleString()} rows · {dataset.column_count} columns · {dataset.source_type}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4" />
            <span className="ml-1">Download</span>
          </Button>
          <Link href={`/app/analysis/new?dataset=${dataset.id}`}>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
              <FileSearch className="h-4 w-4" />
              <span className="ml-1">Analyze</span>
            </Button>
          </Link>
        </div>
      </div>

      <Tabs defaultValue="preview">
        <TabsList className="mb-4">
          <TabsTrigger value="preview"><TableIcon className="mr-1 h-4 w-4" />Preview</TabsTrigger>
          <TabsTrigger value="dictionary"><Database className="mr-1 h-4 w-4" />Dictionary</TabsTrigger>
          <TabsTrigger value="health"><Activity className="mr-1 h-4 w-4" />Health</TabsTrigger>
          <TabsTrigger value="lineage"><GitBranch className="mr-1 h-4 w-4" />Lineage</TabsTrigger>
          <TabsTrigger value="provenance"><Shield className="mr-1 h-4 w-4" />Provenance</TabsTrigger>
        </TabsList>

        {/* Data Preview */}
        <TabsContent value="preview">
          <Card className="border-slate-200">
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-slate-100 p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search rows..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(0);
                    }}
                    className="w-64 pl-9"
                  />
                </div>
                <p className="text-sm text-slate-500">
                  Showing {paginatedRows.length} of {sortedRows.length} rows
                </p>
              </div>
              <div className="overflow-x-auto scrollbar-thin">
                <TableComponent>
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="w-12 px-3 py-2 text-left text-xs font-medium text-slate-500">#</th>
                      {dataset.columns.map((col) => (
                        <th
                          key={col.name}
                          className="cursor-pointer px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100"
                          onClick={() => toggleSort(col.name)}
                        >
                          <div className="flex items-center gap-1">
                            {col.name}
                            {sortCol === col.name && (
                              <span className="text-blue-500">{sortDir === 'asc' ? '↑' : '↓'}</span>
                            )}
                            <Badge variant="outline" className="ml-1 text-[10px]">
                              {col.type}
                            </Badge>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRows.map((row, i) => (
                      <tr key={page * pageSize + i} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-3 py-2 text-xs text-slate-400">{page * pageSize + i + 1}</td>
                        {dataset.columns.map((col) => {
                          const val = row[col.name];
                          return (
                            <td key={col.name} className="px-3 py-2 text-sm text-slate-700">
                              {val === null || val === '' ? (
                                <span className="text-slate-300 italic">null</span>
                              ) : col.type === 'currency' || col.type === 'number' ? (
                                typeof val === 'number' ? val.toLocaleString('en-IN') : String(val)
                              ) : (
                                String(val)
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </TableComponent>
              </div>
              {/* Pagination */}
              <div className="flex items-center justify-between border-t border-slate-100 p-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <p className="text-sm text-slate-500">
                  Page {page + 1} of {totalPages || 1}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(page + 1)}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Data Dictionary */}
        <TabsContent value="dictionary">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-lg">Data Dictionary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <TableComponent>
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">Column</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">Type</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">Missing</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">Unique</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">Min</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">Max</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">Mean</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">Samples</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataset.columns.map((col) => (
                      <tr key={col.name} className="border-b border-slate-50">
                        <td className="px-3 py-3 text-sm font-medium text-slate-900">{col.name}</td>
                        <td className="px-3 py-3">
                          <Badge variant="outline" className={
                            col.type === 'number' ? 'text-blue-600 border-blue-200' :
                            col.type === 'currency' ? 'text-emerald-600 border-emerald-200' :
                            col.type === 'date' ? 'text-purple-600 border-purple-200' :
                            'text-slate-600'
                          }>
                            {col.type}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-sm text-slate-700">
                          {col.missingPercent.toFixed(1)}%
                          {col.missingCount > 0 && (
                            <span className="text-xs text-slate-400"> ({col.missingCount})</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-sm text-slate-700">
                          {col.uniqueCount}
                          <span className="text-xs text-slate-400"> ({col.uniqueness.toFixed(0)}%)</span>
                        </td>
                        <td className="px-3 py-3 text-sm text-slate-700">
                          {col.min !== undefined ? (typeof col.min === 'number' ? col.min.toLocaleString('en-IN') : String(col.min)) : '—'}
                        </td>
                        <td className="px-3 py-3 text-sm text-slate-700">
                          {col.max !== undefined ? (typeof col.max === 'number' ? col.max.toLocaleString('en-IN') : String(col.max)) : '—'}
                        </td>
                        <td className="px-3 py-3 text-sm text-slate-700">
                          {col.mean !== undefined ? col.mean.toFixed(2) : '—'}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-500">
                          {col.samples.slice(0, 3).map((s, i) => (
                            <span key={i} className="mr-1 rounded bg-slate-100 px-1.5 py-0.5">
                              {String(s)}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </TableComponent>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Data Health */}
        <TabsContent value="health">
          {q && (
            <div className="space-y-4">
              <Card className="border-slate-200">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-500">Overall Health Score</p>
                      <p className={`mt-1 text-4xl font-bold ${q.overallScore >= 80 ? 'text-emerald-600' : q.overallScore >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                        {q.overallScore}<span className="text-xl text-slate-400">/100</span>
                      </p>
                    </div>
                    <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ${q.overallScore >= 80 ? 'bg-emerald-50' : q.overallScore >= 60 ? 'bg-amber-50' : 'bg-red-50'}`}>
                      {q.overallScore >= 80 ? (
                        <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="h-8 w-8 text-amber-600" />
                      )}
                    </div>
                  </div>
                  <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-5">
                    {[
                      { label: 'Completeness', value: q.completeness },
                      { label: 'Validity', value: q.validity },
                      { label: 'Consistency', value: q.consistency },
                      { label: 'Uniqueness', value: q.uniqueness },
                      { label: 'Freshness', value: q.freshness },
                    ].map((metric) => (
                      <div key={metric.label}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-600">{metric.label}</span>
                          <span className="text-xs font-bold text-slate-900">{metric.value}%</span>
                        </div>
                        <Progress
                          value={metric.value}
                          className={`mt-1.5 h-2 ${metric.value >= 80 ? '[&>div]:bg-emerald-500' : metric.value >= 60 ? '[&>div]:bg-amber-500' : '[&>div]:bg-red-500'}`}
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {q.issues.length > 0 && (
                <Card className="border-slate-200">
                  <CardHeader>
                    <CardTitle className="text-lg">Issues Detected ({q.issues.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {q.issues.map((issue, i) => (
                        <div
                          key={i}
                          className={`flex items-start gap-3 rounded-lg border p-3 ${
                            issue.severity === 'high'
                              ? 'border-red-200 bg-red-50'
                              : issue.severity === 'medium'
                              ? 'border-amber-200 bg-amber-50'
                              : 'border-slate-200 bg-slate-50'
                          }`}
                        >
                          <AlertTriangle className={`h-4 w-4 flex-shrink-0 mt-0.5 ${
                            issue.severity === 'high' ? 'text-red-600' :
                            issue.severity === 'medium' ? 'text-amber-600' : 'text-slate-500'
                          }`} />
                          <div>
                            <p className="text-sm font-medium text-slate-900">{issue.description}</p>
                            {issue.column && (
                              <Badge variant="outline" className="mt-1 text-xs">{issue.column}</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* Data Lineage */}
        <TabsContent value="lineage">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-lg">Data Lineage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center gap-2">
                {[
                  { label: 'SOURCE', detail: `${dataset.source_type} · ${dataset.source_label || dataset.name}`, icon: Database, color: 'bg-blue-600' },
                  { label: 'DATASET', detail: `${dataset.name} · ${dataset.row_count.toLocaleString()} rows`, icon: TableIcon, color: 'bg-emerald-600' },
                  { label: 'COLUMNS', detail: `${dataset.column_count} columns detected`, icon: Database, color: 'bg-purple-600' },
                  { label: 'SCHEMA', detail: dataset.columns.map((c) => `${c.name}(${c.type})`).join(', ').slice(0, 80) + '...', icon: Database, color: 'bg-cyan-600' },
                  { label: 'QUALITY CHECK', detail: `Score: ${q?.overallScore}/100`, icon: Activity, color: 'bg-amber-600' },
                  { label: 'READY FOR ANALYSIS', detail: 'Dataset available for analysis and verification', icon: CheckCircle2, color: 'bg-emerald-600' },
                ].map((stage, i, arr) => (
                  <div key={stage.label} className="flex flex-col items-center">
                    <div className={`flex items-center gap-3 rounded-xl ${stage.color} px-6 py-3 text-white`}>
                      <stage.icon className="h-5 w-5" />
                      <div>
                        <p className="text-sm font-bold">{stage.label}</p>
                        <p className="text-xs text-white/80">{stage.detail}</p>
                      </div>
                    </div>
                    {i < arr.length - 1 && (
                      <div className="h-6 w-0.5 bg-slate-300" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Provenance */}
        <TabsContent value="provenance">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-lg">Data Provenance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { label: 'Dataset Name', value: dataset.name },
                  { label: 'Source', value: dataset.source_type },
                  { label: 'Source Label', value: dataset.source_label || 'N/A' },
                  { label: 'Row Count', value: dataset.row_count.toLocaleString() },
                  { label: 'Column Count', value: String(dataset.column_count) },
                  { label: 'Health Score', value: `${q?.overallScore}/100` },
                  { label: 'Sample Data', value: dataset.is_sample ? 'Yes — SAMPLE DATA — DEMONSTRATION ONLY' : 'No — REAL USER DATA' },
                  { label: 'Uploaded', value: new Date(dataset.created_at).toLocaleString() },
                ].map((item) => (
                  <div key={item.label} className="flex justify-between border-b border-slate-100 py-2">
                    <span className="text-sm font-medium text-slate-500">{item.label}</span>
                    <span className="text-sm text-slate-900">{item.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
