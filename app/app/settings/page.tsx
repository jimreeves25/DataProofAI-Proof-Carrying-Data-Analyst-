'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { User, Lock, Bell, Plug, Shield, Trash2, Save } from 'lucide-react';

export default function SettingsPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [organization, setOrganization] = useState(profile?.organization || '');
  const [role, setRole] = useState(profile?.role || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName, organization, role, updated_at: new Date().toISOString() })
      .eq('id', user?.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    } else {
      await refreshProfile();
      toast({ title: 'Profile updated', description: 'Your settings have been saved.' });
    }
  };

  return (
    <div className="p-4 lg:p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your profile, security, and preferences</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="mb-4">
          <TabsTrigger value="profile"><User className="mr-1 h-4 w-4" />Profile</TabsTrigger>
          <TabsTrigger value="security"><Lock className="mr-1 h-4 w-4" />Security</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="mr-1 h-4 w-4" />Notifications</TabsTrigger>
          <TabsTrigger value="connected"><Plug className="mr-1 h-4 w-4" />Connected Apps</TabsTrigger>
          <TabsTrigger value="privacy"><Shield className="mr-1 h-4 w-4" />Data & Privacy</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card className="border-slate-200">
            <CardHeader><CardTitle className="text-lg">Profile</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={user?.email || ''} disabled />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Organization</Label>
                  <Input value={organization} onChange={(e) => setOrganization(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <select value={role} onChange={(e) => setRole(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option>Analyst</option>
                    <option>Reviewer</option>
                    <option>Owner</option>
                    <option>Viewer</option>
                  </select>
                </div>
              </div>
              <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                <Save className="h-4 w-4" /><span className="ml-2">Save Changes</span>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card className="border-slate-200">
            <CardHeader><CardTitle className="text-lg">Security</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Password</p>
                    <p className="text-xs text-slate-500">Last changed: N/A</p>
                  </div>
                  <Button variant="outline" size="sm">Change Password</Button>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Two-Factor Authentication</p>
                    <p className="text-xs text-slate-500">Add an extra layer of security</p>
                  </div>
                  <Badge variant="secondary">Not configured</Badge>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Active Sessions</p>
                    <p className="text-xs text-slate-500">Current session is active</p>
                  </div>
                  <Badge variant="default" className="bg-emerald-600">Active</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card className="border-slate-200">
            <CardHeader><CardTitle className="text-lg">Notifications</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {['Analysis completed', 'Verification passed', 'Verification failed', 'Data quality issues', 'New proof generated', 'Report ready'].map((item) => (
                <div key={item} className="flex items-center justify-between border-b border-slate-100 py-2">
                  <span className="text-sm text-slate-700">{item}</span>
                  <Badge variant="secondary">Email + In-app</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="connected">
          <Card className="border-slate-200">
            <CardHeader><CardTitle className="text-lg">Connected Apps</CardTitle></CardHeader>
            <CardContent>
              <div className="py-8 text-center">
                <Plug className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm text-slate-500">No apps connected yet</p>
                <p className="text-xs text-slate-400">Connect Google Sheets, Power BI, and more from the Integrations page</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="privacy">
          <Card className="border-slate-200">
            <CardHeader><CardTitle className="text-lg">Data & Privacy</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-sm font-medium text-slate-900">Your Data</p>
                <p className="mt-1 text-xs text-slate-500">All your datasets, analyses, and proofs are stored securely in your workspace.</p>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <div className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4 text-red-600" />
                  <p className="text-sm font-medium text-red-900">Danger Zone</p>
                </div>
                <p className="mt-1 text-xs text-red-700">Delete all datasets and analysis history. This action cannot be undone.</p>
                <Button variant="destructive" size="sm" className="mt-3" disabled>Delete All Data</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
