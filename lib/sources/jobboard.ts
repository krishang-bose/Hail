// Job board APIs — all free, public endpoints, no auth needed
// Tries Greenhouse → Lever → Ashby in order, returns first match
// Job postings reveal the company's real tech stack and what roles they're hiring for

export interface JobPosting {
  title: string;
  department: string;
  location: string;
}

async function tryGreenhouse(slug: string): Promise<JobPosting[]> {
  try {
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
      { next: { revalidate: 7200 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobs ?? []).slice(0, 10).map((j: any) => ({
      title: j.title,
      department: j.departments?.[0]?.name ?? '',
      location: j.location?.name ?? '',
    }));
  } catch { return []; }
}

async function tryLever(slug: string): Promise<JobPosting[]> {
  try {
    const res = await fetch(
      `https://api.lever.co/v0/postings/${slug}?mode=json&limit=10`,
      { next: { revalidate: 7200 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.slice(0, 10).map((j: any) => ({
      title: j.text,
      department: j.categories?.department ?? '',
      location: j.categories?.location ?? '',
    }));
  } catch { return []; }
}

async function tryAshby(slug: string): Promise<JobPosting[]> {
  try {
    const res = await fetch(
      `https://jobs.ashbyhq.com/api/non-user-facing/posting-board/job-postings?organizationHostedJobsPageName=${slug}`,
      { next: { revalidate: 7200 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobPostings ?? []).slice(0, 10).map((j: any) => ({
      title: j.title,
      department: j.departmentName ?? '',
      location: j.isRemote ? 'Remote' : (j.locationName ?? ''),
    }));
  } catch { return []; }
}

export async function fetchJobPostings(domain: string): Promise<JobPosting[]> {
  // Strip TLD to get company slug: "stripe.com" → "stripe"
  const slug = domain.split('.')[0];

  // Run all three in parallel — first one with results wins
  const [gh, lv, ab] = await Promise.all([
    tryGreenhouse(slug),
    tryLever(slug),
    tryAshby(slug),
  ]);

  const jobs = [...gh, ...lv, ...ab];
  // Deduplicate by title
  const seen = new Set<string>();
  return jobs.filter(j => {
    if (seen.has(j.title)) return false;
    seen.add(j.title);
    return true;
  }).slice(0, 8);
}
