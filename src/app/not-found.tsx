import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center px-6">
      <div className="text-center">
        <p className="font-display text-[80px] leading-none tracking-tight">404</p>
        <p className="text-subtle mt-2 text-[15px]">This page wandered off.</p>
        <Link
          href="/"
          className="inline-block mt-8 text-[14px] underline underline-offset-4 decoration-faint hover:decoration-fg transition"
        >
          Back to keko.ai
        </Link>
      </div>
    </div>
  );
}
