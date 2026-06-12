import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('*')
      .eq('id', id)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const { data: people, error: peopleError } = await supabaseAdmin
      .from('people')
      .select('*')
      .eq('company_id', id)
      .order('category');

    if (peopleError) {
      console.error('People fetch error:', peopleError);
    }

    return NextResponse.json({
      company,
      people: people || [],
    });
  } catch (err) {
    console.error('Company API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE — purge company + people from cache so next search re-fetches fresh data
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { error } = await supabaseAdmin.from('companies').delete().eq('id', id);
  if (error) {
    console.error('[Refresh] Delete error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`[Refresh] Purged company ${id} from cache`);
  return NextResponse.json({ success: true });
}
