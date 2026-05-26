import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const createSchema = z.object({
  conversationId: z.string().uuid(),
});

const revokeSchema = z.object({
  conversationId: z.string().uuid(),
});

function makeToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // URL-safe base64
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

// Get existing share link for a conversation (if any)
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const conversationId = request.nextUrl.searchParams.get('conversationId');
  if (!conversationId || !z.string().uuid().safeParse(conversationId).success) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const { data } = await supabase
    .from('share_links')
    .select('token, created_at')
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .maybeSingle();

  return NextResponse.json({ link: data ?? null });
}

// Create a new share link (or return existing active one).
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  }

  // Verify ownership
  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', parsed.data.conversationId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!conv) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Reuse existing active link if there is one
  const { data: existing } = await supabase
    .from('share_links')
    .select('token')
    .eq('conversation_id', parsed.data.conversationId)
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .maybeSingle();
  if (existing) return NextResponse.json({ link: existing });

  const token = makeToken();
  const { data, error } = await supabase
    .from('share_links')
    .insert({
      token,
      conversation_id: parsed.data.conversationId,
      user_id: user.id,
    })
    .select('token')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ link: data });
}

// Revoke (mark all active links for this conversation as revoked).
export async function DELETE(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsed = revokeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  }

  const { error } = await supabase
    .from('share_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('conversation_id', parsed.data.conversationId)
    .eq('user_id', user.id)
    .is('revoked_at', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
