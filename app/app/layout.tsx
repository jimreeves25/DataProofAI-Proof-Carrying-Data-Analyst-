'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Logo, LogoMark } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { CommandPalette } from '@/components/command-palette';
import { supabase } from '@/lib/supabase';
import {
  LayoutDashboard, Database, BarChart3, FileSearch, ShieldCheck,
  FileText, Plug, Zap, Users, Activity, Shield, HelpCircle,
  Settings, LogOut, Menu, X, Search, Bell, ScanLine, Plus,
  ChevronDown, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navGroups = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', href: '/app/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Data',
    items: [
      { label: 'Data Sources', href: '/app/data', icon: Database },
      { label: 'ProofScan', href: '/app/scan', icon: ScanLine },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { label: 'New Analysis', href: '/app/analysis/new', icon: FileSearch },
      { label: 'Assistant', href: '/app/assistant', icon: Sparkles },
      { label: 'History', href: '/app/analysis/history', icon: Activity },
    ],
  },
  {
    label: 'Verification',
    items: [
      { label: 'Verification Center', href: '/app/verification', icon: ShieldCheck },
      { label: 'Proofs', href: '/app/proofs', icon: Shield },
    ],
  },
  {
    label: 'Reports',
    items: [
      { label: 'Reports', href: '/app/reports', icon: FileText },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { label: 'Analytics Studio', href: '/app/analytics', icon: BarChart3 },
      { label: 'Integrations', href: '/app/integrations', icon: Plug },
      { label: 'Automation', href: '/app/automation', icon: Zap },
      { label: 'Trust Center', href: '/app/trust', icon: Shield },
      { label: 'Audit Log', href: '/app/audit', icon: Activity },
      { label: 'Settings', href: '/app/settings', icon: Settings },
    ],
  },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, signOut, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [notifications, setNotifications] = useState<{ id: string; title: string; read: boolean }[]>([]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (user) {
      supabase
        .from('notifications')
        .select('id, title, read')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10)
        .then(({ data }) => {
          if (data) setNotifications(data as { id: string; title: string; read: boolean }[]);
        });
    }
  }, [user]);

  // Keyboard shortcut for command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="animate-pulse">
          <LogoMark size={48} />
        </div>
      </div>
    );
  }

  if (!user) return null;

  const initials = (profile?.full_name || user.email || 'U')
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-slate-900 text-slate-300 transition-transform lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-800 px-4">
          <Link href="/app/dashboard" className="flex items-center">
            <Logo variant="light" size={28} />
          </Link>
          <button
            className="text-slate-400 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
          {navGroups.map((group) => (
            <div key={group.label} className="mb-4">
              <div className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href || (item.href !== '/app/dashboard' && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        active
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                      )}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-800 p-3">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2">
            <Avatar className="h-8 w-8 border border-slate-700">
              <AvatarFallback className="bg-slate-700 text-xs text-white">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 truncate">
              <div className="truncate text-sm font-medium text-white">{profile?.full_name || 'User'}</div>
              <div className="truncate text-xs text-slate-500">{profile?.organization || user.email}</div>
            </div>
            <button onClick={handleSignOut} className="text-slate-400 hover:text-white">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              className="text-slate-500 lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <button
              onClick={() => setCommandOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-100"
            >
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Search...</span>
              <kbd className="hidden rounded border border-slate-300 bg-white px-1.5 text-xs font-mono sm:inline">⌘K</kbd>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/app/analysis/new">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">New Analysis</span>
              </Button>
            </Link>
            <div className="relative">
              <button className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
                )}
              </button>
            </div>
            <Avatar className="h-8 w-8 border border-slate-200">
              <AvatarFallback className="bg-blue-600 text-xs text-white">{initials}</AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto scrollbar-thin">{children}</main>
      </div>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  );
}
