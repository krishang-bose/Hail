// Hacker News via Algolia Search API — https://hn.algolia.com/api
// No auth, no rate limit. Returns real HN stories mentioning the company.

export type HNHit = {
  objectID: string;
  title: string;
  url?: string;
  points: number;
  num_comments: number;
  created_at: string;
  author: string;
};

export async function searchHN(query: string): Promise<string[]> {
  try {
    // Search for stories about this company
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=10`;
    const res = await fetch(url);
    if (!res.ok) return [];

    const data = await res.json();
    const hits: HNHit[] = data.hits ?? [];

    // Filter to hits actually about this company (title contains the query)
    const q = query.toLowerCase();
    const relevant = hits.filter(h =>
      h.title?.toLowerCase().includes(q) && h.points > 10
    );

    // Return top 3 titles sorted by points
    return relevant
      .sort((a, b) => b.points - a.points)
      .slice(0, 3)
      .map(h => h.title);
  } catch (e) {
    console.warn('[HN] Search failed:', e);
    return [];
  }
}

// Search "Who is hiring" threads for a company
export async function searchHNHiring(companyName: string): Promise<string[]> {
  try {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(companyName)}&tags=comment&hitsPerPage=5`;
    const res = await fetch(url);
    if (!res.ok) return [];

    const data = await res.json();
    const hits = data.hits ?? [];

    const q = companyName.toLowerCase();
    return hits
      .filter((h: any) => h.comment_text?.toLowerCase().includes(q))
      .slice(0, 2)
      .map((h: any) => {
        const text: string = h.comment_text ?? '';
        // Extract first line (usually job title / role)
        return text.split('\n')[0].replace(/<[^>]+>/g, '').trim().slice(0, 120);
      })
      .filter(Boolean);
  } catch (e) {
    console.warn('[HN] Hiring search failed:', e);
    return [];
  }
}
