import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const idSchema = z.string().uuid();

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!idSchema.safeParse(params.id).success) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const { data: doc } = await supabase
    .from('rag_documents')
    .select('storage_path')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (doc?.storage_path) {
    await supabase.storage.from('attachments').remove([doc.storage_path]);
  }

  // Cascade deletes chunks via FK.
  const { error } = await supabase
    .from('rag_documents')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
