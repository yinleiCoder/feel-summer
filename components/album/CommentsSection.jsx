// 服务端组件：把留言取好，再交给客户端组件去渲染。
//
// 这样首屏拿到的 HTML 里就有留言（跟着页面一起流下来），而不是等 hydration 之后
// 客户端再发一次请求 —— 后者会让留言永远比图片和文字晚一拍出现。
//
// 外面那层 <Suspense>（在 page.js 里）用一个形状对得上的骨架屏兜住等待时间，
// 所以留言慢只会慢它自己那一段，不会拖住左边的图和右边的信息。
import { createClient } from '@/lib/supabase/server';
import CommentThread from '@/components/album/CommentThread';

const COMMENT_COLUMNS = 'id, body, user_id, created_at, profiles(display_name, avatar_url)';

async function CommentsSection({ mediaId, viewer }) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('comments')
    .select(COMMENT_COLUMNS)
    .eq('media_id', mediaId)
    .order('created_at', { ascending: true });

  // 失败不抛出去：抛出会顶掉整页的错误边界，而这里只是「留言没取到」。
  // 交给客户端组件去显示提示和重试按钮 —— 那个重试走的是浏览器直连，
  // 不需要刷新整页。
  if (error) {
    return (
      <CommentThread
        mediaId={mediaId}
        viewer={viewer}
        initialComments={null}
        initialError="留言加载失败"
      />
    );
  }

  return (
    <CommentThread mediaId={mediaId} viewer={viewer} initialComments={data ?? []} />
  );
}

export default CommentsSection;
