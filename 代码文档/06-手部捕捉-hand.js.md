# 06 · 手部捕捉 `js/hand.js`

> 180 行。**唯一一个依赖外部库的模块**：MediaPipe Tasks Vision 的 `HandLandmarker`。
> 运行时与模型都在 `vendor/mediapipe/` 下，**完全离线**，不走 CDN。

---

## 一、它负责什么 / 不负责什么

| 负责 | 不负责 |
| --- | --- |
| 开摄像头、拿 21 个手部关键点 | 判断哪只手控制哪个影人（那是 `stage.js`） |
| 把关键点整理成 `this.hands` | 把手指位移换算成骨骼动作 |
| 在摄像头小窗上画骨骼线框 | 皮影本身的渲染 |
| 失败时给出中文原因并降级 | — |

**降级策略**：任何一步失败（没摄像头 / 拒绝授权 / 模型载不进来），`start()` 返回 `false`，
`stage.js` 会自动切到"鼠标操影"，功能不中断。

---

## 二、行号地图

| 行 | 内容 |
| --- | --- |
| 4 | `import { FilesetResolver, HandLandmarker } from '../vendor/mediapipe/vision_bundle.mjs'` |
| 6~7 | `TIPS` 指尖索引 / `PALM` 掌心索引 |
| 9~16 | `CONN` 21 条骨骼连线 |
| 18~34 | `class HandTracker` 构造 + 状态字段 |
| 36~93 | `start()` 开摄像头 + 载模型 |
| 95~119 | `_loop` 检测循环 |
| 121~173 | `_drawOverlay` 画线框 |
| 175~179 | `stop()` |

---

## 三、MediaPipe 的 21 个关键点

```
        8   12  16  20          ← 食/中/无名/小 指尖
        |   |   |   |
        7   11  15  19
        |   |   |   |
        6   10  14  18
        |   |   |   |
  4     5   9   13  17          ← 9 = 掌心（PALM）
  |     |  /   /   /
  3     6 10  14  18
  |     |/   /   /
  2     5  9  13  17
  |    /  /  /
  1  /
  |/
  0   ← 腕（wrist）
```

| 常量 | 值 | 含义 |
| --- | --- | --- |
| `TIPS.thumb` | 4 | 拇指尖 |
| `TIPS.index` | 8 | 食指尖 |
| `TIPS.middle` | 12 | 中指尖 |
| `TIPS.ring` | 16 | 无名指尖 |
| `TIPS.pinky` | 20 | 小指尖 |
| `PALM` | 9 | 中指掌指关节（用作"掌心"参照点） |

> 为什么用 9 而不是 0（腕）当掌心？因为 9 在手的几何中心附近，**手指相对它的向量对"握拳/张手"最敏感**；
> 用腕点会让"手腕转动"混进手指信号里。

---

## 四、`start()` 的完整流程

```js
async start() {
  if (this.running) return true;            // 已启动，幂等
  this.status = 'loading';

  /* ① 开摄像头 */
  this.stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
    audio: false,
  });
  this.video.srcObject = this.stream;
  await this.video.play();
  // 等 videoWidth 就绪（最多 1.5 秒）

  /* ② 载 WASM 运行时 */
  const fileset = await FilesetResolver.forVisionTasks('vendor/mediapipe/wasm');

  /* ③ 建检测器（GPU 优先，失败回退 CPU） */
  this.landmarker = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: 'vendor/mediapipe/hand_landmarker.task', delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  /* ④ 起检测循环 */
  this.running = true;
  this._loop();
  return true;
}
```

### 失败分支

| 失败点 | `status` | `message` | 后续 |
| --- | --- | --- | --- |
| 浏览器无 `getUserMedia` | `'error'` | `未能启用摄像头 —— 已切换为鼠标操影` | 返回 false |
| 用户拒绝授权（`NotAllowedError`） | `'denied'` | `摄像头权限被拒绝 —— 已切换为鼠标操影` | 返回 false |
| GPU delegate 建失败 | — | — | **自动重试 CPU**（第 75~85 行） |
| CPU 也失败 | `'error'` | `捕捉模型载入失败 —— 已切换为鼠标操影` | 返回 false |

> GPU 失败的典型原因：某些集成显卡 / 远程桌面 / 虚拟机。
> 回退时**故意不传 `delegate`**（默认就是 CPU），代码里没有再写 `'CPU'`。

---

## 五、`_loop` 检测循环

```js
_loop = () => {
  if (!this.running) return;
  const v = this.video;
  if (v.readyState >= 2 && this.landmarker) {
    const now = performance.now();
    const res = this.landmarker.detectForVideo(v, now);      // VIDEO 模式必须传时间戳
    this.hands = (res.landmarks || []).map((lm, i) => ({
      landmarks: lm,                                          // [{x,y,z} ×21]，归一化 0~1
      label: res.handednesses[i][0].categoryName,             // 'Left' / 'Right'
      score: res.handednesses[i][0].score,
    }));
    // 每 500ms 算一次 fps
  }
  this._drawOverlay();
  requestAnimationFrame(this._loop);
};
```

要点：

1. **`detectForVideo(video, timestamp)` 的时间戳必须单调递增**，这里直接传 `performance.now()`。
2. `try/catch` 包住了单帧异常——某帧检测失败不该中断整个循环。
3. `landmarks` 坐标是**视频原始坐标系**（未镜像），x 从画面左到右。
   镜像发生在两处：小窗绘制（`_drawOverlay` 的 `map`）和 `stage.js` 的 `1 - p.x`。
4. 检测频率跟着 `requestAnimationFrame` 走（约 60fps），MediaPipe 内部会自动降频。

---

## 六、`_drawOverlay` 小窗线框

```js
const map = (p) => [ (1 - p.x) * w, p.y * h ];   // ← 视频镜像
```

画四层：

| 层 | 颜色 | 说明 |
| --- | --- | --- |
| 压暗底 | `rgba(12,8,4,.22)` | 让金色线框更跳 |
| 骨骼连线 | `rgba(226,194,116,.85)` 金 | `CONN` 里的 21 条 |
| 关节点 | `rgba(243,232,208,.9)` 米白 | 每 4 个点画大一点（指尖/关节） |
| 五指引线 + 指尖朱点 | 线 `rgba(214,96,79,.75)`，点 `#e2564a` | 从掌心连到 5 个指尖 |
| 掌心点 | `rgba(226,194,116,.95)` | 大一点的金点 |

线宽用 `w / 260`、`w / 300` 这种**相对画布宽**的写法，保证小窗缩放时线框不糊。

---

## 七、`stop()`

```js
stop() {
  this.running = false;
  if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
  this.hands = [];
}
```

**必须 `getTracks().forEach(t => t.stop())`**，否则摄像头指示灯会一直亮着。
`landmarker` 故意**不销毁**——下次再进第四幕时省掉几秒的模型加载。

---

## 八、常见改动

### 1. 改成只检测一只手

```js
numHands: 2,   →   numHands: 1,
```
但这样两个影人只能有一个被手控制，另一个会走"呼吸待机"。

### 2. 提高/降低检测灵敏度

| 参数 | 默认 | 调大 | 调小 |
| --- | --- | --- | --- |
| `minHandDetectionConfidence` | 0.5 | 少误检、容易漏检 | 更容易检出、可能误检 |
| `minHandPresenceConfidence` | 0.5 | 手一出画就丢 | 手半出画还能跟 |
| `minTrackingConfidence` | 0.5 | 抖动时容易丢手 | 更稳但可能"粘住"旧位置 |

室内灯光偏暗时，把三个都降到 `0.35` 通常更稳。

### 3. 改摄像头分辨率

```js
video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
```
**不建议超过 1280×720**：分辨率翻倍，`detectForVideo` 的耗时也翻倍，手会明显延迟。
`facingMode: 'user'` 是前置摄像头；接外接摄像头时浏览器会自己选。

### 4. 改小窗线框样式

改 `_drawOverlay` 里的颜色常量。**这些是 Canvas 绘制，吃不到 CSS 变量**——
换主题色时要手动改这里（搜 `226,194,116` / `214,96,79` / `#e2564a`）。

### 5. 想在小窗里显示 FPS

已经有了：`this.fps`，由 `stage.js` 的 `_drawHud()` 显示为 `FPS : 30`。

### 6. 换一个手部模型

替换 `vendor/mediapipe/hand_landmarker.task`，路径不用改。
如果要换成"手势识别"（`GestureRecognizer`），需要改 `import` 与 `createFromOptions` 的类名，
并且 `res.gestures` 的取法和 `res.landmarks` 不同——**属于较大改动**。

---

## 九、排错

| 现象 | 原因 |
| --- | --- |
| 小窗全黑但有 HUD | 摄像头没出图。headless / 虚拟机下常见；真机上检查是否被别的程序占用 |
| 小窗有画面但没线框 | `landmarker` 没建起来 → 看 `tracker.message` |
| 线框左右反了 | 正常。`map()` 里做了镜像以匹配 `video` 的 `scaleX(-1)` |
| 影人跟着手反着动 | 问题在 `stage.js` 的 `_applyHands`，不是这里 |
| 一进第四幕就报 `NotAllowedError` | 浏览器记住了"拒绝"，需在地址栏左侧的权限图标里改回"允许" |
| 换端口/换机器后必须重新授权 | 浏览器按 origin 记权限，`127.0.0.1:8848` 与 `localhost:8848` 是两个 origin |
