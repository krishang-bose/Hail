// Hunter.io API — https://hunter.io/api-documentation
// 25 free searches/month. Returns real people + email patterns at a domain.

export type HunterPerson = {
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  seniority: string | null;
  department: string | null;
  confidence: number;
  linkedinUrl: string | null;
};

export type HunterResult = {
  emailPattern: string | null;
  organization: string | null;
  people: HunterPerson[];
};

export async function searchHunter(domain: string): Promise<HunterResult> {
  const key = process.env.HUNTER_API_KEY;
  if (!key) {
    console.log('[Hunter] No API key — skipping');
    return { emailPattern: null, organization: null, people: [] };
  }

  try {
    const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${key}&limit=10&type=personal`;
    const res = await fetch(url);

    if (res.status === 401) { console.warn('[Hunter] Invalid API key'); return { emailPattern: null, organization: null, people: [] }; }
    if (res.status === 429) { console.warn('[Hunter] Rate limited');    return { emailPattern: null, organization: null, people: [] }; }
    if (!res.ok) throw new Error(`Hunter HTTP ${res.status}`);

    const json = await res.json();
    const data = json.data ?? {};

    const people: HunterPerson[] = (data.emails ?? [])
      .filter((e: any) => e.first_name && e.last_name)
      .map((e: any) => ({
        name: `${e.first_name} ${e.last_name}`.trim(),
        firstName: e.first_name ?? '',
        lastName: e.last_name ?? '',
        email: e.value ?? '',
        role: e.position ?? '',
        seniority: e.seniority ?? null,
        department: e.department ?? null,
        confidence: e.confidence ?? 0,
        linkedinUrl: e.linkedin ?? null,
      }));

    console.log(`[Hunter] Found ${people.length} people at ${domain}`);
    return {
      emailPattern: data.pattern ?? null,
      organization: data.organization ?? null,
      people,
    };
  } catch (e) {
    console.warn('[Hunter] Failed:', e);
    return { emailPattern: null, organization: null, people: [] };
  }
}

// Guess email for a specific person using the domain's pattern
export function guessEmail(
  firstName: string,
  lastName: string,
  domain: string,
  pattern: string | null
): string | null {
  if (!pattern || !firstName || !lastName) return null;

  const f = firstName.toLowerCase();
  const l = lastName.toLowerCase();
  const fi = f[0] ?? '';
  const li = l[0] ?? '';

  return pattern
    .replace('{first}', f)
    .replace('{last}', l)
    .replace('{f}', fi)
    .replace('{l}', li)
    .replace('{first_initial}', fi)
    .replace('{last_initial}', li) + `@${domain}`;
}
