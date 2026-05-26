import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient as createSb } from '@supabase/supabase-js';
import { getPersona } from '@/lib/personas';
import { ShareView } from './share-view';

export const dynamic = 'force-dynamic';

interface SharedPayload {
  conversation: {
    id: string;
    title: string;
    persona_id: string;
    created_at: string;
    updated_at: string;
  };
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    created_at: string;
    attachments: any;
  }>;
}

async function fetchShared(token: string): Promise<SharedPayload | null> {
  // Anon client — RLS-bypassing function returns null for invalid/revoked tokens.
  const sb = createSb(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await sb.rpc('get_shared_conversation', { p_token: token });
  if (error || !data) return null;
  return data as SharedPayload;
}

export async function generateMetadata({ params }: { params: { token: string } }) {
  const data = await fetchShared(params.token);
  if (!data) return { title: 'Conversation not found' };
  return {
    title: `${data.conversation.title} · keko.ai`,
    description: 'A shared conversation on keko.ai',
  };
}

export default async function SharePage({ params }: { params: { token: string } }) {
  const data = await fetchShared(params.token);
  if (!data) notFound();

  const persona = getPersona(data.conversation.persona_id);

  return (
    <div className="min-h-screen">
      <header className="border-b border-hairline">
        <div className="max-w-3xl mx-auto px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="font-display text-[20px] tracking-tight leading-none">
            keko.ai
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-[0.2em] text-faint">
              Shared · read-only
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 lg:px-8 py-10">
        <div className="mb-10">
          <p className="text-[11px] uppercase tracking-widest text-faint mb-2">
            <span className="opacity-70 mr-1.5">{persona.emoji}</span>
            {persona.name}
          </p>
          <h1 className="font-display text-[36px] leading-tight tracking-tight">
            {data.conversation.title}
          </h1>
        </div>

        <ShareView messages={data.messages} personaEmoji={persona.emoji} personaName={persona.name} />

        <div className="mt-16 pt-6 border-t border-hairline flex items-center justify-between text-[12px] text-faint">
          <p>This is a read-only snapshot. Replies are not possible.</p>
          <Link
            href="/"
            className="text-fg underline underline-offset-4 decoration-faint hover:decoration-fg transition"
          >
            Try keko.ai →
          </Link>
        </div>
      </main>
    </div>
  );
}
