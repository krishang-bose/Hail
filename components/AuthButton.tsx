'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { LogIn, LogOut, Zap } from 'lucide-react';
import { DAILY_LIMIT } from '@/lib/constants';

interface AuthButtonProps {
  /** If provided, displays the current usage (fetched externally after generate) */
  usedCalls?: number;
}

export default function AuthButton({ usedCalls }: AuthButtonProps) {
  const { data: session, status } = useSession();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [usageToday, setUsageToday] = useState<number | null>(usedCalls ?? null);

  // Fetch usage on mount when signed in
  useEffect(() => {
    if (session?.user) {
      fetch('/api/usage')
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.used !== undefined) setUsageToday(d.used); })
        .catch(() => {});
    }
  }, [session]);

  // Sync external usedCalls prop
  useEffect(() => {
    if (usedCalls !== undefined) setUsageToday(usedCalls);
  }, [usedCalls]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Render nothing until client-side hydration is complete.
  // This prevents the server/client HTML mismatch from the session loading state.
  if (!mounted || status === 'loading') {
    return (
      <div className="h-8 w-24 rounded-lg animate-pulse" style={{ background: 'var(--cream-2)' }} />
    );
  }

  if (!session) {
    return (
      <button
        id="sign-in-btn"
        onClick={() => signIn('google')}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
        style={{
          background: 'var(--brown-3)',
          color: 'var(--cream)',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        {/* Google 'G' icon */}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Sign in with Google
      </button>
    );
  }

  const remaining = usageToday !== null ? DAILY_LIMIT - usageToday : null;
  const isExhausted = remaining !== null && remaining <= 0;

  return (
    <div className="relative">
      <button
        id="user-menu-btn"
        onClick={() => setDropdownOpen(o => !o)}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-sm transition-all"
        style={{
          background: 'var(--cream-2)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          cursor: 'pointer',
        }}
      >
        {/* Avatar */}
        {session.user?.image ? (
          <img
            src={session.user.image}
            alt={session.user.name ?? 'User'}
            className="w-6 h-6 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold"
            style={{ background: 'var(--brown-1)', color: 'var(--cream)' }}>
            {session.user?.name?.[0] ?? '?'}
          </div>
        )}

        {/* Name — hidden on mobile */}
        <span className="hidden sm:inline max-w-[100px] truncate font-medium" style={{ color: 'var(--brown-3)' }}>
          {session.user?.name?.split(' ')[0]}
        </span>

        {/* Usage pill */}
        {remaining !== null && (
          <span
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold shrink-0"
            style={{
              background: isExhausted ? '#FEF3F0' : 'var(--cream-3)',
              color:      isExhausted ? '#8B3A2A' : 'var(--brown-2)',
              border:     `1px solid ${isExhausted ? '#F5C9BC' : 'var(--border)'}`,
            }}
          >
            <Zap className="w-2.5 h-2.5" />
            {remaining}/{DAILY_LIMIT}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {dropdownOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setDropdownOpen(false)}
          />
          <div
            className="absolute right-0 top-full mt-2 z-50 rounded-2xl shadow-lg overflow-hidden min-w-[220px]"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            {/* User info */}
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--brown-3)' }}>
                {session.user?.name}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                {session.user?.email}
              </p>
            </div>

            {/* Usage bar */}
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs" style={{ color: 'var(--muted)' }}>Messages today</span>
                <span className="text-xs font-semibold" style={{ color: isExhausted ? '#8B3A2A' : 'var(--brown-2)' }}>
                  {usageToday ?? '…'} / {DAILY_LIMIT}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--cream-2)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, ((usageToday ?? 0) / DAILY_LIMIT) * 100)}%`,
                    background: isExhausted ? '#EF4444' : 'var(--brown-1)',
                  }}
                />
              </div>
              {isExhausted && (
                <p className="text-xs mt-1.5" style={{ color: '#8B3A2A' }}>
                  Resets at midnight UTC
                </p>
              )}
            </div>

            {/* Sign out */}
            <button
              id="sign-out-btn"
              onClick={() => { signOut(); setDropdownOpen(false); }}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm transition-colors hover:bg-[var(--cream-2)]"
              style={{ color: 'var(--muted)', cursor: 'pointer', background: 'none', border: 'none' }}
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
