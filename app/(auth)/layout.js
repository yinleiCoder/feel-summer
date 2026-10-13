import { Fragment } from 'react';
import Link from 'next/link';

import GridMotion from '@/components/GridMotion';
import { getBackdropPhotos, UNSPLASH_URL } from '@/lib/unsplash';

// Auth pages deliberately sit outside the (site) group so they render without the
// fixed CardNav; the wordmark doubles as the way back to the site.
//
// The wall behind them is the one full-bleed surface on the site that is not the
// visitor's own photography: these two pages have nothing to show yet, so they borrow
// a summer from Unsplash instead. It sits under everything, ignores the pointer
// (GridMotion reads pointermove from the window), and the tiles stay grayscale and
// dimmed until the cursor brings colour back near it — which is also what keeps the
// card readable in the middle of it.
export default async function AuthLayout({ children }) {
  const { photos, people } = await getBackdropPhotos();

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden px-6 py-10">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <GridMotion
          items={photos}
          rows={5}
          aspectRatio={1.33}
          gap={14}
          radius={18}
          angle={-10}
          speed={20}
          direction="alternate"
          parallax={0.4}
          spotlight={0.65}
          // High enough that the wordmark and the credit line stay legible over
          // whatever photo lands behind them — the spotlight is what keeps the wall
          // from going flat, since it lifts tiles back to full strength under the
          // cursor.
          dim={0.58}
          grayscale
          fade={0.8}
          // Read from the theme tokens rather than from GridMotion's own dark/light
          // palette: the tile colours would otherwise be baked into the server's
          // markup and disagree with the store as soon as someone whose stored theme
          // is light hydrates. A var() resolves in CSS, on both sides, at paint time.
          tileColor="var(--card)"
          textColor="var(--muted-foreground)"
        />
      </div>

      {/* A pool of page background under the middle of the wall. Without it the
          wordmark — and the feature text inside the card's top edge — sit on whatever
          photo the grid happens to place there, and a white wordmark on a bright tile
          is unreadable no matter how far the tiles are dimmed: the spotlight lifts
          them back to full strength exactly where the pointer is. The wall stays
          whole at the edges, where GridMotion's own fade is already working.

          Inline rather than a Tailwind arbitrary value: the gradient's commas and
          percentages have to survive the class parser, and this one is easier to read
          and verify as CSS. It is theme-agnostic on purpose — every stop is the page
          background at some alpha. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 58% 54% at 50% 50%, var(--background) 0%, color-mix(in oklab, var(--background) 62%, transparent) 46%, transparent 76%)'
        }}
      />

      {/* flex-1 rather than a plain centring column: the credit below has to sit at
          the foot of the page without dragging the card off centre. */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8">
        <Link href="/" className="text-xl font-semibold tracking-[0.12em]">
          知夏
        </Link>
        {children}
      </div>

      {/* Attribution is an Unsplash API requirement, not a design choice: the links
          carry the UTM parameters their guidelines ask for. It sits at the foot of
          the page, where GridMotion's edge fade has already taken the tiles out. */}
      <p className="relative z-10 text-center text-[10px] leading-relaxed tracking-[0.12em] text-muted-foreground/80">
        照片来自{' '}
        <a
          href={UNSPLASH_URL}
          target="_blank"
          rel="noreferrer"
          className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          Unsplash
        </a>
        {people.map(person => (
          <Fragment key={person.url}>
            <span aria-hidden="true"> · </span>
            <a
              href={person.url}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              {person.name}
            </a>
          </Fragment>
        ))}
      </p>
    </main>
  );
}
