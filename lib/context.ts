// lib/context.ts — PersonContext builder
//
// Fetches GitHub profile, HN mentions, job postings, and Product Hunt launches
// in parallel (all free), then compresses into a compact string for the AI prompt.
//
// Compact format saves ~40% tokens vs prose while giving MORE signal.
// Context is cached in Supabase on the people row (24hr TTL) so repeat
// generate clicks reuse the cached data — zero external API calls.

import { findGitHubProfile, GitHubProfile } from './sources/github';
import { fetchJobPostings, JobPosting } from './sources/jobboard';
import { searchHN } from './sources/hn';
import { findPHProducts, PHProduct } from './sources/producthunt';
import { supabaseAdmin } from './supabase';

export interface BuiltContext {
  compact: string;
  github: GitHubProfile | null;
  jobs: JobPosting[];
  phProducts: PHProduct[];
  hnMentions: string[];
  fromCache: boolean;
}

export async function buildPersonContext(params: {
  personId?: string;            // if provided, context is cached on this people row
  personName: string;
  personRole: string;
  personBio?: string | null;
  personExperience?: string | null;
  personEmail?: string | null;
  companyName: string;
  companyWebsite?: string | null;
  companyMission?: string | null;
  companyDescription?: string | null;
  companyIndustry?: string | null;
  companyTechnologies?: string[];
  userGoal: string;
}): Promise<BuiltContext> {
  const {
    personId, personName, personRole, personBio, personExperience,
    companyName, companyWebsite, companyMission, companyDescription,
    companyIndustry, companyTechnologies, userGoal,
  } = params;

  // Derive domain
  let domain: string | null = null;
  try {
    if (companyWebsite) {
      domain = new URL(
        companyWebsite.startsWith('http') ? companyWebsite : `https://${companyWebsite}`
      ).hostname.replace(/^www\./, '');
    }
  } catch { /* ignore */ }

  // ── Check Supabase cache first (avoids all external API calls on re-generate) ──
  if (personId) {
    const { data: cached } = await supabaseAdmin
      .from('people')
      .select('context_cache, context_cached_at')
      .eq('id', personId)
      .single();

    if (cached?.context_cache && cached?.context_cached_at) {
      const age = Date.now() - new Date(cached.context_cached_at).getTime();
      if (age < 24 * 60 * 60 * 1000) { // 24hr TTL
        console.log('[Context] Cache hit — skipping all external API calls');
        const c = cached.context_cache as any;
        return {
          ...buildCompact({
            personName, personRole, personBio, personExperience,
            companyName, companyMission, companyDescription, companyIndustry,
            companyTechnologies, userGoal,
            github: c.github ?? null,
            jobs:   c.jobs   ?? [],
            phProducts: c.phProducts ?? [],
            hnMentions: c.hnMentions ?? [],
          }),
          fromCache: true,
        };
      }
    }
  }

  // ── Fetch all sources in parallel ─────────────────────────────────────────
  const [github, jobs, hnMentions, phProducts] = await Promise.all([
    findGitHubProfile(personName, domain ?? undefined).catch(() => null),
    domain ? fetchJobPostings(domain).catch(() => []) : Promise.resolve<JobPosting[]>([]),
    searchHN(personName).catch(() => []),
    findPHProducts(companyName).catch(() => []),
  ]);

  console.log(
    `[Context] GitHub:${github ? `@${github.username}` : '—'} | Jobs:${jobs.length} | PH:${phProducts.length} | HN:${hnMentions.length}`
  );

  // Filter HN mentions to ones that actually mention this person by first name
  const personHN = hnMentions
    .filter(h => h.toLowerCase().includes(personName.split(' ')[0].toLowerCase()))
    .slice(0, 3);

  // ── Cache to Supabase so re-generate is instant ────────────────────────────
  if (personId) {
    await supabaseAdmin
      .from('people')
      .update({
        context_cache:     { github, jobs, phProducts, hnMentions: personHN },
        context_cached_at: new Date().toISOString(),
      })
      .eq('id', personId);
  }

  return {
    ...buildCompact({
      personName, personRole, personBio, personExperience,
      companyName, companyMission, companyDescription, companyIndustry,
      companyTechnologies, userGoal,
      github, jobs, phProducts, hnMentions: personHN,
    }),
    fromCache: false,
  };
}

// ── Build compact string ───────────────────────────────────────────────────
// Each line is a labelled key-value fact. AI reads it like a brief.
// ~350 tokens total. Far more signal than the same content written as prose.
function buildCompact(p: {
  personName: string;
  personRole: string;
  personBio?: string | null;
  personExperience?: string | null;
  companyName: string;
  companyMission?: string | null;
  companyDescription?: string | null;
  companyIndustry?: string | null;
  companyTechnologies?: string[];
  userGoal: string;
  github: GitHubProfile | null;
  jobs: JobPosting[];
  phProducts: PHProduct[];
  hnMentions: string[];
}): Omit<BuiltContext, 'fromCache'> {
  const lines: string[] = [];

  // Company line
  const tech  = (p.companyTechnologies ?? []).slice(0, 5).join(', ');
  const about = p.companyMission || (p.companyDescription ?? '').slice(0, 100);
  lines.push(
    `COMPANY: ${p.companyName}${p.companyIndustry ? ` (${p.companyIndustry})` : ''} | ${about}${tech ? ` | stack: ${tech}` : ''}`
  );

  // Person line
  const bio  = p.personBio        ? ` | "${p.personBio.slice(0, 120)}"` : '';
  const prev = p.personExperience ? ` | prev: ${p.personExperience.slice(0, 100)}` : '';
  lines.push(`PERSON: ${p.personName}, ${p.personRole}${bio}${prev}`);

  // GitHub — strongest signal for engineering outreach
  if (p.github) {
    const langs = p.github.top_languages.join(', ');
    const repos = p.github.recent_repos
      .map(r => `${r.name}${r.stars > 5 ? ` (⭐${r.stars})` : ''}`)
      .join(', ');
    const ghBio = p.github.bio ? ` | bio: "${p.github.bio}"` : '';
    lines.push(`GITHUB: @${p.github.username}${ghBio} | langs: ${langs} | repos: ${repos}`);
  }

  // Product Hunt launches — unique hook most senders never use
  if (p.phProducts.length > 0) {
    const launches = p.phProducts
      .slice(0, 2)
      .map(ph => `"${ph.name}" (${ph.votesCount} votes) — ${ph.tagline}`)
      .join(' | ');
    lines.push(`PH_LAUNCHES: ${launches}`);
  }

  // HN mentions
  if (p.hnMentions.length > 0) {
    lines.push(`HN_MENTIONS: ${p.hnMentions.join(' / ')}`);
  }

  // Open roles
  const techRoles = p.jobs
    .filter(j => {
      const t = j.title.toLowerCase();
      return t.includes('engineer') || t.includes('intern') || t.includes('developer') || t.includes('research');
    })
    .slice(0, 3)
    .map(j => j.title);
  if (techRoles.length > 0) {
    lines.push(`OPEN_ROLES: ${techRoles.join(', ')}`);
  }

  lines.push(`GOAL: ${p.userGoal}`);

  return {
    compact: lines.join('\n'),
    github: p.github,
    jobs: p.jobs,
    phProducts: p.phProducts,
    hnMentions: p.hnMentions,
  };
}
