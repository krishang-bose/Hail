// GitHub API — free, 60 req/hr unauthenticated, 5000/hr with GITHUB_TOKEN
// Finds a person's GitHub profile and extracts interests, languages, and projects

export interface GitHubProfile {
  username: string;
  bio: string | null;
  location: string | null;
  blog: string | null;
  top_languages: string[];
  recent_repos: { name: string; description: string | null; language: string | null; stars: number }[];
  followers: number;
}

export type GitHubPerson = {
  login:     string;
  name:      string;
  role:      string;
  bio:       string | null;
  email:     string | null;
  blog:      string | null;
  avatarUrl: string | null;
  htmlUrl:   string;
};

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
  if (process.env.GITHUB_TOKEN) headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

async function ghFetch(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: githubHeaders(), next: { revalidate: 3600 } });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export async function findGitHubProfile(
  personName: string,
  companyDomain?: string
): Promise<GitHubProfile | null> {
  // Search: "John Smith stripe" → returns user list
  const companyKeyword = companyDomain ? companyDomain.split('.')[0] : '';
  const q = encodeURIComponent(`${personName} ${companyKeyword}`.trim());
  const search = await ghFetch(`https://api.github.com/search/users?q=${q}&per_page=3`);
  if (!search?.items?.length) return null;

  const login = search.items[0].login;

  // Fetch full profile + repos in parallel
  const [profile, repos] = await Promise.all([
    ghFetch(`https://api.github.com/users/${login}`),
    ghFetch(`https://api.github.com/users/${login}/repos?sort=updated&per_page=12&type=public`),
  ]);

  if (!profile) return null;

  // Tally languages by (stars + 1) so popular repos count more
  const langScore: Record<string, number> = {};
  const recentRepos: GitHubProfile['recent_repos'] = [];

  for (const r of repos ?? []) {
    if (r.fork) continue; // skip forks, only original work
    if (r.language) langScore[r.language] = (langScore[r.language] ?? 0) + r.stargazers_count + 1;
    recentRepos.push({
      name: r.name,
      description: r.description,
      language: r.language,
      stars: r.stargazers_count,
    });
  }

  const top_languages = Object.entries(langScore)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([lang]) => lang);

  return {
    username: login,
    bio: profile.bio ?? null,
    location: profile.location ?? null,
    blog: profile.blog ?? null,
    top_languages,
    recent_repos: recentRepos.slice(0, 5),
    followers: profile.followers ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// searchGitHubOrg — find real employees via the company's GitHub org
// Works for any tech company that has a public GitHub organisation.
// ─────────────────────────────────────────────────────────────────────────────

/** Converts a company name + domain into candidate GitHub org slug variations */
function nameToSlugs(companyName: string, domain: string | null): string[] {
  const base = companyName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

  const slugs: string[] = [base];
  if (base.endsWith('-inc'))   slugs.push(base.slice(0, -4));
  if (base.endsWith('-hq'))    slugs.push(base.slice(0, -3));
  if (!base.endsWith('hq'))   slugs.push(`${base}hq`);
  if (domain) {
    const domSlug = domain.split('.')[0].toLowerCase();
    if (domSlug && !slugs.includes(domSlug)) slugs.push(domSlug);
  }
  return [...new Set(slugs)].slice(0, 5);
}

/** Derive a human-readable role from a GitHub user's bio + company fields */
function deriveRole(bio: string | null, company: string | null): string {
  const text = `${bio ?? ''} ${company ?? ''}`.toLowerCase();
  if (text.includes('ceo') || text.includes('co-founder') || text.includes('cofounder')) return 'Co-founder / CEO';
  if (text.includes('cto') || text.includes('chief tech')) return 'CTO';
  if (text.includes('vp eng') || text.includes('vp of eng')) return 'VP Engineering';
  if (text.includes('design') || text.includes('ux ') || text.includes('ui ')) return 'Designer';
  if (text.includes('product manager') || text.includes('product lead')) return 'Product Manager';
  if (text.includes('devrel') || text.includes('developer advocate')) return 'Developer Advocate';
  if (text.includes('marketing') || text.includes('growth')) return 'Marketing';
  if (text.includes('data') || text.includes(' ml ') || text.includes('machine learning')) return 'Data / ML Engineer';
  if (text.includes('infra') || text.includes('platform') || text.includes('sre') || text.includes('devops')) return 'Infrastructure Engineer';
  if (text.includes('backend') || text.includes('back-end')) return 'Backend Engineer';
  if (text.includes('frontend') || text.includes('front-end')) return 'Frontend Engineer';
  return 'Software Engineer';
}

/**
 * Find a company's GitHub org and return up to `limit` real member profiles.
 * No API key required — uses GitHub's public endpoints.
 */
export async function searchGitHubOrg(
  companyName: string,
  domain: string | null,
  limit = 20
): Promise<GitHubPerson[]> {
  const slugs = nameToSlugs(companyName, domain);

  let orgLogin: string | null = null;
  for (const slug of slugs) {
    const org = await ghFetch(`https://api.github.com/orgs/${slug}`);
    if (org?.login) {
      orgLogin = org.login;
      console.log(`[GitHub] Found org "${orgLogin}" (slug: "${slug}")`);
      break;
    }
  }

  if (!orgLogin) {
    console.log(`[GitHub] No org found for "${companyName}" (tried: ${slugs.join(', ')})`);
    return [];
  }

  // Fetch public org members (up to 2× limit so we have room after filtering)
  const members: any[] = await ghFetch(
    `https://api.github.com/orgs/${orgLogin}/members?per_page=${Math.min(limit * 2, 60)}&public=true`
  ) ?? [];

  if (!Array.isArray(members) || members.length === 0) return [];

  // Enrich each member with their full profile in parallel
  const profiles = await Promise.all(
    members.slice(0, limit * 2).map(async (m: any): Promise<GitHubPerson | null> => {
      const user = await ghFetch(`https://api.github.com/users/${m.login}`);
      if (!user?.name) return null; // skip accounts with no display name

      return {
        login:     user.login,
        name:      user.name,
        role:      deriveRole(user.bio, user.company),
        bio:       user.bio || null,
        email:     user.email || null,
        blog:      user.blog || null,
        avatarUrl: user.avatar_url || null,
        htmlUrl:   user.html_url,
      };
    })
  );

  const results = profiles.filter((p): p is GitHubPerson => p !== null).slice(0, limit);
  console.log(`[GitHub] ${results.length} profiles from org "${orgLogin}"`);
  return results;
}
