'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import {
  LayoutDashboard, Database, FileSearch, ShieldCheck, Shield,
  FileText, BarChart3, ScanLine, Settings, Plus, Upload,
  Activity, Plug, Zap, Search, ArrowRight,
} from 'lucide-react';

const commands = [
  { label: 'Go to Dashboard', href: '/app/dashboard', icon: LayoutDashboard, group: 'Navigation' },
  { label: 'Upload Data', href: '/app/data', icon: Upload, group: 'Actions' },
  { label: 'New Analysis', href: '/app/analysis/new', icon: Plus, group: 'Actions' },
  { label: 'Scan Paper Data', href: '/app/scan', icon: ScanLine, group: 'Actions' },
  { label: 'Ask DataProof Assistant', href: '/app/assistant', icon: Search, group: 'Actions' },
  { label: 'View Data Sources', href: '/app/data', icon: Database, group: 'Navigation' },
  { label: 'Analytics Studio', href: '/app/analytics', icon: BarChart3, group: 'Navigation' },
  { label: 'Verification Center', href: '/app/verification', icon: ShieldCheck, group: 'Navigation' },
  { label: 'View Proofs', href: '/app/proofs', icon: Shield, group: 'Navigation' },
  { label: 'Reports', href: '/app/reports', icon: FileText, group: 'Navigation' },
  { label: 'Integrations', href: '/app/integrations', icon: Plug, group: 'Navigation' },
  { label: 'Automation', href: '/app/automation', icon: Zap, group: 'Navigation' },
  { label: 'Audit Log', href: '/app/audit', icon: Activity, group: 'Navigation' },
  { label: 'Trust Center', href: '/app/trust', icon: Shield, group: 'Navigation' },
  { label: 'Settings', href: '/app/settings', icon: Settings, group: 'Navigation' },
  { label: 'Analysis History', href: '/app/analysis/history', icon: FileSearch, group: 'Navigation' },
];

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  const runCommand = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const groups = Array.from(new Set(commands.map((c) => c.group)));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search commands, pages, and actions..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {groups.map((group) => (
          <React.Fragment key={group}>
            <CommandGroup heading={group}>
              {commands
                .filter((c) => c.group === group)
                .map((cmd) => (
                  <CommandItem
                    key={cmd.label}
                    onSelect={() => runCommand(cmd.href)}
                    className="flex items-center gap-3"
                  >
                    <cmd.icon className="h-4 w-4 text-slate-400" />
                    <span>{cmd.label}</span>
                    <ArrowRight className="ml-auto h-3 w-3 text-slate-300" />
                  </CommandItem>
                ))}
            </CommandGroup>
            <CommandSeparator />
          </React.Fragment>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
