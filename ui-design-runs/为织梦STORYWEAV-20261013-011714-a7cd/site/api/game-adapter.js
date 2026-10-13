/* AI 剧本杀 · 后端驱动适配层（#/play 状态机桥接）
 * 规则：只展示后端视图、提交玩家操作；不伪造剧情、不在本地推 revision；
 *       event_id 必须回执；请求期间禁用操作；失败保留状态并显示中文错误。
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  /* 场景 ID → 高保真背景图（前缀匹配：N00-N08 主线、A/B 分支、E/F 结局、H 变体） */
  const sceneImage = (id) => {
    if (!id) return 'assets/scene-archive.jpg';
    if (/^[EF]/.test(id)) return 'assets/ending-bg.jpg';      // 结局
    if (/^N02/.test(id)) return 'assets/scene-street.jpg';    // 猫眼/街道
    if (/^N05/.test(id)) return 'assets/scene-oldhouse.jpg';  // 老宅/撤离
    if (/^H/.test(id)) return 'assets/scene-oldhouse.jpg';    // 变体
    return 'assets/scene-archive.jpg';
  };

  let current = null;      // 最近一次成功响应的游戏视图
  let busy = false;

  /* ── 文字输入（typewriter）与段落页码 ─────────────────── */
  function typeInto(el, text, done) {
    el.innerHTML = '';
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { el.textContent = text; done && done(); return; }
    let i = 0;
    const iv = setInterval(() => {
      el.textContent = text.slice(0, i) + (i < text.length ? '▍' : '');
      if (i >= text.length) { clearInterval(iv); done && done(); }
      i++;
    }, 16);
  }

  /* ── 视图渲染：按 mode 驱动 #/play ─────────────────── */
  function renderView(data) {
    current = data;

    // 章节与场景
    $('playChapter').textContent = data.scene_title || '档案 · 未命名场景';
    $('sceneTag').textContent = '◆ ' + (data.scene_title || '');
    const sceneImg = $('sceneImg');
    const nextImg = sceneImage(data.scene_id);
    if (sceneImg.getAttribute('src') !== nextImg) {
      const fog = $('sceneFog');
      fog.classList.remove('on'); void fog.offsetWidth; fog.classList.add('on');
      setTimeout(() => { sceneImg.src = nextImg; }, 420);
    }

    // 进度环：以 page_number/page_count 推算（不精确也仅作氛围）
    const pct = data.mode === 'ending' ? 100 : (data.page_count ? Math.max(12, Math.round(data.page_number / data.page_count * 88)) : 33);
    $('ringPct').textContent = pct;
    $('ringFg').style.strokeDashoffset = 276 - 276 * (pct / 100);

    // 段落页码
    const narIdx = document.querySelector('.nar-idx');
    if (narIdx && data.page_count) narIdx.textContent = '◈ 案卷记录 · ' + String(data.page_number).padStart(3, '0') + ' / ' + data.page_count;

    // 正文 / 调查 / 选项容器
    const textBox = $('narText');
    const optBox = $('optBox');
    const invBox = $('invBox');
    const continueBtn = $('continueBtn');
    const hasEvents = data.display_events && data.display_events.length;

    if (data.mode === 'page' || data.mode === 'feedback') {
      const block = data.block || {};
      const text = block.text || '';
      textBox.style.display = '';
      // 调查反馈：先展示 feedback_label 标题，再打正文
      const title = data.mode === 'feedback' ? (data.feedback_label || '调查反馈') : null;
      typeInto(textBox, (title ? '【' + title + '】\n' : '') + text);
      optBox.innerHTML = '';
      invBox.innerHTML = '';
      if (continueBtn) continueBtn.hidden = true;
      // 有展示事件（弹窗）时由弹窗确认回执；无事件才渲染页面确认按钮
      if (!hasEvents) renderNextButton(data);
    } else if (data.mode === 'investigation') {
      textBox.textContent = '调查现场 · 你环顾四周，寻找值得留意的物件。';
      textBox.style.display = '';
      optBox.innerHTML = '';
      renderInvestigation(data);
    } else if (data.mode === 'choices') {
      textBox.textContent = data.block && data.block.text ? data.block.text : '该做决定了。';
      textBox.style.display = '';
      optBox.innerHTML = '';
      invBox.innerHTML = '';
      if (continueBtn) continueBtn.hidden = true;
      // 分支事件由弹窗承载；无事件（如已取消）才在页面渲染选项/重新选择
      if (!hasEvents) renderOptions(data.options || [], data);
    } else if (data.mode === 'ending') {
      textBox.textContent = '故事已抵达结局。';
      optBox.innerHTML = '';
      invBox.innerHTML = '';
      if (continueBtn) continueBtn.hidden = true;
      goEnding(data);
      return;
    }

    renderInventory(data);
    renderHistory(data);
    renderCheckpoints(data);
  }

  /* 文字确认按钮（next_label，不可硬编码动作） */
  function renderNextButton(data) {
    const box = $('optBox');
    box.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'opt next-btn';
    btn.innerHTML = '<span class="opt-idx">确认 · 继续</span>' + (data.next_label || '我已读完，继续');
    btn.onclick = () => act('next');
    box.appendChild(btn);
  }

  /* 调查物件 + 继续 */
  function renderInvestigation(data) {
    const box = $('optBox');
    box.innerHTML = '';
    (data.interactions || []).forEach((item, i) => {
      const b = document.createElement('button');
      b.className = 'opt';
      b.innerHTML = '<span class="opt-idx">物件 0' + (i + 1) + '</span>' + item.label + (item.viewed ? ' <small style="color:var(--gold)">（可重读）</small>' : '');
      b.onclick = () => act('inspect', item.id);
      box.appendChild(b);
    });
    if (data.can_continue) {
      const c = document.createElement('button');
      c.className = 'opt next-btn';
      c.innerHTML = '<span class="opt-idx">继续 · 前进</span>' + (data.continue_label || '继续');
      c.onclick = () => act('continue');
      box.appendChild(c);
    }
    const invBox = $('invBox');
    if (invBox) {
      invBox.innerHTML = '';
      const note = document.createElement('div');
      note.className = 'clue';
      note.innerHTML = '<span class="cl-seal">提示</span><span>至少查看一件物件后才可继续前进</span>';
      invBox.appendChild(note);
    }
  }

  /* 分支选项（choices） */
  function renderOptions(options, data) {
    const box = $('optBox');
    box.innerHTML = '';
    options.forEach((o, i) => {
      const b = document.createElement('button');
      b.className = 'opt';
      b.innerHTML = '<span class="opt-idx">抉择 0' + (i + 1) + '</span>' + o.label;
      b.onclick = () => act('choose', o.id);
      box.appendChild(b);
    });
    if (data.selection_cancelled) {
      const r = document.createElement('button');
      r.className = 'opt next-btn';
      r.innerHTML = '<span class="opt-idx">重新选择</span>重新选择路线';
      r.onclick = () => act('retry_choice');
      box.appendChild(r);
    }
  }

  /* 库存（右栏任务手记 → 随身物品） */
  function renderInventory(data) {
    const box = $('invBox');
    if (!box) return;
    const items = data.inventory || [];
    if (!items.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="clue" style="background:rgba(191,160,90,.12);border:1px solid rgba(191,160,90,.35)"><span class="cl-seal">物品</span><span>' +
      items.map(i => i.name + (i.quantity && i.quantity > 1 ? ' ×' + i.quantity : '')).join('、') + '</span></div>';
  }

  /* 历史 → 任务手记线索 */
  function renderHistory(data) {
    const list = $('historyBox');
    if (!list) return;
    const history = data.history || [];
    list.innerHTML = '';
    history.slice(-4).reverse().forEach((h) => {
      const div = document.createElement('div');
      div.className = 'clue';
      div.innerHTML = '<span class="cl-seal">' + (h.kind === 'choice' ? '决定' : h.kind === 'dialogue' ? '对白' : '记录') + '</span><span>' +
        (h.speaker ? h.speaker + '：' : '') + h.text + '</span>';
      list.appendChild(div);
    });
    if (!history.length) {
      list.innerHTML = '<div class="clue"><span class="cl-seal">记录</span><span>故事尚未开始</span></div>';
    }
  }

  /* 回溯检查点 */
  function renderCheckpoints(data) {
    const box = $('rewindBox');
    if (!box) return;
    const checkpoints = data.checkpoints || [];
    box.innerHTML = '';
    checkpoints.forEach((cp) => {
      const b = document.createElement('button');
      b.className = 'mini-chip';
      b.textContent = cp.label;
      b.onclick = () => act('rewind', cp.id);
      box.appendChild(b);
    });
  }

  /* ── 事件弹窗（保持协议，夜行风格自实现） ─────────────── */
  let dialogEl = null;
  function syncEvents(events) {
    closeDialog();
    const event = events && events[0];
    if (!event) return;
    const wrap = document.createElement('div');
    wrap.className = 'mb-backdrop';
    const card = document.createElement('div');
    card.className = 'mb-card';
    const key = (event.box && event.box.group + '/' + event.box.template) || '';
    const sealText = { 'narration': '叙述', 'dialogue': '对白', 'background': '背景', 'information': '信息', 'screen_text': '屏幕' }[event.box && event.box.template] || '提示';
    if (event.event_type === 'text_display_requested') {
      const role = event.payload.role;
      card.innerHTML =
        '<div class="mb-head"><span class="mb-seal">' + sealText + '</span><span class="mb-role">' + (role || '旁白') + '</span></div>' +
        '<p class="mb-text"></p>' +
        '<button class="btn btn-cta mb-confirm"></button>';
      card.querySelector('.mb-text').textContent = event.payload.message || '';
      card.querySelector('.mb-confirm').textContent = event.payload.confirm_label || '我已读完，继续';
      card.querySelector('.mb-confirm').onclick = () => act('next', undefined, event.event_id);
    } else if (event.event_type === 'branch_selection_requested') {
      const options = event.payload.options || [];
      card.innerHTML =
        '<div class="mb-head"><span class="mb-seal">抉择</span><span class="mb-role">路线选择</span></div>' +
        '<p class="mb-text"></p><div class="mb-opts"></div>' +
        '<button class="btn btn-ghost mb-cancel">稍后选择</button>';
      card.querySelector('.mb-text').textContent = event.payload.prompt || '请选择接下来的行动';
      const list = card.querySelector('.mb-opts');
      options.forEach((o, i) => {
        const b = document.createElement('button');
        b.className = 'opt';
        b.innerHTML = '<span class="opt-idx">路线 0' + (i + 1) + '</span>' + o.label;
        b.onclick = () => act('choose', o.id, event.event_id);
        list.appendChild(b);
      });
      card.querySelector('.mb-cancel').onclick = () => act('cancel_choice', undefined, event.event_id);
    } else {
      return;
    }
    wrap.appendChild(card);
    document.body.appendChild(wrap);
    dialogEl = wrap;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      // 协议：文字弹窗 Escape 不推进；分支弹窗 Escape 等同 cancel_choice（带 event_id 回执）
      if (event.event_type === 'branch_selection_requested') {
        act('cancel_choice', undefined, event.event_id);
      }
    };
    wrap._onKey = onKey;
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => wrap.classList.add('on'));
  }
  function closeDialog() {
    if (dialogEl) {
      if (dialogEl._onKey) document.removeEventListener('keydown', dialogEl._onKey);
      dialogEl.remove(); dialogEl = null;
    }
  }
  function showDialogError(text) {
    if (!dialogEl) return;
    const card = dialogEl.querySelector('.mb-card');
    let err = card.querySelector('.mb-error');
    if (!err) { err = document.createElement('p'); err.className = 'mb-error'; card.insertBefore(err, card.firstChild); }
    err.textContent = text;
  }

  /* ── 动作提交（busy 防重 + revision 原样回传 + 失败保留） ── */
  async function act(action, value, eventId) {
    if (busy || !current) return;
    setBusy(true);
    try {
      const data = await AIGameAPI.act({
        game_id: current.game_id,
        revision: current.revision,
        action: action,
        value: value,
        event_id: eventId
      });
      renderView(data);
      await syncEvents(data.display_events);
      showSaveState('进度已保存');
    } catch (err) {
      showPlayError(err.message || '操作失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  /* ── 入口：开始 / 恢复 ─────────────────────── */
  async function startGame(routeTo = true) {
    setBusy(true);
    try {
      const data = await AIGameAPI.startGame();
      renderView(data);
      await syncEvents(data.display_events);
      if (routeTo) go('play');
      showSaveState('新档案已建立');
    } catch (err) {
      showPlayError(err.message || '无法连接试玩服务，请通过后端地址启动。');
    } finally {
      setBusy(false);
    }
  }

  async function resumeGame() {
    setBusy(true);
    try {
      const data = await AIGameAPI.resumeGame();
      renderView(data);
      await syncEvents(data.display_events);
      // 恢复后由 mode 决定去向：ending 走结局页，其余确保在 play
      if (data.mode !== 'ending' && (location.hash || '').indexOf('play') < 0) go('play');
      showSaveState('进度已恢复');
    } catch (err) {
      const msg = err.message || '';
      // §8：存档不存在 → 清除无效 game_id，引导重新开始
      if (/存档不存在|不存在|无效|重新开始/.test(msg)) {
        AIGameAPI.forgetId();
        showPlayError('没有可恢复的进度，已清除旧存档。请返回大厅开始新游戏。');
      } else {
        showPlayError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  /* 结局：跳转 #/ending 并填充 */
  function goEnding(data) {
    const ending = data.ending || { label: '结局' };
    $('ehSeal').textContent = '结局 · 达成';
    $('ehTitle').innerHTML = (ending.label || '故事落幕').replace(/\n/g, '<br>');
    $('ehDesc').innerHTML = (data.history && data.history.length ? '你走完了这段旅程，档案就此封存。' : '');
    const tl = $('endingTimeline');
    tl.innerHTML = '';
    (data.history || []).slice(-3).forEach((h, i) => {
      const node = document.createElement('div');
      node.className = 'tl-node';
      node.innerHTML = '<span class="tl-mark">0' + (i + 1) + '</span><div class="tl-body"><div class="tl-q">' + (h.scene_title || '旅程') + '</div><div class="tl-a">' + h.text + '</div></div>';
      tl.appendChild(node);
    });
    go('ending');
  }

  /* ── UI 状态辅助 ─────────────────────── */
  function setBusy(value) {
    busy = value;
    const buttons = document.querySelectorAll('#optBox button, #invBox button, #rewindBox button, .mb-card button');
    buttons.forEach((b) => { b.disabled = value; });
  }
  function showSaveState(text) {
    const tip = document.querySelector('.save-tip');
    if (!tip) return;
    const t = document.getElementById('saveTime');
    if (t) t.textContent = text;
    tip.classList.add('show');
    clearTimeout(tip._t);
    tip._t = setTimeout(() => tip.classList.remove('show'), 2200);
  }
  function showPlayError(message) {
    if (typeof toast === 'function') toast(message);
    showDialogError(message);
  }

  window.AIGame = {
    startGame: startGame,
    resumeGame: resumeGame,
    act: act,
    syncEvents: syncEvents,
    hasGame: () => !!current,
    current: () => current
  };

  /* ── 刷新自动恢复：停留在 play/ending 且有存档时，恢复未确认弹窗 ── */
  window.addEventListener('load', () => {
    const h = (location.hash || '#/hall').replace('#/', '') || 'hall';
    if ((h === 'play' || h === 'ending') && AIGameAPI.currentId()) {
      resumeGame();
    }
  });
})();
