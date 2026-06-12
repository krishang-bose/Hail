// Product Hunt API — GraphQL, developer_token (no OAuth needed for public data)
// Endpoint: https://api.producthunt.com/v2/api/graphql
//
// What we use it for:
// - Find a company's product launches on PH
// - Get launch names, taglines, vote counts, topics
// - Result: "I saw your launch of X on Product Hunt (Y upvotes)" — very strong outreach hook
// - Nobody else is doing this level of research

export interface PHProduct {
  name: string;
  tagline: string;
  votesCount: number;
  topics: string[];
  url: string;
  launchedAt: string; // ISO date
}

const PH_API = 'https://api.producthunt.com/v2/api/graphql';

export async function findPHProducts(companyName: string): Promise<PHProduct[]> {
  const token = process.env.PRODUCT_HUNT_TOKEN;
  if (!token) return [];

  const query = `
    query SearchPosts($query: String!) {
      posts(search: { query: $query }, first: 5, order: VOTES) {
        edges {
          node {
            name
            tagline
            votesCount
            url
            createdAt
            topics {
              edges {
                node { name }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const res = await fetch(PH_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify({ query, variables: { query: companyName } }),
      next: { revalidate: 86400 }, // cache 24hr — launches don't change often
    });

    if (!res.ok) {
      console.warn(`[PH] HTTP ${res.status}`);
      return [];
    }

    const json = await res.json();
    const edges = json?.data?.posts?.edges ?? [];

    return edges.map((e: any) => ({
      name:       e.node.name,
      tagline:    e.node.tagline,
      votesCount: e.node.votesCount,
      url:        e.node.url,
      launchedAt: e.node.createdAt,
      topics:     (e.node.topics?.edges ?? []).map((t: any) => t.node.name),
    }));
  } catch (err) {
    console.warn('[PH] Error:', err);
    return [];
  }
}
