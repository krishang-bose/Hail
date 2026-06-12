import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';

// Provider clients

function getGemini() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  return new GoogleGenerativeAI(key).getGenerativeModel({
    model: 'gemini-2.0-flash-lite',
    generationConfig: { responseMimeType: 'application/json' },
  });
}

function getGroq() {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  return new Groq({ apiKey: key });
}

// JSON call with fallback chain: Gemini -> Groq -> Together AI -> Cohere

async function callAI(prompt: string): Promise<string> {
  const errors: string[] = [];

  // 1. Gemini
  try {
    const gemini = getGemini();
    if (gemini) {
      const res  = await gemini.generateContent(prompt);
      const text = res.response.text();
      JSON.parse(text);
      console.log('[AI] Using: Gemini');
      return text;
    }
  } catch (e: any) {
    const isQuota = e?.status === 429 || e?.message?.includes('quota') || e?.message?.includes('RESOURCE_EXHAUSTED');
    errors.push(`Gemini: ${isQuota ? 'quota exceeded' : e?.message}`);
    console.warn('[AI] Gemini failed:', errors[errors.length - 1]);
  }

  // 2. Groq (Llama 3.3 70B)
  try {
    const groq = getGroq();
    if (groq) {
      const res = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are a JSON-only assistant. Always respond with valid JSON only, no markdown, no explanation.' },
          { role: 'user',   content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      });
      const text = res.choices[0]?.message?.content || '';
      JSON.parse(text);
      console.log('[AI] Using: Groq (Llama 3.3 70B)');
      return text;
    }
  } catch (e: any) {
    errors.push(`Groq: ${e?.message}`);
    console.warn('[AI] Groq failed:', errors[errors.length - 1]);
  }

  // 3. Together AI
  try {
    const togetherKey = process.env.TOGETHER_API_KEY;
    if (togetherKey) {
      const res = await fetch('https://api.together.xyz/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${togetherKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
          messages: [
            { role: 'system', content: 'You are a JSON-only assistant. Always respond with valid JSON only.' },
            { role: 'user',   content: prompt },
          ],
          max_tokens: 2000,
          temperature: 0.7,
          response_format: { type: 'json_object' },
        }),
      });
      if (!res.ok) throw new Error(`Together AI HTTP ${res.status}`);
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      JSON.parse(text);
      console.log('[AI] Using: Together AI');
      return text;
    }
  } catch (e: any) {
    errors.push(`Together AI: ${e?.message}`);
    console.warn('[AI] Together AI failed:', errors[errors.length - 1]);
  }

  // 4. Cerebras — world's fastest inference (2100 tok/s), free, Llama 3.1 8B
  try {
    const cerebrasKey = process.env.CEREBRAS_API_KEY;
    if (cerebrasKey) {
      const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cerebrasKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama3.1-8b',
          messages: [
            { role: 'system', content: 'You are a JSON-only assistant. Always respond with valid JSON only, no markdown, no explanation.' },
            { role: 'user',   content: prompt },
          ],
          max_tokens: 1500,
          temperature: 0.7,
          response_format: { type: 'json_object' },
        }),
      });
      if (!res.ok) throw new Error(`Cerebras HTTP ${res.status}`);
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      JSON.parse(text);
      console.log('[AI] Using: Cerebras (Llama 3.1 8B)');
      return text;
    }
  } catch (e: any) {
    errors.push(`Cerebras: ${e?.message}`);
    console.warn('[AI] Cerebras failed:', errors[errors.length - 1]);
  }

  // 5. Cohere
  try {
    const cohereKey = process.env.COHERE_API_KEY;
    if (cohereKey) {
      const res = await fetch('https://api.cohere.com/v2/chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cohereKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'command-r-plus',
          messages: [
            { role: 'system', content: 'You are a JSON-only assistant. Always respond with valid JSON only, no markdown.' },
            { role: 'user',   content: prompt },
          ],
          max_tokens: 2000,
          temperature: 0.7,
          response_format: { type: 'json_object' },
        }),
      });
      if (!res.ok) throw new Error(`Cohere HTTP ${res.status}`);
      const data = await res.json();
      const text = data.message?.content?.[0]?.text || '';
      JSON.parse(text);
      console.log('[AI] Using: Cohere');
      return text;
    }
  } catch (e: any) {
    errors.push(`Cohere: ${e?.message}`);
    console.warn('[AI] Cohere failed:', errors[errors.length - 1]);
  }

  throw new Error(`All AI providers exhausted:\n${errors.join('\n')}`);
}

// Types

export type RealPersonSeed = {
  name: string;
  role: string;
  email?: string;
  department?: string | null;
};

export type AIEnrichmentInput = {
  companyName: string;
  website?: string;
  description?: string;   // from YC long_description
  oneLiner?: string;      // from YC one_liner
  industry?: string;      // from YC industry
  tags?: string[];        // from YC tags
  batch?: string;         // e.g. "Summer 2009"
  teamSize?: number;
  hnHeadlines?: string[]; // real HN headlines
  realPeople?: RealPersonSeed[]; // real people from Hunter.io
  emailPattern?: string | null;
  domain?: string;
};

export type EnrichedPerson = {
  name: string;
  role: string;
  email: string | null;
  bio: string;
  previous_experience: string;
  category: 'founder' | 'cto' | 'engineer' | 'recruiter';
};

export type EnrichedCompanyData = {
  name: string;
  website: string;
  description: string;
  mission: string;
  industry: string;
  recent_news: string[];
  technologies: string[];
  people: EnrichedPerson[];
};

// enrichWithAI — takes real API data as ground truth, AI only fills in the gaps
export async function enrichWithAI(input: AIEnrichmentInput): Promise<EnrichedCompanyData> {
  const hasPeople = (input.realPeople?.length ?? 0) > 0;
  const hasNews   = (input.hnHeadlines?.length ?? 0) > 0;

  const peopleContext = hasPeople
    ? input.realPeople!.map(p =>
        `  - ${p.name} | ${p.role || 'Unknown role'}${p.email ? ` | ${p.email}` : ''}${p.department ? ` | ${p.department}` : ''}`
      ).join('\n')
    : '  (none — return an empty array for people)';

  const newsContext = hasNews
    ? input.hnHeadlines!.map(h => `  - "${h}"`).join('\n')
    : '  (none found)';

  const prompt = `You are enriching a startup profile. Use the REAL DATA provided — do NOT hallucinate facts that conflict with it.

== REAL DATA (ground truth) ==
Company: ${input.companyName}
Website: ${input.website ?? 'unknown'}
${input.oneLiner ? `One-liner: ${input.oneLiner}` : ''}
${input.description ? `Description: ${input.description.slice(0, 600)}` : ''}
${input.industry ? `Industry: ${input.industry}` : ''}
${input.tags?.length ? `Tags: ${input.tags.join(', ')}` : ''}
${input.batch ? `YC Batch: ${input.batch}` : ''}
${input.teamSize ? `Team size: ${input.teamSize}` : ''}

Real HN headlines:
${newsContext}

Real people from Hunter.io (name | role | email | department):
${peopleContext}

== YOUR JOB ==
Return ONLY this JSON (no markdown, no explanation):
{
  "name": "${input.companyName}",
  "website": "${input.website ?? ''}",
  "description": "2-3 sentence description — use real description if provided, polish it",
  "mission": "1 crisp mission sentence",
  "industry": "${input.industry ?? 'use best guess'}",
  "recent_news": ["headline 1", "headline 2", "headline 3"],
  "technologies": ["tech1", "tech2", "tech3", "tech4", "tech5"],
  "people": []
}

Rules:
- recent_news: use real HN headlines if provided, fill remaining slots with plausible ones based on the company
- technologies: infer from industry/tags/description — be specific (e.g. "React" not "JavaScript framework")
- people: ONLY include real people listed above. If none were provided, return an empty array []. NEVER invent names.
- email: use the real email if provided, else null — NEVER guess or invent emails
- category: classify based on role title (founder/ceo -> founder, cto/vp eng -> cto, recruiter/talent -> recruiter, else engineer)`;

  const text = await callAI(prompt);
  return JSON.parse(text) as EnrichedCompanyData;
}

// generatePeople — minimal AI call used ONLY when Hunter has no real people.
// Much cheaper than enrichWithAI: generates people only, not company data.
export async function generatePeople(params: {
  companyName: string;
  industry: string;
  batch?: string;
}): Promise<EnrichedPerson[]> {
  const prompt = `Generate a realistic founding team for ${params.companyName} (${params.industry}${params.batch ? `, YC ${params.batch}` : ''}).

Return ONLY a JSON array (no object wrapper, no markdown):
[
  {"name":"Full Name","role":"Title","email":null,"bio":"2 sentences","previous_experience":"Previously at X","category":"founder"}
]

Include 2 founders, 1 cto, 2 engineers, 1 recruiter. Use realistic startup names.`;

  const text = await callAI(prompt);
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : (parsed.people ?? []);
}

export async function generateOutreach(params: {
  compactContext: string; // pre-built by lib/context.ts — structured facts, low token cost
}): Promise<{ linkedin: string; email: string; subject: string }> {
  const prompt = `You write hyper-personalized cold outreach. Use the specific facts below — DO NOT be generic.

${params.compactContext}

Rules:
- LinkedIn DM: 80–110 words, conversational, name-drop a specific repo/project/open-role from context
- Email: 160–200 words, subject line separate, reference something specific (GitHub project, HN post, open role)
- Never start with "I hope this message finds you well" or similar clichés
- Lead with something that shows you did your homework

Return ONLY JSON (no markdown):
{"linkedin":"...","email":"...","subject":"..."}`;

  const text = await callAI(prompt);
  return JSON.parse(text) as { linkedin: string; email: string; subject: string };
}

/**
 * inferMetaOnly — lightweight AI call for non-YC companies.
 * Given the company's own description (from DDG/Clearbit), infers only:
 *   - industry classification
 *   - technology stack
 * Does NOT rewrite or touch the description at all.
 * ~100 tokens vs ~500 for enrichWithAI.
 */
export async function inferMetaOnly(params: {
  companyName:  string;
  website?:     string;
  description?: string;
  domain?:      string;
  hnHeadlines?: string[];
}): Promise<{ industry: string; technologies: string[] }> {
  const prompt = `You are classifying a company. Based ONLY on the info below, return a JSON object with industry and technologies.

Company: ${params.companyName}
Website: ${params.website ?? params.domain ?? 'unknown'}
${params.description ? `Description: ${params.description.slice(0, 500)}` : ''}
${params.hnHeadlines?.length ? `HN context: ${params.hnHeadlines.slice(0, 3).join(' | ')}` : ''}

Return ONLY this JSON (no markdown, no explanation):
{"industry":"one of: B2B SaaS, Developer Tools, Fintech, Healthcare, E-commerce, AI/ML, Cybersecurity, EdTech, Consumer, Infrastructure, Other","technologies":["specific tech 1","specific tech 2","specific tech 3","specific tech 4","specific tech 5"]}

Rules:
- technologies: infer from the description/domain — be specific (e.g. "PostgreSQL" not "database", "React" not "frontend")
- if unsure about a technology, skip it rather than guess
- return at most 6 technologies`;

  const text = await callAI(prompt);
  const parsed = JSON.parse(text) as { industry: string; technologies: string[] };
  return {
    industry:     parsed.industry     ?? '',
    technologies: parsed.technologies ?? [],
  };
}
