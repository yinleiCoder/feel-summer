'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { RotateCcw, Send, Trash2 } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { canManage as canModerate } from '@/lib/roles';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import CommentSkeleton from '@/components/album/CommentSkeleton';

const MAX_BODY = 2000;

const COMMENT_COLUMNS = 'id, body, user_id, created_at, profiles(display_name, avatar_url)';

// 留言框：去掉聚焦时的描边和光圈，改成一整块浅色填充。
//
// shadcn 的 Textarea 默认在 focus-visible 时把边框染成 ring 色并加一圈 3px 光圈，
// 那是给表单用的；留言框是个随手写两句的地方，那个「亮起来」的反馈太重了。
// 填充式（faded）在深色底上也比描边式更好认，因为它是**面**而不是**线**。
//
// 用 border-transparent 而不是 border-0：保持在 1px 边框宽度上，
// 聚焦前后不会因为边框消失而抖动 1px。
const COMPOSER_CLASS =
  'min-h-0 resize-none border-transparent bg-muted shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-muted';

// PostgREST 返回一对一的关联时是对象，关系判断异常时是单元素数组 —— 两种都接住，
// 免得渲染出 [object Object]。
const profileOf = (row) => {
  const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return { name: p?.display_name || '匿名用户', avatar: p?.avatar_url || null };
};

/**
 * @param initialComments 服务端流式加载好的评论。为 null 表示服务端那次就失败了。
 * @param initialError    服务端失败时的说明。
 *
 * 首屏不再由客户端发起请求：评论在服务端取好、跟着页面一起流下来，
 * 慢的只是它自己那一段（外层 Suspense 的 fallback 是骨架屏），
 * 不会拖住图片和信息。这里的 load() 只服务于两件事 —— 重试，和发完新留言后刷新。
 */
const CommentThread = ({ mediaId, viewer, initialComments = null, initialError = null }) => {
  const [comments, setComments] = useState(initialComments ?? []);
  // 'ready' | 'loading' | 'error'
  const [status, setStatus] = useState(initialComments === null ? 'error' : 'ready');
  const [error, setError] = useState(initialError);
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setStatus('loading');
      setError(null);

      const supabase = createClient();
      const { data, error: loadError } = await supabase
        .from('comments')
        .select(COMMENT_COLUMNS)
        .eq('media_id', mediaId)
        .order('created_at', { ascending: true });

      if (loadError) {
        setStatus('error');
        setError('留言加载失败');
        return;
      }
      setComments(data ?? []);
      setStatus('ready');
    },
    [mediaId]
  );

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || trimmed.length > MAX_BODY) return;

    setPending(true);
    setError(null);

    const supabase = createClient();
    const { error: insertError } = await supabase
      .from('comments')
      // user_id 必须等于 auth.uid()，否则会被 RLS 的 WITH CHECK 拒掉。
      .insert({ media_id: mediaId, user_id: viewer.id, body: trimmed });

    setPending(false);

    if (insertError) {
      setError('留言失败，请稍后重试');
      return;
    }

    setBody('');
    // silent：刷新已有的列表，不要把整块换成骨架屏 —— 用户刚发完留言，
    // 看到自己的评论闪一下再回来会很怪。
    load({ silent: true });
  }

  async function handleDelete(id) {
    const supabase = createClient();
    const { error: deleteError } = await supabase.from('comments').delete().eq('id', id);

    if (deleteError) {
      setError('删除失败');
      return;
    }
    setComments((prev) => prev.filter((comment) => comment.id !== id));
  }

  return (
    <section>
      <h2 className="mb-5 flex items-baseline gap-3 text-[11px] tracking-[0.25em] text-muted-foreground">
        留言
        {status === 'ready' && comments.length > 0 && (
          <span className="tracking-wider text-muted-foreground/80">{comments.length}</span>
        )}
      </h2>

      {/* 输入框在上，列表在下 —— 新留言就出现在输入框正下方，
          读起来是「写下 -> 它就长在下面」，而不用每次跨过一整屏去确认。
          列表在加载时输入框照常可用：它和列表是两件独立的事。 */}
      {viewer ? (
        <form onSubmit={handleSubmit} className="flex w-full items-start gap-3">
          <Avatar className="mt-0.5 size-9 shrink-0">
            {viewer.avatarUrl && <AvatarImage src={viewer.avatarUrl} alt="" />}
            <AvatarFallback className="text-xs">
              {(viewer.displayName || '我')[0]}
            </AvatarFallback>
          </Avatar>

          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
            rows={2}
            placeholder="说点什么…"
            aria-label="留言内容"
            className={`${COMPOSER_CLASS} flex-1`}
          />

          {/* 跟在输入框右侧，不占满整宽 —— 整宽会把一条近白色横条铺满页面，
              是页面上最响的元素，而它只是个次要动作。 */}
          <Button
            type="submit"
            size="icon"
            disabled={pending || !body.trim()}
            aria-label="发送"
            className="mt-0.5 size-9 shrink-0 rounded-full"
          >
            <Send className="size-4" />
          </Button>
        </form>
      ) : (
        <p className="w-full rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
          <Link href="/login" className="text-foreground underline underline-offset-4">
            登录
          </Link>{' '}
          后可以留言。
        </p>
      )}

      {body.length > MAX_BODY - 200 && (
        <p className="mt-1 text-right text-[11px] text-muted-foreground">
          {body.length}/{MAX_BODY}
        </p>
      )}

      <div className="mt-6">
        {status === 'loading' ? (
          <CommentSkeleton />
        ) : status === 'error' ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-border/60 px-4 py-5">
            <p className="text-sm text-muted-foreground">{error || '留言加载失败'}</p>
            <Button variant="outline" size="sm" onClick={() => load()}>
              <RotateCcw className="size-3.5" />
              重试
            </Button>
          </div>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">还没有留言。</p>
        ) : (
          <ul className="flex flex-col gap-5">
            {comments.map((comment) => {
              const mine = viewer?.id === comment.user_id;
              const author = profileOf(comment);
              return (
                <li key={comment.id} className="flex gap-3">
                  <Avatar className="mt-0.5 size-9 shrink-0">
                    {author.avatar && <AvatarImage src={author.avatar} alt="" />}
                    <AvatarFallback className="text-xs">{author.name[0]}</AvatarFallback>
                  </Avatar>

                  {/* min-w-0 是必须的：flex 项默认 min-width:auto，
                      长留言会把这一行撑宽，把右边的删除按钮顶出容器。 */}
                  <div className="flex min-w-0 flex-1 gap-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-baseline gap-x-3">
                        <span className="text-sm text-foreground">{author.name}</span>
                        <time className="text-[11px] tracking-wider text-muted-foreground/80">
                          {new Date(comment.created_at).toLocaleString('zh-CN')}
                        </time>
                      </div>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                        {comment.body}
                      </p>
                    </div>

                    {/* ml-auto 把它推到本行最右。 */}
                    {(mine || canModerate(viewer)) && (
                      <button
                        type="button"
                        onClick={() => handleDelete(comment.id)}
                        aria-label="删除这条留言"
                        className="ml-auto h-6 shrink-0 self-start text-muted-foreground/80 transition-colors hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {status === 'ready' && error && (
        <p aria-live="polite" className="mt-3 text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  );
};

export default CommentThread;
