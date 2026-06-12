import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { checkDailyLimit } from '@/lib/ratelimit';
import { DAILY_LIMIT } from '@/lib/constants';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = (session.user as typeof session.user & { id?: string }).id;
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { used, limit } = await checkDailyLimit(userId);
  return NextResponse.json({ used, limit, remaining: limit - used });
}
