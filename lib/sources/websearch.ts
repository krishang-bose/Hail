// lib/sources/websearch.ts
// Free company lookup sources for non-YC companies.
// No auth, no rate limits, no API keys required.
//
// Pipeline:
//   1. Clearbit Autocomplete — returns UP TO 5 companies (name, domain, logo)
//   2. DuckDuckGo Instant Answer — fallback description for top result
//
// Both are intentionally unauthenticated public endpoints.

export interface WebCompanyResult {
  name:        string;
  domain:      string | null;
  logo_url:    string | null;
  description: string | null;
  website:     string | null;
}

// ── 1. Clearbit Autocomplete ──────────────────────────────────────────────
// https://clearbit.com/docs#autocomplete-api
// Returns UP TO 5 companies matching the query — name, domain, logo.

/** Returns the top result only (for backwards compat with existing callers). */
export async function clearbitSearch(query: string): Promise<WebCompanyResult | null> {
  const all = await clearbitSearchAll(query);
  return all.length > 0 ? all[0] : null;
}

/** Returns ALL Clearbit suggestions (up to 5) for a query. */
export async function clearbitSearchAll(query: string): Promise<WebCompanyResult[]> {
  try {
    const res = await fetch(
      `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(query)}`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return [];

    const results: any[] = await res.json();
    if (!results.length) return [];

    return results.map((c) => {
      const domain = c.domain ?? null;
      return {
        name:        c.name,
        domain,
        logo_url:    c.logo ?? (domain ? `https://favicon.im/${domain}?larger=true` : null),
        description: null, // Clearbit autocomplete doesn't include descriptions
        website:     domain ? `https://${domain}` : null,
      };
    });
  } catch (e) {
    console.warn('[Clearbit] Error:', e);
    return [];
  }
}

// ── 2. DuckDuckGo Instant Answer ─────────────────────────────────────────
// Returns abstract text, website, image for well-known companies
export async function duckduckgoSearch(query: string): Promise<{ abstract: string | null; website: string | null; image: string | null }> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return { abstract: null, website: null, image: null };

    const data = await res.json();
    return {
      abstract: data.AbstractText || data.Abstract || null,
      website:  data.AbstractURL || null,
      image:    data.Image ? `https://duckduckgo.com${data.Image}` : null,
    };
  } catch (e) {
    console.warn('[DDG] Error:', e);
    return { abstract: null, website: null, image: null };
  }
}

// ── Combined single-result lookup (backwards compat) ──────────────────────
// Returns the best single match — Clearbit top result enriched with DDG abstract.
export async function lookupCompanyWeb(query: string): Promise<WebCompanyResult | null> {
  const [clearbitResults, ddg] = await Promise.all([
    clearbitSearchAll(query),
    duckduckgoSearch(query),
  ]);

  const clearbit = clearbitResults[0] ?? null;

  if (!clearbit && !ddg.abstract) return null;

  const base = clearbit ?? {
    name:        query,
    domain:      null,
    logo_url:    null,
    website:     ddg.website,
    description: null,
  };

  return {
    ...base,
    description: ddg.abstract || base.description,
    website:     base.website ?? ddg.website,
  };
}

// ── Multi-company lookup ───────────────────────────────────────────────────
// Returns ALL Clearbit suggestions for a query (up to 5).
// The first entry is enriched with the DDG abstract; rest are lightweight stubs.
export async function lookupCompanyWebAll(query: string): Promise<WebCompanyResult[]> {
  const [clearbitResults, ddg] = await Promise.all([
    clearbitSearchAll(query),
    duckduckgoSearch(query),
  ]);

  if (clearbitResults.length === 0 && !ddg.abstract) return [];

  // Enrich first result with DDG abstract
  if (clearbitResults.length > 0 && ddg.abstract) {
    clearbitResults[0] = {
      ...clearbitResults[0],
      description: ddg.abstract,
      website:     clearbitResults[0].website ?? ddg.website,
    };
  }

  // If no Clearbit results, return DDG stub
  if (clearbitResults.length === 0 && ddg.abstract) {
    return [{
      name:        query,
      domain:      null,
      logo_url:    null,
      description: ddg.abstract,
      website:     ddg.website,
    }];
  }

  return clearbitResults;
}
