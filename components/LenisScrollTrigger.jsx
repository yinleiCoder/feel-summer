'use client';

import { useEffect } from 'react';
import { useLenis } from 'lenis/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// Lenis scrolls the window itself, but it writes each frame's position inside its
// own rAF loop, so ScrollTrigger's own scroll listener can be a frame behind the
// value the user is actually looking at. Handing Lenis' scroll event to
// ScrollTrigger.update() is the integration GSAP documents, and it is what keeps a
// reveal landing on the frame the section arrives instead of the one after it.
//
// Deliberately not in SmoothScroll: that lives in the root layout, and this would
// pull ScrollTrigger into the album, the auth pages and the admin, none of which
// have a scroll animation. It only mounts where something scroll-triggered does.
export default function LenisScrollTrigger() {
  const lenis = useLenis();

  useEffect(() => {
    if (!lenis) return undefined;
    const update = () => ScrollTrigger.update();
    lenis.on('scroll', update);
    return () => lenis.off('scroll', update);
  }, [lenis]);

  return null;
}
