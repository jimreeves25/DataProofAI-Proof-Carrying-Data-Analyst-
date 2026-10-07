'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useDatasets, useProofs, useAuditLog } from '@/lib/hooks';
import { computeDataQuality } from '@/lib/data-processing';
import { computeGroupAggregation, computeTimeSeries } from '@/lib/analysis-engine';
import { DatasetColumn } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import {
  FileText, Download, FileSpreadsheet, Loader2, Shield,
  Plus, FileDown, Printer, QrCode as QrIcon, Presentation,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface DatasetInfo {
  id: string;
  name: string;
  columns: DatasetColumn[];
  rows: Record<string, number | string | null>[];
  is_sample: boolean;
}

const REPORT_SECTIONS = [
  { id: 'summary', label: 'Executive Summary', default: true },
  { id: 'kpi', label: 'KPI Overview', default: true },
  { id: 'charts', label: 'Charts & Findings', default: true },
  { id: 'anomalies', label: 'Anomalies', default: true },
  { id: 'quality', label: 'Data Quality', default: true },
  { id: 'verification', label: 'Verification & Proofs', default: true },
  { id: 'sources', label: 'Sources & Lineage', default: true },
];

export default function ReportsPage() {
  const { user } = useAuth();
  const { datasets } = useDatasets();
  const { proofs } = useProofs();
  const { addLog } = useAuditLog();
  const { toast } = useToast();
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [selectedSections, setSelectedSections] = useState<string[]>(REPORT_SECTIONS.filter((s) => s.default).map((s) => s.id));
  const [generating, setGenerating] = useState(false);
  const [reports, setReports] = useState<{ id: string; title: string; report_type: string; created_at: string }[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('reports')
        .select('id, title, report_type, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (data) setReports(data as typeof reports);
    };
    load();
  }, [user]);

  const availableDatasets = datasets as unknown as DatasetInfo[];
  const selectedDataset = availableDatasets.find((d) => d.id === selectedDatasetId);

  const toggleSection = (id: string) => {
    setSelectedSections((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const generatePDF = async () => {
    if (!selectedDataset) return;
    setGenerating(true);
    await new Promise((r) => setTimeout(r, 500));

    const doc = new jsPDF();
    const quality = computeDataQuality(selectedDataset.columns, selectedDataset.rows);
    const numericCols = selectedDataset.columns.filter((c) => c.type === 'number' || c.type === 'currency');
    const stringCols = selectedDataset.columns.filter((c) => c.type === 'string');
    const dateCol = selectedDataset.columns.find((c) => c.type === 'date');

    let y = 20;

    // Title
    doc.setFillColor(30, 58, 95);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('DataProofAI — Analytics Report', 14, 15);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Dataset: ${selectedDataset.name}`, 14, 22);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 27);

    y = 40;
    doc.setTextColor(0, 0, 0);

    if (selectedSections.includes('summary')) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Executive Summary', 14, y);
      y += 7;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`This report covers ${selectedDataset.rows.length.toLocaleString()} records across ${selectedDataset.column_count} columns.`, 14, y);
      y += 6;
      doc.text(`Overall data health score: ${quality.overallScore}/100`, 14, y);
      y += 6;
      doc.text(`Verified proofs in workspace: ${proofs.filter((p) => p.match).length}`, 14, y);
      y += 12;
    }

    if (selectedSections.includes('kpi') && numericCols.length > 0) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('KPI Overview', 14, y);
      y += 5;
      const kpiData = numericCols.map((col) => {
        const values = selectedDataset.rows.map((r) => Number(r[col.name])).filter((v) => !isNaN(v));
        const total = values.reduce((a, b) => a + b, 0);
        const avg = values.length > 0 ? total / values.length : 0;
        return [col.name, total.toLocaleString('en-IN'), avg.toFixed(2), Math.max(...values).toLocaleString('en-IN')];
      });
      autoTable(doc, {
        head: [['Metric', 'Total', 'Average', 'Max']],
        body: kpiData as string[][],
        startY: y,
        theme: 'striped',
        headStyles: { fillColor: [37, 99, 235] },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
    }

    if (selectedSections.includes('charts') && stringCols.length > 0 && numericCols.length > 0) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(`Top ${stringCols[0].name} by ${numericCols[0].name}`, 14, y);
      y += 5;
      const groupData = computeGroupAggregation(selectedDataset.rows, stringCols[0].name, numericCols[0].name, 'SUM').slice(0, 10);
      autoTable(doc, {
        head: [[stringCols[0].name, numericCols[0].name]],
        body: groupData.map((g) => [g.label, g.value.toLocaleString('en-IN')]),
        startY: y,
        theme: 'striped',
        headStyles: { fillColor: [37, 99, 235] },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
    }

    if (selectedSections.includes('quality')) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Data Quality', 14, y);
      y += 5;
      autoTable(doc, {
        head: [['Metric', 'Score']],
        body: [
          ['Completeness', `${quality.completeness}%`],
          ['Validity', `${quality.validity}%`],
          ['Consistency', `${quality.consistency}%`],
          ['Uniqueness', `${quality.uniqueness}%`],
          ['Freshness', `${quality.freshness}%`],
          ['Overall', `${quality.overallScore}/100`],
        ],
        startY: y,
        theme: 'striped',
        headStyles: { fillColor: [37, 99, 235] },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;

      if (quality.issues.length > 0) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Issues Detected', 14, y);
        y += 5;
        autoTable(doc, {
          head: [['Severity', 'Issue']],
          body: quality.issues.map((i) => [i.severity, i.description]),
          startY: y,
          theme: 'striped',
          headStyles: { fillColor: [245, 158, 11] },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
      }
    }

    if (selectedSections.includes('verification') && proofs.length > 0) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Verification & Proofs', 14, y);
      y += 5;
      autoTable(doc, {
        head: [['Proof ID', 'Question', 'Answer', 'Status']],
        body: proofs.slice(0, 10).map((p) => [p.proof_id_serial, p.question.slice(0, 40), p.answer, p.match ? 'VERIFIED' : 'FAILED']),
        startY: y,
        theme: 'striped',
        headStyles: { fillColor: [16, 185, 129] },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
    }

    if (selectedSections.includes('sources')) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Sources & Lineage', 14, y);
      y += 7;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Source: ${selectedDataset.name}`, 14, y); y += 6;
      doc.text(`Rows: ${selectedDataset.rows.length.toLocaleString()}`, 14, y); y += 6;
      doc.text(`Columns: ${selectedDataset.columns.length}`, 14, y); y += 6;
      if (dateCol) {
        const trend = computeTimeSeries(selectedDataset.rows, dateCol.name, numericCols[0]?.name || '', 'SUM');
        if (trend.length > 0) {
          doc.text(`Date range: ${trend[0].date} to ${trend[trend.length - 1].date}`, 14, y); y += 6;
        }
      }
    }

    doc.save(`DataProofAI_Report_${selectedDataset.name}.pdf`);

    // Save report record
    const { data } = await supabase.from('reports').insert({
      user_id: user?.id,
      title: `Analytics Report — ${selectedDataset.name}`,
      report_type: 'pdf',
      sections: selectedSections,
      proof_ids: proofs.map((p) => p.id),
    }).select().single();

    if (data) {
      setReports((prev) => [{ id: data.id, title: data.title, report_type: data.report_type, created_at: data.created_at }, ...prev]);
    }
    await addLog('Generated PDF report', 'report', { dataset: selectedDataset.name });
    toast({ title: 'PDF report generated', description: `Report for ${selectedDataset.name} downloaded successfully.` });
    setGenerating(false);
  };

  const generateExcel = async () => {
    if (!selectedDataset) return;
    setGenerating(true);
    await new Promise((r) => setTimeout(r, 500));

    const quality = computeDataQuality(selectedDataset.columns, selectedDataset.rows);
    const numericCols = selectedDataset.columns.filter((c) => c.type === 'number' || c.type === 'currency');

    // Summary sheet
    const summaryData = [
      ['DataProofAI — Analytics Report'],
      ['Dataset', selectedDataset.name],
      ['Rows', selectedDataset.rows.length],
      ['Columns', selectedDataset.column_count],
      ['Generated', new Date().toLocaleString()],
      [],
      ['Data Quality'],
      ['Completeness', `${quality.completeness}%`],
      ['Validity', `${quality.validity}%`],
      ['Consistency', `${quality.consistency}%`],
      ['Uniqueness', `${quality.uniqueness}%`],
      ['Freshness', `${quality.freshness}%`],
      ['Overall Score', `${quality.overallScore}/100`],
    ];

    // KPI sheet
    const kpiData: (string | number)[][] = [['Metric', 'Total', 'Average', 'Max', 'Min']];
    for (const col of numericCols) {
      const values = selectedDataset.rows.map((r) => Number(r[col.name])).filter((v) => !isNaN(v));
      kpiData.push([
        col.name,
        values.reduce((a, b) => a + b, 0),
        values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0,
        Math.max(...values),
        Math.min(...values),
      ]);
    }

    // Source data sheet (first 1000 rows)
    const sourceData = selectedDataset.rows.slice(0, 1000).map((r) => {
      const row: Record<string, string | number> = {};
      for (const col of selectedDataset.columns) {
        row[col.name] = r[col.name] === null ? '' : (r[col.name] as string | number);
      }
      return row;
    });

    // Verification sheet
    const verifyData: (string | boolean)[][] = [['Proof ID', 'Question', 'Answer', 'Verified']];
    for (const p of proofs.slice(0, 20)) {
      verifyData.push([p.proof_id_serial, p.question, p.answer, p.match]);
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kpiData), 'Verified Results');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sourceData), 'Source Data');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(verifyData), 'Verification');

    XLSX.writeFile(wb, `DataProofAI_Report_${selectedDataset.name}.xlsx`);

    const { data } = await supabase.from('reports').insert({
      user_id: user?.id,
      title: `Excel Report — ${selectedDataset.name}`,
      report_type: 'excel',
      sections: selectedSections,
      proof_ids: proofs.map((p) => p.id),
    }).select().single();

    if (data) {
      setReports((prev) => [{ id: data.id, title: data.title, report_type: data.report_type, created_at: data.created_at }, ...prev]);
    }
    await addLog('Generated Excel report', 'report', { dataset: selectedDataset.name });
    toast({ title: 'Excel report generated', description: `Excel file for ${selectedDataset.name} downloaded successfully.` });
    setGenerating(false);
  };

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="mt-1 text-sm text-slate-500">Generate real PDF and Excel reports from your verified data</p>
      </div>

      {/* Report Builder */}
      <Card className="mb-6 border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg">Report Builder</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <label className="text-sm font-semibold text-slate-900">Select Dataset</label>
            <select
              value={selectedDatasetId}
              onChange={(e) => setSelectedDatasetId(e.target.value)}
              className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select a dataset...</option>
              {availableDatasets.map((ds) => (
                <option key={ds.id} value={ds.id}>{ds.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Report Sections</label>
            <p className="text-xs text-slate-500 mt-0.5">Choose what appears in your report</p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {REPORT_SECTIONS.map((section) => (
                <label key={section.id} className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer ${selectedSections.includes(section.id) ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`}>
                  <Checkbox
                    checked={selectedSections.includes(section.id)}
                    onCheckedChange={() => toggleSection(section.id)}
                  />
                  <span className="text-sm text-slate-700">{section.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={generatePDF}
              disabled={!selectedDatasetId || generating}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              <span className="ml-2">Generate PDF</span>
            </Button>
            <Button
              onClick={generateExcel}
              disabled={!selectedDatasetId || generating}
              variant="outline"
              className="flex-1"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              <span className="ml-2">Export Excel</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report History */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg">Report History</CardTitle>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">No reports generated yet</div>
          ) : (
            <div className="space-y-2">
              {reports.map((report) => (
                <div key={report.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                      {report.report_type === 'pdf' ? <FileText className="h-4 w-4 text-red-600" /> : <FileSpreadsheet className="h-4 w-4 text-emerald-600" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{report.title}</p>
                      <p className="text-xs text-slate-500">{new Date(report.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="uppercase">{report.report_type}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Export types info */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { icon: FileText, label: 'PDF Report', desc: 'Full formatted report with charts and tables' },
          { icon: FileSpreadsheet, label: 'Excel Export', desc: 'Multi-sheet workbook with verified data' },
          { icon: QrIcon, label: 'QR Proof', desc: 'Available on every proof passport page' },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-slate-200 p-4">
            <item.icon className="h-5 w-5 text-blue-600" />
            <p className="mt-2 text-sm font-semibold text-slate-900">{item.label}</p>
            <p className="text-xs text-slate-500">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
