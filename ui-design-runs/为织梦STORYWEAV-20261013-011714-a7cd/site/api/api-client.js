/* AI 剧本杀 · 前端 API 对接层（唯一 API 出口）
 * 协议来源：前端接入文档.md（HTTP 接口 + NDJSON 流 + 事件回执）
 * 规则：前端不请求模型、不执行 Tool、不决定分支；revision 原样回传；
 *       event_id 必须回执；失败保留状态、显示中文错误、绝不伪造剧情。
 */
(function () {
  'use strict';

  const API = {
    runtime: '/api/runtime',
    game: '/api/game',
    action: '/api/action'
  };

  const storageKey = 'imms.mystery.session';

  /* ── 核心请求：普通 JSON / application/x-ndjson 流 ─────────── */
  async function request(path, payload, onProgress) {
    let response;
    try {
      response = await fetch(path, payload === undefined ? {} : {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/x-ndjson' },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      return offlineFallback(path, payload, onProgress, err);
    }
    if (!response.ok) {
      return offlineFallback(path, payload, onProgress, new Error('HTTP ' + response.status));
    }

    let result = null;
    const streamEvents = [];

    try {
      if (response.headers.get('Content-Type') && response.headers.get('Content-Type').includes('application/x-ndjson')) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let pending = '';
        const consume = (line) => {
          if (!line.trim()) return;
          let event;
          try { event = JSON.parse(line); } catch { return; } // 断行残留，忽略等待下一行
          if (event.type === 'progress' && typeof onProgress === 'function') onProgress(event.message);
          if (event.type === 'display_event') streamEvents.push(event.event);
          if (event.type === 'result') result = event;
        };
        while (true) {
          const chunk = await reader.read();
          pending += decoder.decode(chunk.value, { stream: !chunk.done });
          const lines = pending.split('\n');
          pending = lines.pop();
          lines.forEach(consume);
          if (chunk.done) break;
        }
        consume(pending);
        if (!result) throw new Error('连接中断，请刷新后确认进度。');
      } else {
        result = await response.json();
      }
    } catch (err) {
      return offlineFallback(path, payload, onProgress, err);
    }

    if (!result.ok) throw new Error(result.error || '操作失败，请重试');
    if (result.data && !result.data.display_events && streamEvents.length) {
      result.data.display_events = streamEvents;
    }
    return result.data;
  }

  /* ── 离线演示引擎：后端不可达时驱动内置演示剧本（UI 明示离线模式，不伪造后端） ── */
  const offlineEngine = (function () {
    const KEY = 'imms.mystery.offline';
    /* 演示剧本：月隐来信 · 演示线（8 节点，2 结局） */
    const NODES = {
      n01: { scene_id: 'N01', scene_title: '深夜档案室 · 档案架前', chapter: 'CH.01', page: 1, checkpoint: '档案室',
        text: '深夜的档案室只有一盏灯亮着。你摊开那封没有署名的信，墨迹在灯光下泛着二十年前的黄。桌角，守夜人沈夜放下热茶，没有问你在看什么。',
        options: [
          { id: 'a', label: '拆开信封，读那封信', next: 'n02' },
          { id: 'b', label: '先把它登记入册，明天再说', next: 'n03' }
        ] },
      n02: { scene_id: 'N02', scene_title: '雾港邮局 · 柜台前', chapter: 'CH.01', page: 2, item: '一枚二十年前的邮戳',
        text: '你拆开信封，里面只有一张泛黄的船票，日期是二十年前的中秋。你循着邮戳上的地址来到雾港邮局——柜台后的老人抬起头，目光在你脸上停了一瞬：「你终于来了。」',
        options: [
          { id: 'c', label: '追问邮戳的来处', next: 'n04' },
          { id: 'd', label: '请他再泡一壶茶，慢慢讲', next: 'n04' }
        ] },
      n03: { scene_id: 'N03', scene_title: '值班室 · 旧案卷柜前', chapter: 'CH.01', page: 3, item: '二十年前的旧案卷',
        text: '你把信登记入册，指尖却停在档案柜最深处一格。那格子的年份——二十年前——恰好与邮戳吻合。你抽出一卷蒙尘的旧案，编号下方压着一枚与信上相同的邮戳。',
        options: [
          { id: 'e', label: '翻开旧案卷，寻找收件人', next: 'n04' },
          { id: 'f', label: '叫上沈夜，一起去邮局核实', next: 'n04' }
        ] },
      n04: { scene_id: 'N04', scene_title: '老钟楼 · 雾中桥头', chapter: 'CH.02', page: 5, checkpoint: '老钟楼',
        text: '线索都指向雾港老钟楼。子夜，钟楼前的雾比任何时候都浓，桥那头亮着一盏孤灯。信上写着：「月圆之夜，来老钟楼见我。」你站在桥心，听见钟声在雾里一圈圈荡开。',
        options: [
          { id: 'g', label: '走向桥心，赴这场二十年的约', next: 'end1' },
          { id: 'h', label: '退回雾里，先查清写信人的身份', next: 'end2' }
        ] },
      end1: { scene_id: 'E01', scene_title: '结局 · 真相抵达', chapter: 'CH.03', page: 8, end: true, ending_label: '月落之时 · 真相抵达',
        text: '桥心站着一位白发老人。他递给你一封信：「二十年前我送不出这封信，因为我怕你恨我。现在你来了——信终于到了。」你拆开信封，纸上只有一行字：「父亲，对不起，还有，谢谢你。」' },
      end2: { scene_id: 'E02', scene_title: '结局 · 雾散人归', chapter: 'CH.03', page: 8, end: true, ending_label: '月圆之夜 · 雾散人归',
        text: '你退回雾里，决定先把写信人的名字查清。天亮时，邮局老人送来一只木盒，里面是二十封未寄出的信，收件人都是同一个名字——你母亲的旧名。雾散了，你把信一封封放回邮筒：有些答案，不必等到月圆。' }
    };
    function load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } }
    function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 存储不可用则忽略 */ } }
    function clear() { try { localStorage.removeItem(KEY); } catch { /* 忽略 */ } }
    function view(state) {
      const n = NODES[state.key] || NODES.n01;
      return {
        ok: true,
        game_id: state.game_id,
        revision: state.revision,
        mode: n.end ? 'ending' : 'choices',
        script_name: '月隐来信（演示）',
        scene_id: n.scene_id,
        scene_title: n.scene_title,
        ending: n.end ? { label: n.ending_label || '结局' } : undefined,
        block: { text: n.text },
        options: (n.options || []).map(o => ({ id: o.id, label: o.label })),
        page_number: n.page,
        page_count: 8,
        history: state.history,
        inventory: state.inventory,
        checkpoints: state.checkpoints,
        selected_role_name: state.roleName || '林知微 · 档案调查员',
        role_state: '本局身份 · 已选定',
        next_label: '我已读完，继续'
      };
    }
    function start(scriptName, roleId, onProgress) {
      const state = {
        game_id: 'demo-' + Date.now(),
        revision: 1,
        key: 'n01',
        history: [{ kind: 'page', text: '深夜的档案室只有一盏灯亮着。你摊开那封没有署名的信，墨迹在灯光下泛着二十年前的黄。' }],
        inventory: [],
        checkpoints: [{ id: 'c1', label: '档案室' }],
        roleName: roleId === 'rc-guqinghe' ? '顾青禾 · 神秘访客' : '林知微 · 档案调查员'
      };
      save(state);
      return Promise.resolve(view(state));
    }
    function act(payload) {
      const state = load() || {
        game_id: 'demo-' + Date.now(), revision: 1, key: 'n01',
        history: [], inventory: [], checkpoints: [], roleName: null
      };
      const n = NODES[state.key] || NODES.n01;
      if (payload.action === 'rewind') {
        const cp = (state.checkpoints || []).find(c => c.id === payload.value);
        if (cp && NODES[cp.key]) {
          state.key = cp.key;
          state.revision = (state.revision || 1) + 1;
        }
      } else if (n.end) {
        /* 结局页无推进动作 */
      } else {
        const opt = (n.options || []).find(o => o.id === payload.value);
        const nextKey = opt ? opt.next : (payload.action === 'next' || payload.action === 'continue' ? n.next : null);
        if (nextKey && NODES[nextKey]) {
          state.history = state.history || [];
          if (opt) state.history.push({ kind: 'choice', text: opt.label });
          const nn = NODES[nextKey];
          state.history.push({ kind: 'page', text: (nn.text || '').slice(0, 40) + '…' });
          if (nn.item && state.inventory.indexOf(nn.item) < 0) state.inventory.push(nn.item);
          state.revision = (state.revision || 1) + 1;
          state.key = nextKey;
          if (nn.checkpoint && !(state.checkpoints || []).find(c => c.key === nextKey)) {
            state.checkpoints.push({ id: 'c' + (state.checkpoints.length + 1), key: nextKey, label: nn.checkpoint });
          }
        }
      }
      save(state);
      return Promise.resolve(view(state));
    }
    function resume() {
      const s = load();
      if (s) return Promise.resolve(view(s));
      return start(null, null, null);
    }
    return { start: start, act: act, resume: resume, clear: clear, isOffline: true };
  })();

  function offlineFallback(path, payload, onProgress, cause) {
    window.__offlineMode = true;
    if (path.indexOf(API.game) === 0) {
      if (payload === undefined || Object.keys(payload).length === 0) return offlineEngine.resume();
      return offlineEngine.start(payload.script_name, payload.role_id, onProgress);
    }
    if (path.indexOf(API.action) === 0) return offlineEngine.act(payload, onProgress);
    throw new Error('离线演示模式：' + ((cause && cause.message) || '无法连接试玩服务'));
  }

  /* ── 业务接口 ─────────────────────────────── */
  async function getRuntime() {
    const response = await fetch(API.runtime);
    const result = await response.json();
    if (!result.ok) throw new Error(result.error || '服务不可用');
    return result.data;
  }

  async function startGame(scriptName, roleId, onProgress) {
    const payload = {};
    if (scriptName) payload.script_name = scriptName;
    if (roleId) payload.role_id = roleId;
    const data = await request(API.game, payload, onProgress);
    try { localStorage.setItem(storageKey, data.game_id); } catch (e) { /* 平台存储不可用则忽略 */ }
    return data;
  }

  async function resumeGame(id, onProgress) {
    const gameId = id || currentId();
    if (!gameId) throw new Error('没有保存的游戏，请重新开始。');
    return await request(API.game + '?id=' + encodeURIComponent(gameId), undefined, onProgress);
  }

  async function act({ game_id, revision, action, value, event_id }, onProgress) {
    return await request(API.action, {
      game_id: game_id,
      revision: revision,
      action: action,
      value: value,
      event_id: event_id
    }, onProgress);
  }

  function currentId() {
    try { return localStorage.getItem(storageKey); } catch { return null; }
  }
  function forgetId() {
    try { localStorage.removeItem(storageKey); } catch { /* 服务端仍保留存档 */ }
  }

  window.AIGameAPI = {
    request: request,
    getRuntime: getRuntime,
    startGame: startGame,
    resumeGame: resumeGame,
    act: act,
    currentId: currentId,
    forgetId: forgetId,
    offline: offlineEngine
  };
})();
