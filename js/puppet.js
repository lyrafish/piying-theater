/* ===========================================================
   puppet.js · WebGL 线性混合蒙皮（LBS）皮影渲染器
   每人 10 根骨骼：躯干 / 头 / 左右上臂 / 左右小臂 / 左右大腿 / 左右小腿
   由 5 个控制点（头、双手、双脚）经双骨 IK 反解驱动
   =========================================================== */

const VS = `
attribute vec2 a_pos;      // 静止姿态下的图像像素坐标（y 向下）
attribute vec2 a_uv;
attribute vec4 a_wA;       // 骨骼 0..3 权重
attribute vec4 a_wB;       // 骨骼 4..7 权重
attribute vec4 a_wC;       // 骨骼 8..9 权重

uniform mat3 u_bones[10];
uniform vec2 u_scale;
uniform vec2 u_offset;

varying vec2 v_uv;

void main() {
  vec3 p = vec3(a_pos, 1.0);
  vec3 acc =
      a_wA.x * (u_bones[0] * p) + a_wA.y * (u_bones[1] * p) +
      a_wA.z * (u_bones[2] * p) + a_wA.w * (u_bones[3] * p) +
      a_wB.x * (u_bones[4] * p) + a_wB.y * (u_bones[5] * p) +
      a_wB.z * (u_bones[6] * p) + a_wB.w * (u_bones[7] * p) +
      a_wC.x * (u_bones[8] * p) + a_wC.y * (u_bones[9] * p);

  v_uv = a_uv;
  gl_Position = vec4(acc.x * u_scale.x + u_offset.x,
                     acc.y * u_scale.y + u_offset.y, 0.0, 1.0);
}`;

const FS = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_alpha;
uniform float u_warm;

void main() {
  vec4 c = texture2D(u_tex, v_uv);
  if (c.a < 0.02) discard;
  vec3 warm = vec3(1.07, 0.98, 0.85);
  vec3 rgb = mix(c.rgb, c.rgb * warm, u_warm);
  rgb += u_warm * 0.05 * (1.0 - c.a) * vec3(1.0, .9, .68);
  gl_FragColor = vec4(rgb, c.a * u_alpha);
}`;

/* ---------- 3x3 仿射矩阵（行主序） ---------- */
function matMul(a, b) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
}
const matTrans = (x, y) => [1, 0, x, 0, 1, y, 0, 0, 1];
const matRot = (t) => { const c = Math.cos(t), s = Math.sin(t); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
const boneMatrix = (px, py, t, tx = 0, ty = 0) =>
  matMul(matMul(matTrans(px, py), matMul(matRot(t), matTrans(-px, -py))), matTrans(tx, ty));
const applyM = (m, x, y) => [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/* ---------- 骨骼定义（索引固定） ---------- */
const BONES = [
  { k: 'body',  p: 'root', t: 'neck',  parent: -1 },
  { k: 'head',  p: 'neck', t: 'head',  parent: 0 },
  { k: 'armLu', p: 'shL',  t: 'elL',   parent: 0 },
  { k: 'armLl', p: 'elL',  t: 'handL', parent: 2 },
  { k: 'armRu', p: 'shR',  t: 'elR',   parent: 0 },
  { k: 'armRl', p: 'elR',  t: 'handR', parent: 4 },
  { k: 'legLu', p: 'hipL', t: 'knL',   parent: 0 },
  { k: 'legLl', p: 'knL',  t: 'footL', parent: 6 },
  { k: 'legRu', p: 'hipR', t: 'knR',   parent: 0 },
  { k: 'legRl', p: 'knR',  t: 'footR', parent: 8 },
];
const SIGMA = [0.60, 0.150, 0.135, 0.125, 0.135, 0.125, 0.165, 0.150, 0.165, 0.150];

function distSeg(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const L2 = vx * vx + vy * vy;
  let t = L2 > 1e-6 ? ((px - ax) * vx + (py - ay) * vy) / L2 : 0;
  t = clamp(t, 0, 1);
  const dx = px - (ax + vx * t), dy = py - (ay + vy * t);
  return Math.sqrt(dx * dx + dy * dy);
}

/* ===========================================================
   Puppet
   =========================================================== */
export class Puppet {
  constructor(gl, prog, loc, img, rig, opts = {}) {
    this.gl = gl; this.prog = prog; this.loc = loc;
    this.W = img.width; this.H = img.height;
    this.mirror = !!opts.mirror;
    this.alpha = opts.alpha ?? 1;
    this.warm = opts.warm ?? 0.42;
    this.side = opts.side || 'left';

    this.J = {};
    for (const k in rig) this.J[k] = [rig[k][0] * this.W, rig[k][1] * this.H];

    this.rest = []; this.len = [];
    for (const b of BONES) {
      const p = this.J[b.p], t = this.J[b.t];
      this.rest.push(Math.atan2(t[1] - p[1], t[0] - p[0]));
      this.len.push(Math.max(1, Math.hypot(t[0] - p[0], t[1] - p[1])));
    }
    this.bend = {
      armL: this._bendSign('shL', 'elL', 'handL'),
      armR: this._bendSign('shR', 'elR', 'handR'),
      legL: this._bendSign('hipL', 'knL', 'footL'),
      legR: this._bendSign('hipR', 'knR', 'footR'),
    };

    /* 控制点（图像像素坐标） */
    this.ctrl = {
      head: this.J.head.slice(), handL: this.J.handL.slice(), handR: this.J.handR.slice(),
      footL: this.J.footL.slice(), footR: this.J.footR.slice(),
    };
    this.ctrlRest = JSON.parse(JSON.stringify(this.ctrl));
    this.smooth = JSON.parse(JSON.stringify(this.ctrl));
    this.bodyOff = [0, 0];
    this.bodySway = 0;

    /* 纹理 */
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    this._buildMesh();
    this.boneBuf = new Float32Array(90);
    this.pose = null;
  }

  _bendSign(a, b, c) {
    const A = this.J[a], B = this.J[b], C = this.J[c];
    const base = Math.atan2(C[1] - A[1], C[0] - A[0]);
    const ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
    return Math.sign(wrapPi(ang - base)) || 1;
  }

  _buildMesh() {
    const gl = this.gl;
    const NX = Math.min(72, Math.max(24, Math.round(this.W / 24)));
    const NY = Math.min(96, Math.max(32, Math.round(this.H / 24)));
    const nvx = NX + 1, nvy = NY + 1, n = nvx * nvy;

    const pos = new Float32Array(n * 2), uv = new Float32Array(n * 2);
    const wA = new Float32Array(n * 4), wB = new Float32Array(n * 4), wC = new Float32Array(n * 4);
    const seg = BONES.map(b => {
      const p = this.J[b.p], t = this.J[b.t];
      return [p[0], p[1], t[0], t[1]];
    });
    const sig = SIGMA.map(s => s * this.H);

    for (let j = 0; j < nvy; j++) {
      for (let i = 0; i < nvx; i++) {
        const id = j * nvx + i;
        const x = (i / NX) * this.W, y = (j / NY) * this.H;
        pos[id * 2] = x; pos[id * 2 + 1] = y;
        uv[id * 2] = i / NX; uv[id * 2 + 1] = j / NY;

        const w = new Array(10); let sum = 0;
        for (let b = 0; b < 10; b++) {
          const s = seg[b];
          const r = distSeg(x, y, s[0], s[1], s[2], s[3]) / sig[b];
          const v = Math.exp(-r * r);
          w[b] = v; sum += v;
        }
        if (sum < 1e-9) { w[0] = 1; sum = 1; }
        for (let b = 0; b < 10; b++) w[b] /= sum;

        wA[id * 4] = w[0]; wA[id * 4 + 1] = w[1]; wA[id * 4 + 2] = w[2]; wA[id * 4 + 3] = w[3];
        wB[id * 4] = w[4]; wB[id * 4 + 1] = w[5]; wB[id * 4 + 2] = w[6]; wB[id * 4 + 3] = w[7];
        wC[id * 4] = w[8]; wC[id * 4 + 1] = w[9];
      }
    }

    const idx = new Uint16Array(NX * NY * 6);
    let k = 0;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const a = j * nvx + i, b = a + 1, c = a + nvx, d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b;
      idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }

    const mk = (data, loc, size) => {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return { buf, loc, size };
    };
    this.attribs = [
      mk(pos, this.loc.a_pos, 2), mk(uv, this.loc.a_uv, 2),
      mk(wA, this.loc.a_wA, 4), mk(wB, this.loc.a_wB, 4), mk(wC, this.loc.a_wC, 4),
    ];
    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    this.count = idx.length;
  }

  /* 双骨 IK：返回 [上骨局部角, 下骨局部角, 肘/膝 x, y]（目标位于父级坐标系内） */
  _ik(pivotK, midK, endK, T, bend, iU, iL) {
    const S = this.J[pivotK];
    const L1 = this.len[iU], L2 = this.len[iL];
    let dx = T[0] - S[0], dy = T[1] - S[1];
    let d = Math.hypot(dx, dy);
    const dmax = (L1 + L2) * 0.995, dmin = Math.abs(L1 - L2) * 1.03 + 1e-3;
    if (d > dmax) { const s = dmax / (d || 1); dx *= s; dy *= s; d = dmax; }
    else if (d < dmin) { const s = dmin / (d || 1); dx *= s; dy *= s; d = dmin; }
    const base = Math.atan2(dy, dx);
    const cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
    const A = Math.acos(cosA);
    const a1 = base + bend * A;
    const ex = S[0] + L1 * Math.cos(a1), ey = S[1] + L1 * Math.sin(a1);
    const a2 = Math.atan2(T[1] - ey, T[0] - ex);
    const thU = wrapPi(a1 - this.rest[iU]);
    const thL = wrapPi(a2 - this.rest[iL]) - thU;
    return [thU, thL, ex, ey];
  }

  solve(dt) {
    const J = this.J, r = this.rest;

    const k = 1 - Math.pow(0.0009, Math.min(dt, 0.05));
    for (const key in this.ctrl) {
      const c = this.ctrl[key], s = this.smooth[key];
      s[0] += (c[0] - s[0]) * k;
      s[1] += (c[1] - s[1]) * k;
    }
    const S = this.smooth, root = J.root, th = this.bodySway, off = this.bodyOff;
    const cb = Math.cos(-th), sb = Math.sin(-th);
    const toLocal = (p) => {
      const dx = p[0] - root[0] - off[0], dy = p[1] - root[1] - off[1];
      return [root[0] + dx * cb - dy * sb, root[1] + dx * sb + dy * cb];
    };

    const M = new Array(10);
    M[0] = boneMatrix(root[0], root[1], th, off[0], off[1]);

    /* 头 */
    {
      const T = toLocal(S.head);
      let a = wrapPi(Math.atan2(T[1] - J.neck[1], T[0] - J.neck[0]) - r[1]);
      a = clamp(a, -0.6, 0.6);
      const hx = clamp(S.head[0] - this.ctrlRest.head[0], -0.062 * this.H, 0.062 * this.H);
      const hy = clamp(S.head[1] - this.ctrlRest.head[1], -0.055 * this.H, 0.055 * this.H);
      M[1] = matMul(M[0], boneMatrix(J.neck[0], J.neck[1], a, hx, hy));
    }

    /* 四肢 */
    const limb = (pivotK, midK, endK, ctrlK, bend, iU, iL) => {
      const T = toLocal(S[ctrlK]);
      const ik = this._ik(pivotK, midK, endK, T, bend, iU, iL);
      M[iU] = matMul(M[0], boneMatrix(J[pivotK][0], J[pivotK][1], ik[0]));
      M[iL] = matMul(M[iU], boneMatrix(J[midK][0], J[midK][1], ik[1]));
    };
    limb('shL', 'elL', 'handL', 'handL', this.bend.armL, 2, 3);
    limb('shR', 'elR', 'handR', 'handR', this.bend.armR, 4, 5);
    limb('hipL', 'knL', 'footL', 'footL', this.bend.legL, 6, 7);
    limb('hipR', 'knR', 'footR', 'footR', this.bend.legR, 8, 9);

    this.pose = M;
    return M;
  }

  /* 关节当前图像空间位置 */
  jointPos(key) {
    if (!this.pose) return this.J[key];
    const tipBone = { head: 1, handL: 3, handR: 5, footL: 7, footR: 9, elL: 3, elR: 5, knL: 7, knR: 9 };
    if (key in tipBone) {
      const m = this.pose[tipBone[key]];
      return applyM(m, this.J[key][0], this.J[key][1]);
    }
    return applyM(this.pose[0], this.J[key][0], this.J[key][1]);
  }

  draw(rect, canvasW, canvasH) {
    const gl = this.gl;
    if (!this.pose) return;
    const sx = (rect.w / this.W) * 2 / canvasW * (this.mirror ? -1 : 1);
    const sy = -(rect.h / this.H) * 2 / canvasH;
    const ox = (this.mirror ? rect.x + rect.w : rect.x) * 2 / canvasW - 1;
    const oy = 1 - rect.y * 2 / canvasH;

    gl.useProgram(this.prog);
    for (const a of this.attribs) {
      gl.bindBuffer(gl.ARRAY_BUFFER, a.buf);
      gl.enableVertexAttribArray(a.loc);
      gl.vertexAttribPointer(a.loc, a.size, gl.FLOAT, false, 0, 0);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);

    const bb = this.boneBuf;
    for (let i = 0; i < 10; i++) {
      const m = this.pose[i];
      bb[i * 9 + 0] = m[0]; bb[i * 9 + 1] = m[3]; bb[i * 9 + 2] = m[6];
      bb[i * 9 + 3] = m[1]; bb[i * 9 + 4] = m[4]; bb[i * 9 + 5] = m[7];
      bb[i * 9 + 6] = m[2]; bb[i * 9 + 7] = m[5]; bb[i * 9 + 8] = m[8];
    }
    gl.uniformMatrix3fv(this.loc.u_bones, false, bb);
    gl.uniform2f(this.loc.u_scale, sx, sy);
    gl.uniform2f(this.loc.u_offset, ox, oy);
    gl.uniform1f(this.loc.u_alpha, this.alpha);
    gl.uniform1f(this.loc.u_warm, this.warm);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.loc.u_tex, 0);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteTexture(this.tex);
    this.attribs.forEach(a => gl.deleteBuffer(a.buf));
    gl.deleteBuffer(this.ibo);
  }
}

/* ===========================================================
   工具
   =========================================================== */
export function createGL(canvas) {
  const opt = { alpha: true, premultipliedAlpha: false, antialias: true, preserveDrawingBuffer: false };
  const gl = canvas.getContext('webgl', opt) || canvas.getContext('experimental-webgl', opt);
  if (!gl) return null;

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));

  const loc = {};
  ['a_pos', 'a_uv', 'a_wA', 'a_wB', 'a_wC', 'u_bones', 'u_scale', 'u_offset', 'u_alpha', 'u_warm', 'u_tex']
    .forEach(n => { loc[n] = n[0] === 'a' ? gl.getAttribLocation(prog, n) : gl.getUniformLocation(prog, n); });

  gl.clearColor(0, 0, 0, 0);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  return { gl, prog, loc };
}

export function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('图片载入失败: ' + src));
    im.src = src;
  });
}
