# Hail — Startup Outreach Intelligence

> Discover startups, map their team, and generate highly personalized outreach messages for internships and engineering roles.

Built with **Next.js 14**, **TypeScript**, **Supabase**, and a multi-provider AI fallback chain (Gemini → Groq → Cohere → Together AI).

---

## Features

- 🔍 **Search any startup** — AI generates company intelligence (description, mission, tech stack, recent news)
- 🌳 **Visual org tree** — D3.js dendrogram mapping founders, CTOs, engineers, and recruiters
- ✉️ **AI outreach generator** — Personalized LinkedIn DM + email draft for any person you select
- 💾 **Smart caching** — Results saved to Supabase so repeat searches are instant and free
- 🔄 **Multi-provider AI fallback** — Automatically switches providers if one hits rate limits

---

## Quick Start (Local)

### 1. Clone & install

```bash
git clone https://github.com/your-username/project-hail.git
cd project-hail
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local` — see the API Keys table below for where to get each key.

### 3. Create database tables

Run this in your [Supabase SQL Editor](https://supabase.com/dashboard):

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  website TEXT,
  logo_url TEXT,
  description TEXT,
  mission TEXT,
  industry TEXT,
  recent_news TEXT[] DEFAULT '{}',
  technologies TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS people (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  linkedin_url TEXT,
  bio TEXT,
  previous_experience TEXT,
  category TEXT CHECK (category IN ('founder', 'cto', 'engineer', 'recruiter')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  person_id UUID REFERENCES people(id) ON DELETE CASCADE,
  user_goal TEXT,
  generated_text JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_people_company_id ON people(company_id);
CREATE INDEX IF NOT EXISTS idx_messages_company_id ON messages(company_id);
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on companies" ON companies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on people" ON people FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on messages" ON messages FOR ALL USING (true) WITH CHECK (true);
```

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Sharing with Students — How the API Limits Work

The app is designed to handle shared usage gracefully without burning through your API quota.

### Supabase caching (the key insight)

Every company searched is saved to Supabase. When anyone searches "Stripe" after the first person already did, **no AI call is made** — it's served from the DB instantly. This means:

- The **first search** for any company costs one AI call
- Every **repeat search** is free and instant for everyone
- Popular startups get cached fast — after the first student uses them, they're free for all


### Rate limit behaviour

The app already shows a **60-second cooldown UI** when Gemini's free tier is hit, and automatically falls back across 4 providers:

| Provider | Free Limit |
|---|---|
| Gemini | 15 req/min, 1,500/day |
| Groq | 30 req/min, 14,400/day |
| Cohere | 20 req/min, 1,000/month |
| Together AI | $1 free credit (~2,000 calls) |

With 4 providers chained, new searches are rarely blocked, and cached results are always free.

### Option B — Students run their own instance (BYOK)

If you prefer students to each have their own isolated copy:

1. Share the repo publicly on GitHub
2. Each student creates their own free accounts:
   - [supabase.com](https://supabase.com) — free, no credit card
   - [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — Gemini, free
   - [console.groq.com](https://console.groq.com) — Groq, free
3. They fill in `.env.local` and deploy to Vercel themselves

Zero shared cost — each student has a completely independent instance.

---

## API Keys Reference

| Variable | Where to get it | Cost |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | [supabase.com](https://supabase.com) → Project → Settings → API | Free |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same | Free |
| `SUPABASE_SERVICE_ROLE_KEY` | Same (**keep secret — never commit**) | Free |
| `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Free |
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) | Free |
| `COHERE_API_KEY` | [dashboard.cohere.com/api-keys](https://dashboard.cohere.com/api-keys) | Free tier |
| `TOGETHER_API_KEY` | [api.together.ai](https://api.together.ai) | $1 free credit |

> Add at least **Gemini + Groq** for the best reliability.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript |
| Database | Supabase (PostgreSQL) |
| AI | Gemini, Groq (Llama 3.3 70B), Cohere, Together AI |
| Visualization | D3.js |
| Deployment | Vercel |

---

## Project Structure

```
app/
  page.tsx              # Home / search
  company/[id]/page.tsx # Company intelligence + org tree
  outreach/page.tsx     # Message generator
  api/
    search/route.ts     # Search + AI enrichment + Supabase cache
    company/[id]/route.ts
    generate/route.ts   # Outreach generation
components/
  OrgTree.tsx           # D3 visualization
lib/
  openai.ts             # Multi-provider AI fallback chain
  supabase.ts           # Supabase client
  types.ts              # TypeScript types
supabase/
  migrations/           # SQL migration files
```
