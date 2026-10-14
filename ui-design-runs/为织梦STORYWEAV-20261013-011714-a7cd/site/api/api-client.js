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
    const response = await fetch(path, payload === undefined ? {} : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/x-ndjson' },
      body: JSON.stringify(payload)
    });

    let result = null;
    const streamEvents = [];

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

    if (!result.ok) throw new Error(result.error || '操作失败，请重试');
    if (result.data && !result.data.display_events && streamEvents.length) {
      result.data.display_events = streamEvents;
    }
    return result.data;
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
    forgetId: forgetId
  };
})();
