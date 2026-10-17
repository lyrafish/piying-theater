/* ===========================================================
   main.js · 皮影剧场 入口
   =========================================================== */
import { STORIES, CUSTOM_CHARS, CUSTOM_BGS, ROLES } from './data.js';
import { Stage } from './stage.js';

/* 模块成功执行 = 运行环境正常，取消 file:// 兜底提示 */
window.__piyingBooted = true;
const _diag = document.getElementById('diag');
if (_diag) _diag.classList.remove('on');

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const deck = $('#deck');
const dotsEl = $('#dots');
const toastEl = $('#toast');

/* ---------------- 提示 ---------------- */
let toastTimer = 0;
function toast(msg, ms = 2200) {
  toastEl.textContent = msg;
  toastEl.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('on'), ms);
}

/* ---------------- 全局状态 ---------------- */
const state = {
  index: 0,
  mode: null,            // 'classic' | 'custom'
  storyIndex: 0,
  tab: 'char',           // 自定义页当前分栏
  selChars: [],
  selBg: null,
  rig: null,
  stage: null,
};

/* ---------------- 页面导航 ---------------- */
const N = 4;
function go(i, silent) {
  i = Math.max(0, Math.min(N - 1, i));
  if (i === state.index && !silent) return;
  state.index = i;
  deck.dataset.index = String(i);
  $$('#dots button').forEach((b, k) => b.classList.toggle('on', k === i));
  if (i === 3) {
    const cfg = buildStageConfig();
    if (state.stage && cfg) {
      state.stage.enter(cfg);
      toast('双手入画，五指自然张开静置片刻以校准', 4200);
    }
  } else if (state.stage) {
    state.stage.leave();
  }
}

/* 页码点 */
for (let i = 0; i < N; i++) {
  const b = document.createElement('button');
  b.title = ['封面', '择幕', '剧目', '演绎'][i];
  b.addEventListener('click', () => go(i));
  dotsEl.appendChild(b);
}

/* 滚轮 / 键盘 / 触摸 */
let lock = 0;
function wheelNav(dy) {
  const now = performance.now();
  if (now - lock < 780 || Math.abs(dy) < 4) return;
  lock = now;
  go(state.index + (dy > 0 ? 1 : -1));
}
window.addEventListener('wheel', (e) => {
  const sc = e.target.closest && e.target.closest('.side-body, .grid, .strip, .scrollable');
  if (sc && sc.scrollHeight > sc.clientHeight + 3) {
    const atTop = sc.scrollTop <= 1;
    const atBot = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1;
    if ((e.deltaY > 0 && !atBot) || (e.deltaY < 0 && !atTop)) return;
  }
  wheelNav(e.deltaY);
}, { passive: true });

window.addEventListener('keydown', (e) => {
  if (['ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(state.index + 1); }
  else if (['ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); go(state.index - 1); }
  else if (e.key === 'Escape' && state.index === 3) go(2);
});

let touchY = 0, touchX = 0;
window.addEventListener('touchstart', (e) => {
  touchY = e.touches[0].clientY; touchX = e.touches[0].clientX;
}, { passive: true });
window.addEventListener('touchend', (e) => {
  const dy = e.changedTouches[0].clientY - touchY;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dy) < 56 || Math.abs(dy) < Math.abs(dx)) return;
  const sc = e.target.closest && e.target.closest('.side-body, .grid, .strip');
  if (sc && sc.scrollHeight > sc.clientHeight + 3) return;
  go(state.index + (dy < 0 ? 1 : -1));
}, { passive: true });

/* ---------------- 封面 ---------------- */
(function coverTitle() {
  const el = $('#coverTitle');
  const txt = el.textContent.trim();
  el.textContent = '';
  [...txt].forEach((ch, i) => {
    const s = document.createElement('span');
    s.className = 'ch'; s.textContent = ch;
    s.style.animationDelay = (0.16 + i * 0.13) + 's';
    el.appendChild(s);
  });
})();
$('#btnStart').addEventListener('click', () => go(1));

/* ---------------- 页面二 ---------------- */
$('#pickClassic').addEventListener('click', () => { state.mode = 'classic'; buildWorkspace(); go(2); });
$('#pickCustom').addEventListener('click', () => { state.mode = 'custom'; buildWorkspace(); go(2); });

/* ---------------- 页面三 ---------------- */
const workspace = $('#scr3 .workspace');

function buildWorkspace() {
  if (state.mode === 'classic') renderClassic(state.storyIndex);
  else renderCustom();
}

/* —— 经典剧目 —— */
function renderClassic(idx) {
  state.storyIndex = idx;
  const story = STORIES[idx];

  const tabs = STORIES.map((s, i) =>
    `<button class="tb-item${i === idx ? ' on' : ''}" data-i="${i}">
       <span class="t">${s.title}</span><span class="s">${s.subtitle}</span>
     </button>`).join('');

  const POS = { 1: ['c'], 2: ['l', 'r'], 3: ['l', 'c', 'r'] };
  const spots = POS[story.chars.length] || ['l', 'c', 'r'];
  const actors = story.chars.map((c, i) => {
    const cls = spots[i] || 'r';
    const mir = (cls === 'l' && story.chars.length === 2) ? ' mirror' : '';
    return `<img class="actor ${cls}${mir}" src="assets/chars/${c}.png" alt="${c}"
              style="animation-delay:${0.08 * i}s">`;
  }).join('');

  const thumbs = story.chars.map(c =>
    `<div class="th" title="${c} · ${ROLES[c] || ''}">
       <img src="assets/chars/${c}.png" alt=""><span>${c}</span>
     </div>`).join('');

  workspace.innerHTML = `
    <div class="topbar">${tabs}</div>
    <div class="ws-body">
      <div class="stage-col">
        <div class="stage">
          <img class="sbg" src="${story.bg}" alt="">
          <div class="sglow"></div>
          <div class="svig"></div>
          ${actors}
          <div class="plate">${story.title}　·　${story.chars.join(' · ')}</div>
        </div>
        <div class="strip scrollable">
          <span class="lbl">戏箱</span>
          ${thumbs}
          <div class="sep"></div>
          <div class="th wide" title="皮影布景"><img src="${story.bg}" alt=""><span>布景</span></div>
        </div>
      </div>
      <div class="side">
        <div class="side-head">
          <span class="h">简　介</span>
          <span class="tag-v">${story.tone.join(' · ')}</span>
        </div>
        <div class="side-body scrollable">
          <h3>${story.title}</h3>
          <div class="sub">${story.subtitle}</div>
          <p class="txt">${story.intro}</p>
          <div class="chips">${story.notes.map(n => `<span class="chip">${n}</span>`).join('')}</div>
        </div>
        <div class="side-foot"><button class="btn" id="btnEnter">进　入</button></div>
      </div>
    </div>`;

  $$('.tb-item', workspace).forEach(b => b.addEventListener('click', () => renderClassic(+b.dataset.i)));
  $('#btnEnter').addEventListener('click', () => go(3));
}

/* —— 自定义剧目 —— */
function renderCustom() {
  const tabs = `
    <button class="tb-item${state.tab === 'char' ? ' on' : ''}" data-t="char">
      <span class="t">人　物</span><span class="s">皮影人物 · 可择其二</span>
    </button>
    <button class="tb-item${state.tab === 'bg' ? ' on' : ''}" data-t="bg">
      <span class="t">背　景</span><span class="s">皮影布景 · 择其一</span>
    </button>`;

  const isChar = state.tab === 'char';
  const list = isChar ? CUSTOM_CHARS : CUSTOM_BGS;
  const picked = isChar ? state.selChars : (state.selBg ? [state.selBg] : []);

  const cards = list.map(it => {
    const on = picked.some(p => p.id === it.id);
    const badge = (on && isChar) ? `<span class="nm">第 ${state.selChars.findIndex(p => p.id === it.id) + 1} 影</span>` : '';
    return `<button class="card${isChar ? '' : ' wide'}${on ? ' on' : ''}" data-id="${it.id}">
        <img src="${it.file}" alt="">
        <span class="nm">${it.name}</span>${badge}
      </button>`;
  }).join('');

  const cTxt = state.selChars.length ? state.selChars.map(c => c.name).join('　/　') : '未选择';
  const bTxt = state.selBg ? state.selBg.name : '未选择';
  const ready = state.selChars.length > 0 && !!state.selBg;

  workspace.innerHTML = `
    <div class="topbar">${tabs}</div>
    <div class="ws-body">
      <div class="showcase" id="showcase">
        <div class="empty" id="showEmpty">移　鼠　以　观　其　影</div>
      </div>
      <div class="picker frame">
        <span class="cnr-b"></span>
        <div class="grid scrollable" id="grid">${cards}</div>
      </div>
    </div>
    <div class="pick-status">
      <div class="kv"><b>人物</b><i class="${state.selChars.length ? 'set' : ''}">${cTxt}</i></div>
      <div class="kv"><b>布景</b><i class="${state.selBg ? 'set' : ''}">${bTxt}</i></div>
      <div class="spacer"></div>
      <button class="btn ${ready ? '' : 'is-disabled'}" id="btnEnter" ${ready ? '' : 'disabled'}>进　入</button>
    </div>`;

  $$('.tb-item', workspace).forEach(b => b.addEventListener('click', () => {
    state.tab = b.dataset.t; renderCustom();
  }));

  const showcase = $('#showcase');
  function show(it) {
    if (!it) return;
    showcase.innerHTML =
      `<img class="big${isChar ? '' : ' is-bg'}" src="${it.file}" alt="">
       <div class="cap">${isChar ? '人物' : '布景'}　<em>${it.name}</em></div>`;
  }
  const cur = picked[picked.length - 1];
  if (cur) show(cur);

  $$('.card', workspace).forEach(card => {
    const it = list.find(x => x.id === card.dataset.id);
    card.addEventListener('mouseenter', () => show(it));
    card.addEventListener('focus', () => show(it));
    card.addEventListener('click', () => {
      if (isChar) {
        const i = state.selChars.findIndex(p => p.id === it.id);
        if (i >= 0) state.selChars.splice(i, 1);
        else {
          if (state.selChars.length >= 2) state.selChars.shift();
          state.selChars.push(it);
        }
      } else {
        state.selBg = (state.selBg && state.selBg.id === it.id) ? null : it;
      }
      renderCustom();
      const keep = isChar ? state.selChars.find(p => p.id === it.id) : state.selBg;
      if (keep) show(keep);
    });
  });

  $('#btnEnter').addEventListener('click', () => {
    if (!ready) { toast('请先择定人物与布景'); return; }
    go(3);
  });
}

/* ---------------- 页面四 ---------------- */
function buildStageConfig() {
  if (state.mode === 'classic') {
    const s = STORIES[state.storyIndex];
    return {
      bg: s.bg,
      title: s.title,
      meta: s.subtitle,
      chars: s.chars.map(c => ({ key: c, name: c })),
    };
  }
  if (state.mode === 'custom' && state.selChars.length && state.selBg) {
    const cs = state.selChars.length >= 2 ? state.selChars : [state.selChars[0], state.selChars[0]];
    return {
      bg: state.selBg.file,
      title: '自定义剧目',
      meta: `${cs[0].name} · ${cs[1].name} ｜ ${state.selBg.name}`,
      chars: cs.map(c => ({ key: c.id, name: c.name })),
    };
  }
  return null;
}

/* 结束演绎 */
$('#btnEnd').addEventListener('click', () => {
  go(2);
  toast('已收影入箱');
});

/* ---------------- 启动 ---------------- */
async function boot() {
  try {
    const res = await fetch('data/rig.json');
    state.rig = await res.json();
  } catch (e) {
    console.error(e);
    toast('人物数据载入失败');
    state.rig = { chars: {} };
  }

  state.stage = new Stage({
    root: $('#scr4'),
    glCanvas: $('#glCanvas'),
    fxCanvas: $('#fxCanvas'),
    bg: $('#stageBg'),
    title: $('#stageTitle'),
    meta: $('#stageMeta'),
    video: $('#camVideo'),
    camCanvas: $('#camCanvas'),
    camHud: $('#camHud'),
    camMsg: $('#camMsg'),
    camDot: $('#camDot'),
    cam: $('#cam'),
    camHead: $('#camHead'),
    camFold: $('#camFold'),
  }, state.rig);

  renderClassic(0);
  go(0, true);

  /* 预载首屏与常用素材，避免露白 */
  const preload = [
    'assets/bg/page-bg.jpg',
    ...STORIES.map(s => s.bg),
    ...STORIES.slice(0, 2).flatMap(s => s.chars.map(c => `assets/chars/${c}.png`)),
    ...CUSTOM_CHARS.slice(0, 6).map(c => c.file),
    ...CUSTOM_BGS.slice(0, 6).map(b => b.file),
  ];
  await Promise.race([
    Promise.all(preload.map(src => new Promise(r => {
      const im = new Image(); im.onload = im.onerror = r; im.src = src;
    }))),
    new Promise(r => setTimeout(r, 6000)),
  ]);

  const ld = $('#loading');
  ld.classList.add('off');
  setTimeout(() => ld.remove(), 900);
}

boot();
