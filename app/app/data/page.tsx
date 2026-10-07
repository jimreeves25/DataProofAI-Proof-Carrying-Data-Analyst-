'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useDatasets } from '@/lib/hooks';
import { useAuditLog } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { parseCSV, analyzeColumns, coerceRows, computeDataQuality, generateSampleSalesData } from '@/lib/data-processing';
import { Database, Upload, FileText, Table, Trash2, ArrowRight, Loader2, FileSpreadsheet, Plus } from 'lucide-react';
import { format } from 'date-fns';

export default function DataSourcesPage() {
  const { datasets, loading, addDataset, deleteDataset, loadDatasets } = useDatasets();
  const { addLog } = useAuditLog();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [search, setSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!file) return;
      setUploading(true);
      try {
        setUploadProgress('Reading file...');
        const text = await file.text();
        setUploadProgress('Parsing data...');
        const { columns, rows } = parseCSV(text);

        if (columns.length === 0 || rows.length === 0) {
          toast({ title: 'Upload failed', description: 'The CSV file appears to be empty or invalid.', variant: 'destructive' });
          setUploading(false);
          setUploadProgress('');
          return;
        }

        setUploadProgress('Detecting schema...');
        const analyzedColumns = analyzeColumns(columns, rows);

        setUploadProgress('Coercing data types...');
        const coercedRows = coerceRows(analyzedColumns, rows);

        setUploadProgress('Computing data quality...');
        const quality = computeDataQuality(analyzedColumns, coercedRows);

        setUploadProgress('Saving dataset...');
        const ds = await addDataset({
          name: file.name.replace(/\.csv$/i, ''),
          source_type: 'csv',
          source_label: file.name,
          row_count: coercedRows.length,
          column_count: analyzedColumns.length,
          columns: analyzedColumns,
          rows: coercedRows,
        });

        if (ds) {
          // Save quality report
          const { supabase } = await import('@/lib/supabase');
          await supabase.from('data_quality_reports').insert({
            dataset_id: ds.id,
            user_id: ds.user_id || (await supabase.auth.getUser()).data.user?.id,
            completeness: quality.completeness,
            validity: quality.validity,
            consistency: quality.consistency,
            uniqueness: quality.uniqueness,
            freshness: quality.freshness,
            overall_score: quality.overallScore,
            issues: quality.issues,
          });

          await addLog('Uploaded dataset', 'dataset', { name: file.name, rows: coercedRows.length });
          toast({
            title: 'Dataset uploaded successfully',
            description: `${file.name}: ${coercedRows.length} rows, ${analyzedColumns.length} columns detected. Health score: ${quality.overallScore}/100`,
          });
        }
      } catch (err) {
        toast({
          title: 'Upload failed',
          description: err instanceof Error ? err.message : 'Could not process the file.',
          variant: 'destructive',
        });
      } finally {
        setUploading(false);
        setUploadProgress('');
      }
    },
    [addDataset, addLog, toast]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith('.csv')) {
        handleFileUpload(file);
      } else {
        toast({ title: 'Only CSV files supported', variant: 'destructive' });
      }
    },
    [handleFileUpload, toast]
  );

  const handleLoadSample = useCallback(async () => {
    setUploading(true);
    setUploadProgress('Generating sample data...');
    try {
      const { columns, rows } = generateSampleSalesData();
      setUploadProgress('Detecting schema...');
      const analyzedColumns = analyzeColumns(columns, rows);
      setUploadProgress('Coercing data types...');
      const coercedRows = coerceRows(analyzedColumns, rows);
      setUploadProgress('Computing data quality...');
      const quality = computeDataQuality(analyzedColumns, coercedRows);
      setUploadProgress('Saving dataset...');
      const ds = await addDataset({
        name: 'Sample Sales Data 2025',
        source_type: 'sample',
        source_label: 'SAMPLE DATA — DEMONSTRATION ONLY',
        row_count: coercedRows.length,
        column_count: analyzedColumns.length,
        columns: analyzedColumns,
        rows: coercedRows,
        is_sample: true,
      });

      if (ds) {
        const { supabase } = await import('@/lib/supabase');
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('data_quality_reports').insert({
            dataset_id: ds.id,
            user_id: user.id,
            completeness: quality.completeness,
            validity: quality.validity,
            consistency: quality.consistency,
            uniqueness: quality.uniqueness,
            freshness: quality.freshness,
            overall_score: quality.overallScore,
            issues: quality.issues,
          });
        }
        await addLog('Loaded sample dataset', 'dataset', { name: 'Sample Sales Data 2025' });
        toast({
          title: 'Sample data loaded',
          description: `${coercedRows.length} rows of sales data with products, regions, and revenue. Clearly labelled as SAMPLE DATA.`,
        });
      }
    } catch (err) {
      toast({ title: 'Failed to load sample data', description: String(err), variant: 'destructive' });
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  }, [addDataset, addLog, toast]);

  const handleDelete = async (id: string, name: string) => {
    await deleteDataset(id);
    await addLog('Deleted dataset', 'dataset', { name });
    toast({ title: 'Dataset deleted', description: name });
  };

  const filteredDatasets = datasets.filter((ds) =>
    ds.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Data Sources</h1>
        <p className="mt-1 text-sm text-slate-500">Upload, connect, and manage your datasets</p>
      </div>

      {/* Upload zone */}
      <div
        className="mb-6 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center transition-colors hover:border-blue-400"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-sm font-medium text-slate-700">{uploadProgress}</p>
          </div>
        ) : (
          <>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
              <Upload className="h-7 w-7 text-blue-600" />
            </div>
            <p className="mt-4 text-lg font-medium text-slate-900">Drop your CSV file here</p>
            <p className="mt-1 text-sm text-slate-500">or click to browse — your data is parsed, schema-detected, and quality-scored automatically</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button onClick={() => fileInputRef.current?.click()} className="bg-blue-600 hover:bg-blue-700">
                <Upload className="h-4 w-4" />
                <span className="ml-2">Choose CSV File</span>
              </Button>
              <Button variant="outline" onClick={handleLoadSample}>
                <Plus className="h-4 w-4" />
                <span className="ml-2">Load Sample Data</span>
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
                e.target.value = '';
              }}
            />
          </>
        )}
      </div>

      {/* Datasets list */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Datasets ({filteredDatasets.length})</h2>
        <input
          type="text"
          placeholder="Search datasets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      ) : filteredDatasets.length === 0 ? (
        <Card className="border-dashed border-slate-300">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Database className="h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">No datasets found. Upload a CSV or load sample data to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredDatasets.map((ds) => (
            <Card key={ds.id} className="group border-slate-200 transition-all hover:shadow-md">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                      {ds.source_type === 'csv' ? (
                        <FileText className="h-5 w-5 text-slate-600" />
                      ) : (
                        <Table className="h-5 w-5 text-slate-600" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-900">{ds.name}</h3>
                        {ds.is_sample && (
                          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">SAMPLE</Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">{ds.source_label || ds.source_type}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(ds.id, ds.name)}
                    className="text-slate-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">Rows</p>
                    <p className="font-semibold text-slate-900">{ds.row_count.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Columns</p>
                    <p className="font-semibold text-slate-900">{ds.column_count}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Uploaded</p>
                    <p className="font-semibold text-slate-900">{format(new Date(ds.created_at), 'MMM d, yyyy')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Status</p>
                    <Badge variant="secondary" className="text-xs">Ready</Badge>
                  </div>
                </div>

                <Link href={`/app/data/${ds.id}`}>
                  <Button variant="outline" size="sm" className="mt-4 w-full">
                    Explore Data <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
