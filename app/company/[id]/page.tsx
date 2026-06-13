'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { HailLogo } from '@/app/theme-provider';
import dynamic from 'next/dynamic';
import {
  ArrowLeft, Globe, Building2, Newspaper, Code2,
  ChevronRight, Link2, Users, MessageSquare, ExternalLink, X, RefreshCw
} from 'lucide-react';
import { Company, Person } from '@/lib/types';
import { categoryColors, categoryLabels } from '@/lib/utils';

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
        <img src={src} alt={`${name} logo`}
          className="w-full h-full object-contain p-2"
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
      <Building2 className="w-6 h-6 text-[var(--brown-1)]" />
    </div>
  );
}

const OrgTree = dynamic(() => import('@/components/OrgTree'), { ssr: false });

interface PageData { company: Company; people: Person[]; }

export default function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router  = useRouter();
  const [data, setData]                   = useState<PageData | null>(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState('');
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [activeTab, setActiveTab]         = useState<'tree' | 'list'>('tree');
  const [refreshing, setRefreshing]       = useState(false);

  useEffect(() => {
    fetch(`/api/company/${id}`)
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setData(d); })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleOutreach = () => {
    if (!selectedPerson || !data) return;
    router.push(
      `/outreach?companyId=${id}&personId=${selectedPerson.id}` +
      `&companyName=${encodeURIComponent(data.company.name)}` +
      `&personName=${encodeURIComponent(selectedPerson.name)}` +
      `&personRole=${encodeURIComponent(selectedPerson.role)}`
    );
  };

  // Purge cached data and go back to search so user can re-fetch fresh
  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await fetch(`/api/company/${id}`, { method: 'DELETE' });
    } finally {
      router.push('/');
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--cream)' }}>
      <div className="text-center">
        <div className="spinner mx-auto mb-3" style={{ width: 24, height: 24, borderWidth: 2.5 }} />
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      </div>
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--cream)' }}>
      <div className="text-center">
        <p className="text-sm text-red-500 mb-3">{error || 'Not found'}</p>
        <button onClick={() => router.push('/')} className="btn-ghost text-sm">← Back</button>
      </div>
    </div>
  );

  const { company, people } = data;

  /* ── Category dot colors (warm muted) ── */
  const dotColor: Record<string, string> = {
    founder:   '#A07040',
    cto:       '#7A7040',
    engineer:  '#407A70',
    recruiter: '#7A407A',
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--cream)' }}>

      {/* Nav */}
      <nav className="nav sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/')}
              className="flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
            <span className="text-[var(--border)]">·</span>
            <HailLogo />
            {/* Refresh — purges stale cached data and goes back to search */}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              title="Delete cached data and re-fetch fresh"
              className="flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--brown-1)] transition-colors ml-1"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Clearing…' : 'Refresh'}
            </button>
          </div>
          {selectedPerson && (
            <button onClick={handleOutreach}
              className="btn-primary flex items-center gap-2 text-sm py-2 px-4">
              <MessageSquare className="w-3.5 h-3.5" />
              Reach {selectedPerson.name.split(' ')[0]}
            </button>
          )}
        </div>
      </nav>

      <div className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">

        {/* Company header */}
        <div className="surface p-8 mb-5 fade-up">
          <div className="flex flex-col lg:flex-row lg:items-start gap-6">
            <CompanyLogo
              logoUrl={company.logo_url}
              website={company.website}
              name={company.name}
              className="w-14 h-14 rounded-2xl shrink-0"
            />
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3 mb-1">
                <h1 className="text-2xl font-semibold text-[var(--brown-3)]">{company.name}</h1>
                <span className="pill">{company.industry}</span>
              </div>
              {company.website && (
                <a href={company.website} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--brown-1)] transition-colors mb-4 w-fit">
                  <Globe className="w-3 h-3" />
                  {company.website.replace('https://', '')}
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
              <p className="text-sm text-[var(--muted)] leading-relaxed mb-4 max-w-2xl">
                {company.description}
              </p>
              {company.mission && (
                <div className="inline-flex items-start gap-2 px-4 py-3 rounded-xl text-sm"
                  style={{ background: 'var(--cream-2)', border: '1px solid var(--border)' }}>
                  <span className="text-[var(--muted)] shrink-0 font-medium">Mission —</span>
                  <span className="text-[var(--brown-3)]">{company.mission}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Meta row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          {company.recent_news?.length > 0 && (
            <div className="surface p-6 fade-up delay-1">
              <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide mb-4 flex items-center gap-2">
                <Newspaper className="w-3.5 h-3.5" /> Recent Activity
              </p>
              <ul className="space-y-2.5">
                {company.recent_news.map((n, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[var(--brown-3)]">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: 'var(--brown-1)' }} />
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {company.technologies?.length > 0 && (
            <div className="surface p-6 fade-up delay-2">
              <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide mb-4 flex items-center gap-2">
                <Code2 className="w-3.5 h-3.5" /> Tech Stack
              </p>
              <div className="flex flex-wrap gap-2">
                {company.technologies.map((t) => (
                  <span key={t} className="text-xs px-3 py-1 rounded-lg"
                    style={{ background: 'var(--cream-2)', border: '1px solid var(--border)', color: 'var(--brown-2)' }}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* People section */}
        <div className="surface overflow-hidden fade-up delay-3">
          {/* Tab bar */}
          <div className="flex items-center justify-between border-b px-6 py-4"
            style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm font-medium text-[var(--brown-3)] flex items-center gap-2">
              <Users className="w-4 h-4 text-[var(--muted)]" />
              People
              <span className="text-[var(--muted)] font-normal">({people.length})</span>
            </p>
            <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--cream-2)' }}>
              {(['tree', 'list'] as const).map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className="px-3 py-1 rounded-md text-xs font-medium transition-all capitalize"
                  style={activeTab === tab
                    ? { background: '#fff', color: 'var(--brown-3)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }
                    : { color: 'var(--muted)' }}>
                  {tab === 'tree' ? 'Org Tree' : 'List'}
                </button>
              ))}
            </div>
          </div>

          {activeTab === 'tree' ? (
            <div className="flex flex-col lg:flex-row">
              <div className="flex-1 h-[380px] lg:h-[540px] p-2" style={{ background: 'var(--cream)' }}>
                <OrgTree
                  company={{ id: company.id, name: company.name, industry: company.industry }}
                  people={people}
                  onSelectPerson={setSelectedPerson}
                  selectedPersonId={selectedPerson?.id}
                />
              </div>

              {selectedPerson && (
                <div
                  className="lg:w-64 lg:border-l border-t lg:border-t-0 p-5 flex flex-col gap-4"
                  style={{ borderColor: 'var(--border)', background: '#fff' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--muted)] uppercase tracking-wide">Selected</span>
                    <button onClick={() => setSelectedPerson(null)}
                      className="text-[var(--muted)] hover:text-[var(--text)] transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center font-semibold text-sm shrink-0"
                      style={{ background: `${dotColor[selectedPerson.category]}18`, color: dotColor[selectedPerson.category] }}>
                      {selectedPerson.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                    </div>
                    <div>
                      <p className="font-medium text-sm text-[var(--brown-3)]">{selectedPerson.name}</p>
                      <p className="text-xs text-[var(--muted)] mt-0.5">{selectedPerson.role}</p>
                      <span className="pill mt-1">{categoryLabels[selectedPerson.category]}</span>
                    </div>
                  </div>

                  {selectedPerson.bio && (
                    <p className="text-xs text-[var(--muted)] leading-relaxed">{selectedPerson.bio}</p>
                  )}

                  {selectedPerson.previous_experience && (
                    <p className="text-xs text-[var(--muted)]">
                      <span className="text-[var(--brown-3)] font-medium">Previously — </span>
                      {selectedPerson.previous_experience}
                    </p>
                  )}

                  {/* LinkedIn — direct people search */}
                  <a
                    href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(selectedPerson.name + ' ' + data.company.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-[var(--brown-1)] hover:text-[var(--brown-2)] transition-colors"
                  >
                    <Link2 className="w-3 h-3" /> Find on LinkedIn
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>

                  {/* Real email from Hunter */}
                  {selectedPerson.email && (
                    <a
                      href={`mailto:${selectedPerson.email}`}
                      className="flex items-center gap-1.5 text-xs text-[var(--brown-1)] hover:text-[var(--brown-2)] transition-colors"
                    >
                      <span style={{ fontSize: 11 }}>✉</span>
                      <span className="truncate">{selectedPerson.email}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: '#EDF7ED', color: '#2D6A2D' }}>verified</span>
                    </a>
                  )}

                  {/* AI estimated badge for unverified people */}
                  {!selectedPerson.email && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{ background: 'var(--cream-2)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                      AI estimated · not verified
                    </span>
                  )}

                  <button onClick={handleOutreach}
                    className="btn-primary mt-auto flex items-center justify-center gap-2 text-sm py-2.5">
                    <MessageSquare className="w-3.5 h-3.5" />
                    Generate Outreach
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {people.map((person) => (
                <button key={person.id} onClick={() => setSelectedPerson(person)}
                  className="text-left p-4 rounded-2xl border lift transition-all"
                  style={selectedPerson?.id === person.id
                    ? { background: 'var(--cream-2)', borderColor: 'var(--brown-1)' }
                    : { background: 'var(--cream)', borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center font-medium text-xs shrink-0"
                      style={{ background: `${dotColor[person.category]}18`, color: dotColor[person.category] }}>
                      {person.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--brown-3)] truncate">{person.name}</p>
                      <p className="text-xs text-[var(--muted)] truncate">{person.role}</p>
                    </div>
                  </div>
                  <span className="pill text-[11px]">{categoryLabels[person.category]}</span>
                  {person.bio && (
                    <p className="text-xs text-[var(--muted)] mt-2 line-clamp-2 leading-relaxed">{person.bio}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Floating CTA */}
        {selectedPerson && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md"
            style={{ filter: 'drop-shadow(0 4px 20px rgba(74,59,44,0.15))' }}>
            <div className="surface flex items-center gap-3 px-4 py-3 rounded-2xl flex-wrap justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center font-medium text-xs shrink-0"
                  style={{ background: `${dotColor[selectedPerson.category]}18`, color: dotColor[selectedPerson.category] }}>
                  {selectedPerson.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                </div>
                <div>
                  <span className="text-sm font-medium text-[var(--brown-3)]">{selectedPerson.name}</span>
                  <span className="text-xs text-[var(--muted)] ml-2 hidden sm:inline">{selectedPerson.role}</span>
                </div>
              </div>
              <button onClick={handleOutreach}
                className="btn-primary flex items-center gap-2 text-sm py-2 px-4">
                <MessageSquare className="w-3.5 h-3.5" />
                Generate Outreach
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
