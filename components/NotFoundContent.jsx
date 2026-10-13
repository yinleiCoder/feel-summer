import Link from 'next/link';

import FuzzyText from '@/components/FuzzyText';

// Shared by app/not-found.js and app/(site)/not-found.js. The root one renders the
// nav itself (an unmatched URL never enters the (site) group); the (site) one gets
// the nav from its layout, so this component stays nav-free.
export default function NotFoundContent() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-12 px-6">
      {/* FuzzyText paints to a canvas, so the colour has to be a literal — a CSS
          variable would be passed to fillStyle unresolved. */}
      <FuzzyText
        fontSize="clamp(4rem, 18vw, 12rem)"
        color="#f4f4f5"
        baseIntensity={0.2}
        hoverIntensity={0.5}
      >
        404
      </FuzzyText>
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-sm tracking-[0.3em] text-foreground/50">这一页不存在</p>
        <Link
          href="/"
          className="rounded-full border border-white/15 px-6 py-2 text-sm text-foreground/80 transition-colors hover:border-white/40 hover:text-foreground"
        >
          返回首页
        </Link>
      </div>
    </main>
  );
}
