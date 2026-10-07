'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAnalyses } from '@/lib/hooks';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { FileSearch, ArrowRight, Plus, Loader2 } from 'lucide-react';

export default function AnalysisHistoryPage() {
  const { analyses, loading } = useAnalyses();
  const [search, setSearch] = useState('');

  const filtered = analyses.filter((a) =>
    a.question.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analysis History</h1>
          <p className="mt-1 text-sm text-slate-500">{analyses.length} total analyses</p>
        </div>
        <Link href="/app/analysis/new">
          <Button className="bg-blue-600 hover:bg-blue-700"><Plus className="h-4 w-4" /><span className="ml-1">New Analysis</span></Button>
        </Link>
      </div>

      <Input
        placeholder="Search analyses..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 max-w-md"
      />

      {filtered.length === 0 ? (
        <Card className="border-dashed border-slate-300">
          <CardContent className="flex flex-col items-center py-16">
            <FileSearch className="h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">No analyses yet</p>
            <Link href="/app/analysis/new" className="mt-4">
              <Button className="bg-blue-600 hover:bg-blue-700">Start your first analysis</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((analysis) => (
            <Link key={analysis.id} href={`/app/analysis/${analysis.id}`}>
              <Card className="group border-slate-200 transition-all hover:border-blue-300 hover:shadow-md">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 flex-shrink-0">
                      <FileSearch className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{analysis.question}</p>
                      <p className="text-xs text-slate-500">{new Date(analysis.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <Badge variant={analysis.status === 'verified' ? 'default' : analysis.status === 'cannot_verify' ? 'secondary' : 'destructive'}>
                      {analysis.status}
                    </Badge>
                    <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
