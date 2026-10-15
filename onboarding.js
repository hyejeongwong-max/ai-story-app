(() => {
  const KEY='deepexplore.onboarding.v1';
  const steps=[
    {title:'欢迎来到深探',text:'这里是你的互动故事档案局。用一分钟认识各个板块，再选择一段故事，开启属于你的旅程。',page:'hall'},
    {title:'剧本大厅 · 发现故事',text:'所有故事的入口都在这里。你可以浏览剧本、挑选喜欢的世界，也可以随时回到大厅重新选择。',page:'hall',target:'.nav-item[data-page="hall"]'},
    {title:'按兴趣筛选世界',text:'用「悬疑奇幻」「治愈冒险」筛选故事；「我的剧本」用于查看自己创作的内容。',page:'hall',target:'#tabs'},
    {title:'继续上次的旅程',text:'想接着玩？在这里查看上次的章节与进度，点击「继续旅程」返回故事。',page:'hall',target:'#continueBar'},
    {title:'挑选剧本，开始冒险',text:'点击剧本卡片查看背景、角色与章节介绍，再选择扮演的角色进入故事。部分剧本仍在归档中，以页面提示为准。',page:'hall',target:'#storyGrid .story-card'},
    {title:'创作剧本 · 构建你的世界',text:'创作有两种方式：已有完整故事，选择「上传剧本」；只有灵感，选择「提供信息，AI 生成剧本」，填写题材、人物与背景。',page:'upload',target:'.creation-methods'},
    {title:'我的旅程 · 回看故事足迹',text:'这里汇集旅程手记。查看章节记录、线索和人物关系，回顾自己的选择，再继续故事。',page:'notes',target:'.page[data-page="notes"] .notes-list'},
    {title:'准备好了，故事等你落笔',text:'从大厅选择一份感兴趣的卷宗开始吧。以后想再了解各个板块，点击右下角「新手指南」即可重新查看。',page:'hall'}
  ];
  const launch=document.createElement('button');launch.className='guide-launch';launch.textContent='✧ 新手指南';document.body.append(launch);
  const authed=()=>{try{const u=localStorage.getItem('deepexplore.auth');if(!u)return false;if(u==='admin')return true;const us=JSON.parse(localStorage.getItem('deepexplore.users')||'{}');return !!us[u];}catch(e){return false;}};
  function syncLaunch(){launch.style.display=authed()?'':'none';}
  syncLaunch();window.addEventListener('load',syncLaunch);window.__syncGuideLaunch=syncLaunch;
  const overlay=document.createElement('div');overlay.className='guide-overlay';overlay.hidden=true;
  overlay.innerHTML='<div class="guide-shade"></div>'.repeat(4)+'<div class="guide-focus"></div><section class="guide-card" role="dialog" aria-modal="true" aria-labelledby="guide-title" aria-describedby="guide-description" tabindex="-1"><button class="guide-close" aria-label="跳过引导">×</button><div class="guide-kicker">DEEP EXPLORE / 新人入局指南</div><h2 id="guide-title"></h2><p id="guide-description"></p><div class="guide-progress" aria-hidden="true"></div><div class="guide-actions"><span class="guide-count"></span><button class="guide-prev">上一步</button><button class="guide-next">开始了解 →</button></div><div class="guide-hint">可用 ← → 切换步骤，Esc 跳过</div></section>';
  document.body.append(overlay);
  const card=overlay.querySelector('.guide-card'),focus=overlay.querySelector('.guide-focus'),shades=[...overlay.querySelectorAll('.guide-shade')];
  let index=0,timer,renderVersion=0,preparing=false,active=false,returnPage='hall',lastFocus,oldOverflow;
  const box=(el,x,y,w,h)=>Object.assign(el.style,{left:x+'px',top:y+'px',width:Math.max(0,w)+'px',height:Math.max(0,h)+'px'});
  function position(){
    if(!active||preparing)return;
    const s=steps[index],el=s.target&&document.querySelector(s.target),r=el?.getBoundingClientRect();
    const W=innerWidth,H=innerHeight;
    if(r&&r.width&&r.height){
      const x=Math.max(8,r.left-7),y=Math.max(8,r.top-7),right=Math.min(W-8,r.right+7),bottom=Math.min(H-8,r.bottom+7);
      focus.hidden=false;box(focus,x,y,right-x,bottom-y);
      box(shades[0],0,0,W,y);box(shades[1],0,y,x,bottom-y);box(shades[2],right,y,W-right,bottom-y);box(shades[3],0,bottom,W,H-bottom);
      const cw=card.offsetWidth,ch=card.offsetHeight;
      let cx=right+20,cy=y;
      if(cx+cw>W-16){cx=Math.min(W-cw-16,Math.max(16,x));cy=bottom+18;}
      if(cy+ch>H-16)cy=y-ch-18;
      if(cy<16){cy=Math.max(16,(H-ch)/2);cx=Math.max(16,W-cw-24);}
      card.style.left=Math.max(16,cx)+'px';card.style.top=Math.max(16,Math.min(H-ch-16,cy))+'px';
    }else{focus.hidden=true;box(shades[0],0,0,W,H);shades.slice(1).forEach(s=>box(s,0,0,0,0));card.style.left=(W-card.offsetWidth)/2+'px';card.style.top=Math.max(16,(H-card.offsetHeight)/2)+'px';}
  }
  const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  async function show(){
    const version=++renderVersion,s=steps[index];
    preparing=true;
    // Keep the previous card in place while the route and viewport settle.
    go(s.page);
    for(let frame=0;frame<120;frame++){
      if(!active||version!==renderVersion)return;
      if(document.querySelector('.page.active')?.dataset.page===s.page)break;
      await nextFrame();
    }
    if(!active||version!==renderVersion)return;
    if(s.target)document.querySelector(s.target)?.scrollIntoView({block:'center',behavior:'instant'});
    await nextFrame();await nextFrame();
    if(!active||version!==renderVersion)return;
    card.querySelector('h2').textContent=s.title;card.querySelector('p').textContent=s.text;
    card.querySelector('.guide-count').textContent=String(index+1).padStart(2,'0')+' / '+steps.length;
    card.querySelector('.guide-progress').innerHTML=steps.map((_,i)=>'<i class="'+(i<=index?'on':'')+'"></i>').join('');
    card.querySelector('.guide-prev').hidden=index===0;
    card.querySelector('.guide-next').textContent=index===steps.length-1?'完成，开始探索':index===0?'开始了解 →':'下一步 →';
    preparing=false;
    position();card.style.visibility='visible';card.focus({preventScroll:true});
  }
  function start(){if(!authed())return;lastFocus=document.activeElement;returnPage=document.querySelector('.page.active')?.dataset.page||'hall';oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';document.body.classList.add('guide-active');active=true;index=0;card.style.visibility='hidden';overlay.hidden=false;show();}
  function close(){document.body.classList.remove('guide-active');active=false;renderVersion++;preparing=false;clearTimeout(timer);overlay.hidden=true;document.body.style.overflow=oldOverflow;try{localStorage.setItem(KEY,'seen');}catch{}go(returnPage);lastFocus?.focus();}
  launch.onclick=start;overlay.querySelector('.guide-close').onclick=close;
  window.__startGuide=start; /* 供登录成功后调用：未看过引导的新用户登录即自动播放一次 */
  overlay.querySelector('.guide-prev').onclick=()=>{if(index>0){index--;show();}};
  overlay.querySelector('.guide-next').onclick=()=>{if(index<steps.length-1){index++;show();}else{ returnPage='hall';close();}};
  document.addEventListener('keydown',e=>{if(!active)return;if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='ArrowRight'){e.preventDefault();overlay.querySelector('.guide-next').click();}if(e.key==='ArrowLeft'){e.preventDefault();overlay.querySelector('.guide-prev').click();}if(e.key==='Tab'){const a=[...card.querySelectorAll('button')].filter(b=>!b.hidden);let n=a.indexOf(document.activeElement);e.preventDefault();a[(n+(e.shiftKey?-1:1)+a.length)%a.length].focus();}});
  window.addEventListener('resize',position);
  /* 引导只对新用户自动播放一次：未看过时登录自动弹；看过之后不再自动出现（?guide=1 可强制重看，右下角按钮可手动重看） */
  let seen=false;try{seen=!!localStorage.getItem(KEY);}catch{}
  if(authed()&&(!seen||new URLSearchParams(location.search).get('guide')==='1'))setTimeout(start,900);
})();

(() => {
 const form=document.getElementById('uploadForm'),panel=document.getElementById('scriptUploadPanel');
 form.hidden=true;
 document.querySelectorAll('[data-method]').forEach(button=>button.addEventListener('click',()=>{
   const ai=button.dataset.method==='ai';form.hidden=!ai;panel.hidden=ai;
   document.querySelectorAll('[data-method]').forEach(b=>{const on=b===button;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});
   if(ai){form.classList.add('in');form.querySelector('.upload-cta .txt').textContent='根据以上信息生成剧本';}
 }));
 let selection=0;
 document.getElementById('scriptFile').addEventListener('change',async e=>{
   const ticket=++selection,file=e.target.files[0],status=document.getElementById('scriptFileStatus'),preview=document.getElementById('scriptText');preview.value='';
   if(!file){status.textContent='尚未选择文件';return;}
   if(file.size>20*1024*1024){status.textContent='文件超过 20 MB，请选择较小的文件。';e.target.value='';return;}
   if(!/\.(txt|md|pdf|docx)$/i.test(file.name)){status.textContent='请选择 TXT、Markdown、PDF 或 DOCX 文件。';e.target.value='';return;}
   status.textContent='已选择：'+file.name+'（'+(file.size/1024).toFixed(1)+' KB）';
   if(/\.(txt|md)$/i.test(file.name)){const text=await file.text();if(ticket===selection)preview.value=text;}
   else preview.placeholder='已选择文档，PDF / Word 内容解析需连接后端服务。';
 });
})();
