# 07 · 舞台编排 `js/stage.js`

> 383 行。第四幕的"总导演"：**把手的动作翻译成皮影的动作**。
> 这是全项目调参最集中的地方——想让影人"更跟手 / 更稳 / 幅度更大"，基本都在这里改。

---

## 一、职责边界

| 负责 | 不负责 |
| --- | --- |
| 布局：两个影人站哪、多大 | 骨骼怎么变形（`puppet.js`） |
| 手势 → 5 个控制点目标值 | 关键点怎么来的（`hand.js`） |
| 手型基准校准、死区、增益、限幅 | 皮影怎么画到屏幕上 |
| 提线 / 投影 / 柔光（Canvas2D） | 页面翻幕（`main.js`） |
| 摄像头小窗的状态文字 | — |

---

## 二、行号地图

| 行 | 内容 |
| --- | --- |
| 5~6 | `import` 渲染器与捕捉器 |
| 8~11 | `CTRL_KEYS` / `CTRL_LABEL` / `FINGER_FOR` / `clamp` |
| 13~24 | 构造函数 |
| 27~79 | `enter(cfg)` 进入第四幕 |
| 81~85 | `leave()` |
| 88~103 | `_bind()` 事件绑定 |
| 105~116 | `_resize()` 画布尺寸 |
| 124~137 | `_layout()` **布局算法** |
| 141~156 | `_virtualHand()` 鼠标虚拟手 |
| 158~269 | `_applyHands()` **核心：手势 → 控制点** |
| 272~289 | `_loop()` 主循环 |
| 291~295 | `_toScreen()` 图像坐标 → 屏幕坐标 |
| 298~362 | `_drawFx()` 提线 / 投影 / 柔光 |
| 364~382 | `_drawHud()` 状态文字 |

---

## 三、五指 ↔ 关节的映射

```js
const CTRL_KEYS  = ['head', 'handL', 'handR', 'footL', 'footR'];
const CTRL_LABEL = { head:'头', handL:'左臂', handR:'右臂', footL:'左腿', footR:'右腿' };
const FINGER_FOR = { head:'thumb', handL:'index', handR:'middle', footL:'ring', footR:'pinky' };
```

| 手指 | 关键点 | 控制 | 影人部位 |
| --- | --- | --- | --- |
| 拇指 | 4 | `head` | 头（可平移 + 轻微转动） |
| 食指 | 8 | `handL` | 左臂（肩→肘→手） |
| 中指 | 12 | `handR` | 右臂 |
| 无名指 | 16 | `footL` | 左腿（髋→膝→脚） |
| 小指 | 20 | `footR` | 右腿 |

**改映射只需改 `FINGER_FOR` 一个对象**，其余逻辑全部由 `CTRL_KEYS` 驱动。
例如想"食指控右臂、中指控左臂"，把两个值对调即可。

---

## 四、`enter(cfg)` 进入第四幕

```js
async enter({ bg, chars, title, meta }) {
  /* 1. 换布景与题签 */
  this.els.bg.src = bg;
  this.els.title.textContent = title;
  this.els.meta.textContent = meta || '双影同台 · 十指提线';

  /* 2. 首次才建 WebGL（复用上下文，避免反复丢失） */
  if (!this.glCtx) {
    this.glCtx = createGL(this.els.glCanvas);
    if (!this.glCtx) { /* 提示"不支持 WebGL"，直接 return */ }
  }

  /* 3. 释放上一场的皮影，重建 */
  this.puppets.forEach(p => p.dispose());
  const list = chars.slice(0, 2);
  while (list.length < 2) list.push(list[0]);       // 只有 1 个就复制成 2 个

  /* 4. 载图 + 建 Puppet */
  const loaded = await Promise.all(list.map(async (c, i) => {
    const info = this.rig.chars[c.key];
    if (!info) return null;                          // ← key 对不上就静默跳过
    const img = await loadImage(info.file);
    return { img, rig: info.rig, name: c.name, side: i === 0 ? 'left' : 'right' };
  }));

  this.puppets.push(new Puppet(gl, prog, loc, img, rig, {
    mirror: i === 1,      // ← 第二个影人镜像，两人相对而立
    side: L.side,
    warm: 0.40,           // ← 暖色强度
  }));

  /* 5. 起循环 + 开摄像头 */
  this._resize();
  this.running = true;
  if (!this._bound) { this._bind(); this._bound = true; }   // 事件只绑一次
  this.tracker = new HandTracker({ video, canvas });
  const ok = await this.tracker.start();
  this.els.camDot.classList.toggle('live', ok);
  requestAnimationFrame(this._loop);
}
```

要点：

1. **`glCtx` 只建一次**。反复 `createGL` 会泄漏上下文（浏览器最多 ~16 个）。
2. **`_bound` 标记保证事件只绑一次**，否则每进一次第四幕就多一套监听器，鼠标操影会越来越飘。
3. `chars.slice(0, 2)` —— 即使第三幕传来 3 个人物，第四幕也只画 2 个。
4. `tracker` 也复用：第二次进来时 `start()` 里 `if (this.running) return true` 会短路，
   但 `leave()` 已经 `stop()` 过了，所以会重新 `getUserMedia`（模型不重建，很快）。

---

## 五、布局 `_layout()`

```js
const bottom = H * 0.935;                    // 脚底基线
const gap    = W * 0.5;                      // 两人中心距
const centers = [W*0.5 - gap*0.5, W*0.5 + gap*0.5];   // = 0.25W 与 0.75W

let h = H * 0.70;                            // 高度 = 屏高 70%
let w = h * (p.W / p.H);                     // 按原图比例算宽
const maxW = W * 0.335;                      // 宽度上限
if (w > maxW) { const s = maxW / w; w = maxW; h *= s; }   // 太宽就等比缩
```

| 想调什么 | 改哪个常量 | 效果 |
| --- | --- | --- |
| 影人整体大小 | `H * 0.70` | 0.8 = 更大，更贴近观众 |
| 两人间距 | `W * 0.5` | 0.6 = 更分开 |
| 站位高低 | `H * 0.935` | 0.98 = 更靠下（脚踩到画面底） |
| 单人最大宽度 | `W * 0.335` | 防止横构图人物把画面撑爆 |

`rect` 返回 `{ x, y, w, h, cx }`，其中 `y = bottom - h`（从脚底往上算）。

---

## 六、`_applyHands()` —— 核心中的核心

这一函数 111 行，是"手感"的全部来源。分五步：

### 步骤 1：镜像 + 排序 + 分配

```js
const norm = hands.map(hd => {
  const mir = hd.landmarks.map(p => ({ x: 1 - p.x, y: p.y }));   // 镜像，与视频画面一致
  return { mir, palm: mir[PALM], label: hd.label };
});
norm.sort((a, b) => a.palm.x - b.palm.x);        // 按屏幕横坐标从左到右排

const assign = [null, null];
if (norm.length >= 2) { assign[0] = norm[0]; assign[1] = norm[norm.length - 1]; }
else if (norm.length === 1) {
  const i = norm[0].palm.x < 0.5 ? 0 : 1;        // 单手：看它在左半还是右半
  assign[i] = norm[0];
}
```

> **不按 `label`（Left/Right）分配，而按屏幕位置分配。**
> 因为用户可能交叉双手，按位置分永远符合直觉；按 Left/Right 分会出现"左手控制右影"的错乱。

### 步骤 2：鼠标虚拟手

```js
const mouseFresh = this.mouse.active && (now - this.mouse.t < 5000);
const virt = mouseFresh ? this._virtualHand(T) : null;
if (virt) { /* 填空位：先填 0，再填 1 */ }
```

- 5 秒内有鼠标移动才算"活跃"，避免鼠标停在角落时影人还在跟着动。
- `_virtualHand` 生成一只**假手**：五指按不同相位正弦开合（`0.62 + 0.5*sin`），
  所以鼠标操影时影人是"活着在动"的，而不是僵住。
- 真手 + 鼠标可以同时存在（一个影人跟手，一个跟鼠标）。

### 步骤 3：手型基准校准（**最关键的"不漂移"设计**）

```js
if (!p.base || p.baseSrc !== (hd.virtual ? 'mouse' : 'hand')) {
  p.base = {}; p.baseSrc = hd.virtual ? 'mouse' : 'hand';
  for (const k of CTRL_KEYS) {
    const t = hd.mir[TIPS[FINGER_FOR[k]]];
    p.base[k] = [(t.x - palm.x), (t.y - palm.y)];    // 记录"自然手型"下指尖相对掌心的向量
  }
  p.basePalm = [palm.x, palm.y];
  p.calib = 0;
}
```

**为什么需要**：不同人的手型差别很大——有人天生手指张得开，有人习惯半握。
如果直接把手部坐标当绝对控制量，一进来影人就会被"拽"到奇怪姿势。

**做法**：第一次捕捉到手的那个瞬间，把当前手型记为"静止位"（`base`），
之后只传递 `当前 - base` 的**差值**。于是"放松的手 = 影人的静止姿态"。

`baseSrc` 区分"手"和"鼠标"，切换时会重新校准，避免两套坐标系混用。

### 步骤 4：逐指计算控制点

```js
const gain = 2.35;                                  // ① 增益
const mirrorSign = p.mirror ? -1 : 1;               // ② 镜像影人方向取反

const tip = hd.mir[TIPS[FINGER_FOR[k]]];
const dx = (tip.x - palm.x) * mirrorSign;           // ③ 当前向量（镜像）
const dy = (tip.y - palm.y);
const bx = p.base[k][0] * mirrorSign, by = p.base[k][1];
let ex = dx - bx, ey = dy - by;                     // ④ 相对变化量

/* ⑤ 缓慢回中：手指回到放松位时基准跟着漂，避免长期偏置 */
const mag = Math.hypot(ex, ey);
if (mag < 0.032 && p.calib > 30) {
  p.base[k][0] += ((tip.x - palm.x) - p.base[k][0]) * 0.012;
  p.base[k][1] += ((tip.y - palm.y) - p.base[k][1]) * 0.012;
}

/* ⑥ 死区：抑制抖动 */
const dead = 0.006;
if (mag < dead) { ex = 0; ey = 0; }
else { const s = (mag - dead) / mag; ex *= s; ey *= s; }

/* ⑦ 换算成像素并限幅 */
let tx = p.ctrlRest[k][0] + ex * gain * p.H;
let ty = p.ctrlRest[k][1] + ey * gain * p.H;
const r = 0.34 * p.H;                               // 最大偏移半径
const d = Math.hypot(tx - p.ctrlRest[k][0], ty - p.ctrlRest[k][1]);
if (d > r) { tx = ctrlRest + ddx/d*r; ty = ctrlRest + ddy/d*r; }
p.ctrl[k][0] = tx; p.ctrl[k][1] = ty;
```

**四个保护措施，缺一个手感就会崩**：

| 措施 | 参数 | 作用 | 去掉会怎样 |
| --- | --- | --- | --- |
| 基准校准 | `p.base` | 以用户自然手型为零点 | 一进画面影人就扭曲 |
| 缓慢回中 | `0.032` / `0.012` | 手放松时基准慢慢漂回真实位置 | 长时间握持后"零点"跑偏，越玩越歪 |
| 死区 | `0.006` | 小于此值视为没动 | 影人持续高频抖动 |
| 圆形限幅 | `0.34 * H` | 控制点不超出身体合理范围 | 手一动，胳膊被拉到画面外，网格撕裂 |

> `mag < 0.032 && p.calib > 30` 这两个条件是配套的：
> 前 30 帧（约 0.5 秒）不做回中，否则校准刚建立就被改掉。

### 步骤 5：整体跟手（"被提起"的挂坠感）

```js
p.basePalm[0] += (palm.x - p.basePalm[0]) * 0.004;      // 掌心基准极慢漂移
p.basePalm[1] += (palm.y - p.basePalm[1]) * 0.004;

p.bodyOff[0] = clamp((palm.x - p.basePalm[0]) * 0.85, -0.22, 0.22) * p.H * mirrorSign;
p.bodyOff[1] = clamp((palm.y - p.basePalm[1]) * 0.75, -0.20, 0.20) * p.H;

p.bodySway  = clamp(-(palm.x - p.basePalm[0]) * 1.1, -0.22, 0.22) * mirrorSign;
```

- 掌心左右移动 → 影人**平移 + 轻微倾斜**（像被人提着走）。
- `0.004` 的漂移让"手一直举在偏左的位置"不会导致影人永远贴着左边。
- `bodySway` 与 `bodyOff` 用同一个差值，但**符号相反**（`-`），产生"晃动"而不是"平移"。

### 无手时的待机（`else` 分支）

```js
p.live = false;
const sway = Math.sin(T*0.85 + ph) * 0.035 + (this.mouse.active ? (this.mouse.x-0.5)*0.10 : 0);
p.bodySway = sway;
p.bodyOff[0] = Math.sin(T*0.62 + ph) * 0.012 * p.H;
p.bodyOff[1] = Math.sin(T*0.93 + ph) * 0.010 * p.H;
// 五个控制点各自按不同相位小幅摆动
```

两个人用 `ph = i * 2.1` 错开相位，**避免同步摆动像机器人**。
鼠标在动时，待机的影人也会"往鼠标方向偏一点"（`0.10` 那一项），显得有生命。

---

## 七、主循环 `_loop`

```js
_loop = () => {
  if (!this.running) return;
  const dt = Math.min(0.05, (now - this._last) / 1000);   // 限幅，防止切后台回来跳变
  if (!this.vw || !this.vh) this._resize();

  this._applyHands();

  const gl = this.glCtx.gl;
  gl.clear(gl.COLOR_BUFFER_BIT);
  const rects = this._layout();
  this.puppets.forEach((p, i) => { p.solve(dt); p.draw(rects[i], this.vw, this.vh); });

  this._drawFx(rects);    // Canvas2D 叠在上面
  this._drawHud();
  requestAnimationFrame(this._loop);
};
```

顺序不能变：**先解算再绘制**；`_drawFx` 必须在 `draw` 之后（它要读 `jointPos` 的最新姿态）。

---

## 八、`_drawFx()` 视觉层

| 元素 | 参数 | 说明 |
| --- | --- | --- |
| 顶部横杆 | `barY = H * 0.028` | 金色渐变，中间亮两端透明 |
| 落地投影 | `rect.y + rect.h*0.995` | 椭圆径向渐变，让影人"立"在台上 |
| 提线 | 二次贝塞尔 | 从横杆垂到关节，带轻微垂坠 |
| 线头朱点 | `W / 620` | 红点 + 米白描边 |
| 柔光 | `rect.h * 0.62` | 影人周围一圈暖光 |

提线的锚点：

```js
const anchorX = rect.cx + (x - rect.cx) * 0.35;   // 横杆上的点向影人中心收拢 65%
```

这样五根线在横杆上是**聚拢**的，不会散成一把扇子。

**改色**：`rgba(190,46,40,.72)` 是线色，`#d9604f` 是朱点。换主题色时这里要手改（Canvas 吃不到 CSS 变量）。

---

## 九、`_drawHud()` 状态文字

```js
const lines = [
  'STATUS : ' + st,
  'HANDS  : ' + n + ' / 2',
  'A · 左 : ' + nm(hs[0]),
  'B · 右 : ' + nm(hs[1]),
  'FPS    : ' + fps,
];
this.els.camHud.textContent = lines.join('\n');
```

`st` 的取值：`演绎中` / `演绎中 · 单影鼠标` / `鼠标操影` / `待机`。
`nm()` 返回 `——  待入画` / `鼠标 操影中` / `左影  已捕捉`。

CSS 里 `.cam-hud { white-space: pre }` 是让 `\n` 生效的关键，删了会变成一行。

---

## 十、调参速查表（**手感全在这里**）

| 想要的效果 | 改哪个数 | 当前位置 | 建议范围 |
| --- | --- | --- | --- |
| 手指动一点，影人动很多 | `gain` | `2.35` | 1.2 ~ 4.0 |
| 影人更稳（不抖） | `dead` | `0.006` | 0.004 ~ 0.02 |
| 影人更灵敏（小动作也响应） | `dead` 调小 | — | — |
| 影人动作幅度上限更大 | `r = 0.34 * p.H` | 0.34 | 0.25 ~ 0.45 |
| 整体跟手更明显 | `0.85` / `0.75` | — | 0.5 ~ 1.2 |
| 整体跟手更"飘" | `0.004`（漂移）调小 | — | 0.002 ~ 0.01 |
| 摆动幅度更大 | `1.1` | — | 0.5 ~ 1.6 |
| 回中更快（不易偏置） | `0.012` | — | 0.005 ~ 0.05 |
| 头部动作更明显 | `gain`（共用）或改 `puppet.js` 的 clamp | — | — |
| 待机更"活" | `else` 分支的 `0.035 / 0.012 / 0.010` | — | — |

---

## 十一、常见改动

### 1. 换手指映射

只改 `FINGER_FOR`。

### 2. 改成"两只手都控制同一个影人"

`assign[1] = assign[0]`，然后 `puppets` 只保留一个。属于结构性改动。

### 3. 影人不镜像

`enter()` 里 `mirror: i === 1` → `mirror: false`。
但提线与 `_layout` 的 `cx` 逻辑仍按左右站位，视觉上会变成"两个同向的人"。

### 4. 去掉鼠标操影

删掉 `_virtualHand` 的调用与 `virt` 相关分支，`else` 分支保留（待机呼吸）。

### 5. 改摄像头小窗的收起行为

```js
this.els.camHead.addEventListener('click', () => {
  const min = this.els.cam.classList.toggle('min');
  this.els.camFold.textContent = min ? '展开 ▼' : '收起 ▲';
});
```
`_bind()` 里，只绑一次。想默认收起，在 `index.html` 的 `<div class="cam" id="cam">` 上加 `min` 类，
并把 `#camFold` 初始文字改成 `展开 ▼`。

### 6. 加"暂停/继续"

在 `_loop` 里加一个 `if (this.paused) { requestAnimationFrame(this._loop); return; }`，
注意**仍要继续调度 rAF**，否则暂停后就再也起不来了。
