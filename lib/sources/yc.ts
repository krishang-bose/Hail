// YC OSS API — https://github.com/yc-oss/api
// No auth needed, no rate limit. 5,954 companies as of 2026.
// We fetch all.json once per 24h (Next.js server-side fetch cache).

export type YCCompany = {
  id: number;
  name: string;
  slug: string;
  former_names: string[];
  small_logo_thumb_url: string | null;
  website: string;
  all_locations: string;
  long_description: string;
  one_liner: string;
  team_size: number;
  industry: string;
  subindustry: string;
  tags: string[];
  batch: string;
  status: 'Active' | 'Acquired' | 'Public' | 'Inactive' | string;
  isHiring: boolean;
  nonprofit: boolean;
  top_company: boolean;
  url: string; // YC profile URL
};

let _cache: YCCompany[] | null = null;
let _cacheTime = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

async function getAllCompanies(): Promise<YCCompany[]> {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) return _cache;

  try {
    const res = await fetch('https://yc-oss.github.io/api/companies/all.json', {
      next: { revalidate: 86400 },
    });
    if (!res.ok) throw new Error(`YC API ${res.status}`);
    _cache = await res.json() as YCCompany[];
    _cacheTime = now;
    console.log(`[YC] Loaded ${_cache.length} companies`);
    return _cache;
  } catch (e) {
    console.warn('[YC] Failed to load all.json:', e);
    return _cache ?? [];
  }
}

export async function findYCCompany(query: string): Promise<YCCompany | null> {
  const companies = await getAllCompanies();
  if (!companies.length) return null;

  const q = query.toLowerCase().trim();

  // 1. Exact name match
  const exact = companies.find(c => c.name.toLowerCase() === q);
  if (exact) return exact;

  // 2. Name starts with query
  const startsWith = companies.find(c => c.name.toLowerCase().startsWith(q));
  if (startsWith) return startsWith;

  // 3. Slug match
  const slugMatch = companies.find(c => c.slug.toLowerCase() === q.replace(/\s+/g, '-'));
  if (slugMatch) return slugMatch;

  // 4. Name contains query (only if query >= 4 chars to avoid false positives)
  if (q.length >= 4) {
    const contains = companies.find(c => c.name.toLowerCase().includes(q));
    if (contains) return contains;
  }

  return null;
}
