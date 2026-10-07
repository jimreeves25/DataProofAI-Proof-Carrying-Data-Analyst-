'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Mail, Lock, User, Building2, ArrowRight } from 'lucide-react';

export default function SignupPage() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [organization, setOrganization] = useState('');
  const [role, setRole] = useState('Analyst');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const passwordChecks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /\d/.test(password),
    match: password === confirmPassword && password.length > 0,
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!passwordChecks.length || !passwordChecks.uppercase || !passwordChecks.number) {
      setError('Password must be at least 8 characters with an uppercase letter and a number');
      return;
    }
    if (!passwordChecks.match) {
      setError('Passwords do not match');
      return;
    }
    if (!acceptTerms) {
      setError('Please accept the Terms of Service to continue');
      return;
    }

    setLoading(true);
    const { error: signUpError } = await signUp(email, password, fullName, organization, role);
    setLoading(false);

    if (signUpError) {
      setError(signUpError);
    } else {
      router.push('/app/dashboard');
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 lg:flex-row">
      <div className="flex flex-1 flex-col justify-between bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-8 text-white lg:p-12">
        <Link href="/" className="flex items-center">
          <Logo variant="light" size={36} />
        </Link>
        <div className="hidden lg:block">
          <h2 className="text-3xl font-bold leading-tight">
            Join the verification layer.
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            Start analyzing your data with proof-carrying analytics. Every result verified, traceable, and reproducible.
          </p>
        </div>
        <div className="text-sm text-slate-400">
          Ask. Analyze. Verify. Prove.
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-y-auto p-6 lg:p-12">
        <Card className="w-full max-w-md border-slate-200 shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl">Create your account</CardTitle>
            <CardDescription>Start proving your analytics in minutes</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input id="fullName" placeholder="John Doe" value={fullName} onChange={(e) => setFullName(e.target.value)} className="pl-9" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input id="email" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="organization">Organization</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input id="organization" placeholder="Acme Inc." value={organization} onChange={(e) => setOrganization(e.target.value)} className="pl-9" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <select
                    id="role"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option>Analyst</option>
                    <option>Reviewer</option>
                    <option>Owner</option>
                    <option>Viewer</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9" required />
                </div>
                {password.length > 0 && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className={passwordChecks.length ? 'text-emerald-600' : 'text-slate-400'}>8+ chars</span>
                    <span className={passwordChecks.uppercase ? 'text-emerald-600' : 'text-slate-400'}>Uppercase</span>
                    <span className={passwordChecks.number ? 'text-emerald-600' : 'text-slate-400'}>Number</span>
                    <span className={passwordChecks.match ? 'text-emerald-600' : 'text-slate-400'}>Match</span>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input id="confirmPassword" type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="pl-9" required />
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox id="terms" checked={acceptTerms} onCheckedChange={(checked) => setAcceptTerms(checked === true)} />
                <label htmlFor="terms" className="text-sm text-slate-600">
                  I accept the Terms of Service and Privacy Policy
                </label>
              </div>
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading}>
                {loading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating account...</>
                ) : (
                  <>Create Account <ArrowRight className="ml-2 h-4 w-4" /></>
                )}
              </Button>
              <div className="text-center text-sm text-slate-600">
                Already have an account?{' '}
                <Link href="/login" className="font-medium text-blue-600 hover:underline">
                  Sign in
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
