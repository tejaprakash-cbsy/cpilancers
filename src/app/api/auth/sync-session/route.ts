import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole } from '@/types/database';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: { message: 'Unauthorized' } },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const requestedRole: UserRole = body.role === 'client' ? 'client' : 'consultant';

    let adminSupabase;
    try {
      adminSupabase = createAdminClient();
    } catch {
      adminSupabase = null;
    }

    const dbClient = adminSupabase || supabase;

    // Check if user row already exists
    const { data: existingUser } = await dbClient
      .from('users')
      .select('id, email, role, status')
      .eq('id', user.id)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            role: existingUser.role,
          },
        },
      });
    }

    // First-time user provisioning
    const role = requestedRole;
    const metadata = user.user_metadata || {};
    const fullName = (metadata.full_name || metadata.name || '').trim();
    const firstName =
      metadata.given_name ||
      metadata.first_name ||
      (fullName ? fullName.split(' ')[0] : 'User');
    const lastName =
      metadata.family_name ||
      metadata.last_name ||
      (fullName ? fullName.split(' ').slice(1).join(' ') : '');
    const displayName =
      fullName ||
      `${firstName} ${lastName}`.trim() ||
      user.email?.split('@')[0] ||
      user.phone ||
      'User';
    const avatarUrl = metadata.avatar_url || metadata.picture || null;

    await dbClient.from('users').upsert(
      {
        id: user.id,
        email: user.email?.toLowerCase() || (user.phone ? `${user.phone}@phone.cpilancers.local` : ''),
        role,
        status: 'active',
        is_email_verified: !!user.email,
        phone_number: user.phone || null,
      },
      { onConflict: 'id' }
    );

    await dbClient.from('profiles').upsert(
      {
        user_id: user.id,
        first_name: firstName,
        last_name: lastName,
        display_name: displayName,
        avatar_url: avatarUrl,
        timezone: 'UTC',
        country_code: 'US',
      },
      { onConflict: 'user_id' }
    );

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          role,
        },
      },
    });
  } catch (error) {
    console.error('[Sync Session Error]:', error);
    return NextResponse.json(
      { success: false, error: { message: 'Failed to sync session' } },
      { status: 500 }
    );
  }
}
