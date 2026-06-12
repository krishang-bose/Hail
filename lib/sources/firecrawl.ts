/**
 * lib/sources/firecrawl.ts
 *
 * Firecrawl v2 — scrapes a company's own website and extracts:
 *   - ogDescription / meta description  → their exact marketing copy
 *   - ogTitle / title                   → their brand name as they spell it
 *   - First paragraph of markdown       → fallback body text
 *
 * This is the highest-fidelity source for company descriptions because
 * it reads the words they chose for SEO and social sharing, not third-party
 * summaries or AI paraphrases.
 *
 * Priority in search pipeline:
 *   Firecrawl ogDescription > Firecrawl metaDescription > DDG abstract > nothing
 */

const FIRECRAWL_API = 'https://api.firecrawl.dev/v2/scrape';

export interface FirecrawlResult {
  /** og:title or <title> — the company's canonical brand name */
  title:        string | null;
  /** og:description — their marketing one-liner (best source) */
  ogDescription: string | null;
  /** <meta name="description"> — usually same or similar to ogDescription */
  metaDescription: string | null;
  /** First meaningful paragraph from the scraped markdown — richer fallback */
  firstParagraph: string | null;
  /** The best available description in priority order */
  bestDescription: string | null;
}

/**
 * Scrape a company homepage and extract structured metadata.
 * Returns null on any error (timeout, 4xx, invalid JSON, missing API key).
 * Designed to be called in parallel with other sources — never throws.
 */
export async function scrapeCompanyHomepage(url: string): Promise<FirecrawlResult | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.warn('[Firecrawl] FIRECRAWL_API_KEY not set — skipping');
    return null;
  }

  // Normalise url
  const targetUrl = url.startsWith('http') ? url : `https://${url}`;

  try {
    const res = await fetch(FIRECRAWL_API, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        url:             targetUrl,
        formats:         ['markdown'],
        onlyMainContent: true,
        // Don't wait forever — 8s is plenty for a homepage
        timeout:         8000,
      }),
      // Next.js fetch cache — cache for 24h per URL
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      console.warn(`[Firecrawl] HTTP ${res.status} for ${targetUrl}`);
      return null;
    }

    const json = await res.json();
    if (!json.success || !json.data) {
      console.warn(`[Firecrawl] Unsuccessful response for ${targetUrl}`);
      return null;
    }

    const meta     = json.data.metadata ?? {};
    const markdown = (json.data.markdown ?? '') as string;

    const title          = meta.ogTitle        || meta.title        || null;
    const ogDescription  = meta.ogDescription                       || null;
    const metaDescription = meta.description                        || null;

    // Extract first non-empty, non-nav paragraph from markdown (> 40 chars)
    const firstParagraph = extractFirstParagraph(markdown);

    // Priority: og:description → meta description → first paragraph
    const bestDescription = ogDescription || metaDescription || firstParagraph;

    console.log(`[Firecrawl] ${targetUrl} → "${bestDescription?.slice(0, 80)}..."`);

    return { title, ogDescription, metaDescription, firstParagraph, bestDescription };
  } catch (err) {
    console.warn('[Firecrawl] Error scraping', targetUrl, ':', err);
    return null;
  }
}

/**
 * Extract the first meaningful paragraph from Firecrawl markdown.
 * Skips: nav links, image-only lines, headings, very short lines.
 */
function extractFirstParagraph(markdown: string): string | null {
  const lines = markdown.split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) continue;             // heading
    if (line.startsWith('!')) continue;             // image
    if (line.startsWith('[') && line.includes('→')) continue; // nav link
    if (line.startsWith('*') || line.startsWith('-')) continue; // list
    if (line.length < 40) continue;                // too short to be useful
    // Strip inline markdown (bold, links, code)
    const clean = line
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) → text
      .replace(/\*\*([^*]+)\*\*/g, '$1')        // **bold** → bold
      .replace(/`([^`]+)`/g, '$1')              // `code` → code
      .trim();
    if (clean.length >= 40) return clean.slice(0, 300);
  }
  return null;
}
