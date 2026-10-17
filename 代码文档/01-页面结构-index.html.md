# 01 · 页面结构 `index.html`

> 331 行。只有两个职责：**搭出四幕的 DOM 骨架**，以及**在 `file://` 下把用户自动送去本地服务器**。
> 页面上的内容 90% 是空的，由 `js/main.js` 往 `#topbar` / `#wsBody` 里注入。

---

## 一、整体骨架

```
<html>
 ├─ <head>
 │   ├─ meta / title / 内联 SVG favicon
 │   ├─ css/fonts.css
 │   ├─ css/style.css
 │   └─ <script>  自检 + file:// 自动跳转（见第三节）
 └─ <body>
     ├─ .app
     │   ├─ .deck#deck[data-index="0..3"]      ← 四幕横向排列的"卷轴"
     │   │   ├─ section#scr1  .screen          第一幕 · 封面
     │   │   ├─ section#scr2  .screen          第二幕 · 择幕
     │   │   ├─ section#scr3  .screen          第三幕 · 剧目（内容由 JS 注入）
     │   │   └─ section#scr4  .screen          第四幕 · 演绎
     │   ├─ nav#dots                            右侧页码点（JS 生成）
     │   └─ div#toast                           底部吐司提示
     ├─ div#loading                             全屏载入遮罩
     ├─ div#diag                                环境提示浮层（默认 display:none）
     └─ <script type="module" src="js/main.js">
```

**翻幕原理**：`.deck` 是 `height: 400%` 的容器，四幕各占 100%。
`#deck[data-index="n"]` 用 CSS 把它 `translateY(-n*100%)`。
所以翻幕 = 改一个 `data-index` 属性，动画交给 CSS transition。**没有 JS 逐帧动画。**

---

## 二、元素 id 索引表

改 JS 前先在这里查 id，`main.js` / `stage.js` 全靠这些 id 抓节点。

### 第一幕
| id / class | 说明 |
| --- | --- |
| `#coverTitle` | 毛笔大标题。**注意**：`main.js` 的 `coverTitle()` 会把文本拆成 `<span class="ch">` 逐字入场，所以改文案要改 HTML 里的文本，不要改结构 |
| `#btnStart` | 「开始创作」→ `go(1)` |
| `.cover-seal` | 右上角印章「皮影剧场」 |

### 第二幕
| id | 说明 |
| --- | --- |
| `#pickClassic` | 经典剧目卡片 → `state.mode='classic'` |
| `#pickCustom` | 自定义剧目卡片 → `state.mode='custom'` |
| `.gcard .art img` | 卡片底图（`霸王别姬.jpg` / `b08.jpg`），换图只改这里 |

### 第三幕
| id | 说明 |
| --- | --- |
| `#topbar` | 顶部 tab 条。**初始为空**，`renderClassic()` / `renderCustom()` 写入 |
| `#wsBody` | 主体。同上 |

> 第三幕内部所有结构（`.stage-col` `.side` `.strip` `.picker` `.grid` `.pick-status`）都是 JS 拼字符串生成的，
> 详见 `03-入口与流程-main.js.md`。**不要在 index.html 里找它们，找不到的。**

### 第四幕
| id | 元素 | 用途 |
| --- | --- | --- |
| `#stageBg` | `<img>` | 布景底图，`Stage.enter()` 改 `src` |
| `#glCanvas` | `<canvas>` | **WebGL**，画两个皮影 |
| `#fxCanvas` | `<canvas>` | **2D**，画提线 / 投影 / 柔光，叠在 GL 之上 |
| `#stageTitle` | `<span>` | 左上题签的剧目名 |
| `#stageMeta` | `<span>` | 题签的副标题 |
| `#cam` | `.cam` | 摄像头小窗容器，`.min` 类 = 收起 |
| `#camHead` | `.cam-head` | 小窗标题栏，**点击切换展开/收起** |
| `#camDot` | `.dot` | 状态灯，`.live` 类 = 已捕捉 |
| `#camFold` | `.fold` | 「收起 ▲ / 展开 ▼」文字，由 `stage.js` 改 |
| `#camVideo` | `<video>` | 摄像头原始画面（CSS `scaleX(-1)` 镜像） |
| `#camCanvas` | `<canvas>` | 手部骨骼线框 |
| `#camHud` | `.cam-hud` | 左上角等宽字状态文字（`_drawHud()` 写入） |
| `#camMsg` | `.cam-msg` | 错误提示条，`.on` 类控制显示 |
| `#btnEnd` | `<button>` | 「结束演绎」→ `go(2)` |

### 全局
| id | 用途 |
| --- | --- |
| `#deck` | 翻幕容器，`data-index` 是唯一状态 |
| `#dots` | 右侧圆点，`main.js` 循环生成 |
| `#toast` | 吐司，`toast(msg, ms)` 控制 |
| `#loading` | 载入遮罩，`boot()` 完成后加 `.off` 再 `remove()` |
| `#diag` | 环境提示浮层，加 `.on` 显示 |

---

## 三、`<head>` 里的自检脚本（重点）

这是**唯一一段不放在 `js/` 里的逻辑**，因为必须在 ES Module 之前同步执行。

### 它解决什么问题

浏览器在 `file://` 下会：禁用 ES Module、禁用 WASM、禁用 `fetch`。
本项目三者全用（`import` / MediaPipe / `fetch('data/rig.json')`），所以双击 `index.html` 必然是白屏。

### 它怎么解决

```
页面加载
  │
  ├─ 不是 file://  → 什么都不做，正常走 main.js
  │
  └─ 是 file://    → autoTick(true)
        │
        ├─ probe()  用 <img> 请求 http://127.0.0.1:8848/assets/bg/page-bg.jpg?probe=时间戳
        │      │
        │      ├─ onload  → 服务器活着！
        │      │            location.replace('http://127.0.0.1:8848/')
        │      │            （地址栏从 file:///C:/... 变成 http://127.0.0.1:8848/）
        │      │
        │      └─ onerror / 1.6s 超时 → 服务器没开
        │                   显示 #diag 浮层，写明"正在等待本地服务器…"
        │                   每 2 秒自动重试一次
        │                   → 用户此刻双击 启动.bat，2 秒内页面自己就跳过去了
        │
        └─ 浮层上还有两个按钮：
              #diagRetry  立即重试（清掉计时器马上再探一次）
              #diagOpen   直接 location.href 跳过去（不探测，强制跳）
```

### 为什么用 `<img>` 探测而不是 `fetch`

| 方式 | file:// 下可用？ | 说明 |
| --- | --- | --- |
| `fetch('http://127.0.0.1:8848/')` | ❌ | file:// 的源是 `null`，普通跨域请求会被 CORS 挡；`mode:'no-cors'` 在部分 Chrome 版本还会被 Private Network Access 拦 |
| `XMLHttpRequest` | ❌ | 同上 |
| `new Image().src = '...'` | ✅ | **图片是"不受 CORS 约束的子资源"**，只判断 onload/onerror，不需要读内容 |

这是全项目最"取巧"的一处，改它之前请先理解上面这张表。

### 关键代码位置（搜索这些字符串可定位）

| 搜索 | 作用 |
| --- | --- |
| `var AUTO = {` | 自动接管状态；`port: 8848` 是默认端口，URL 加 `?port=9000` 可覆盖 |
| `probeUrl: 'assets/bg/page-bg.jpg'` | 探针图片，**换成别的必须确保该文件存在** |
| `function probe(cb)` | 单次探测，1.6 秒超时 |
| `function autoTick(first)` | 轮询主循环，间隔 2000ms |
| `function showDiag(reason)` | 显示浮层；`reason` 会写进浮层底部（file/script/reject/timeout） |
| `#diagRetry,#diagOpen` 的 click 监听 | 浮层按钮 |
| `setTimeout(..., 8000)` | 非 file:// 场景的兜底：8 秒还没 boot 成功就弹浮层 |

### 失败原因代码对照

浮层最底部会显示 `当前失败原因代码：xxx`：

| 值 | 含义 |
| --- | --- |
| `file` | 走的 `file://` 协议（最常见） |
| `script` | `<script>` 标签加载失败（文件缺失 / 路径写错 / MIME 不对） |
| `reject` | 模块里抛了未捕获的 Promise 异常 |
| `timeout` | 8 秒内 `window.__piyingBooted` 仍为 false |
| `unknown` | 未触发以上任何一条 |

> `js/main.js` 第一行 `window.__piyingBooted = true` 就是"我活了"的信号，
> 它会把浮层关掉。**删掉这一行会导致浮层在正常环境下也弹出来。**

---

## 四、常见改动

### 1. 改封面标题文案

```html
<h1 class="cover-title" id="coverTitle">皮影剧场</h1>
```
直接改文字即可，逐字动画会自动适配任意字数（`coverTitle()` 里是 `[...txt].forEach`）。
字数变多要同步调 `css/style.css` 的 `.cover-title { font-size }`。

### 2. 改第二幕卡片的图 / 文案

```html
<div class="art"><img src="assets/stories/霸王别姬.jpg" alt=""></div>
...
<div class="desc">霸王别姬 · 三打白骨精 · 新贵妃醉酒<br>梁祝 · 鹊桥相会</div>
```
`<br>` 是手动换行，改文案时注意保持两行，否则卡片高度会变。

### 3. 增加一幕（五幕）

需要动三处：
1. `index.html`：在 `.deck` 里加 `<section class="screen" id="scr5">…</section>`
2. `css/style.css`：加 `.screen:nth-child(5){top:400%}` 和 `.deck[data-index="4"]{transform:translateY(-400%)}`
3. `js/main.js`：`const N = 4` 改成 5；`['封面','择幕','剧目','演绎']` 数组补一项

⚠️ `.screen` 的 `top` 和 `.deck[data-index]` 的 `translateY` 必须同时改，漏一个就会错位一屏。

### 4. 调浮层里的启动命令文案

`<ol class="diag-steps">` 里的 `<code>python serve.py</code>` 和 `data-copy="python serve.py"` 是两处，
改的时候**两处都要改**（前者显示，后者是复制内容）。

### 5. 让浮层不再出现

如果你确定只在自己电脑上跑、且只用 `启动.bat`，可以删掉整个 `<div class="diag" id="diag">` 块。
但**不要删 `<head>` 里那段脚本**——它同时承担着"file:// 自动跳转"的功能。
