'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { HailLogo } from '@/app/theme-provider';
import {
  ArrowLeft, MessageSquare, Mail, Copy, Check, ChevronDown, Loader2, User, Building2,
  Code2, Briefcase, Newspaper, Rocket, LogIn, Zap, AlertCircle,
} from 'lucide-react';
import { DAILY_LIMIT, AUTH_ENABLED } from '@/lib/constants';

const GOAL_PRESETS = [
  'Summer 2025 Software Engineering Internship',
  'Full-time Software Engineer role',
  'Machine Learning / AI Engineer role',
  'Backend Engineering role',
  'Frontend Engineering role',
  'Product Engineering role',
  'Research Engineer position',
  'DevOps / Platform Engineering role',
];

interface GenerateResult {
  linkedin: string;
  email: string;
  subject: string;
  usage?: { used: number; limit: number };
  contextSignals?: {
    github: string | null;
    jobs: string[];
    phProduct: string | null;
    hnFound: boolean;
    cached: boolean;
  };
}

function OutreachContent() {
  const router      = useRouter();
  const sp          = useSearchParams();
  const companyId   = sp.get('companyId')   || '';
  const personId    = sp.get('personId')    || '';
  const companyName = sp.get('companyName') || '';
  const personName  = sp.get('personName')  || '';
  const personRole  = sp.get('personRole')  || '';

  const { data: session, status } = useSession();

  const [userGoal, setUserGoal]     = useState('');
  const [customGoal, setCustomGoal] = useState('');
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState<GenerateResult | null>(null);
  const [error, setError]           = useState('');
  const [errorType, setErrorType]   = useState<'generic' | 'daily_limit'>('generic');
  const [copiedLI, setCopiedLI]     = useState(false);
  const [copiedEM, setCopiedEM]     = useState(false);
  const [showMore, setShowMore]     = useState(false);
  const [usedToday, setUsedToday]   = useState<number | null>(null);

  const effectiveGoal = userGoal || customGoal;

  const handleGenerate = async () => {
    if (!effectiveGoal.trim()) return;
    if (AUTH_ENABLED && !session) { signIn('google'); return; }

    setLoading(true); setError(''); setResult(null);
    try {
      const res  = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, personId, userGoal: effectiveGoal.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'daily_limit') {
          setErrorType('daily_limit');
          setError(data.message || 'Daily limit reached.');
          if (data.used !== undefined) setUsedToday(data.used);
        } else {
          setErrorType('generic');
          setError(data.message || data.error || 'Generation failed.');
        }
        return;
      }
      setResult({ linkedin: data.linkedin, email: data.email, subject: data.subject, usage: data.usage, contextSignals: data.contextSignals });
      if (data.usage?.used !== undefined) setUsedToday(data.usage.used);
    } catch {
      setErrorType('generic');
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copy = async (text: string, type: 'li' | 'em') => {
    await navigator.clipboard.writeText(text);
    if (type === 'li') { setCopiedLI(true); setTimeout(() => setCopiedLI(false), 2000); }
    else               { setCopiedEM(true); setTimeout(() => setCopiedEM(false), 2000); }
  };

  if (!companyId || !personId) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--cream)' }}>
      <div className="text-center">
        <p className="text-sm text-[var(--muted)] mb-3">Missing parameters.</p>
        <button onClick={() => router.push('/')} className="btn-ghost text-sm">← Home</button>
      </div>
    </div>
  );

  const remaining = usedToday !== null ? DAILY_LIMIT - usedToday : null;
  const isExhausted = remaining !== null && remaining <= 0;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--cream)' }}>

      {/* Nav */}
      <nav className="nav sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <button onClick={() => router.back()}
            className="flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
          <span className="text-[var(--border)]">·</span>
          <HailLogo />
          <span className="text-xs text-[var(--muted)]">/ Outreach</span>

          {/* Usage pill — only shown when auth is active */}
          {AUTH_ENABLED && session && remaining !== null && (
            <span
              className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{
                background: isExhausted ? '#FEF3F0' : 'var(--cream-2)',
                color:      isExhausted ? '#8B3A2A' : 'var(--brown-2)',
                border:     `1px solid ${isExhausted ? '#F5C9BC' : 'var(--border)'}`,
              }}
            >
              <Zap className="w-3 h-3" />
              {remaining}/{DAILY_LIMIT} messages left today
            </span>
          )}
        </div>
      </nav>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">

        {/* Header */}
        <div className="mb-8 fade-up">
          <h1 className="text-2xl font-semibold text-[var(--brown-3)] mb-1">Generate your message</h1>
          <p className="text-sm text-[var(--muted)]">
            For <span className="text-[var(--brown-3)] font-medium">{personName}</span>
            {' '}at <span className="text-[var(--brown-3)] font-medium">{companyName}</span>
          </p>
        </div>

        {/* Target card */}
        <div className="surface p-5 mb-5 flex flex-col sm:flex-row gap-4 fade-up delay-1">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'var(--cream-2)', border: '1px solid var(--border)' }}>
              <User className="w-4 h-4 text-[var(--brown-1)]" />
            </div>
            <div>
              <p className="text-xs text-[var(--muted)] mb-0.5">Recipient</p>
              <p className="font-medium text-sm text-[var(--brown-3)]">{personName}</p>
              <p className="text-xs text-[var(--muted)]">{personRole}</p>
            </div>
          </div>
          <div className="w-px bg-[var(--border)] hidden sm:block" />
          <div className="flex items-center gap-3 flex-1">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'var(--cream-2)', border: '1px solid var(--border)' }}>
              <Building2 className="w-4 h-4 text-[var(--brown-1)]" />
            </div>
            <div>
              <p className="text-xs text-[var(--muted)] mb-0.5">Company</p>
              <p className="font-medium text-sm text-[var(--brown-3)]">{companyName}</p>
            </div>
          </div>
        </div>

        {/* Auth gate — only shown when auth is enabled and user is not signed in */}
        {AUTH_ENABLED && status !== 'loading' && !session ? (
          <div className="surface p-8 mb-5 text-center fade-up delay-2">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: 'var(--cream-2)', border: '1px solid var(--border)' }}>
              <LogIn className="w-5 h-5 text-[var(--brown-1)]" />
            </div>
            <h2 className="text-base font-semibold text-[var(--brown-3)] mb-2">Sign in to generate</h2>
            <p className="text-sm text-[var(--muted)] mb-5 leading-relaxed max-w-xs mx-auto">
              Free account required. You get <strong className="text-[var(--brown-2)]">5 personalized messages per day</strong> — free forever.
            </p>
            <button
              id="outreach-sign-in-btn"
              onClick={() => signIn('google')}
              className="btn-primary inline-flex items-center gap-2 px-6 py-3"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>
          </div>
        ) : (
          /* Goal selection — shown when signed in */
          <div className="surface p-6 mb-5 fade-up delay-2">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-[var(--brown-3)]">What&apos;s your goal?</p>
              {/* Remaining calls badge */}
              {remaining !== null && (
                <span
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{
                    background: isExhausted ? '#FEF3F0' : 'var(--cream-2)',
                    color:      isExhausted ? '#8B3A2A' : 'var(--brown-2)',
                    border:     `1px solid ${isExhausted ? '#F5C9BC' : 'var(--border)'}`,
                  }}
                >
                  <Zap className="w-3 h-3" />
                  {remaining} left today
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {GOAL_PRESETS.slice(0, 4).map((p) => (
                <button key={p} onClick={() => { setUserGoal(p); setCustomGoal(''); }}
                  className="text-xs px-3 py-1.5 rounded-full border transition-all"
                  style={userGoal === p
                    ? { background: 'var(--brown-3)', color: 'var(--cream)', borderColor: 'var(--brown-3)' }
                    : { background: 'var(--cream-2)', color: 'var(--brown-2)', borderColor: 'var(--border)' }}>
                  {p}
                </button>
              ))}
            </div>

            <div className="relative mb-4">
              <button onClick={() => setShowMore(!showMore)}
                className="flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--brown-2)] transition-colors">
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showMore ? 'rotate-180' : ''}`} />
                More options
              </button>
              {showMore && (
                <div className="absolute top-7 left-0 z-10 surface rounded-xl overflow-hidden min-w-72 shadow-md">
                  {GOAL_PRESETS.slice(4).map((p) => (
                    <button key={p} onClick={() => { setUserGoal(p); setCustomGoal(''); setShowMore(false); }}
                      className="w-full text-left px-4 py-2.5 text-xs text-[var(--brown-3)] hover:bg-[var(--cream-2)] transition-colors border-b last:border-0"
                      style={{ borderColor: 'var(--border)' }}>
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <textarea
              value={customGoal}
              onChange={(e) => { setCustomGoal(e.target.value); setUserGoal(''); }}
              placeholder="Or describe your own goal…"
              rows={3}
              className="input resize-none text-sm mb-4"
              style={{ borderRadius: 10 }}
            />

            <button
              id="generate-btn"
              onClick={handleGenerate}
              disabled={loading || !effectiveGoal.trim() || isExhausted}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3"
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Gathering context &amp; generating…</>
                : isExhausted
                  ? 'Daily limit reached — resets at midnight UTC'
                  : 'Generate Messages'}
            </button>
          </div>
        )}

        {/* Errors */}
        {error && (
          <div className="mb-5 px-4 py-3 rounded-xl border text-sm flex items-start gap-3"
            style={{
              background:   errorType === 'daily_limit' ? '#FDF8F0' : '#FEF3F0',
              borderColor:  errorType === 'daily_limit' ? '#DDD6C8' : '#F5C9BC',
              color:        errorType === 'daily_limit' ? '#5A4A38' : '#8B3A2A',
            }}>
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">{errorType === 'daily_limit' ? 'Daily limit reached' : 'Error'}</p>
              <p className="text-xs mt-0.5 opacity-80">{error}</p>
            </div>
          </div>
        )}

        {/* Generated messages */}
        {result && (
          <div className="space-y-4 fade-up">

            {/* Context signals badge row */}
            {result.contextSignals && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-[var(--muted)]">
                  {result.contextSignals.cached ? '⚡ Cached context from:' : 'Used context from:'}
                </span>
                {result.contextSignals.github && (
                  <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border"
                    style={{ background: 'var(--cream-2)', borderColor: 'var(--border)', color: 'var(--brown-2)' }}>
                    <Code2 className="w-3 h-3" /> {result.contextSignals.github}
                  </span>
                )}
                {result.contextSignals.phProduct && (
                  <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border"
                    style={{ background: 'var(--cream-2)', borderColor: 'var(--border)', color: 'var(--brown-2)' }}>
                    <Rocket className="w-3 h-3" /> {result.contextSignals.phProduct}
                  </span>
                )}
                {result.contextSignals.jobs.length > 0 && (
                  <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border"
                    style={{ background: 'var(--cream-2)', borderColor: 'var(--border)', color: 'var(--brown-2)' }}>
                    <Briefcase className="w-3 h-3" /> {result.contextSignals.jobs.length} open roles
                  </span>
                )}
                {result.contextSignals.hnFound && (
                  <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border"
                    style={{ background: 'var(--cream-2)', borderColor: 'var(--border)', color: 'var(--brown-2)' }}>
                    <Newspaper className="w-3 h-3" /> HN activity
                  </span>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* LinkedIn */}
              <div className="surface overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b"
                  style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5 text-[var(--muted)]" />
                    <span className="text-xs font-medium text-[var(--brown-3)]">LinkedIn DM</span>
                  </div>
                  <button onClick={() => copy(result.linkedin, 'li')}
                    className="flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--brown-2)] transition-colors">
                    {copiedLI
                      ? <><Check className="w-3 h-3 text-green-600" /><span className="text-green-600">Copied</span></>
                      : <><Copy className="w-3 h-3" />Copy</>}
                  </button>
                </div>
                <div className="p-5">
                  <p className="text-sm text-[var(--brown-3)] leading-relaxed whitespace-pre-wrap">{result.linkedin}</p>
                </div>
              </div>

              {/* Email */}
              <div className="surface overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b"
                  style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-[var(--muted)]" />
                    <span className="text-xs font-medium text-[var(--brown-3)]">Email Draft</span>
                  </div>
                  <button onClick={() => copy(result.email, 'em')}
                    className="flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--brown-2)] transition-colors">
                    {copiedEM
                      ? <><Check className="w-3 h-3 text-green-600" /><span className="text-green-600">Copied</span></>
                      : <><Copy className="w-3 h-3" />Copy</>}
                  </button>
                </div>
                {result.subject && (
                  <div className="px-5 py-2 border-b text-xs"
                    style={{ borderColor: 'var(--border)', background: 'var(--cream-2)', color: 'var(--muted)' }}>
                    <span className="font-medium" style={{ color: 'var(--brown-2)' }}>Subject: </span>
                    {result.subject}
                  </div>
                )}
                <div className="p-5">
                  <p className="text-sm text-[var(--brown-3)] leading-relaxed whitespace-pre-wrap">{result.email}</p>
                </div>
              </div>

              <div className="sm:col-span-2 flex justify-center">
                <button
                  onClick={handleGenerate}
                  disabled={loading || isExhausted}
                  className="btn-ghost text-xs"
                >
                  Regenerate
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function OutreachPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--cream)' }}>
        <div className="spinner" style={{ width: 24, height: 24, borderWidth: 2.5 }} />
      </div>
    }>
      <OutreachContent />
    </Suspense>
  );
}
