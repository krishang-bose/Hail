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
	name: string;
	domain: string | null;
	logo_url: string | null;
	description: string | null;
	website: string | null;
}

type ClearbitCompany = {
	name: string;
	domain?: string | null;
	logo?: string | null;
};

// ── 1. Clearbit Autocomplete ──────────────────────────────────────────────
// https://clearbit.com/docs#autocomplete-api
// Returns UP TO 5 companies matching the query — name, domain, logo.

/** Returns the top result only (for backwards compat with existing callers). */
async function clearbitSearch(
	query: string,
): Promise<WebCompanyResult | null> {
	const all = await clearbitSearchAll(query);
	return all.length > 0 ? all[0] : null;
}

/** Returns ALL Clearbit suggestions (up to 5) for a query. */
export async function clearbitSearchAll(
	query: string,
): Promise<WebCompanyResult[]> {
	try {
		const res = await fetch(
			`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(query)}`,
			{ next: { revalidate: 3600 } },
		);
		if (!res.ok) return [];

		const results: ClearbitCompany[] = await res.json();
		if (!results.length) return [];

		return results.map((c) => {
			const domain = c.domain ?? null;
			return {
				name: c.name,
				domain,
				logo_url:
					c.logo ??
					(domain ? `https://favicon.im/${domain}?larger=true` : null),
				description: null, // Clearbit autocomplete doesn't include descriptions
				website: domain ? `https://${domain}` : null,
			};
		});
	} catch (e) {
		console.warn("[Clearbit] Error:", e);
		return [];
	}
}

// ── 2. DuckDuckGo Instant Answer ─────────────────────────────────────────
// Returns abstract text, website, image for well-known companies
export async function duckduckgoSearch(query: string): Promise<{
	abstract: string | null;
	website: string | null;
	image: string | null;
}> {
	try {
		const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
		const res = await fetch(url, { next: { revalidate: 3600 } });
		if (!res.ok) return { abstract: null, website: null, image: null };

		const data = await res.json();
		return {
			abstract: data.AbstractText || data.Abstract || null,
			website: data.AbstractURL || null,
			image: data.Image ? `https://duckduckgo.com${data.Image}` : null,
		};
	} catch (e) {
		console.warn("[DDG] Error:", e);
		return { abstract: null, website: null, image: null };
	}
}

// ── Combined single-result lookup (backwards compat) ──────────────────────
// Returns the best single match — Clearbit top result enriched with DDG abstract.
export async function lookupCompanyWeb(
	query: string,
): Promise<WebCompanyResult | null> {
	const [clearbitResults, ddg] = await Promise.all([
		clearbitSearchAll(query),
		duckduckgoSearch(query),
	]);

	const clearbit = clearbitResults[0] ?? null;

	if (!clearbit && !ddg.abstract) return null;

	const base = clearbit ?? {
		name: query,
		domain: null,
		logo_url: null,
		website: ddg.website,
		description: null,
	};

	return {
		...base,
		description: ddg.abstract || base.description,
		website: base.website ?? ddg.website,
	};
}

// ── Multi-company lookup ───────────────────────────────────────────────────
// Returns ALL Clearbit suggestions for a query (up to 5).
// The first entry is enriched with the DDG abstract; rest are lightweight stubs.
export async function lookupCompanyWebAll(
	query: string,
): Promise<WebCompanyResult[]> {
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
			website: clearbitResults[0].website ?? ddg.website,
		};
	}

	// If no Clearbit results, return DDG stub
	if (clearbitResults.length === 0 && ddg.abstract) {
		return [
			{
				name: query,
				domain: null,
				logo_url: null,
				description: ddg.abstract,
				website: ddg.website,
			},
		];
	}

	return clearbitResults;
}

// ── LinkedIn company search ────────────────────────────────────────────────
// Searches DuckDuckGo for site:linkedin.com/company "CompanyName"
// to extract company page URL + description snippet.

export interface LinkedInCompanyResult {
	linkedinUrl: string;
	description: string | null;
	industry: string | null;
}

export async function searchLinkedInCompany(
	companyName: string,
): Promise<LinkedInCompanyResult | null> {
	try {
		const query = `site:linkedin.com/company "${companyName}"`;
		const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

		const res = await fetch(url, {
			headers: {
				"User-Agent": "Mozilla/5.0 (compatible; HailBot/1.0)",
				"Accept-Language": "en-US,en;q=0.9",
			},
			next: { revalidate: 3600 },
		});
		if (!res.ok) return null;

		const html = await res.text();

		// Find first linkedin.com/company link
		const linkMatch = html.match(
			/href="(https?:\/\/(?:www\.)?linkedin\.com\/company\/[^"?&]+)/,
		);
		if (!linkMatch) return null;

		// Extract snippet text (description-like content)
		const snippetMatch = html.match(
			/<a[^>]+class="result__snippet"[^>]*>([^<]{20,})<\/a>/,
		);
		const raw = snippetMatch?.[1]?.trim() ?? null;

		// Attempt to extract industry from snippet like "... | Industry · ..."
		const industryMatch = raw?.match(/Industry[·\s·]+([^|·\n]{3,40})/i);
		const industry = industryMatch?.[1]?.trim() ?? null;

		console.log(`[LinkedIn] Company page found: ${linkMatch[1]}`);
		return { linkedinUrl: linkMatch[1], description: raw, industry };
	} catch (e) {
		console.warn("[LinkedIn] Company search error:", e);
		return null;
	}
}

// When Hunter + GitHub return 0 people, search DuckDuckGo for:
//   site:linkedin.com/in "CompanyName"
// This returns real public LinkedIn profile URLs without needing an API key.

export interface LinkedInPersonResult {
	name: string;
	linkedinUrl: string;
	role: string | null;
	snippet: string | null;
}

/**
 * Search DuckDuckGo for LinkedIn profiles matching a company name.
 * Uses the HTML endpoint (no API key, no rate limit header needed).
 * Returns up to `limit` results.
 */
export async function searchLinkedInEmployees(
	companyName: string,
	limit = 15,
): Promise<LinkedInPersonResult[]> {
	try {
		const query = `site:linkedin.com/in "${companyName}"`;
		const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

		const res = await fetch(url, {
			headers: {
				"User-Agent": "Mozilla/5.0 (compatible; HailBot/1.0)",
				"Accept-Language": "en-US,en;q=0.9",
			},
			next: { revalidate: 3600 },
		});
		if (!res.ok) {
			console.warn("[LinkedIn] DDG request failed:", res.status);
			return [];
		}

		const html = await res.text();

		// Extract result blocks — each is a <div class="result__body">
		const results: LinkedInPersonResult[] = [];

		// Match LinkedIn /in/ profile URLs
		const linkRegex =
			/href="(https?:\/\/(?:www\.)?linkedin\.com\/in\/[^"?&]+)/g;
		const titleRegex = /<a[^>]+class="result__a"[^>]*>([^<]+)<\/a>/g;
		const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]+?)<\/a>/g;

		const links: string[] = [];
		const titles: string[] = [];
		const snippets: string[] = [];

		let m: RegExpExecArray | null;
		while ((m = linkRegex.exec(html)) !== null) links.push(m[1]);
		while ((m = titleRegex.exec(html)) !== null) titles.push(m[1].trim());
		while ((m = snippetRegex.exec(html)) !== null) snippets.push(m[1].trim());

		for (let i = 0; i < Math.min(links.length, limit); i++) {
			const rawTitle = titles[i] ?? "";
			const snippet = snippets[i] ?? null;

			// LinkedIn titles look like "John Smith - Senior Engineer at Acme | LinkedIn"
			// Extract name (before first " - " or " | ")
			const namePart = rawTitle.split(" - ")[0].split(" | ")[0].trim();
			// Extract role from title: "John Smith - Senior Engineer at Acme | LinkedIn"
			const afterDash = rawTitle.split(" - ")[1] ?? "";
			const role = afterDash.split(" at ")[0].split(" | ")[0].trim() || null;

			if (!namePart || namePart.toLowerCase().includes("linkedin")) continue;

			results.push({
				name: namePart,
				linkedinUrl: links[i],
				role: role || null,
				snippet: snippet,
			});
		}

		console.log(
			`[LinkedIn] Found ${results.length} profiles via DDG for "${companyName}"`,
		);
		return results;
	} catch (e) {
		console.warn("[LinkedIn] Search error:", e);
		return [];
	}
}
