'use client';

import { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';

import { useThemeStore } from '@/lib/store/theme-store-provider';

import Lanyard from './Lanyard';
import SpotlightCard from './SpotlightCard';

// The Lanyard card face is CARD_SIZES.portrait = [1.6, 2.25] world units, so the
// front texture is captured at that same aspect and nothing gets cropped by "cover".
const FACE_WIDTH = 340;
const FACE_HEIGHT = Math.round((FACE_WIDTH * 2.25) / 1.6);

// Percent-encoded: this <img> is server-rendered, and a raw non-ASCII src throws
// "Cannot convert argument to a ByteString" while Next prerenders the page.
const AVATAR_URL = encodeURI('/作者.jpg');

// 深色主题下工牌换成品牌紫；浅色主题保持原来的近黑。
const CARD_ON_DARK = '#5227ff';
const CARD_ON_LIGHT = '#111111';

// 装饰的三个色。紫底上不能再用品牌紫 —— 同色相叠同色相等于没画，
// 所以换成同族的浅紫做「同一件事的深浅变化」，形状不变、只是换了调子。
const DECOR_ON_DARK = ['#a99bff', '#c9c0ff', '#e4e0ff'];
const DECOR_ON_LIGHT = ['#5227ff', '#8b7bff', '#b497cf'];

export default function ProfileLanyard({ className = '' }) {
  const cardRef = useRef(null);
  const avatarRef = useRef(null);
  const [frontImage, setFrontImage] = useState(null);

  // 订阅 theme store，但只有在挂载之后才认它的值。
  //
  // store 的初始值是 resolveInitialTheme 在浏览器里读 DOM 得出的，服务端没有 DOM、
  // 只能落到默认值，两者可能不同 —— 谁在 render 里依赖它谁就 hydration mismatch。
  // （ThemeToggle 顶上那段讲的是同一件事，它的解法是「两个图标都渲染、交给 CSS」；
  // 这里办不到，因为颜色要进贴图，没法交给 CSS。）
  //
  // 所以 mounted 之前一律当 null：先按服务端那套渲染，挂载后再跟着 store 走、
  // 重截一次贴图。三态而不是布尔值，是为了让「还没挂载」和「挂载后读到浅色」区分开 ——
  // 都是 false 的话，浅色用户那次截图的 effect 就永远不会触发。
  //
  // 订阅是必须的：早先这里只在挂载时读一次 dataset.theme，于是点切换按钮时
  // 卡面和吊绳都停在旧主题上，非要刷新才换色。
  const storeTheme = useThemeStore(state => state.theme);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const theme = mounted ? storeTheme : null;

  const isDark = theme === 'dark';
  const faceColor = isDark ? CARD_ON_DARK : CARD_ON_LIGHT;
  const decor = isDark ? DECOR_ON_DARK : DECOR_ON_LIGHT;

  // 卡上只有 "Yin Lei" 这一行降不透明度，其余文字一律实心白。
  //
  // 白字在紫底上降透明度掉得比在黑底上快得多：#5227ff 上 /45 实测只有 2.4:1，
  // 所以紫底时抬到 /80（约 4.8:1）；近黑底保持 /45。
  const faint = isDark ? 'text-white/80' : 'text-white/45';

  useEffect(() => {
    // 主题没读出来之前不截 —— 截了也是错的底色，白跑一次。
    if (theme === null) return undefined;

    const node = cardRef.current;
    if (!node) return undefined;
    let cancelled = false;
    const face = theme === 'dark' ? CARD_ON_DARK : CARD_ON_LIGHT;

    const capture = async () => {
      // Everything visible has to be settled before the shutter: webfonts, and the
      // avatar, which would otherwise be captured as an empty box.
      await document.fonts?.ready;
      const avatar = avatarRef.current;
      if (avatar && !avatar.complete) {
        await new Promise(resolve => {
          avatar.addEventListener('load', resolve, { once: true });
          avatar.addEventListener('error', resolve, { once: true });
        });
      }
      const url = await toPng(node, { pixelRatio: 3, backgroundColor: face });
      if (!cancelled) setFrontImage(url);
    };

    capture().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [theme]);

  return (
    <>
      {/* The offset lives on the wrapper: html-to-image copies the captured node's own
          position into the render, so the captured node itself must stay unpositioned.

          data-theme-snapshot 让这整棵子树跳过换主题时的颜色过渡（见 globals.css）：
          过渡是渐变的，截到一半就会把中间色烘进贴图里。 */}
      <div
        aria-hidden="true"
        data-theme-snapshot=""
        className="pointer-events-none fixed top-0"
        style={{ left: -10000 }}
      >
        <div
          ref={cardRef}
          data-testid="badge-face"
          className=""
          style={{ width: FACE_WIDTH, height: FACE_HEIGHT, backgroundColor: faceColor }}
        >
          {/* --spotlight-card-surface 是 SpotlightCard 自己的底色变量，在它内部
              style 里先写自己那套、再展开外部 style，所以这里能覆盖掉。
              只改 className 是不够的：面的底色来自那个变量，不是 class。 */}
          <SpotlightCard
            theme="dark"
            className="h-full w-full"
            style={{ padding: 0, '--spotlight-card-surface': faceColor }}
          >
            {/* 装饰：异形色块。

                用内联 SVG 而不是 div + border-radius 拼形状,是因为这张卡要走
                html-to-image 的 SVG foreignObject 截成贴图 —— 矢量图形是那条路径上
                最稳的东西,渐变 / clip-path / 混合模式在 foreignObject 里各有各的
                失效方式,而 path 不会。

                viewBox 直接用卡片自己的 340x478,坐标即像素,改布局时不用换算。
                绝对定位 + overflow:hidden(SpotlightCard 自带)让色块可以出血到卡边,
                放在内容之前、内容再 relative,所以它永远压在文字下面。

                配色只取品牌那三档,不引入新色相 —— 这张卡本身是纯黑 + 白字的,
                加一个陌生颜色会立刻显得是贴上去的。深色主题下卡面变成品牌紫,
                这三个色跟着换成同族浅紫(见 DECOR_ON_DARK 的说明)。 */}
            <svg
              aria-hidden="true"
              viewBox={`0 0 ${FACE_WIDTH} ${FACE_HEIGHT}`}
              className="pointer-events-none absolute inset-0 h-full w-full"
            >
              <defs>
                {/* 只此一处使用,所以写死 id;真要渲染两张卡就得改成 useId。 */}
                <linearGradient id="badge-accent" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={decor[0]} />
                  <stop offset="52%" stopColor={decor[1]} />
                  <stop offset="100%" stopColor={decor[2]} />
                </linearGradient>
              </defs>

              {/* 右上角出血的异形块。左边留到 x=174 是因为头像占 40..136、
                  姓名那一列也不到 174,再往左就该压字了。 */}
              <path
                d="M214 -44 C 286 -76 372 -22 378 58 C 383 130 330 190 262 188 C 205 186 168 146 174 92 C 178 48 186 -30 214 -44 Z"
                fill="url(#badge-accent)"
                opacity="0.85"
              />

              {/* 一条弧从异形块底下甩出来，接住右下角那个环。
                  1.5px / 0.5 太轻了，在近黑底上根本读不出来，看着像脏点而不是图形 ——
                  描边比填充难读得多，要么给足粗细和透明度，要么干脆别画。 */}
              <path
                d="M186 244 C 252 206 322 220 366 292"
                fill="none"
                stroke="url(#badge-accent)"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity="0.85"
              />

              {/* 右下角圆环，大部分出血到卡外，压一下整张卡的重心。
                  半径 46 -> 52 让它和上面那条弧的终点接得上，不然是两笔各画各的。 */}
              <circle
                cx="332"
                cy="428"
                r="52"
                fill="none"
                stroke="url(#badge-accent)"
                strokeWidth="2.5"
                opacity="0.85"
              />
            </svg>

            {/* pt-16 clears the badge slot punched through the top of the card; the
                three groups are spread by justify-between, so raising pt shifts the
                avatar down and re-balances the gaps between them.
                relative 是给上面那层装饰用的：不写的话绝对定位的 SVG 会盖在白字上。 */}
            <div className="relative flex h-full flex-col justify-between px-10 pt-16 pb-10 text-left">
              {/* identity */}
              <div>
                <img
                  ref={avatarRef}
                  src={AVATAR_URL}
                  alt=""
                  className="size-24 rounded-2xl object-cover ring-1 ring-white/15"
                />
                <h1 className="mt-7 text-[40px] leading-none font-semibold tracking-wider text-white">
                  尹磊
                </h1>
                {/* Half the size of 尹磊 */}
                <p className={`mt-3 text-[20px] leading-none tracking-[0.3em] uppercase ${faint}`}>
                  Yin Lei
                </p>
              </div>
              {/* role */}
              <div>
                <span className="block h-px w-10 bg-white/25" />
                <p className="mt-7 text-[16px] leading-snug text-white">教师</p>
                <p className="mt-1.5 text-[14px] leading-snug text-white">
                  软件开发，网络建设与维护
                </p>
              </div>
              {/* credential */}
              <p className="border-t border-white/10 pt-4 text-[13px] leading-relaxed text-white">
                曾就职于中国联通绵阳市分公司网络部
              </p>
            </div>
          </SpotlightCard>
        </div>
      </div>
      <Lanyard
        className={className}
        frontImage={frontImage ?? undefined}
        backImage="/cs2.jpg"
        // 卡身和吊绳跟着主题走。Lanyard 内部会 diff 这两个值：
        // strapColor 变了重画绳子贴图，cardColor 变了重建卡面材质，所以切换是即时的。
        cardColor={faceColor}
        finish="glossy"
        metal="silver"
        strapColor={faceColor}
      />
    </>
  );
}
