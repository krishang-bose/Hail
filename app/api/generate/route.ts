import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { generateOutreach } from '@/lib/openai';
import { buildPersonContext } from '@/lib/context';
import { checkDailyLimit, incrementUsage } from '@/lib/ratelimit';
import { DAILY_LIMIT, AUTH_ENABLED, isAdmin } from '@/lib/constants';

export async function POST(req: NextRequest) {
  try {
    // ── Auth + rate limit (only when AUTH_ENABLED) ────────────────────────────
    let userId: string | null = null;
    let usedToday = 0;

    if (AUTH_ENABLED) {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
      }
      userId = (session.user as typeof session.user & { id?: string }).id ?? null;
      if (!userId) {
        return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
      }

      // Admins bypass rate limits entirely
      if (!isAdmin(session.user.email)) {
        const { allowed, used } = await checkDailyLimit(userId);
        usedToday = used;
        if (!allowed) {
          return NextResponse.json(
            {
              error:   'daily_limit',
              message: `You've used all ${DAILY_LIMIT} messages for today. Resets at midnight UTC.`,
              used,
              limit:   DAILY_LIMIT,
            },
            { status: 429 }
          );
        }
      }
    }

    // ── Validate request ───────────────────────────────────────────────────────
    const { companyId, personId, userGoal } = await req.json();

    if (!companyId || !personId || !userGoal?.trim()) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Fetch company + person from DB
    const [{ data: company, error: companyError }, { data: person, error: personError }] =
      await Promise.all([
        supabaseAdmin.from('companies').select('*').eq('id', companyId).single(),
        supabaseAdmin.from('people').select('*').eq('id', personId).single(),
      ]);

    if (companyError || !company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    if (personError  || !person)  return NextResponse.json({ error: 'Person not found'  }, { status: 404 });

    // ── Build rich context (GitHub + PH + jobs + HN) — cached 24hr in Supabase ──
    const context = await buildPersonContext({
      personId:             person.id,
      personName:           person.name,
      personRole:           person.role,
      personBio:            person.bio,
      personExperience:     person.previous_experience,
      personEmail:          person.email,
      companyName:          company.name,
      companyWebsite:       company.website,
      companyMission:       company.mission,
      companyDescription:   company.description,
      companyIndustry:      company.industry,
      companyTechnologies:  company.technologies ?? [],
      userGoal,
    });

    console.log(`[Generate] Context (${context.fromCache ? 'cached' : 'fresh'}):\n${context.compact}`);

    // ── AI call ────────────────────────────────────────────────────────────────
    const generated = await generateOutreach({ compactContext: context.compact });

    // ── Increment usage AFTER successful generation (only when auth enabled) ──
    if (AUTH_ENABLED && userId) {
      await incrementUsage(userId);
    }

    // Save to DB
    await supabaseAdmin
      .from('messages')
      .insert({
        company_id:     companyId,
        person_id:      personId,
        user_goal:      userGoal,
        generated_text: generated,
      });

    return NextResponse.json({
      linkedin: generated.linkedin,
      email:    generated.email,
      subject:  generated.subject,
      // Usage info — only meaningful when auth is enabled
      usage: AUTH_ENABLED ? {
        used:  usedToday + 1,
        limit: DAILY_LIMIT,
      } : null,
      // Context signals for the UI badges
      contextSignals: {
        github:    context.github   ? `@${context.github.username}` : null,
        jobs:      context.jobs.slice(0, 3).map(j => j.title),
        phProduct: context.phProducts?.[0] ? `${context.phProducts[0].name} (${context.phProducts[0].votesCount} votes)` : null,
        hnFound:   context.hnMentions.length > 0,
        cached:    context.fromCache,
      },
    });

  } catch (err: any) {
    const msg = err?.message || '';
    if (err?.status === 429 || msg.includes('429') || msg.includes('quota')) {
      return NextResponse.json(
        { error: 'rate_limited', message: 'AI rate limit. Wait ~60s and retry.' },
        { status: 429 }
      );
    }
    console.error('[Generate] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
