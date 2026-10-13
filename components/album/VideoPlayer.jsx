'use client';

import { useEffect, useRef } from 'react';
import { MediaPlayer, MediaProvider } from '@vidstack/react';
import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default';

import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';

// Vidstack 的视频播放器，替掉原来的原生 <video controls>。
//
// 选它的理由（实测数据，不是印象）：
//   · 唯一一个从设计上就是 React 组件的（不是给原生库套一层包装），SSR 友好；
//   · peer 里明确写了 react ^19，其余几个要么没写要么包装器早已停更；
//   · 整包 0 处 Date.now() —— 这点很关键，lightGallery 就是因为 110 处 Date.now()
//     在预渲染阶段把整条路由判成了 blocking route（见 PhotoGallery.jsx 的说明）。
//
// 原生标签的问题不在功能而在表现：控件长什么样完全由浏览器决定，Chrome / Safari /
// Firefox 三套样子，而且没有倍速、画中画、键盘快捷键这些。Vidstack 自带一整套，
// 默认主题就是深色的，和站点对得上。
const VideoPlayer = ({ src, poster, title, width, height }) => {
  const player = useRef(null);

  // 切到别的标签页/窗口时暂停。用户报过「切走之后还有声音」。
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) player.current?.pause();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // 卸载时也显式停一次。Vidstack 自己会 destroy，但这条是用户报过的真实问题，
  // 多一道保险不值几个字节。
  useEffect(() => () => player.current?.pause(), []);

  return (
    <MediaPlayer
      ref={player}
      title={title || '视频'}
      src={src}
      poster={poster || undefined}
      viewType="video"
      streamType="on-demand"
      playsInline
      crossOrigin
      // 用存下来的自然尺寸定宽高比：首帧还没解码时高度就已经是对的，
      // 不会先塌成一条再撑开。
      style={width && height ? { aspectRatio: `${width} / ${height}` } : undefined}
      // lg:max-h-full：桌面端外层已经是 16:9 的框，高度上限跟着框走而不是跟着视口。
      // 竖屏视频在这个框里居中留黑边，媒体区本身的比例不受素材比例影响。
      className="max-h-[74dvh] w-full overflow-hidden rounded-lg lg:max-h-full"
    >
      <MediaProvider />
      <DefaultVideoLayout icons={defaultLayoutIcons} />
    </MediaPlayer>
  );
};

export default VideoPlayer;
