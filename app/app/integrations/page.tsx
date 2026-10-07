'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plug, FileSpreadsheet, BarChart3, Cloud, Database, Code2, Link2, AlertCircle } from 'lucide-react';

export default function IntegrationsPage() {
  const integrations = [
    { name: 'Google Sheets', icon: FileSpreadsheet, status: 'requires_auth', desc: 'Connect to sync verified data to Google Sheets' },
    { name: 'Excel', icon: FileSpreadsheet, status: 'available', desc: 'Import and export XLSX files with verified data' },
    { name: 'Power BI', icon: BarChart3, status: 'requires_auth', desc: 'Export verified data and validate dashboard values' },
    { name: 'Google Drive', icon: Cloud, status: 'requires_auth', desc: 'Connect to access files from Google Drive' },
    { name: 'OneDrive', icon: Cloud, status: 'requires_auth', desc: 'Connect to access files from OneDrive' },
    { name: 'API / Developer Playground', icon: Code2, status: 'available', desc: 'REST API for analyze, verify, and proof endpoints' },
  ];

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Integrations</h1>
        <p className="mt-1 text-sm text-slate-500">Connect external data sources and export verified results</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {integrations.map((integration) => (
          <Card key={integration.name} className="border-slate-200">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                  <integration.icon className="h-5 w-5 text-slate-600" />
                </div>
                {integration.status === 'requires_auth' ? (
                  <Badge variant="outline" className="text-amber-600 border-amber-300">Connection required</Badge>
                ) : integration.status === 'connected' ? (
                  <Badge variant="default" className="bg-emerald-600">Connected</Badge>
                ) : (
                  <Badge variant="secondary">Available</Badge>
                )}
              </div>
              <h3 className="mt-3 text-sm font-semibold text-slate-900">{integration.name}</h3>
              <p className="mt-1 text-xs text-slate-500">{integration.desc}</p>
              <Button
                variant={integration.status === 'requires_auth' ? 'outline' : 'default'}
                size="sm"
                className="mt-3 w-full"
                disabled={integration.status === 'requires_auth'}
              >
                {integration.status === 'requires_auth' ? (
                  <><Link2 className="h-3 w-3" /> Connect your account</>
                ) : integration.status === 'connected' ? (
                  'Configure'
                ) : (
                  'Open'
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6 border-amber-200 bg-amber-50">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-800">
              External integrations require authentication credentials. DataProofAI will never simulate a successful connection.
              When credentials are configured, the connection status updates automatically.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Sync Center */}
      <Card className="mt-6 border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg">Sync Center</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center">
            <Database className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">No active sync jobs. Connect an integration to start syncing.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
