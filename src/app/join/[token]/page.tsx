import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function JoinPage({ params }: { params: { token: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Bounce to login, return here after auth.
    redirect(`/login?next=${encodeURIComponent(`/join/${params.token}`)}`);
  }

  const { data, error } = await supabase.rpc('redeem_invite', { p_token: params.token });

  if (error || !data || (typeof data === 'object' && 'error' in (data as any))) {
    return (
      <div className="min-h-screen grid place-items-center px-6">
        <div className="text-center max-w-md">
          <p className="font-display text-[40px] leading-tight tracking-tight mb-2">
            Invite invalid
          </p>
          <p className="text-subtle text-[14px] mb-6">
            This invite link doesn&rsquo;t work, or it&rsquo;s been revoked. Ask the owner for a fresh one.
          </p>
          <Link
            href="/"
            className="inline-block text-[14px] underline underline-offset-4 decoration-faint hover:decoration-fg transition"
          >
            Back to keko.ai
          </Link>
        </div>
      </div>
    );
  }

  const conversationId = (data as any).conversation_id as string;
  redirect(`/?c=${conversationId}`);
}
