'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { Search, ChevronRight, Building2, ArrowRight, Clock, LogIn } from 'lucide-react';
import { Company } from '@/lib/types';
import AuthButton from '@/components/AuthButton';
import { AUTH_ENABLED } from '@/lib/constants';
import { HailLogo } from '@/app/theme-provider';

function CompanyLogo({ logoUrl, name, website, className }: {
  logoUrl?: string | null;
  name: string;
  website?: string;
  className?: string;
}) {
  const getFaviconUrl = () => {
    if (logoUrl) return logoUrl;
    if (website) {
      try {
        const domain = new URL(website.startsWith('http') ? website : `https://${website}`).hostname;
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
      } catch { return null; }
    }
    return null;
  };

  const [src, setSrc] = useState<string | null>(getFaviconUrl);

  if (src) {
    return (
      <div className={`flex items-center justify-center overflow-hidden ${className ?? ''}`}
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <img
          src={src}
          alt={`${name} logo`}
          className="w-full h-full object-contain p-1.5"
          onError={() => {
            if (src === logoUrl && website) {
              try {
                const domain = new URL(website.startsWith('http') ? website : `https://${website}`).hostname;
                setSrc(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`);
                return;
              } catch { /* fall through */ }
            }
            setSrc(null);
          }}
        />
      </div>
    );
  }
  return (
    <div className={`flex items-center justify-center ${className ?? ''}`}
      style={{ background: 'var(--cream-2)', border: '1px solid var(--border)' }}>
      <Building2 className="w-4 h-4 text-[var(--brown-1)]" />
    </div>
  );
}

export default function HomePage() {
  const [query, setQuery]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [results, setResults]       = useState<Company[]>([]);
  const [error, setError]           = useState('');
  const [searched, setSearched]     = useState(false);
  const [countdown, setCountdown]   = useState(0);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const inputRef  = useRef<HTMLInputElement>(null);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const router    = useRouter();
  const { data: session } = useSession();

  useEffect(() => { inputRef.current?.focus(); }, []);

  const startCountdown = useCallback((seconds: number) => {
    setCountdown(seconds);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setError('');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading || countdown > 0) return;

    // If auth is on and user not signed in, show the modal immediately
    if (AUTH_ENABLED && !session) {
      setShowSignInModal(true);
      return;
    }

    setLoading(true);
    setError('');
    setSearched(true);
    try {
      const res  = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'unauthenticated') {
          setShowSignInModal(true);
        } else if (data.error === 'daily_limit') {
          setError('daily_limit');
        } else if (data.error === 'rate_limited') {
          startCountdown(60);
          setError('rate_limited');
        } else if (data.error === 'company_not_found') {
          setResults([]);
          setError(data.message || `Couldn't find that company. Try the exact name.`);
        } else {
          setError(data.message || 'Search failed. Please try again.');
        }
        return;
      }
      setResults(data.companies || []);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  };

  const examples = ['Stripe', 'Linear', 'Notion', 'Vercel', 'Figma', 'Anthropic'];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--cream)' }}>

      {/* Nav */}
      <nav className="nav fixed top-0 left-0 right-0 z-50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <HailLogo className="text-lg" />
          <div className="flex items-center gap-3">
            {AUTH_ENABLED && <AuthButton />}
          </div>
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center pt-32 pb-20 px-6">

        {!searched ? (
          /* ── Landing ── */
          <>
            <div className="text-center mb-10 fade-up">
              <h1 className="text-5xl sm:text-6xl font-semibold text-[var(--brown-3)] mb-4 tracking-tight">
                Reach the right<br />people at startups.
              </h1>
              <p className="text-[var(--muted)] text-lg max-w-xl mx-auto leading-relaxed">
                Research any startup in seconds. Map their team.
                Generate outreach that actually gets replies.
              </p>
              {!session && AUTH_ENABLED && (
                <p className="text-sm mt-3 text-[var(--muted)]">
                  Sign in with Google — <strong>2 free searches per day</strong>.
                </p>
              )}
            </div>

            {/* Search */}
            <form onSubmit={handleSearch} className="w-full max-w-xl fade-up delay-1">
              <div className="surface flex items-center gap-3 px-4 py-3 focus-within:border-[var(--brown-1)] transition-colors">
                <Search className="w-4 h-4 text-[var(--muted)] shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search a startup…"
                  className="flex-1 bg-transparent text-[var(--text)] placeholder-[var(--muted)] outline-none text-[15px]"
                />
                <button
                  type="submit"
                  disabled={loading || !query.trim()}
                  className="btn-primary flex items-center gap-2 py-2 px-4 text-sm"
                >
                  {loading
                    ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Searching</>
                    : <><span>Search</span><ArrowRight className="w-3.5 h-3.5" /></>}
                </button>
              </div>
            </form>

            {/* Examples */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-5 fade-up delay-2">
              <span className="text-xs text-[var(--muted)]">Try:</span>
              {examples.map((ex) => (
                <button
                  key={ex}
                  onClick={() => { setQuery(ex); inputRef.current?.focus(); }}
                  className="text-xs px-3 py-1.5 rounded-full border border-[var(--border)] text-[var(--muted)] hover:border-[var(--brown-1)] hover:text-[var(--brown-2)] transition-all"
                >
                  {ex}
                </button>
              ))}
            </div>

            {/* Feature strip */}
            <div className="grid grid-cols-3 gap-4 mt-20 max-w-xl w-full fade-up delay-3">
              {[
                { label: 'Discover',    desc: 'Search any startup' },
                { label: 'Map the Team', desc: 'Visual org tree' },
                { label: 'Reach Out',   desc: 'AI-drafted messages' },
              ].map((f) => (
                <div key={f.label} className="surface-2 p-4 text-center">
                  <p className="text-sm font-medium text-[var(--brown-3)] mb-1">{f.label}</p>
                  <p className="text-xs text-[var(--muted)]">{f.desc}</p>
                </div>
              ))}
            </div>
          </>

        ) : (
          /* ── Results ── */
          <div className="w-full max-w-2xl">
            {/* Header row */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-[var(--brown-3)]">
                  {loading ? 'Researching…' : `"${query}"`}
                </h2>
                {!loading && results.length > 0 && (
                  <p className="text-sm text-[var(--muted)] mt-0.5">{results.length} result{results.length !== 1 ? 's' : ''}</p>
                )}
              </div>
              <button
                onClick={() => { setSearched(false); setResults([]); setQuery(''); }}
                className="btn-ghost text-xs"
              >
                New search
              </button>
            </div>

            {/* Re-search */}
            <form onSubmit={handleSearch} className="mb-6">
              <div className="surface flex items-center gap-3 px-4 py-2.5 focus-within:border-[var(--brown-1)] transition-colors">
                <Search className="w-4 h-4 text-[var(--muted)] shrink-0" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search another startup…"
                  className="flex-1 bg-transparent text-[var(--text)] placeholder-[var(--muted)] outline-none text-sm"
                />
                <button type="submit" disabled={loading || !query.trim()} className="btn-primary py-1.5 px-3 text-xs">
                  {loading ? 'Searching…' : 'Go'}
                </button>
              </div>
            </form>

            {/* Error / Rate limit */}
            {error === 'rate_limited' ? (
              <div className="mb-4 px-5 py-4 rounded-2xl border flex items-start gap-3"
                style={{ background: '#FDF8F0', borderColor: '#DDD6C8' }}>
                <Clock className="w-4 h-4 text-[var(--brown-1)] mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-[var(--brown-3)] mb-0.5">
                    Rate limit hit — please wait
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {countdown > 0
                      ? <>Ready in <span className="font-semibold text-[var(--brown-2)]"> {countdown}s</span> — search will unlock automatically.</>
                      : <>You can search again now.</>}
                  </p>
                </div>
              </div>
            ) : error === 'daily_limit' ? (
              <div className="mb-4 px-5 py-4 rounded-2xl border flex items-start gap-3"
                style={{ background: '#FDF8F0', borderColor: '#DDD6C8' }}>
                <Clock className="w-4 h-4 text-[var(--brown-1)] mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-[var(--brown-3)] mb-0.5">
                    Daily limit reached
                  </p>
                  <p className="text-xs text-[var(--muted)] mb-2">
                    You've used your 2 searches for today. Resets at midnight UTC.
                  </p>
                  {AUTH_ENABLED && (
                    <button onClick={() => signIn('google')} className="text-xs font-medium text-[var(--brown-2)] hover:underline">
                      Sign in with a different account →
                    </button>
                  )}
                </div>
              </div>
            ) : error ? (
              <div className="mb-4 px-4 py-3 rounded-xl border text-sm"
                style={{ background: '#FEF3F0', borderColor: '#F5C9BC', color: '#8B3A2A' }}>
                {error}
              </div>
            ) : null}

            {/* Skeletons */}
            {loading && (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="surface p-6">
                    <div className="skeleton h-4 w-1/3 mb-3" />
                    <div className="skeleton h-3 w-1/4 mb-4" />
                    <div className="skeleton h-3 w-full mb-2" />
                    <div className="skeleton h-3 w-4/5" />
                  </div>
                ))}
                <p className="text-center text-xs text-[var(--muted)] mt-3">
                  Researching with AI — takes about 5 seconds…
                </p>
              </div>
            )}

            {/* No results */}
            {!loading && results.length === 0 && searched && !error && (
              <div className="text-center py-16 text-[var(--muted)] text-sm">
                No results found. Try a different name.
              </div>
            )}

            {/* Result cards */}
            {!loading && results.length > 0 && (
              <div className="space-y-3">
                {results.map((company, i) => (
                  <button
                    key={company.id}
                    onClick={() => router.push(`/company/${company.id}`)}
                    className="surface lift w-full text-left p-6 group fade-up"
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <CompanyLogo
                            logoUrl={company.logo_url}
                            website={company.website}
                            name={company.name}
                            className="w-9 h-9 rounded-xl shrink-0"
                          />
                          <div>
                            <h3 className="font-semibold text-[var(--brown-3)] group-hover:text-[var(--brown-2)] transition-colors">
                              {company.name}
                            </h3>
                            <span className="pill text-xs">{company.industry}</span>
                          </div>
                        </div>
                        <p className="text-sm text-[var(--muted)] leading-relaxed line-clamp-2 mt-2">
                          {company.description}
                        </p>
                        {company.technologies?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {company.technologies.slice(0, 5).map((t) => (
                              <span key={t} className="text-xs px-2 py-0.5 rounded-md"
                                style={{ background: 'var(--cream-2)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-[var(--border)] group-hover:text-[var(--brown-1)] transition-colors shrink-0 mt-1" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Sign-in modal (shown when trying to generate without auth) */}
      {showSignInModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowSignInModal(false)}
        >
          <div className="surface p-8 max-w-sm w-full text-center"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: 'var(--cream-2)', border: '1px solid var(--border)' }}>
              <LogIn className="w-5 h-5 text-[var(--brown-1)]" />
            </div>
            <h2 className="text-lg font-semibold text-[var(--brown-3)] mb-2">Sign in to search</h2>
            <p className="text-sm text-[var(--muted)] mb-6 leading-relaxed">
              Sign in with Google to search startups and generate outreach messages.
              <strong> 2 searches per day</strong>, free forever.
            </p>
            <button
              onClick={() => signIn('google')}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>
            <button onClick={() => setShowSignInModal(false)} className="btn-ghost w-full mt-3 text-sm">
              Maybe later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
