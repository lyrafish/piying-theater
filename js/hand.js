/* ===========================================================
   hand.js · 摄像头实时手部捕捉（MediaPipe HandLandmarker，本地离线）
   =========================================================== */
import { FilesetResolver, HandLandmarker } from '../vendor/mediapipe/vision_bundle.mjs';

export const TIPS = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };
export const PALM = 9;

const CONN = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export class HandTracker {
  constructor({ video, canvas }) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.landmarker = null;
    this.stream = null;
    this.running = false;
    this.hands = [];
    this.fps = 0;
    this.status = 'idle';      // idle | loading | live | error | denied
    this.message = '';
    this._last = 0;
    this._frames = 0;
    this._t0 = performance.now();
    this._ts = 0;
  }

  async start() {
    if (this.running) return true;
    this.status = 'loading';
    this.message = '正在载入捕捉模型…';

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw Object.assign(new Error('浏览器不支持摄像头采集'), { kind: 'unsupported' });
      }
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      this.video.srcObject = this.stream;
      await this.video.play().catch(() => {});
      await new Promise(r => {
        if (this.video.videoWidth) return r();
        this.video.onloadedmetadata = () => r();
        setTimeout(r, 1500);
      });
    } catch (e) {
      this.status = e.kind === 'unsupported' ? 'error' : 'denied';
      this.message = e.name === 'NotAllowedError'
        ? '摄像头权限被拒绝 —— 已切换为鼠标操影'
        : '未能启用摄像头 —— 已切换为鼠标操影';
      return false;
    }

    try {
      const fileset = await FilesetResolver.forVisionTasks('vendor/mediapipe/wasm');
      this.landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: 'vendor/mediapipe/hand_landmarker.task', delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    } catch (e) {
      try {
        const fileset = await FilesetResolver.forVisionTasks('vendor/mediapipe/wasm');
        this.landmarker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: 'vendor/mediapipe/hand_landmarker.task' },
          runningMode: 'VIDEO', numHands: 2,
        });
      } catch (e2) {
        this.status = 'error';
        this.message = '捕捉模型载入失败 —— 已切换为鼠标操影';
        return false;
      }
    }

    this.status = 'live';
    this.message = '';
    this.running = true;
    this._loop();
    return true;
  }

  _loop = () => {
    if (!this.running) return;
    const v = this.video;
    if (v.readyState >= 2 && this.landmarker) {
      const now = performance.now();
      if (now - this._ts > 0) {
        this._ts = now;
        try {
          const res = this.landmarker.detectForVideo(v, now);
          this.hands = (res.landmarks || []).map((lm, i) => ({
            landmarks: lm,
            label: (res.handednesses && res.handednesses[i] && res.handednesses[i][0].categoryName) || '',
            score: (res.handednesses && res.handednesses[i] && res.handednesses[i][0].score) || 0,
          }));
        } catch (e) { /* 忽略单帧异常 */ }
      }
      this._frames++;
      if (now - this._t0 > 500) {
        this.fps = Math.round(this._frames * 1000 / (now - this._t0));
        this._frames = 0; this._t0 = now;
      }
    }
    this._drawOverlay();
    requestAnimationFrame(this._loop);
  };

  _drawOverlay() {
    const c = this.canvas, ctx = this.ctx;
    if (!c || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    /* 轻微提亮，让线框更清楚 */
    ctx.fillStyle = 'rgba(12,8,4,.22)';
    ctx.fillRect(0, 0, w, h);

    const map = (p) => [ (1 - p.x) * w, p.y * h ];   // 视频镜像

    for (const hd of this.hands) {
      const P = hd.landmarks.map(map);
      /* 骨骼线框 */
      ctx.lineWidth = Math.max(1, w / 260);
      ctx.strokeStyle = 'rgba(226,194,116,.85)';
      ctx.beginPath();
      for (const [a, b] of CONN) {
        ctx.moveTo(P[a][0], P[a][1]);
        ctx.lineTo(P[b][0], P[b][1]);
      }
      ctx.stroke();
      /* 关节点 */
      ctx.fillStyle = 'rgba(243,232,208,.9)';
      for (let i = 0; i < P.length; i++) {
        const r = i % 4 === 0 ? Math.max(1.6, w / 150) : Math.max(1, w / 230);
        ctx.beginPath(); ctx.arc(P[i][0], P[i][1], r, 0, 6.2832); ctx.fill();
      }
      /* 五个指尖：朱砂点 + 引线 */
      const palm = P[PALM];
      for (const k in TIPS) {
        const p = P[TIPS[k]];
        ctx.strokeStyle = 'rgba(214,96,79,.75)';
        ctx.lineWidth = Math.max(1, w / 300);
        ctx.beginPath(); ctx.moveTo(palm[0], palm[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
        ctx.fillStyle = '#e2564a';
        ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(2.2, w / 90), 0, 6.2832); ctx.fill();
        ctx.strokeStyle = 'rgba(255,235,200,.9)';
        ctx.lineWidth = Math.max(.6, w / 500);
        ctx.stroke();
      }
      /* 掌心 */
      ctx.fillStyle = 'rgba(226,194,116,.95)';
      ctx.beginPath(); ctx.arc(palm[0], palm[1], Math.max(2, w / 110), 0, 6.2832); ctx.fill();
    }
  }

  stop() {
    this.running = false;
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    this.hands = [];
  }
}
