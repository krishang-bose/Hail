import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { inferMetaOnly, RealPersonSeed } from '@/lib/openai';
import { findYCCompany } from '@/lib/sources/yc';
import { searchHN } from '@/lib/sources/hn';
import { searchHunter } from '@/lib/sources/hunter';
import { searchGitHubOrg } from '@/lib/sources/github';
import { lookupCompanyWeb, lookupCompanyWebAll, clearbitSearchAll } from '@/lib/sources/websearch';
import { scrapeCompanyHomepage } from '@/lib/sources/firecrawl';
import {
  checkDailyLimit, incrementUsage,
  checkIpLimit, incrementIpUsage, hashIp, getClientIp,
} from '@/lib/ratelimit';
import { AUTH_ENABLED, DAILY_LIMIT, isAdmin } from '@/lib/constants';

// Infer people category from role title — no AI needed
function inferCategory(role?: string): 'founder' | 'cto' | 'engineer' | 'recruiter' {
  const r = (role ?? '').toLowerCase();
  if (r.includes('found') || r.includes('ceo') || r.includes('chief exec')) return 'founder';
  if (r.includes('cto') || r.includes('chief tech') || r.includes('vp eng')) return 'cto';
  if (r.includes('recruit') || r.includes('talent') || r.includes('hr') || r.includes('people ops')) return 'recruiter';
  return 'engineer';
}

export async function POST(req: NextRequest) {
  try {
    // ── Auth + rate limit (only when AUTH_ENABLED) ─────────────────────────────
    // Strategy:
    //   • Signed-in users  → check userId-based daily limit (usage table)
    //   • Anonymous users  → check IP-based daily limit (ip_usage table)
    //     After their IP limit is hit they see the sign-in prompt.
    //   • When AUTH_ENABLED = false → no limits, no auth required
    let userId:  string | null = null;
    let ipHash:  string | null = null;
    let isAnon = false;

    if (AUTH_ENABLED) {
      const session = await auth();
      if (session?.user) {
        // Signed-in path — skip limits entirely for admins
        userId = (session.user as typeof session.user & { id?: string }).id ?? null;
        if (userId && !isAdmin(session.user.email)) {
          const { allowed, used } = await checkDailyLimit(userId);
          if (!allowed) {
            return NextResponse.json(
              {
                error:   'daily_limit',
                message: `You've used all ${DAILY_LIMIT} searches for today. Resets at midnight UTC.`,
                used,
                limit:   DAILY_LIMIT,
              },
              { status: 429 }
            );
          }
        }
      } else {
        // Anonymous path — rate limit by IP
        isAnon = true;
        const ip = getClientIp(req);
        ipHash = await hashIp(ip);
        const { allowed, used } = await checkIpLimit(ipHash);
        if (!allowed) {
          return NextResponse.json(
            {
              error:   'anon_limit',
              message: `You've used ${DAILY_LIMIT} free searches today. Sign in to continue.`,
              used,
              limit:   DAILY_LIMIT,
            },
            { status: 429 }
          );
        }
      }
    }

    const { query } = await req.json();
    if (!query?.trim()) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const q = query.trim();

    // ─────────────────────────────────────────────
    // 1. Supabase cache — single query, all matches
    //    Returns all companies whose name contains the query,
    //    ordered so exact matches surface first.
    // ─────────────────────────────────────────────
    const { data: cached } = await supabaseAdmin
      .from('companies')
      .select('*')
      .ilike('name', `%${q}%`)   // contains query anywhere in name
      .order('name')
      .limit(20);                 // generous cap — UI can paginate later

    if (cached && cached.length > 0) {
      // Sort client-side: exact match first, then starts-with, then rest
      const ql = q.toLowerCase();
      cached.sort((a, b) => {
        const al = a.name.toLowerCase();
        const bl = b.name.toLowerCase();
        const aExact = al === ql ? 0 : al.startsWith(ql) ? 1 : 2;
        const bExact = bl === ql ? 0 : bl.startsWith(ql) ? 1 : 2;
        return aExact - bExact;
      });

      console.log(`[Search] Cache hit for "${q}" — ${cached.length} result(s)`);

      // Backfill logo_url for any cached company that's missing it
      const needsLogo = cached.filter(c => !c.logo_url);
      if (needsLogo.length > 0) {
        await Promise.all(needsLogo.map(async (c) => {
          if (!c.website) return;
          try {
            const domain = new URL(c.website).hostname.replace(/^www\./, '');
            const logo_url = `https://favicon.im/${domain}?larger=true`;
            await supabaseAdmin.from('companies').update({ logo_url }).eq('id', c.id);
            c.logo_url = logo_url;
            console.log(`[Logo] Backfilled for ${c.name}`);
          } catch { /* ignore */ }
        }));
      }

      // If we only have 1 cached result, check Clearbit for other companies
      // with the same query (e.g. "pogo" → Pogo.com, Pogoplug, etc.)
      // and store them as stubs so subsequent searches show all options.
      if (cached.length === 1) {
        console.log(`[Search] Only 1 cached result — fetching secondary stubs from Clearbit…`);
        const allClearbit = await clearbitSearchAll(q);
        const secondaries = allClearbit.slice(1); // skip first (already cached)
        if (secondaries.length > 0) {
          await Promise.all(secondaries.map(async (stub) => {
            if (!stub.name || !stub.domain) return;
            try {
              const { data: exists } = await supabaseAdmin
                .from('companies').select('id').eq('name', stub.name).maybeSingle();
              if (exists) return;
              const stubLogo = stub.logo_url
                || `https://favicon.im/${stub.domain}?larger=true`;
              await supabaseAdmin.from('companies').insert({
                name:         stub.name,
                website:      stub.website || `https://${stub.domain}`,
                logo_url:     stubLogo,
                description:  stub.description || '',
                mission:      '',
                industry:     '',
                recent_news:  [],
                technologies: [],
              });
              console.log(`[Search] Stored secondary stub: ${stub.name}`);
            } catch { /* ignore — stub insert failures are non-critical */ }
          }));

          // Re-query to include newly stored stubs
          const { data: refreshed } = await supabaseAdmin
            .from('companies')
            .select('*')
            .ilike('name', `%${q}%`)
            .order('name')
            .limit(20);

          if (refreshed && refreshed.length > cached.length) {
            refreshed.sort((a, b) => {
              const al = a.name.toLowerCase();
              const bl = b.name.toLowerCase();
              const aRank = al === ql ? 0 : al.startsWith(ql) ? 1 : 2;
              const bRank = bl === ql ? 0 : bl.startsWith(ql) ? 1 : 2;
              return aRank - bRank;
            });
            if (AUTH_ENABLED && !isAdmin((await auth())?.user?.email)) { if (userId) await incrementUsage(userId); else if (ipHash) await incrementIpUsage(ipHash); }
            return NextResponse.json({ companies: refreshed });
          }
        }
      }

      if (AUTH_ENABLED && !isAdmin((await auth())?.user?.email)) { if (userId) await incrementUsage(userId); else if (ipHash) await incrementIpUsage(ipHash); }
      return NextResponse.json({ companies: cached });
    }

    // ─────────────────────────────────────────────
    // 2. Real APIs — all parallel, zero sequential blocking
    //    YC + HN: free, no limits
    //    Firecrawl: company homepage → og:description (their exact words)
    //    Hunter: real people / email contacts
    // ─────────────────────────────────────────────
    console.log(`[Search] Cache miss for "${q}" — fetching real APIs…`);

    // Fetch YC, HN, and ALL Clearbit matches simultaneously
    // clearbitAll[1..] = secondary companies to store as stubs regardless of YC/non-YC path
    const [ycCompany, hnHeadlines, clearbitAll] = await Promise.all([
      findYCCompany(q),
      searchHN(q),
      clearbitSearchAll(q),
    ]);
    const allWebResults = clearbitAll;   // alias used later in non-YC path
    const secondaryWebResults = clearbitAll.slice(1);

    if (ycCompany) console.log(`[YC] Found: ${ycCompany.name} (${ycCompany.batch})`);
    else console.log(`[YC] No match for "${q}" | Clearbit: ${clearbitAll.length} result(s)`);

    // Helper: bulk-insert secondary Clearbit stubs (shared by both YC + non-YC paths)
    const storeSecondaryStubs = async () => {
      if (secondaryWebResults.length === 0) return;
      console.log(`[Search] Storing ${secondaryWebResults.length} secondary stub(s)…`);
      await Promise.all(secondaryWebResults.map(async (stub) => {
        if (!stub.name || !stub.domain) return;
        try {
          const { data: exists } = await supabaseAdmin
            .from('companies').select('id').eq('name', stub.name).maybeSingle();
          if (exists) return;
          await supabaseAdmin.from('companies').insert({
            name:         stub.name,
            website:      stub.website || `https://${stub.domain}`,
            logo_url:     stub.logo_url || `https://favicon.im/${stub.domain}?larger=true`,
            description:  stub.description || '',
            mission:      '',
            industry:     '',
            recent_news:  [],
            technologies: [],
          });
          console.log(`[Search] Stored stub: ${stub.name}`);
        } catch { /* non-critical */ }
      }));
    };

    // Derive domain + website for Hunter / logo / Firecrawl
    // Prefer Clearbit's domain (accurate) over guessed domain from company name
    const clearbitPrimary = clearbitAll[0] ?? null;
    const website = ycCompany?.website ?? clearbitPrimary?.website ?? `https://${q.toLowerCase().replace(/\s+/g, '')}.com`;
    let domain: string | null = clearbitPrimary?.domain ?? null;
    if (!domain) {
      try { domain = new URL(website).hostname.replace(/^www\./, ''); } catch { domain = null; }
    }

    // ─────────────────────────────────────────────
    // 3. Hunter + GitHub + Firecrawl — all parallel
    //    Hunter:   real contacts with emails
    //    GitHub:   org members (free, no key needed) with names + roles
    //    Firecrawl: their own marketing copy
    // ─────────────────────────────────────────────
    const [hunterData, githubPeople, firecrawlResult] = await Promise.all([
      domain ? searchHunter(domain) : Promise.resolve({ emailPattern: null, organization: null, people: [] }),
      searchGitHubOrg(q, domain, 20),
      scrapeCompanyHomepage(website),
    ]);

    // Merge Hunter + GitHub people — Hunter gets priority (has emails)
    // Deduplicate by lowercased name so we don't show the same person twice
    const seenNames = new Set<string>();
    const mergedPeople: Array<{ name: string; role: string; email: string | null; linkedinUrl: string | null; source: 'hunter' | 'github' }> = [];

    for (const p of hunterData.people) {
      const key = p.name.toLowerCase();
      if (!seenNames.has(key)) {
        seenNames.add(key);
        mergedPeople.push({ name: p.name, role: p.role, email: p.email, linkedinUrl: p.linkedinUrl, source: 'hunter' });
      }
    }
    for (const p of githubPeople) {
      const key = p.name.toLowerCase();
      if (!seenNames.has(key)) {
        seenNames.add(key);
        mergedPeople.push({ name: p.name, role: p.role, email: p.email ?? null, linkedinUrl: p.blog ?? null, source: 'github' });
      }
    }

    console.log(`[People] Hunter: ${hunterData.people.length}, GitHub: ${githubPeople.length}, merged: ${mergedPeople.length}`);

    // Use mergedPeople as realPeople for downstream storage
    const realPeople = mergedPeople;

    if (firecrawlResult?.bestDescription) {
      console.log(`[Firecrawl] "${firecrawlResult.bestDescription.slice(0, 80)}…"`);
    }

    // ─────────────────────────────────────────────
    // 4a. YC company path — NO AI at all
    //     Use real data directly, AI only if no people found
    // ─────────────────────────────────────────────
    if (ycCompany) {
      // Firecrawl og:description = what they put on their actual site today.
      // Prefer it over YC's stored copy which can be years old.
      const firecrawlDesc = firecrawlResult?.ogDescription || firecrawlResult?.metaDescription;
      const ycDesc = ycCompany.long_description?.trim().slice(0, 1000) || ycCompany.one_liner || '';
      const description = firecrawlDesc || ycDesc;

      const logo_url = ycCompany.small_logo_thumb_url
        ?? (domain ? `https://favicon.im/${domain}?larger=true` : null);

      // Check if already cached (exact name match)
      const { data: existingYC } = await supabaseAdmin
        .from('companies')
        .select('*')
        .eq('name', ycCompany.name)
        .maybeSingle();

      let company: { id: string; [key: string]: any };

      if (existingYC) {
        // Already in DB — update description + logo in case they improved
        console.log(`[Search] YC company already cached, updating: ${ycCompany.name}`);
        const { data: updated, error: updateErr } = await supabaseAdmin
          .from('companies')
          .update({ description, logo_url, recent_news: hnHeadlines })
          .eq('id', existingYC.id)
          .select()
          .single();
        if (updateErr || !updated) {
          company = existingYC;
        } else {
          company = updated;
        }
      } else {
        // New company — insert
        const { data: inserted, error: insertErr } = await supabaseAdmin
          .from('companies')
          .insert({
            name:         ycCompany.name,
            website:      ycCompany.website,
            logo_url,
            description,
            mission:      ycCompany.one_liner || '',
            industry:     ycCompany.industry || '',
            recent_news:  hnHeadlines,
            technologies: ycCompany.tags || [],
          })
          .select()
          .single();
        if (insertErr || !inserted) {
          console.error('[Search] YC insert error:', insertErr?.message);
          return NextResponse.json({ error: 'db_error', message: 'Failed to save company.' }, { status: 500 });
        }
        company = inserted;
      }

      // Save real people (Hunter + GitHub) — never invented ones
      if (realPeople.length > 0) {
        const people = realPeople.map(p => ({
          company_id:          company.id,
          name:                p.name,
          role:                p.role || 'Team Member',
          email:               p.email ?? null,
          linkedin_url:        p.linkedinUrl ?? null,
          bio:                 '',
          previous_experience: '',
          category:            inferCategory(p.role),
        }));
        const { error: pe } = await supabaseAdmin.from('people').insert(people);
        if (pe) console.error('[Search] People insert error:', pe.message);
        else console.log(`[Search] Saved ${people.length} real people (Hunter+GitHub)`);
      } else {
        console.log('[Search] No people found from any source — leaving team empty');
      }

      // Store secondary Clearbit stubs before returning (YC path)
      await storeSecondaryStubs();

      // Re-query all matching cached companies so new result merges with existing cache
      const { data: allMatches } = await supabaseAdmin
        .from('companies')
        .select('*')
        .ilike('name', `%${q}%`)
        .order('name')
        .limit(20);

      const ql2 = q.toLowerCase();
      (allMatches ?? [company]).sort((a, b) => {
        const al = a.name.toLowerCase();
        const bl = b.name.toLowerCase();
        const aRank = al === ql2 ? 0 : al.startsWith(ql2) ? 1 : 2;
        const bRank = bl === ql2 ? 0 : bl.startsWith(ql2) ? 1 : 2;
        return aRank - bRank;
      });

      if (AUTH_ENABLED && !isAdmin((await auth())?.user?.email)) { if (userId) await incrementUsage(userId); else if (ipHash) await incrementIpUsage(ipHash); }
      return NextResponse.json({ companies: allMatches ?? [company] });
    }

    // ─────────────────────────────────────────────
    // 4b. Non-YC company path
    //     Free sources first: Clearbit logo + DDG description
    //     AI only if we still have no description after web lookup
    // ─────────────────────────────────────────────
    console.log(`[Search] Non-YC company — trying free web sources first…`);

    // Non-YC: use Clearbit primary (already fetched) + DDG for description
    // We already have clearbitAll from the parallel batch above — no need to re-fetch
    const webResult = clearbitPrimary
      ? { ...clearbitPrimary, description: clearbitPrimary.description }
      : null;

    // Enrich primary with DDG abstract for description (if Clearbit has none)
    if (webResult && !webResult.description) {
      const { duckduckgoSearch } = await import('@/lib/sources/websearch');
      const ddg = await duckduckgoSearch(q);
      if (ddg.abstract) webResult.description = ddg.abstract;
      if (!webResult.website && ddg.website) webResult.website = ddg.website;
    }

    if (webResult) {
      console.log(`[Search] Web: ${clearbitAll.length} Clearbit result(s) — primary: ${webResult.name} | ${webResult.domain}`);
      if (webResult.domain && !domain) domain = webResult.domain;
    }

    // ── Not found gate — only fire when truly nothing found ─────────────────
    // We have a signal if: Clearbit found a domain OR DDG has a description OR
    // Firecrawl scraped anything at all. Only reject when all three are empty.
    const hasAnySignal =
      webResult !== null            // Clearbit or DDG found something
      || firecrawlResult !== null;  // Firecrawl scraped something

    if (!hasAnySignal) {
      console.log(`[Search] No data found for "${q}" — returning not_found`);
      return NextResponse.json(
        { error: 'company_not_found', message: `Couldn't find "${q}". Try the exact company name or check your spelling.` },
        { status: 404 }
      );
    }

    // If Clearbit gave us a better domain than our initial guess, re-run Firecrawl
    // (e.g. query="Notion" → guessed notion.com but Clearbit says notion.so)
    let bestFirecrawl = firecrawlResult;
    if (webResult?.domain && domain !== webResult.domain) {
      domain = webResult.domain;
      const correctUrl = webResult.website || `https://${webResult.domain}`;
      const retry = await scrapeCompanyHomepage(correctUrl);
      if (retry?.bestDescription) {
        console.log(`[Firecrawl] Retry with correct domain: "${retry.bestDescription.slice(0, 80)}…"`);
        bestFirecrawl = retry;
      }
    }

    // ── Description priority: Firecrawl > DDG > nothing ──────────────────────
    // Firecrawl og:description = the exact words they use for social sharing.
    // DDG abstract = Wikipedia or their site (decent fallback).
    const rawDescription =
      bestFirecrawl?.ogDescription       // og:description tag (best)
      || bestFirecrawl?.metaDescription  // meta description
      || bestFirecrawl?.firstParagraph   // first body paragraph
      || webResult?.description          // DDG abstract (fallback)
      || '';

    // Company name = Clearbit canonical name or the search query.
    // NEVER use Firecrawl's og:title — it's often a tagline, not the company name.
    // (e.g. Notion's og:title is "The AI workspace that works for you.")
    const bestName = webResult?.name || q;

    const hasEnoughData  = rawDescription.length > 40;

    let aiMeta: { industry: string; technologies: string[] } | null = null;
    try {
      aiMeta = await inferMetaOnly({
        companyName:  bestName,
        website:      webResult?.website || website,
        description:  rawDescription,
        domain:       webResult?.domain || domain || undefined,
        hnHeadlines,
      });
    } catch (aiErr: any) {
      const msg = aiErr?.message || '';
      if (aiErr?.status === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
        if (!hasEnoughData) {
          return NextResponse.json(
            { error: 'rate_limited', message: 'AI rate limit hit. Please wait ~60 seconds and try again.' },
            { status: 429 }
          );
        }
        console.warn('[Search] AI rate limited, proceeding with web-only data');
      } else {
        console.error('[Search] AI meta error:', aiErr);
      }
    }

    const finalName     = bestName;
    const finalWebsite  = webResult?.website || website;
    const finalDesc     = rawDescription;
    const finalMission  = (bestFirecrawl?.ogDescription || rawDescription)?.split('.')[0]?.trim() + '.' || '';
    const finalIndustry = aiMeta?.industry || '';
    const finalLogo     = webResult?.logo_url
      || (webResult?.domain ? `https://favicon.im/${webResult.domain}?larger=true` : null)
      || (domain ? `https://favicon.im/${domain}?larger=true` : null);

    console.log(`[Search] Storing non-YC company: name="${finalName}" desc="${finalDesc.slice(0,60)}…"`);

    // Check if already in DB (exact name match)
    const { data: existingCompany } = await supabaseAdmin
      .from('companies')
      .select('*')
      .eq('name', finalName)
      .maybeSingle();

    let company: { id: string; [key: string]: any };

    if (existingCompany) {
      // Already cached — refresh description + logo with latest data
      console.log(`[Search] Non-YC already cached, updating: ${finalName}`);
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('companies')
        .update({
          description:  finalDesc || existingCompany.description,
          logo_url:     finalLogo || existingCompany.logo_url,
          website:      finalWebsite || existingCompany.website,
          industry:     finalIndustry || existingCompany.industry,
          technologies: (aiMeta?.technologies?.length ? aiMeta.technologies : existingCompany.technologies),
        })
        .eq('id', existingCompany.id)
        .select()
        .single();
      company = (updateErr || !updated) ? existingCompany : updated;
    } else {
      // New — insert
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('companies')
        .insert({
          name:         finalName,
          website:      finalWebsite || website,
          logo_url:     finalLogo,
          description:  finalDesc,
          mission:      finalMission,
          industry:     finalIndustry,
          recent_news:  hnHeadlines,
          technologies: aiMeta?.technologies ?? [],
        })
        .select()
        .single();
      if (insertErr || !inserted) {
        console.error('[Search] Non-YC insert error:', insertErr?.message);
        // Last resort: re-query in case another request raced us
        const { data: fallback } = await supabaseAdmin
          .from('companies').select('*').ilike('name', `%${finalName}%`).limit(5);
        if (fallback && fallback.length > 0) return NextResponse.json({ companies: fallback });
        return NextResponse.json({ error: 'db_error', message: 'Failed to save company.' }, { status: 500 });
      }
      company = inserted;
    }
    console.log(`[Search] Company ready: id=${company.id} name="${company.name}"`);


    // Only save real Hunter people — never AI-invented ones
    if (realPeople.length > 0) {
      const { error: pe } = await supabaseAdmin.from('people').insert(
        realPeople.map(p => ({
          company_id:          company.id,
          name:                p.name,
          role:                p.role || 'Team Member',
          email:               p.email ?? null,
          linkedin_url:        p.linkedinUrl ?? null,
          bio:                 '',
          previous_experience: '',
          category:            inferCategory(p.role),
        }))
      );
      if (pe) console.error('[Search] People insert error:', pe.message);
      else console.log(`[Search] Saved ${realPeople.length} real people (Hunter+GitHub)`);
    } else {
      console.log('[Search] No people found from any source — leaving team empty');
    }

    // Store secondary Clearbit stubs before returning (non-YC path)
    await storeSecondaryStubs();

    const { data: allMatches } = await supabaseAdmin
      .from('companies')
      .select('*')
      .ilike('name', `%${q}%`)
      .order('name')
      .limit(20);

    const ql2 = q.toLowerCase();
    (allMatches ?? [company]).sort((a, b) => {
      const al = a.name.toLowerCase();
      const bl = b.name.toLowerCase();
      const aRank = al === ql2 ? 0 : al.startsWith(ql2) ? 1 : 2;
      const bRank = bl === ql2 ? 0 : bl.startsWith(ql2) ? 1 : 2;
      return aRank - bRank;
    });

    if (AUTH_ENABLED && !isAdmin((await auth())?.user?.email)) { if (userId) await incrementUsage(userId); else if (ipHash) await incrementIpUsage(ipHash); }
    return NextResponse.json({ companies: allMatches ?? [company] });

  } catch (err) {
    console.error('[Search] Unhandled error:', err);
    return NextResponse.json({ error: 'server_error', message: 'Internal server error.' }, { status: 500 });
  }
}
