import Link from 'next/link';

import AnimatedContent from '@/components/AnimatedContent';
import FlexCarousel from '@/components/FlexCarousel';
import FlowingMenu from '@/components/FlowingMenu';
import LenisScrollTrigger from '@/components/LenisScrollTrigger';
import ProfileLanyard from '@/components/ProfileLanyard';
import ScrollVelocity from '@/components/ScrollVelocity';
import SplitText from '@/components/SplitText';
import TextLoop from '@/components/TextLoop';

// One accent for the whole page. The badge, the menu, the ribbon's band and the
// index rows' hover flood all have to be the same violet, or the page reads as a
// row of unrelated demos instead of one design.
const ACCENT = '#5227FF';
const PAPER = '#f4f4f5';

// Order alternates landscape / portrait / square so the row keeps a rhythm; the
// carousel keeps each photo's natural aspect ratio, so widths vary anyway.
const PHOTOS = [
  { src: '/carousel/爷爷婆婆及其同学.jpg', title: '爷爷婆婆及其同学' },
  { src: '/carousel/婆婆.jpg', title: '婆婆' },
  { src: '/carousel/爷爷婆婆.jpg', title: '爷爷婆婆' },
  { src: '/carousel/成都薛之谦演唱会.jpg', title: '成都薛之谦演唱会' },
  { src: '/carousel/我面试建设银行.jpg', title: '我面试建设银行' },
  { src: '/carousel/万兽之王.jpg', title: '万兽之王' },
  { src: '/carousel/爷爷婆婆来我学校.jpg', title: '爷爷婆婆来我学校' },
  { src: '/carousel/第一次看演唱会.jpg', title: '第一次看演唱会' },
  { src: '/carousel/疫情来袭之前.png', title: '疫情来袭之前' },
  { src: '/carousel/再见了我的青春.jpg', title: '再见了我的青春' },
  { src: '/carousel/尹伟及弟妹回三台.JPG', title: '尹伟及弟妹回三台' },
  { src: '/carousel/送爷爷婆婆回三台.jpg', title: '送爷爷婆婆回三台' }
];

// FlowingMenu drops `image` straight into an inline `background-image`, and that
// markup is rendered on the server. A raw CJK path inside a serialised style
// attribute throws "Cannot convert argument to a ByteString" while Next prerenders
// — the same trap ProfileLanyard hit with its avatar.
const INDEX_ITEMS = PHOTOS.map(photo => ({
  link: '/album',
  text: photo.title,
  image: encodeURI(photo.src)
}));

// The one piece of running typography on the page: index, rule, Chinese title,
// Latin gloss, always in the same five seats. It is what makes the sections read as
// chapters rather than as full-height blocks stacked on top of each other, so every
// section below the hero opens with it.
function ChapterHead({ index, title, latin, meta }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-2 border-t border-border pt-5">
      <div className="flex items-baseline gap-4">
        <span className="font-mono text-[11px] tracking-[0.3em]" style={{ color: ACCENT }}>
          {index}
        </span>
        <h2 className="text-lg font-medium tracking-[0.28em] sm:text-xl">{title}</h2>
        <span className="hidden font-mono text-[10px] tracking-[0.34em] text-foreground/70 sm:inline">
          {latin}
        </span>
      </div>
      {meta ? (
        <span className="font-mono text-[10px] tracking-[0.24em] text-foreground/70">{meta}</span>
      ) : null}
    </header>
  );
}

export default function HomePage() {
  return (
    <main className="relative overflow-x-clip">
      <LenisScrollTrigger />

      {/* Softens the bottom edge of the fixed nav so a chapter head does not stop
          dead against it. The nav itself now carries its own frosted backdrop
          (see .staggered-menu-header), so this is a fade *below* the bar rather
          than the thing doing the covering — 80px clears the bar, which occupies
          16px..60px; z-30 is one layer under the nav's z-40. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-30 h-20 bg-linear-to-b from-background via-background/85 to-transparent"
      />

      {/* ── 序 ─────────────────────────────────────────────────────────────────
          h-dvh gives the section a definite height so the Lanyard's height:100%
          resolves to the viewport instead of collapsing to the canvas's aspect. */}
      <section className="relative flex h-dvh flex-col overflow-hidden">
        {/* Typographic backdrop. top-20 is 80px — just below the fixed nav, which
            occupies 16px..60px — so the two never overlap. The Lanyard renders on a
            transparent canvas, so the badge hangs in front of this text. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-20 bottom-0 flex select-none flex-col items-center justify-between pt-[3vh] pb-[4vh]"
        >
          {/* Right-aligned rather than centred: the strap hangs down the middle and
              would otherwise slice straight through the line. */}
          <div className="flex w-full items-center justify-end px-[5vw] text-[clamp(11px,1.1vw,14px)] tracking-[0.45em] text-foreground/60">
            <span>YIN LEI</span>
          </div>
          <span className="text-[clamp(150px,32vw,380px)] leading-[0.85] font-semibold tracking-[0.06em] text-foreground/8">
            知夏
          </span>
          <span className="max-w-[92vw] text-center text-[clamp(11px,1.1vw,14px)] tracking-[0.25em] text-foreground/60">
            我从前只知年岁更迭，现在才知，夏是为你而来
          </span>
        </div>
        <ProfileLanyard />
      </section>

      {/* ── 速度带 ─────────────────────────────────────────────────────────────
          The seam between the hero and the gallery: the page has just moved from a
          3D object to flat images, and this band is what covers the cut. The band is
          a texture, not a heading, so the default display type is replaced through
          scrollerClassName and the copy stays quiet.

          scrollContainerRef is left alone — Lenis scrolls the window itself, so the
          default window scroller is already the right one. */}
      <section className="border-y border-border">
        <ScrollVelocity
          texts={['知夏 2025 ✦ YIN LEI ✦']}
          velocity={55}
          numCopies={8}
          parallaxClassName=""
          scrollerClassName="flex whitespace-nowrap py-[1.7vh]"
          className="text-[clamp(12px,1.1vw,15px)] font-normal tracking-[0.4em] text-foreground/65"
        />
      </section>

      {/* ── 01 · 影像 ────────────────────────────────────────────────────────── */}
      <section className="pt-[16vh]">
        <div className="px-[5vw]">
          <AnimatedContent distance={26} duration={0.7}>
            <ChapterHead index="01" title="影像" latin="THE IMAGES" meta={`${PHOTOS.length} 张 · 2025`} />
          </AnimatedContent>
        </div>

        {/* Full-bleed on purpose: the bend lens is a stage, and a stage with page
            margins on it looks like a screenshot of one. The header above keeps the
            page margin, so the two edges never line up and the row reads as floating
            rather than boxed. The section's padding moves inside the chapter head
            instead of sitting on the section, because a negative arbitrary margin
            does not survive the Tailwind v4 pass in this project. */}
        <div className="mt-[7vh] h-[70vh] w-full">
          <FlexCarousel items={PHOTOS} loop={false} cardHeight={0.6} />
        </div>

        <div className="px-[5vw]">
          <AnimatedContent distance={18} duration={0.6} delay={0.15}>
            <p className="mt-[5vh] text-center font-mono text-[10px] tracking-[0.4em] text-foreground/65">
              拖动浏览 · 点击放大
            </p>
          </AnimatedContent>
        </div>
      </section>

      {/* ── 02 · 索引 ────────────────────────────────────────────────────────── */}
      <section className="pt-[18vh]">
        <div className="px-[5vw]">
          <AnimatedContent distance={26} duration={0.7}>
            <ChapterHead
              index="02"
              title="索引"
              latin="INDEX"
              meta={`${PHOTOS.length} 条记忆 · 全部照片 →`}
            />
          </AnimatedContent>
        </div>

        {/* FlowingMenu is `h-full` and full-bleed by construction, so it takes a
            sized parent rather than sitting directly in the section; its rows are
            flex-1, which makes each row 86vh / 12. Rows are deliberately dim — the
            accent flood and the photo running through the marquee on hover are the
            whole interaction, and twelve rows of full-strength white would shout over
            it.

            Row and rule colours come from the theme tokens, not from the palette at
            the top of this file: the marquee's own type sits on the accent, so it can
            stay PAPER, but the rows underneath it have to survive a white background
            too. These land in inline styles, where `var()` resolves — the colours GSAP
            animates are the ones that cannot be variables. */}
        <div className="mt-[6vh] h-[86vh] w-full">
          <FlowingMenu
            items={INDEX_ITEMS}
            speed={16}
            textColor="var(--muted-foreground)"
            bgColor="transparent"
            marqueeBgColor={ACCENT}
            marqueeTextColor={PAPER}
            borderColor="var(--border)"
          />
        </div>
      </section>

      {/* ── 03 · 尾声 ────────────────────────────────────────────────────────── */}
      <section className="px-[5vw] pt-[20vh]">
        <AnimatedContent distance={26} duration={0.7}>
          <ChapterHead index="03" title="尾声" latin="EPILOGUE" />
        </AnimatedContent>

        {/* The hero's line, said again at full strength: up there it is a watermark
            behind the badge, here it is the last thing on the page. Split twice at
            the comma so the two halves rise one after the other instead of as one
            long row of characters. */}
        <div className="mt-[10vh] flex flex-col items-center gap-4">
          <SplitText
            text="你透支了我似水年华里的太多"
            tag="p"
            splitType="chars"
            delay={45}
            duration={1.1}
            className="text-center text-[clamp(19px,3vw,40px)] font-medium tracking-[0.16em] text-foreground/90"
          />
          <SplitText
            text=" 我的时间， 我的眼泪"
            tag="p"
            splitType="chars"
            delay={45}
            duration={1.1}
            className="text-center text-[clamp(19px,3vw,40px)] font-medium tracking-[0.16em] text-foreground/90"
          />
        </div>

        <AnimatedContent distance={20} duration={0.7} delay={0.2} className="mt-[9vh] flex justify-center">
          <Link
            href="/album"
            className="group inline-flex items-center gap-3 rounded-full border border-border px-7 py-3 font-mono text-[11px] tracking-[0.3em] text-foreground/70 transition-colors duration-300 hover:border-transparent hover:bg-[#5227FF] hover:text-white"
          >
            进入相册
            <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
          </Link>
        </AnimatedContent>
      </section>

      {/* The ribbon is the site's signature — same violet as the menu and the badge —
          so it gets the last word. The SVG carries ~120 units of empty viewBox above
          and below the ribbon, which scales with the width; the negative margin crops
          it. Inline style, not a Tailwind class: v4 emits nothing for negative
          arbitrary margins here, so the crop silently did not apply. */}
      <section className="w-full overflow-hidden pt-[14vh]">
        <div style={{ margin: '-6vw 0' }}>
          <TextLoop text="知夏 2025" color={PAPER} ribbonColor={ACCENT} />
        </div>
      </section>

      <p className="pt-[3vh] pb-[10vh] text-center font-mono text-[10px] tracking-[0.45em] text-foreground/60">
        知夏 · 尹磊 · 2025
      </p>
    </main>
  );
}
