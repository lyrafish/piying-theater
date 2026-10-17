/* ===========================================================
   stage.js · 页面四「皮影演绎」舞台
   两个皮影由左右手同时操控，五指各牵一线，分别控制头 / 双臂 / 双腿
   =========================================================== */
import { createGL, Puppet, loadImage } from './puppet.js';
import { HandTracker, TIPS, PALM } from './hand.js';

const CTRL_KEYS = ['head', 'handL', 'handR', 'footL', 'footR'];
const CTRL_LABEL = { head: '头', handL: '左臂', handR: '右臂', footL: '左腿', footR: '右腿' };
const FINGER_FOR = { head: 'thumb', handL: 'index', handR: 'middle', footL: 'ring', footR: 'pinky' };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Stage {
  constructor(els, rigData) {
    this.els = els;
    this.rig = rigData;
    this.glCtx = null;
    this.puppets = [];
    this.running = false;
    this.tracker = null;
    this.mouse = { x: .5, y: .5, active: false, t: 0 };
    this.t0 = performance.now();
    this._bound = false;
  }

  /* ---------------- 进入 ---------------- */
  async enter({ bg, chars, title, meta }) {
    this.els.bg.src = bg;
    this.els.title.textContent = title;
    this.els.meta.textContent = meta || '双影同台 · 十指提线';

    if (!this.glCtx) {
      this.glCtx = createGL(this.els.glCanvas);
      if (!this.glCtx) {
        this.els.camMsg.textContent = '当前浏览器不支持 WebGL，无法渲染皮影。';
        this.els.camMsg.classList.add('on');
        return;
      }
    }

    /* 载入人物 */
    this.puppets.forEach(p => p.dispose());
    this.puppets = [];
    const list = chars.slice(0, 2);
    while (list.length < 2) list.push(list[0]);

    const loaded = await Promise.all(list.map(async (c, i) => {
      const info = this.rig.chars[c.key];
      if (!info) return null;
      const img = await loadImage(info.file);
      return { img, rig: info.rig, name: c.name, side: i === 0 ? 'left' : 'right' };
    }));

    for (let i = 0; i < loaded.length; i++) {
      const L = loaded[i];
      if (!L) continue;
      this.puppets.push(new Puppet(this.glCtx.gl, this.glCtx.prog, this.glCtx.loc, L.img, L.rig, {
        mirror: i === 0,
        side: L.side,
        warm: 0.40,
      }));
    }

    this._resize();
    this.running = true;
    if (!this._bound) { this._bind(); this._bound = true; }

    /* 摄像头 */
    if (!this.tracker) {
      this.tracker = new HandTracker({ video: this.els.video, canvas: this.els.camCanvas });
    }
    this._setCamMsg('正在请求摄像头权限…');
    const ok = await this.tracker.start();
    this.els.camDot.classList.toggle('live', ok);
    this.els.camMsg.classList.toggle('on', !ok);
    if (!ok) this.els.camMsg.textContent = this.tracker.message;

    requestAnimationFrame(this._loop);
  }

  leave() {
    this.running = false;
    if (this.tracker) this.tracker.stop();
    this.els.camDot.classList.remove('live');
  }

  /* ---------------- 事件 ---------------- */
  _bind() {
    window.addEventListener('resize', () => this._resize());
    const page = this.els.root;
    page.addEventListener('pointermove', (e) => {
      const r = page.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) / r.width;
      this.mouse.y = (e.clientY - r.top) / r.height;
      this.mouse.active = true;
      this.mouse.t = performance.now();
    });
    page.addEventListener('pointerleave', () => { this.mouse.active = false; });
    this.els.camHead.addEventListener('click', () => {
      const min = this.els.cam.classList.toggle('min');
      this.els.camFold.textContent = min ? '展开 ▼' : '收起 ▲';
    });
  }

  _resize() {
    const c = this.els.glCanvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const f = this.els.fxCanvas;
    f.width = Math.round(w * dpr); f.height = Math.round(h * dpr);
    this.dpr = dpr;
    this.vw = w; this.vh = h;
    if (this.glCtx) this.glCtx.gl.viewport(0, 0, c.width, c.height);
  }

  _setCamMsg(t) {
    this.els.camMsg.textContent = t;
    this.els.camMsg.classList.add('on');
  }

  /* ---------------- 布局 ---------------- */
  _layout() {
    const W = this.vw, H = this.vh;
    const bottom = H * 0.935;
    const gap = W * 0.5;
    const centers = [W * 0.5 - gap * 0.5, W * 0.5 + gap * 0.5];
    return this.puppets.map((p, i) => {
      let h = H * 0.70;
      let w = h * (p.W / p.H);
      const maxW = W * 0.335;
      if (w > maxW) { const s = maxW / w; w = maxW; h *= s; }
      const cx = this.puppets.length === 1 ? W * 0.5 : centers[i];
      return { x: cx - w / 2, y: bottom - h, w, h, cx };
    });
  }

  /* ---------------- 控制解算 ---------------- */
  /* 鼠标化作虚拟手：掌心跟随指针，五指持续开合，如同一场独角戏 */
  _virtualHand(T) {
    const cx = this.mouse.x, cy = this.mouse.y;
    const base = {
      thumb: [-0.062, -0.034], index: [-0.038, -0.092],
      middle: [0.004, -0.102], ring: [0.046, -0.086], pinky: [0.082, -0.054],
    };
    const ph = { thumb: 0.2, index: 1.3, middle: 2.4, ring: 3.5, pinky: 4.6 };
    const mir = {};
    for (const k in TIPS) {
      const s = Math.sin(T * 1.55 + ph[k]);
      const o = base[k];
      const m = 0.62 + 0.5 * s;
      mir[TIPS[k]] = { x: cx + o[0] * m, y: cy + o[1] * m };
    }
    return { palm: { x: cx, y: cy }, mir, label: 'MOUSE', virtual: true };
  }

  _applyHands() {
    const now = performance.now();
    const T = (now - this.t0) / 1000;
    const hands = this.tracker ? this.tracker.hands : [];

    /* 镜像后的归一化坐标 */
    const norm = hands.map(hd => {
      const lm = hd.landmarks;
      const mir = lm.map(p => ({ x: 1 - p.x, y: p.y }));
      const palm = mir[PALM];
      return { mir, palm, label: hd.label };
    });
    /* 按屏幕左右分配给两个皮影 */
    norm.sort((a, b) => a.palm.x - b.palm.x);

    const assign = [null, null];
    if (norm.length >= 2) { assign[0] = norm[0]; assign[1] = norm[norm.length - 1]; }
    else if (norm.length === 1) {
      const i = norm[0].palm.x < 0.5 ? 0 : 1;
      assign[i] = norm[0];
    }

    /* 无摄像头（或长时间未捕捉）时，鼠标化作一只"虚拟手"继续操影 */
    const mouseFresh = this.mouse.active && (now - this.mouse.t < 5000);
    const virt = mouseFresh ? this._virtualHand(T) : null;
    if (virt) {
      if (!assign[0] && !assign[1]) assign[this.mouse.x < 0.5 ? 0 : 1] = virt;
      else if (!assign[0]) assign[0] = virt;
      else if (!assign[1]) assign[1] = virt;
    }

    this.handInfo = assign;
    this.usingMouse = !!virt;

    this.puppets.forEach((p, i) => {
      const hd = assign[i];
      const gain = 2.35;
      const mirrorSign = p.mirror ? -1 : 1;

      if (hd) {
        const palm = hd.palm;

        /* —— 手型基准校准：以用户自然放松的手为"静止位"，只把手指的相对变化传给影人 —— */
        if (!p.base || p.baseSrc !== (hd.virtual ? 'mouse' : 'hand')) {
          p.base = {}; p.baseSrc = hd.virtual ? 'mouse' : 'hand';
          for (const k of CTRL_KEYS) {
            const t = hd.mir[TIPS[FINGER_FOR[k]]];
            p.base[k] = [(t.x - palm.x), (t.y - palm.y)];
          }
          p.basePalm = [palm.x, palm.y];
          p.calib = 0;
        }
        p.calib = (p.calib || 0) + 1;

        for (const k of CTRL_KEYS) {
          const tip = hd.mir[TIPS[FINGER_FOR[k]]];
          const dx = (tip.x - palm.x) * mirrorSign;
          const dy = (tip.y - palm.y);
          const bx = p.base[k][0] * mirrorSign, by = p.base[k][1];
          let ex = dx - bx, ey = dy - by;

          /* 缓慢回中：手指回到放松位时，基准随之漂移（避免长期偏置） */
          const mag = Math.hypot(ex, ey);
          if (mag < 0.032 && p.calib > 30) {
            p.base[k][0] += ((tip.x - palm.x) - p.base[k][0]) * 0.012;
            p.base[k][1] += ((tip.y - palm.y) - p.base[k][1]) * 0.012;
          }

          /* 死区，抑制抖动 */
          const dead = 0.006;
          if (mag < dead) { ex = 0; ey = 0; }
          else { const s = (mag - dead) / mag; ex *= s; ey *= s; }

          let tx = p.ctrlRest[k][0] + ex * gain * p.H;
          let ty = p.ctrlRest[k][1] + ey * gain * p.H;
          const r = 0.34 * p.H;
          const ddx = tx - p.ctrlRest[k][0], ddy = ty - p.ctrlRest[k][1];
          const d = Math.hypot(ddx, ddy);
          if (d > r) { tx = p.ctrlRest[k][0] + ddx / d * r; ty = p.ctrlRest[k][1] + ddy / d * r; }
          p.ctrl[k][0] = tx; p.ctrl[k][1] = ty;
        }

        /* 整体随手掌平移，产生"被提起"的挂坠感 */
        if (!p.basePalm) p.basePalm = [palm.x, palm.y];
        p.basePalm[0] += (palm.x - p.basePalm[0]) * 0.004;
        p.basePalm[1] += (palm.y - p.basePalm[1]) * 0.004;
        p.bodyOff[0] = clamp((palm.x - p.basePalm[0]) * 0.85, -0.22, 0.22) * p.H * mirrorSign;
        p.bodyOff[1] = clamp((palm.y - p.basePalm[1]) * 0.75, -0.20, 0.20) * p.H;
        p.bodySway = clamp(-(palm.x - p.basePalm[0]) * 1.1, -0.22, 0.22) * mirrorSign;
        p.live = true;
      } else {
        p.base = null; p.basePalm = null;
        /* 未捕捉到：呼吸式待机 */
        p.live = false;
        const ph = i * 2.1;
        const sway = Math.sin(T * 0.85 + ph) * 0.035 + (this.mouse.active ? (this.mouse.x - 0.5) * 0.10 : 0);
        p.bodySway = sway;
        p.bodyOff[0] = Math.sin(T * 0.62 + ph) * 0.012 * p.H;
        p.bodyOff[1] = Math.sin(T * 0.93 + ph) * 0.010 * p.H;

        const set = (k, ax, ay, ph2) => {
          p.ctrl[k][0] = p.ctrlRest[k][0] + Math.sin(T * 0.9 + ph2) * ax * p.H;
          p.ctrl[k][1] = p.ctrlRest[k][1] + Math.sin(T * 1.25 + ph2 * 1.7) * ay * p.H;
        };
        set('head', 0.035, 0.022, ph + 0.4);
        set('handL', 0.085, 0.055, ph + 1.1);
        set('handR', 0.085, 0.055, ph + 2.3);
        set('footL', 0.055, 0.040, ph + 3.0);
        set('footR', 0.055, 0.040, ph + 4.2);
      }
    });
  }

  /* ---------------- 主循环 ---------------- */
  _loop = () => {
    if (!this.running) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - (this._last || now)) / 1000);
    this._last = now;

    if (!this.vw || !this.vh) this._resize();
    this._applyHands();

    const gl = this.glCtx.gl;
    gl.clear(gl.COLOR_BUFFER_BIT);
    const rects = this._layout();
    this.puppets.forEach((p, i) => { p.solve(dt); p.draw(rects[i], this.vw, this.vh); });

    this._drawFx(rects);
    this._drawHud();
    requestAnimationFrame(this._loop);
  };

  _toScreen(p, rect, px, py) {
    const sx = p.mirror ? (rect.x + rect.w - px * rect.w / p.W) : (rect.x + px * rect.w / p.W);
    const sy = rect.y + py * rect.h / p.H;
    return [sx, sy];
  }

  /* 提线 + 光晕 */
  _drawFx(rects) {
    const c = this.els.fxCanvas, ctx = c.getContext('2d');
    const dpr = this.dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.vw, this.vh);

    const W = this.vw, H = this.vh;
    const barY = H * 0.028;

    /* 顶部提线横杆 */
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(226,194,116,0)');
    g.addColorStop(.18, 'rgba(226,194,116,.55)');
    g.addColorStop(.5, 'rgba(240,214,150,.9)');
    g.addColorStop(.82, 'rgba(226,194,116,.55)');
    g.addColorStop(1, 'rgba(226,194,116,0)');
    ctx.fillStyle = g;
    ctx.fillRect(W * 0.08, barY, W * 0.84, 1.5);
    ctx.fillStyle = 'rgba(226,194,116,.14)';
    ctx.fillRect(W * 0.08, barY + 1.5, W * 0.84, 6);

    this.puppets.forEach((p, i) => {
      const rect = rects[i];
      /* 落地投影，让影人"立"在台上 */
      const gy = rect.y + rect.h * 0.995;
      const rg = ctx.createRadialGradient(rect.cx, gy, 0, rect.cx, gy, rect.w * 0.62);
      rg.addColorStop(0, 'rgba(26,15,6,.40)');
      rg.addColorStop(.55, 'rgba(26,15,6,.16)');
      rg.addColorStop(1, 'rgba(26,15,6,0)');
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(rect.cx, gy, rect.w * 0.62, rect.h * 0.026, 0, 0, 6.2832);
      ctx.clip();
      ctx.fillStyle = rg;
      ctx.fillRect(rect.cx - rect.w * 0.7, gy - rect.h * 0.05, rect.w * 1.4, rect.h * 0.1);
      ctx.restore();

      for (const k of CTRL_KEYS) {
        const j = p.jointPos(k);
        const [x, y] = this._toScreen(p, rect, j[0], j[1]);
        const anchorX = rect.cx + (x - rect.cx) * 0.35;
        /* 提线：从横杆垂落，带轻微垂坠 */
        ctx.beginPath();
        ctx.moveTo(anchorX, barY);
        ctx.quadraticCurveTo(anchorX + (x - anchorX) * 0.35, barY + (y - barY) * 0.55, x, y);
        ctx.strokeStyle = 'rgba(190,46,40,.72)';
        ctx.lineWidth = Math.max(1, W / 1400);
        ctx.stroke();
        /* 线头朱点 */
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.6, W / 620), 0, 6.2832);
        ctx.fillStyle = '#d9604f';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,225,190,.85)';
        ctx.lineWidth = Math.max(.6, W / 1600);
        ctx.stroke();
      }
      /* 影人整体柔光 */
      const rad = ctx.createRadialGradient(rect.cx, rect.y + rect.h * 0.5, 0, rect.cx, rect.y + rect.h * 0.5, rect.h * 0.62);
      rad.addColorStop(0, 'rgba(255,214,140,.10)');
      rad.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = rad;
      ctx.fillRect(rect.cx - rect.h * 0.62, rect.y - rect.h * 0.1, rect.h * 1.24, rect.h * 1.3);
    });
  }

  _drawHud() {
    const t = this.tracker;
    const hs = this.handInfo || [null, null];
    const nm = (h) => {
      if (!h) return '——  待入画';
      if (h.virtual) return '鼠标 操影中';
      return (h.palm.x < 0.5 ? '左影' : '右影') + '  已捕捉';
    };
    const live = t && t.status === 'live';
    const st = live ? (this.usingMouse ? '演绎中 · 单影鼠标' : '演绎中') : (this.usingMouse ? '鼠标操影' : '待机');
    const lines = [
      'STATUS : ' + st,
      'HANDS  : ' + (t && t.hands ? t.hands.length : 0) + ' / 2',
      'A · 左 : ' + nm(hs[0]),
      'B · 右 : ' + nm(hs[1]),
      'FPS    : ' + (t ? t.fps : 0),
    ];
    this.els.camHud.textContent = lines.join('\n');
  }
}
