/* ═══ 登录 · 档案准入守卫 ═══ */
(() => {
  const KEY = 'deepexplore.auth';
  const authed = () => { try { return localStorage.getItem(KEY) === 'admin'; } catch (e) { return false; } };
  const curPage = () => (location.hash || '').replace('#/', '') || 'hall';

  /* 未登录时，任何非登录页的访问都拉回登录页 */
  function guard() {
    if (!authed() && curPage() !== 'login') go('login');
  }

  window.addEventListener('load', () => {
    guard();
    window.addEventListener('hashchange', guard);

    /* 登录提交 */
    const form = document.getElementById('loginForm');
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();
      const user = (document.getElementById('loginUser').value || '').trim();
      const pass = document.getElementById('loginPass').value || '';
      const err = document.getElementById('loginErr');
      if (user === 'admin' && pass === '0000') {
        try { localStorage.setItem(KEY, 'admin'); } catch (e2) {}
        if (err) err.classList.remove('show');
        if (window.__syncGuideLaunch) window.__syncGuideLaunch();
        toast('身份核验通过 · 欢迎回来，档案管理员');
        go('hall');
      } else {
        if (err) { err.textContent = '档案编号或密钥不正确，请重新输入'; err.classList.add('show'); }
        const pw = document.getElementById('loginPass');
        if (pw) { pw.value = ''; pw.focus(); }
      }
    });

    /* 登出 */
    const logout = document.getElementById('logoutBtn');
    if (logout) logout.addEventListener('click', () => {
      try { localStorage.removeItem(KEY); } catch (e3) {}
      if (window.__syncGuideLaunch) window.__syncGuideLaunch();
      toast('已注销，档案局进入休眠');
      go('login');
    });
  });
})();
