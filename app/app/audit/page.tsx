'use client';

import { useAuditLog } from '@/lib/hooks';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Activity, Search, Loader2 } from 'lucide-react';
import { useState } from 'react';

export default function AuditLogPage() {
  const { logs, loading } = useAuditLog();
  const [search, setSearch] = useState('');

  const filtered = logs.filter((log) =>
    log.action.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Audit Log</h1>
        <p className="mt-1 text-sm text-slate-500">{logs.length} events tracked</p>
      </div>

      <Input
        placeholder="Search audit events..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 max-w-md"
      />

      {filtered.length === 0 ? (
        <Card className="border-dashed border-slate-300">
          <CardContent className="flex flex-col items-center py-16">
            <Activity className="h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">No audit events yet</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-200">
          <CardContent className="p-0">
            <div className="divide-y divide-slate-50">
              {filtered.map((log) => (
                <div key={log.id} className="flex items-center gap-4 p-4 hover:bg-slate-50">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 flex-shrink-0">
                    <Activity className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{log.action}</p>
                    {log.entity_type && (
                      <Badge variant="outline" className="mt-0.5 text-xs">{log.entity_type}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 flex-shrink-0">
                    {new Date(log.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
