import { expect, test } from '@playwright/test';

import { E2E_BOARD, clearBoard, columnTitles, dragCardTo, readBoardFromDb, seedBoard } from './fixtures/board';

// 逐项跑：拿起 / 移动 / 放下，每一步都要有可观察的反馈。
// 测试全程只碰 board='e2e' 那块板子，站长的 'main' 不被触碰。

const URL = `/kanban?board=${E2E_BOARD}`;

const card = (page, title) =>
  page.locator('[data-testid="task-card"]', { hasText: title }).first();

// 监听写库请求，用来断言「取消时不该发出任何写入」。
function countMoveCalls(page) {
  const calls = [];
  page.on('request', (r) => {
    if (r.url().includes('/rest/v1/rpc/move_task')) calls.push(r);
  });
  return calls;
}

test.beforeEach(async () => {
  await clearBoard();
});

test.afterAll(async () => {
  await clearBoard();
});

test.describe('任务看板', () => {
  test('三栏按位置渲染', async ({ page }) => {
    await seedBoard([
      { status: 'todo', position: 0, title: '甲' },
      { status: 'todo', position: 1, title: '乙' },
      { status: 'doing', position: 0, title: '丙' }
    ]);

    await page.goto(URL);
    await expect(page.getByTestId('column-todo')).toBeVisible();

    expect(await columnTitles(page, 'todo')).toEqual(['甲', '乙']);
    expect(await columnTitles(page, 'doing')).toEqual(['丙']);
    expect(await columnTitles(page, 'done')).toEqual([]);
    // 空栏也要有落点提示，否则用户不知道那里可以放
    await expect(page.getByTestId('column-done').getByText('拖到这里')).toBeVisible();
  });

  test('拿起：出现拖拽副本，源卡片仍留在原位', async ({ page }) => {
    await seedBoard([
      { status: 'todo', position: 0, title: '甲' },
      { status: 'todo', position: 1, title: '乙' }
    ]);
    await page.goto(URL);

    const source = card(page, '甲');
    const box = await source.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 40, { steps: 8 });

    // 源卡片必须还在 DOM 里 —— 条件卸载会让这一栏塌掉，dnd-kit 的矩形随之失效
    await expect(page.getByTestId('task-card')).toHaveCount(2);
    expect(await columnTitles(page, 'todo')).toEqual(['甲', '乙']);

    // 「拿起来了」唯一看得见的证据：跟着指针走的那份副本。
    // 它不带 task-card 这个 id，所以上面的计数不会把它一起数进来。
    await expect(page.getByTestId('drag-overlay')).toBeVisible();
    await expect(page.getByTestId('drag-overlay')).toContainText('甲');

    await page.mouse.up();
  });

  test('栏内排序', async ({ page }) => {
    await seedBoard([
      { status: 'todo', position: 0, title: '甲' },
      { status: 'todo', position: 1, title: '乙' },
      { status: 'todo', position: 2, title: '丙' }
    ]);
    await page.goto(URL);

    const release = await dragCardTo(page, card(page, '甲'), card(page, '丙'));
    await release();

    await expect.poll(() => columnTitles(page, 'todo')).toEqual(['乙', '丙', '甲']);
  });

  test('跨栏移动', async ({ page }) => {
    await seedBoard([
      { status: 'todo', position: 0, title: '甲' },
      { status: 'doing', position: 0, title: '乙' }
    ]);
    await page.goto(URL);

    const release = await dragCardTo(
      page,
      card(page, '甲'),
      page.getByTestId('column-body-doing')
    );
    await release();

    await expect.poll(() => columnTitles(page, 'doing')).toEqual(['乙', '甲']);
    expect(await columnTitles(page, 'todo')).toEqual([]);
  });

  test('拖进空栏', async ({ page }) => {
    await seedBoard([{ status: 'todo', position: 0, title: '甲' }]);
    await page.goto(URL);
    expect(await columnTitles(page, 'done')).toEqual([]);

    const release = await dragCardTo(
      page,
      card(page, '甲'),
      page.getByTestId('column-body-done')
    );
    await release();

    await expect.poll(() => columnTitles(page, 'done')).toEqual(['甲']);
  });

  test('拖动时显示落点，且位置随指针移动', async ({ page }) => {
    await seedBoard([
      { status: 'todo', position: 0, title: '甲' },
      { status: 'doing', position: 0, title: '乙' },
      { status: 'doing', position: 1, title: '丙' }
    ]);
    await page.goto(URL);

    const source = card(page, '甲');
    const box = await source.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 20, { steps: 5 });

    // 悬在「乙」上 -> 落在 doing 的第 0 位
    const yi = await card(page, '乙').boundingBox();
    await page.mouse.move(yi.x + yi.width / 2, yi.y + yi.height / 2, { steps: 10 });
    await expect(page.getByTestId('drop-indicator')).toBeVisible();
    await expect(page.getByTestId('drop-indicator')).toHaveAttribute('data-status', 'doing');
    await expect(page.getByTestId('drop-indicator')).toHaveAttribute('data-index', '0');

    // 再往下挪一格 -> 落点跟着变，说明它真的在跟指针，而不是画死在某处
    const bing = await card(page, '丙').boundingBox();
    await page.mouse.move(bing.x + bing.width / 2, bing.y + bing.height / 2 + 10, { steps: 10 });
    await expect
      .poll(() => page.getByTestId('drop-indicator').getAttribute('data-index'))
      .not.toBe('0');

    await page.keyboard.press('Escape');
  });

  test('取消（Esc）恢复原位，且不写库', async ({ page }) => {
    await seedBoard([
      { status: 'todo', position: 0, title: '甲' },
      { status: 'doing', position: 0, title: '乙' }
    ]);
    await page.goto(URL);
    const calls = countMoveCalls(page);
    const before = await columnTitles(page, 'todo');

    const source = card(page, '甲');
    const box = await source.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const target = await page.getByTestId('column-body-doing').boundingBox();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 });
    await expect(page.getByTestId('drop-indicator')).toBeVisible();

    await page.keyboard.press('Escape');
    await page.mouse.up();

    await expect(page.getByTestId('drop-indicator')).toHaveCount(0);
    expect(await columnTitles(page, 'todo')).toEqual(before);
    expect(calls).toHaveLength(0);
  });

  test('键盘：拿起、移动、放下，且每一步都有播报', async ({ page }) => {
    await seedBoard([
      { status: 'todo', position: 0, title: '甲' },
      { status: 'doing', position: 0, title: '乙' }
    ]);
    await page.goto(URL);

    // 必须点进 role=status 那一层。dnd-kit 把「操作说明」和「播报」放进同一个容器，
    // 说明那段是 display:none 的，而 toContainText 读的是 textContent —— 连隐藏文本
    // 一起读，于是断言永远匹配不上，看上去像播报根本没发生。
    const live = page.getByTestId('dnd-live').getByRole('status');
    await card(page, '甲').focus();

    // 每次按键之后等播报落地再按下一个：dnd-kit 把「当前悬停在哪」记在
    // React state 里，连着按会让放下发生在落点更新之前。
    // 而等播报本身就是用户能看到的反馈，比 sleep 固定毫秒数更有意义。
    await page.keyboard.press('Space');
    await expect(live).toContainText('已拿起');

    await page.keyboard.press('ArrowRight');
    await expect(live).toContainText('将落在');

    await page.keyboard.press('Space');
    // 这里只断言「确实换栏了」，不断言它落在 doing 的第几位：
    // 键盘方向键选中的是最近的一个落点，是卡片还是整栏由几何决定，
    // 位置本身由「栏内排序 / 跨栏移动」两条用例精确覆盖。
    await expect.poll(() => columnTitles(page, 'todo')).toEqual([]);
    await expect.poll(async () => (await columnTitles(page, 'doing')).length).toBe(2);
    expect(await columnTitles(page, 'doing')).toContain('甲');
  });

  test('键盘取消：回到原位并播报', async ({ page }) => {
    await seedBoard([
      { status: 'todo', position: 0, title: '甲' },
      { status: 'todo', position: 1, title: '乙' }
    ]);
    await page.goto(URL);
    const calls = countMoveCalls(page);
    const live = page.getByTestId('dnd-live').getByRole('status');

    await card(page, '甲').focus();
    await page.keyboard.press('Space');
    await expect(live).toContainText('已拿起');

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(live).toContainText('回到原位');

    expect(await columnTitles(page, 'todo')).toEqual(['甲', '乙']);
    expect(calls).toHaveLength(0);
  });

  test('点一下是打开弹窗，不会变成拖拽', async ({ page }) => {
    await seedBoard([{ status: 'todo', position: 0, title: '甲', description: '原说明' }]);
    await page.goto(URL);
    const calls = countMoveCalls(page);

    await card(page, '甲').click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel('标题')).toHaveValue('甲');
    expect(calls).toHaveLength(0);
  });

  test('只有「待制作」栏能新建任务', async ({ page }) => {
    // beforeEach 已经清空板子，这里不需要播种。
    await page.goto(URL);

    await expect(page.getByTestId('column-todo').getByTestId('column-add')).toBeVisible();
    // 另外两栏是流转的去处。卡片凭空出现在「已完成」里，在真实流程中没有意义。
    await expect(page.getByTestId('column-doing').getByTestId('column-add')).toHaveCount(0);
    await expect(page.getByTestId('column-done').getByTestId('column-add')).toHaveCount(0);
  });

  test('从「待制作」新建的任务落在待制作栏，且刷新仍在', async ({ page }) => {
    await page.goto(URL);

    await page.getByTestId('column-todo').getByTestId('column-add').click();
    await page.getByLabel('标题').fill('新任务');
    await page.getByLabel('说明').fill('来自待制作');
    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await expect.poll(() => columnTitles(page, 'todo')).toEqual(['新任务']);
    expect(await columnTitles(page, 'doing')).toEqual([]);
    expect(await columnTitles(page, 'done')).toEqual([]);

    // 直接查库：确认落进去的 status 真的是 todo，而不是「界面上看着像」
    await expect
      .poll(async () => (await readBoardFromDb()).map((r) => `${r.status}:${r.title}`))
      .toEqual(['todo:新任务']);

    await page.reload();
    await expect.poll(() => columnTitles(page, 'todo')).toEqual(['新任务']);
  });

  test('编辑说明后刷新仍在', async ({ page }) => {
    await seedBoard([{ status: 'todo', position: 0, title: '甲' }]);
    await page.goto(URL);

    await card(page, '甲').click();
    await page.getByLabel('说明').fill('改过的说明');
    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.reload();
    await expect(card(page, '甲')).toContainText('改过的说明');
  });

  test('拖动结果落库（刷新后顺序不变）', async ({ page }) => {
    await seedBoard([
      { status: 'todo', position: 0, title: '甲' },
      { status: 'doing', position: 0, title: '乙' }
    ]);
    await page.goto(URL);

    const release = await dragCardTo(
      page,
      card(page, '甲'),
      page.getByTestId('column-body-done')
    );
    await release();
    await expect.poll(() => columnTitles(page, 'done')).toEqual(['甲']);

    // 直接查库：证明落的是数据库，不是本地 state
    await expect
      .poll(async () => (await readBoardFromDb()).filter((r) => r.status === 'done').map((r) => r.title))
      .toEqual(['甲']);

    await page.reload();
    await expect.poll(() => columnTitles(page, 'done')).toEqual(['甲']);
  });

  test('写库失败时回滚并提示', async ({ page }) => {
    await seedBoard([{ status: 'todo', position: 0, title: '甲' }]);
    await page.goto(URL);

    // 让这一条 RPC 永远失败，模拟网络或 RLS 拒绝
    await page.route('**/rest/v1/rpc/move_task*', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' })
    );

    const release = await dragCardTo(
      page,
      card(page, '甲'),
      page.getByTestId('column-body-done')
    );
    await release();

    // 先乐观地动过去，失败之后回到原位
    await expect(page.getByTestId('board-error')).toContainText('已恢复原位');
    await expect.poll(() => columnTitles(page, 'todo')).toEqual(['甲']);
    expect(await columnTitles(page, 'done')).toEqual([]);
  });

  test('普通用户和未登录都进不来', async ({ page, browser }) => {
    // 带管理员身份时是好的。页面本身没有标题（标题只在导航里），
    // 所以这里认的是看板本身渲染出来了没有。
    await page.goto(URL);
    await expect(page.getByTestId('column-todo')).toBeVisible();

    // 未登录 -> 登录页
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const anonPage = await anon.newPage();
    await anonPage.goto(URL);
    await expect(anonPage).toHaveURL(/\/login/);
    await anon.close();
  });
});
