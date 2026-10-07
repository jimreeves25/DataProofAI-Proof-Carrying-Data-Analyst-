'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useProofs } from '@/lib/hooks';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Shield, CheckCircle2, AlertTriangle, ArrowRight, Search, Loader2, Plus } from 'lucide-react';

export default function ProofsListPage() {
  const { proofs, loading } = useProofs();
  const [search, setSearch] = useState('');

  const filtered = proofs.filter((p) =>
    p.question.toLowerCase().includes(search.toLowerCase()) ||
    p.proof_id_serial.toLowerCase().includes(search.toLowerCase())
  );

  const verifiedCount = proofs.filter((p) => p.match).length;
  const failedCount = proofs.filter((p) => !p.match).length;

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Proofs</h1>
          <p className="mt-1 text-sm text-slate-500">
            {proofs.length} total · {verifiedCount} verified · {failedCount} failed
          </p>
        </div>
        <Link href="/app/verification">
          <Button className="bg-blue-600 hover:bg-blue-700"><Plus className="h-4 w-4" /><span className="ml-1">Prove a Result</span></Button>
        </Link>
      </div>

      <Input
        placeholder="Search proofs by question or proof ID..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 max-w-md"
      />

      {filtered.length === 0 ? (
        <Card className="border-dashed border-slate-300">
          <CardContent className="flex flex-col items-center py-16">
            <Shield className="h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">No proofs yet. Run an analysis or prove a result to generate proof passports.</p>
            <Link href="/app/analysis/new" className="mt-4">
              <Button className="bg-blue-600 hover:bg-blue-700">Start Analysis</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((proof) => (
            <Link key={proof.id} href={`/app/proofs/${proof.id}`}>
              <Card className="group border-slate-200 transition-all hover:border-blue-300 hover:shadow-md">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${proof.match ? 'bg-emerald-50' : 'bg-red-50'}`}>
                      {proof.match ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-red-600" />}
                    </div>
                    <p className="text-xs font-mono font-bold text-blue-600">{proof.proof_id_serial}</p>
                  </div>
                  <p className="mt-3 text-sm font-medium text-slate-900 line-clamp-2">{proof.question}</p>
                  <p className="mt-1 text-xs text-slate-500">{new Date(proof.created_at).toLocaleString()}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <Badge variant={proof.match ? 'default' : 'destructive'} className="text-xs">
                      {proof.match ? 'VERIFIED' : 'FAILED'}
                    </Badge>
                    <span className="text-sm font-bold text-slate-900">{proof.answer}</span>
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
