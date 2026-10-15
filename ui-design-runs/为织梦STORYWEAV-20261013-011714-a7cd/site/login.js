/* ═══ 登录/注册 · 档案准入守卫 ═══ */
(() => {
  const KEY = 'deepexplore.auth';
  const USERS = 'deepexplore.users';
  const getUsers = () => { try { return JSON.parse(localStorage.getItem(USERS) || '{}'); } catch (e) { return {}; } };
  const authed = () => {
    try {
      const u = localStorage.getItem(KEY);
      if (!u) return false;
      if (u === 'admin') return true;
      return !!getUsers()[u];
    } catch (e) { return false; }
  };
  const curPage = () => (location.hash || '').replace('#/', '') || 'hall';
  const saveUsers = (u) => { try { localStorage.setItem(USERS, JSON.stringify(u)); } catch (e) {} };

  let mode = 'login';
  const setMode = (m) => {
    mode = m;
    document.querySelectorAll('.login-tabs .tab-item').forEach(b => {
      const on = b.dataset.tab === m;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
    const reg = m === 'register';
    document.getElementById('passConfirmField').hidden = !reg;
    document.getElementById('loginSubmit').textContent = reg ? '创建档案，进入档案局' : '进入档案局';
    document.getElementById('loginSub').textContent = reg ? '建立你的档案编号与密钥，开启故事之旅' : '输入档案编号与密钥，进入互动故事档案局';
    document.getElementById('loginHint').textContent = reg ? '编号需 2-20 位 · 密钥至少 4 位' : '试用编号 admin · 密钥 0000';
    document.getElementById('loginStamp').textContent = reg ? '建档' : '准入';
    const err = document.getElementById('loginErr');
    if (err) { err.textContent = ''; err.classList.remove('show'); }
    const user = document.getElementById('loginUser');
    if (user) user.placeholder = reg ? '设置你的档案编号' : '输入档案编号';
  };

  /* 未登录时，任何非登录页的访问都拉回登录页 */
  function guard() {
    if (!authed() && curPage() !== 'login') go('login');
  }

  window.addEventListener('load', () => {
    guard();
    window.addEventListener('hashchange', guard);

    /* 登录/注册 Tab 切换 */
    document.querySelectorAll('.login-tabs .tab-item').forEach(btn =>
      btn.addEventListener('click', () => setMode(btn.dataset.tab)));

    /* 表单提交 */
    const form = document.getElementById('loginForm');
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();
      const user = (document.getElementById('loginUser').value || '').trim();
      const pass = document.getElementById('loginPass').value || '';
      const err = document.getElementById('loginErr');
      const fail = (msg) => {
        if (err) { err.textContent = msg; err.classList.add('show'); }
        const pw = document.getElementById('loginPass');
        if (pw) { pw.value = ''; pw.focus(); }
      };

      if (mode === 'register') {
        const pass2 = document.getElementById('loginPass2').value || '';
        if (!user) return fail('请输入档案编号');
        if (user.length < 2 || user.length > 20) return fail('档案编号需为 2-20 位');
        if (pass.length < 4) return fail('密钥至少需要 4 位');
        if (pass !== pass2) return fail('两次输入的密钥不一致');
        const users = getUsers();
        if (users[user] || user === 'admin') return fail('该档案编号已存在，请换一个或直接登录');
        users[user] = pass;
        saveUsers(users);
        try { localStorage.setItem(KEY, user); } catch (e2) {}
        if (err) err.classList.remove('show');
        if (window.__syncGuideLaunch) window.__syncGuideLaunch();
        toast('档案建立成功 · 欢迎加入深探');
        go('hall');
      } else {
        const users = getUsers();
        if ((user === 'admin' && pass === '0000') || users[user] === pass) {
          try { localStorage.setItem(KEY, user); } catch (e2) {}
          if (err) err.classList.remove('show');
          if (window.__syncGuideLaunch) window.__syncGuideLaunch();
          toast(user === 'admin' ? '身份核验通过 · 欢迎回来，档案管理员' : '身份核验通过 · 欢迎回来，' + user);
          go('hall');
        } else {
          return fail('档案编号或密钥不正确，请重新输入');
        }
      }
    });

    /* 登出 */
    const logout = document.getElementById('logoutBtn');
    if (logout) logout.addEventListener('click', () => {
      try { localStorage.removeItem(KEY); } catch (e3) {}
      if (window.__syncGuideLaunch) window.__syncGuideLaunch();
      toast('已注销，档案局进入休眠');
      setMode('login');
      go('login');
    });
  });
})();
