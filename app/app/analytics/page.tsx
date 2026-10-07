'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { DatasetColumn } from '@/lib/types';
import {
  computeTimeSeries, computeGroupAggregation, computeDistribution,
  computeCorrelation, detectAnomalies, computeRootCause,
} from '@/lib/analysis-engine';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, ScatterChart,
  Scatter, Legend, AreaChart, Area,
} from 'recharts';
import {
  BarChart3, TrendingUp, GitCompare, ScatterChart as ScatterIcon,
  AlertTriangle, Search, Database, Activity, Target, PieChart as PieIcon,
} from 'lucide-react';

const CHART_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#ef4444', '#84cc16'];

interface DatasetInfo {
  id: string;
  name: string;
  columns: DatasetColumn[];
  rows: Record<string, number | string | null>[];
  is_sample: boolean;
}

function AnalyticsStudioContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
        const preset = searchParams.get('dataset');
        if (preset && dsData.find((d) => d.id === preset)) {
          setActiveId(preset);
        } else if (dsData.length > 0) {
          setActiveId(dsData[0].id);
        }
      }
      setLoading(false);
    };
    load();
  }, [user, searchParams]);

  const dataset = datasets.find((d) => d.id === activeId);

  const numericCols = useMemo(
    () => dataset?.columns.filter((c) => c.type === 'number' || c.type === 'currency') || [],
    [dataset]
  );
  const stringCols = useMemo(
    () => dataset?.columns.filter((c) => c.type === 'string') || [],
    [dataset]
  );
  const dateCol = useMemo(
    () => dataset?.columns.find((c) => c.type === 'date'),
    [dataset]
  );

  const [selectedMetric, setSelectedMetric] = useState<string>('');
  const [selectedDimension, setSelectedDimension] = useState<string>('');

  useEffect(() => {
    if (numericCols.length > 0 && !selectedMetric) setSelectedMetric(numericCols[0].name);
  }, [numericCols, selectedMetric]);
  useEffect(() => {
    if (stringCols.length > 0 && !selectedDimension) setSelectedDimension(stringCols[0].name);
  }, [stringCols, selectedDimension]);

  // Computations
  const trendData = useMemo(() => {
    if (!dataset || !dateCol || !selectedMetric) return [];
    return computeTimeSeries(dataset.rows, dateCol.name, selectedMetric, 'SUM');
  }, [dataset, dateCol, selectedMetric]);

  const groupData = useMemo(() => {
    if (!dataset || !selectedDimension || !selectedMetric) return [];
    return computeGroupAggregation(dataset.rows, selectedDimension, selectedMetric, 'SUM').slice(0, 10);
  }, [dataset, selectedDimension, selectedMetric]);

  const distribution = useMemo(() => {
    if (!dataset || !selectedMetric) return null;
    return computeDistribution(dataset.rows, selectedMetric);
  }, [dataset, selectedMetric]);

  const anomalies = useMemo(() => {
    if (!dataset || !selectedMetric) return [];
    const labelCols = stringCols.slice(0, 2).map((c) => c.name);
    return detectAnomalies(dataset.rows, selectedMetric, labelCols).slice(0, 10);
  }, [dataset, selectedMetric, stringCols]);

  const rootCause = useMemo(() => {
    if (!dataset || !selectedMetric || !selectedDimension) return [];
    return computeRootCause(dataset.rows, selectedMetric, selectedDimension).slice(0, 5);
  }, [dataset, selectedMetric, selectedDimension]);

  const correlation = useMemo(() => {
    if (!dataset || numericCols.length < 2) return null;
    return computeCorrelation(dataset.rows, numericCols[0].name, numericCols[1].name);
  }, [dataset, numericCols]);

  const scatterData = useMemo(() => {
    if (!dataset || numericCols.length < 2) return [];
    return dataset.rows
      .map((r) => ({ x: Number(r[numericCols[0].name]), y: Number(r[numericCols[1].name]) }))
      .filter((d) => !isNaN(d.x) && !isNaN(d.y))
      .slice(0, 200);
  }, [dataset, numericCols]);

  const pieData = useMemo(() => {
    if (!dataset || !selectedDimension || !selectedMetric) return [];
    return computeGroupAggregation(dataset.rows, selectedDimension, selectedMetric, 'SUM').slice(0, 6);
  }, [dataset, selectedDimension, selectedMetric]);

  if (loading) {
    return <div className="flex h-full items-center justify-center text-slate-400">Loading analytics...</div>;
  }

  if (datasets.length === 0) {
    return (
      <div className="flex flex-col items-center py-20">
        <Database className="h-10 w-10 text-slate-300" />
        <p className="mt-3 text-sm text-slate-500">No datasets available for analytics</p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analytics Studio</h1>
          <p className="mt-1 text-sm text-slate-500">Real analytics computed from your actual data</p>
        </div>
        <div className="flex gap-2">
          <select
            value={activeId || ''}
            onChange={(e) => setActiveId(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          >
            {datasets.map((ds) => (
              <option key={ds.id} value={ds.id}>{ds.name}</option>
            ))}
          </select>
          {numericCols.length > 0 && (
            <select
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
            >
              {numericCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          )}
        </div>
      </div>

      {dataset && (
        <div className="mb-4 flex items-center gap-2">
          {dataset.is_sample && <Badge variant="outline" className="text-amber-600 border-amber-300">SAMPLE DATA</Badge>}
          <Badge variant="secondary">{dataset.rows.length.toLocaleString()} rows</Badge>
          <Badge variant="secondary">{dataset.columns.length} columns</Badge>
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="overview"><BarChart3 className="mr-1 h-4 w-4" />Overview</TabsTrigger>
          <TabsTrigger value="trends"><TrendingUp className="mr-1 h-4 w-4" />Trends</TabsTrigger>
          <TabsTrigger value="comparisons"><GitCompare className="mr-1 h-4 w-4" />Comparisons</TabsTrigger>
          <TabsTrigger value="distribution"><ScatterIcon className="mr-1 h-4 w-4" />Distribution</TabsTrigger>
          <TabsTrigger value="anomalies"><AlertTriangle className="mr-1 h-4 w-4" />Anomalies</TabsTrigger>
          <TabsTrigger value="rootcause"><Target className="mr-1 h-4 w-4" />Root Cause</TabsTrigger>
          <TabsTrigger value="relationships"><Search className="mr-1 h-4 w-4" />Relationships</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* KPI cards */}
            <Card className="border-slate-200 lg:col-span-2">
              <CardHeader><CardTitle className="text-sm">Key Metrics (computed from data)</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {numericCols.slice(0, 4).map((col) => {
                    const values = dataset!.rows.map((r) => Number(r[col.name])).filter((v) => !isNaN(v));
                    const total = values.reduce((a, b) => a + b, 0);
                    const avg = values.length > 0 ? total / values.length : 0;
                    const max = values.length > 0 ? Math.max(...values) : 0;
                    return (
                      <div key={col.name} className="rounded-lg border border-slate-100 p-4">
                        <p className="text-xs text-slate-500">{col.name}</p>
                        <p className="mt-1 text-xl font-bold text-slate-900">
                          {col.type === 'currency' ? `₹${total.toLocaleString('en-IN')}` : total.toLocaleString('en-IN')}
                        </p>
                        <div className="mt-1 flex justify-between text-xs text-slate-400">
                          <span>Avg: {avg.toFixed(0)}</span>
                          <span>Max: {max.toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Bar chart by dimension */}
            {groupData.length > 0 && (
              <Card className="border-slate-200">
                <CardHeader>
                  <CardTitle className="text-sm">{selectedMetric} by {selectedDimension}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={groupData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Pie chart */}
            {pieData.length > 0 && (
              <Card className="border-slate-200">
                <CardHeader><CardTitle className="text-sm">Distribution by {selectedDimension}</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={100} label={(e) => e.label}>
                        {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Trends */}
        <TabsContent value="trends">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-sm">
                {selectedMetric} Trend {dateCol ? `over ${dateCol.name}` : ''}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="value" stroke="#2563eb" fill="url(#colorRevenue)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="py-12 text-center text-sm text-slate-500">
                  No date column found. Trends require a date column in your dataset.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Comparisons */}
        <TabsContent value="comparisons">
          <div className="space-y-4">
            {stringCols.length > 0 && (
              <Card className="border-slate-200">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Compare {selectedMetric} by dimension</CardTitle>
                    <select
                      value={selectedDimension}
                      onChange={(e) => setSelectedDimension(e.target.value)}
                      className="rounded border border-slate-200 px-2 py-1 text-sm"
                    >
                      {stringCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                </CardHeader>
                <CardContent>
                  {groupData.length > 0 && (
                    <ResponsiveContainer width="100%" height={350}>
                      <BarChart data={groupData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis dataKey="label" type="category" tick={{ fontSize: 11 }} width={100} />
                        <Tooltip />
                        <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Distribution */}
        <TabsContent value="distribution">
          {distribution ? (
            <div className="space-y-4">
              <Card className="border-slate-200">
                <CardHeader><CardTitle className="text-sm">Statistical Summary: {selectedMetric}</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {[
                      { label: 'Mean', value: distribution.mean.toFixed(2) },
                      { label: 'Median', value: distribution.median.toFixed(2) },
                      { label: 'Min', value: distribution.min.toLocaleString('en-IN') },
                      { label: 'Max', value: distribution.max.toLocaleString('en-IN') },
                      { label: 'Range', value: distribution.range.toLocaleString('en-IN') },
                      { label: 'Std Dev', value: distribution.stdDev.toFixed(2) },
                      { label: 'Q1 (25%)', value: distribution.quartiles.q1.toLocaleString('en-IN') },
                      { label: 'Q3 (75%)', value: distribution.quartiles.q3.toLocaleString('en-IN') },
                    ].map((stat) => (
                      <div key={stat.label} className="rounded-lg border border-slate-100 p-3">
                        <p className="text-xs text-slate-500">{stat.label}</p>
                        <p className="mt-0.5 text-sm font-bold text-slate-900">{stat.value}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {distribution.histogram.length > 0 && (
                <Card className="border-slate-200">
                  <CardHeader><CardTitle className="text-sm">Histogram of {selectedMetric}</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={distribution.histogram}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="bucket" tick={{ fontSize: 10 }} angle={-15} textAnchor="end" height={60} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-slate-500">No numeric columns for distribution analysis.</div>
          )}
        </TabsContent>

        {/* Anomalies */}
        <TabsContent value="anomalies">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Detected Anomalies in {selectedMetric}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {anomalies.length > 0 ? (
                <div className="space-y-2">
                  {anomalies.map((anomaly, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-white">
                          <AlertTriangle className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{anomaly.reason}</p>
                          <p className="text-xs text-slate-500">Z-Score: {anomaly.zScore.toFixed(2)}</p>
                        </div>
                      </div>
                      <p className="text-sm font-bold text-amber-700">{anomaly.value.toLocaleString('en-IN')}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-sm text-slate-500">No anomalies detected. All values are within normal range (z-score &lt; 2.5).</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Root Cause */}
        <TabsContent value="rootcause">
          <Card className="border-slate-200">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Root Cause Analysis: {selectedMetric} by {selectedDimension}</CardTitle>
                {stringCols.length > 0 && (
                  <select
                    value={selectedDimension}
                    onChange={(e) => setSelectedDimension(e.target.value)}
                    className="rounded border border-slate-200 px-2 py-1 text-sm"
                  >
                    {stringCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {rootCause.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 mb-3">Largest observed contributors to {selectedMetric}:</p>
                  {rootCause.map((rc, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-400 w-6">#{i + 1}</span>
                      <div className="flex-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium text-slate-900">{rc.dimension}</span>
                          <span className="font-bold text-slate-900">{rc.contribution.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-blue-600" style={{ width: `${rc.share}%` }} />
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">{rc.share.toFixed(1)}% of total</p>
                      </div>
                    </div>
                  ))}
                  <p className="mt-4 text-xs text-slate-500 italic">
                    Note: "Largest observed contributor" describes correlation, not causation.
                  </p>
                </div>
              ) : (
                <div className="py-12 text-center text-sm text-slate-500">Select a dimension to analyze root causes.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Relationships */}
        <TabsContent value="relationships">
          {numericCols.length >= 2 && correlation !== null ? (
            <div className="space-y-4">
              <Card className="border-slate-200">
                <CardHeader><CardTitle className="text-sm">Correlation: {numericCols[0].name} vs {numericCols[1].name}</CardTitle></CardHeader>
                <CardContent>
                  <div className="mb-4 rounded-lg bg-slate-50 p-4">
                    <p className="text-sm text-slate-700">
                      Pearson Correlation Coefficient: <span className="font-bold text-slate-900">{correlation.toFixed(4)}</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500 italic">
                      Correlation does not imply causation. This measures linear relationship strength only.
                    </p>
                  </div>
                  <ResponsiveContainer width="100%" height={350}>
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="x" name={numericCols[0].name} tick={{ fontSize: 11 }} />
                      <YAxis dataKey="y" name={numericCols[1].name} tick={{ fontSize: 11 }} />
                      <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                      <Scatter data={scatterData} fill="#2563eb" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-slate-500">At least 2 numeric columns are needed for relationship analysis.</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AnalyticsStudioPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-400">Loading...</div>}>
      <AnalyticsStudioContent />
    </Suspense>
  );
}
