'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import {
  Shield, ShieldCheck, FileSearch, BarChart3, Camera, FileCheck,
  CheckCircle2, ArrowRight, Database, GitBranch, Eye, Zap, Lock, Code2,
  TrendingUp, AlertTriangle, Sparkles, ChevronRight,
} from 'lucide-react';

export default function LandingPage() {
  const router = useRouter();
  const [hoveredFeature, setHoveredFeature] = useState<number | null>(null);

  const features = [
    { icon: FileSearch, title: 'Real Analytics, Not Hallucinations', desc: 'Ask questions in plain English. Real code calculates real answers from your actual data — never fabricated.' },
    { icon: ShieldCheck, title: 'Independent Verification', desc: 'Every calculation runs through two different computation paths. Only matching results get the VERIFIED stamp.' },
    { icon: FileCheck, title: 'Proof Passport', desc: 'Every verified result gets a proof ID, evidence chain, and full reproducibility — traceable from question to answer.' },
    { icon: Camera, title: 'ProofScan', desc: 'Scan paper receipts, tables, and documents with your camera. Extract structured data, verify totals, and start analyzing.' },
    { icon: GitBranch, title: 'Data Lineage', desc: 'See exactly where every number comes from — source, filter, calculation, verification — at every step.' },
    { icon: TrendingUp, title: 'Analytics Studio', desc: 'Trends, comparisons, distributions, correlations, anomalies, root cause analysis — all computed from your real data.' },
  ];

  const verificationSteps = [
    { icon: Eye, label: 'Interpretation', desc: 'Question parsed correctly' },
    { icon: Database, label: 'Data Quality', desc: 'Source data validated' },
    { icon: Code2, label: 'Calculation', desc: 'Primary computation runs' },
    { icon: Shield, label: 'Independent Check', desc: 'Second code path verifies' },
    { icon: GitBranch, label: 'Source Consistency', desc: 'Data provenance confirmed' },
    { icon: CheckCircle2, label: 'Reproducible', desc: 'Result can be replayed' },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Logo size={36} />
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link href="/signup">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                Get Started
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-50 via-white to-white" />
        <div className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-blue-200/20 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-700">
              <Shield className="h-4 w-4" />
              HNX26PSI08 — Proof-Carrying Data Analyst
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl text-balance">
              AI Analytics <span className="text-blue-600">You Can Prove</span>
            </h1>
            <p className="mt-6 text-lg text-slate-600 sm:text-xl text-balance">
              Ask questions in plain English. Get answers calculated from your real data —
              independently verified, fully traceable, and backed by a proof you can reproduce.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-slate-500">
              <span className="flex items-center gap-1"><Zap className="h-4 w-4 text-blue-500" /> Ask</span>
              <ChevronRight className="h-3 w-3" />
              <span className="flex items-center gap-1"><BarChart3 className="h-4 w-4 text-blue-500" /> Analyze</span>
              <ChevronRight className="h-3 w-3" />
              <span className="flex items-center gap-1"><Shield className="h-4 w-4 text-blue-500" /> Verify</span>
              <ChevronRight className="h-3 w-3" />
              <span className="flex items-center gap-1"><FileCheck className="h-4 w-4 text-emerald-500" /> Prove</span>
            </div>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                size="lg"
                className="w-full bg-blue-600 hover:bg-blue-700 sm:w-auto"
                onClick={() => router.push('/signup')}
              >
                Start Analyzing Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => router.push('/login')}
              >
                View Demo
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Verification Pipeline */}
      <section className="border-y border-slate-200 bg-slate-50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-slate-900">The Verification Layer</h2>
            <p className="mt-3 text-slate-600">
              DataProofAI does not present an answer as verified unless it can reproduce and validate the calculation.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {verificationSteps.map((step, i) => (
              <div
                key={i}
                className="group flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                  <step.icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400">0{i + 1}</span>
                    <h3 className="font-semibold text-slate-900">{step.label}</h3>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-slate-900">Built for serious analytics</h2>
            <p className="mt-3 text-slate-600">
              Not a chatbot with charts. An enterprise analytics platform with an intelligent verification engine.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, i) => (
              <div
                key={i}
                className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 transition-all hover:border-blue-200 hover:shadow-lg"
                onMouseEnter={() => setHoveredFeature(i)}
                onMouseLeave={() => setHoveredFeature(null)}
              >
                <div className={`absolute -right-8 -top-8 h-24 w-24 rounded-full bg-blue-50 transition-transform ${hoveredFeature === i ? 'scale-150' : 'scale-100'}`} />
                <div className="relative">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white">
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-slate-900">{feature.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Smart Refusal Section */}
      <section className="bg-slate-900 py-20 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-sm font-medium text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                Smart Refusal
              </div>
              <h2 className="mt-4 text-3xl font-bold">When data can't support an answer, we refuse</h2>
              <p className="mt-4 text-slate-300">
                Most AI tools guess. DataProofAI refuses rather than fabricating. If currencies conflict, data is missing, or evidence is insufficient — you get a clear explanation of what's needed, not a hallucinated number.
              </p>
              <div className="mt-6 space-y-3">
                {['No data? No problem — we tell you what to connect', 'Currency conflicts? We flag them before combining', 'Ambiguous question? We ask for clarification', 'Contradictory sources? We surface the conflict'].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-slate-200">
                    <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-400" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-800 p-6 font-mono text-sm">
              <div className="flex items-center gap-2 text-amber-400">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-semibold">CANNOT VERIFY</span>
              </div>
              <div className="mt-4 space-y-2 text-slate-300">
                <p>Revenue contains:</p>
                <p className="pl-4">INR</p>
                <p className="pl-4">USD</p>
                <p className="pl-4">EUR</p>
                <p className="mt-3">No exchange-rate information found.</p>
                <p>Combining these would produce an unreliable result.</p>
              </div>
              <div className="mt-4 flex gap-2">
                <span className="rounded-md border border-slate-600 px-3 py-1 text-xs text-slate-300">Resolve Issue</span>
                <span className="rounded-md border border-slate-600 px-3 py-1 text-xs text-slate-300">Analyze INR Only</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-gradient-to-br from-blue-600 to-blue-800 p-12 text-white">
            <Sparkles className="mx-auto h-10 w-10 text-blue-200" />
            <h2 className="mt-4 text-3xl font-bold">Start proving your analytics</h2>
            <p className="mt-3 text-blue-100">
              Upload a CSV, ask a question, and watch the verification engine work.
            </p>
            <Button
              size="lg"
              className="mt-8 bg-white text-blue-600 hover:bg-blue-50"
              onClick={() => router.push('/signup')}
            >
              Create Free Account
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
          <Logo size={28} />
          <p className="text-sm text-slate-500">
            Don't make the AI sound intelligent. Make the system behave intelligently.
          </p>
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <Lock className="h-4 w-4" />
            <span>Secure · Verified · Reproducible</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
