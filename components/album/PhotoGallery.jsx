'use client';

// lightGallery 单独放在一个模块里，好让 PhotoDetail 用 dynamic(..., { ssr: false })
// 把它整个挡在服务端渲染之外。
//
// 为什么必须这么做：lightGallery 内部有 110 处 Date.now()（@lightgallery/react 另有
// 60 处），而它在 SSR 时会被求值。cacheComponents 打开后，Next 会在预渲染阶段检查
// 不稳定取值，一旦发现 Date.now() 就把整条路由判成阻塞路由：
//
//   Route "/photo/[id]": Next.js encountered the unstable value `Date.now()` while prerendering.
//
// 这不是「把 Date.now() 改成别的」能解决的 —— 那是库的内部实现。正解是它本来也不
// 需要在服务端跑：画廊是个纯客户端的弹层，首屏 HTML 里根本没有它。
// 顺带还省掉了首屏加载这 200 多 KB。
//
// 具名导出 { LightGallery }，不是 default —— 这个包的入口只导出
// { LightGallery, LightGalleryItem, setLicenseKey }。

import { LightGallery } from '@lightgallery/react';
import Autoplay from '@lightgallery/react/plugins/autoplay';
import Fullscreen from '@lightgallery/react/plugins/fullscreen';
import Thumbnail from '@lightgallery/react/plugins/thumbnail';
import Zoom from '@lightgallery/react/plugins/zoom';

import 'lightgallery/css/lightgallery.css';
import 'lightgallery/css/lg-thumbnail.css';
import 'lightgallery/css/lg-zoom.css';
import 'lightgallery/css/lg-fullscreen.css';
import 'lightgallery/css/lg-autoplay.css';

const PhotoGallery = ({ open, onClose, index, onIndexChange, slides, originRect }) => (
  // 受控模式：open / index / onIndexChange 由调用方掌握，这样翻页后关掉能同步路由；
  // 视频不在 slides 里，所以画廊不会翻到视频上。
  <LightGallery
    open={open}
    onClose={onClose}
    index={index}
    onIndexChange={onIndexChange}
    slides={slides}
    plugins={[Thumbnail, Zoom, Fullscreen, Autoplay]}
    originRect={originRect}
    speed={400}
  />
);

export default PhotoGallery;
