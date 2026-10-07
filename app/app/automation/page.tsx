'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Zap, Bell, Plus, Clock, TrendingDown, AlertTriangle } from 'lucide-react';

export default function AutomationPage() {
  const [schedules, setSchedules] = useState<{ name: string; frequency: string; enabled: boolean }[]>([]);
  const [alerts, setAlerts] = useState<{ condition: string; action: string; enabled: boolean }[]>([]);

  return (
    <div className="p-4 lg:p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Automation</h1>
        <p className="mt-1 text-sm text-slate-500">Schedule analyses, configure alerts, and manage sync jobs</p>
      </div>

      {/* Scheduled Analysis */}
      <Card className="mb-6 border-slate-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg"><Zap className="h-5 w-5 text-blue-600" /> Scheduled Analysis</CardTitle>
            <Button size="sm" variant="outline"><Plus className="h-4 w-4" /> New Schedule</Button>
          </div>
        </CardHeader>
        <CardContent>
          {schedules.length === 0 ? (
            <div className="py-8 text-center">
              <Clock className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">No scheduled analyses configured</p>
              <p className="text-xs text-slate-400">Automate recurring analyses — daily, weekly, or monthly</p>
            </div>
          ) : (
            <div className="space-y-2">
              {schedules.map((s, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{s.name}</p>
                    <p className="text-xs text-slate-500">{s.frequency}</p>
                  </div>
                  <Badge variant={s.enabled ? 'default' : 'secondary'}>{s.enabled ? 'Active' : 'Paused'}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alerts */}
      <Card className="mb-6 border-slate-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg"><Bell className="h-5 w-5 text-blue-600" /> Alerts</CardTitle>
            <Button size="sm" variant="outline"><Plus className="h-4 w-4" /> New Alert</Button>
          </div>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <div className="py-8 text-center">
              <TrendingDown className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">No alerts configured</p>
              <p className="text-xs text-slate-400">e.g., "If revenue decreases &gt; 10%, notify and generate analysis"</p>
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map((a, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">IF {a.condition}</p>
                    <p className="text-xs text-slate-500">THEN: {a.action}</p>
                  </div>
                  <Badge variant={a.enabled ? 'default' : 'secondary'}>{a.enabled ? 'Active' : 'Paused'}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Example */}
      <Card className="border-slate-200 bg-slate-50">
        <CardContent className="p-4">
          <p className="text-xs font-medium text-slate-500">Example automation</p>
          <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <p className="font-semibold text-slate-900">Monthly Revenue Report</p>
            <p className="text-xs text-slate-500 mt-1">Run: Every Monday, 9:00 AM</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="secondary" className="text-xs">Generate PDF</Badge>
              <Badge variant="secondary" className="text-xs">Update Google Sheets</Badge>
              <Badge variant="secondary" className="text-xs">Update Power BI</Badge>
              <Badge variant="secondary" className="text-xs">Email Report</Badge>
              <Badge variant="secondary" className="text-xs">Verification Required</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
