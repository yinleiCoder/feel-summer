// family_trees 表的读写。服务端和浏览器端共用（和 lib/media.js 一样），
// 两边都走 RLS，所以这里不做任何身份判断 —— 那是策略的事，不是这层的事。

export const FAMILY_TREE_COLUMNS = 'graph,revision,updated_at';

export async function fetchFamilyTree(supabase, userId) {
  return supabase
    .from('family_trees')
    .select(FAMILY_TREE_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();
}

/**
 * 保存整张关系图。
 *
 * 用 revision 做乐观并发控制，而不是「谁后写谁赢」：
 * 这个页面是开在新标签页里的，用户很容易同时开着两个标签各改各的，
 * 后写的那个会把前一个的改动整份抹掉，而且不会有任何提示。
 *
 * @param expectedRevision 已知的服务端版本号；null 表示这一行还不存在。
 * @returns {{ok: true, revision: number, updatedAt: string}
 *          | {ok: false, reason: 'conflict'|'too_large'|'auth'|'error', message?: string}}
 */
export async function saveFamilyTree(supabase, userId, graph, expectedRevision) {
  const payload = { graph, updated_at: new Date().toISOString() };

  const query =
    expectedRevision === null
      ? supabase
          .from('family_trees')
          .upsert({ user_id: userId, ...payload, revision: 1 }, { onConflict: 'user_id' })
      : supabase
          .from('family_trees')
          .update({ ...payload, revision: expectedRevision + 1 })
          .eq('user_id', userId)
          // 这一行才是并发控制本体：版本号对不上就一行都改不到。
          .eq('revision', expectedRevision);

  // maybeSingle 而不是 single：改到 0 行时返回 data:null 而不是 PGRST116 报错，
  // 「版本冲突」就成了一段普通的控制流，不用去解析错误码。
  const { data, error } = await query.select('revision,updated_at').maybeSingle();

  if (error?.code === '23514') {
    return { ok: false, reason: 'too_large', message: '关系图超出大小限制' };
  }
  if (error?.code === '42501') {
    return { ok: false, reason: 'auth', message: '登录状态已失效' };
  }
  if (error) return { ok: false, reason: 'error', message: error.message };
  if (!data) return { ok: false, reason: 'conflict' };

  return { ok: true, revision: data.revision, updatedAt: data.updated_at };
}
