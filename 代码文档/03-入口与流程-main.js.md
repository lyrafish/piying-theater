# 03 · 入口与流程 `js/main.js`

> 357 行。**整个应用的唯一入口**。负责：翻幕、第三幕的两种渲染、第四幕配置的组装、启动流程。
> 它不参与任何渲染计算——第四幕之后的事全交给 `stage.js`。

---

## 一、行号地图

| 行 | 区块 | 作用 |
| --- | --- | --- |
| 4~5 | `import` | 从 `data.js` 取数据，从 `stage.js` 取 `Stage` |
| 8~10 | 启动信号 | `window.__piyingBooted = true` + 关掉 `#diag` |
| 12~13 | 工具 | `$` / `$$` 选择器简写 |
| 15~17 | 节点缓存 | `#deck` `#dots` `#toast` |
| 20~26 | `toast()` | 底部吐司，默认 2.2 秒 |
| 29~38 | `state` | 全局状态（见总览第六节） |
| 41~57 | `go(i)` | **翻幕核心** |
| 60~65 | 页码点生成 | 4 个 `<button>` 追加到 `#dots` |
| 68~83 | 滚轮翻幕 | 780ms 节流 + 内部滚动豁免 |
| 85~89 | 键盘翻幕 | ↑↓ / PageUp·PageDown / 空格 / Esc |
| 91~102 | 触摸翻幕 | 垂直位移 > 56px 且大于水平位移 |
| 105~116 | 封面逐字动画 | 把 `#coverTitle` 文本拆成 `<span class="ch">` |
| 119~120 | 第二幕点击 | 设定 `state.mode` 后 `buildWorkspace()` + `go(2)` |
| 123 | 缓存 | `#scr3 .workspace` |
| 125~128 | `buildWorkspace()` | 按 mode 分流 |
| 131~189 | `renderClassic(idx)` | 经典剧目整页渲染 |
| 192~275 | `renderCustom()` | 自定义剧目整页渲染 |
| 278~298 | `buildStageConfig()` | **state → 第四幕配置** |
| 301~304 | `#btnEnd` | 结束演绎，回第三幕 |
| 307~357 | `boot()` | 载 rig.json → new Stage → 预载素材 → 关遮罩 |

---

## 二、翻幕 `go(i)`

```js
function go(i, silent) {
  i = Math.max(0, Math.min(N - 1, i));       // 夹在 0..3
  if (i === state.index && !silent) return;  // 没变化就不动
  state.index = i;
  deck.dataset.index = String(i);            // ← 唯一的"翻页"动作
  $$('#dots button').forEach((b, k) => b.classList.toggle('on', k === i));
  if (i === 3) {
    const cfg = buildStageConfig();
    if (state.stage && cfg) {
      state.stage.enter(cfg);                // 进入第四幕：开摄像头、载人物
      toast('双手入画，五指自然张开静置片刻以校准', 4200);
    }
  } else if (state.stage) {
    state.stage.leave();                     // 离开第四幕：关摄像头
  }
}
```

要点：

1. **翻幕本身没有 JS 动画**，只是改 `data-index`，CSS 的 `transform` 过渡负责动。
2. `silent` 参数用于"定位到某一幕但不触发动画/回调"，`boot()` 里 `go(0, true)` 就是这么用的。
3. **进第四幕才开摄像头**，离开就关。这样第三幕不会白占一个摄像头指示灯。
4. `cfg` 为 `null` 时（自定义剧目没选全）不会进舞台——但 UI 上"进入"按钮已经 disabled 了，双保险。

---

## 三、翻幕的四种输入

| 输入 | 位置 | 关键细节 |
| --- | --- | --- |
| 滚轮 | 75~83 | 若指针在 `.side-body/.grid/.strip/.scrollable` 且该容器**还能滚**，就不翻幕；`780ms` 节流防连翻 |
| 键盘 | 85~89 | `Space` 会 `preventDefault()`，否则页面会滚动；`Esc` 只在第四幕生效 |
| 触摸 | 91~102 | 位移 < 56px 或水平分量更大 → 视为不是翻页手势 |
| 页码点 | 60~65 | `dotsEl` 里生成，`title` 是幕名 |

> **节流值 `780` 与 CSS 过渡 `.8s` 是配套的**。改 CSS 动画时长记得同步改这个数，否则会"翻到一半又被翻一次"。

---

## 四、第三幕 A：经典剧目 `renderClassic(idx)`

整个页面是**一次 `innerHTML` 拼接**完成的，没有 DOM 复用。所以每次切 tab 都是整块重绘。

### 4.1 人物站位

```js
const POS = { 1: ['c'], 2: ['l','r'], 3: ['l','c','r'] };
```

| 该剧人物数 | 站位 | 说明 |
| --- | --- | --- |
| 1 | `c` | 居中，`height: 62%` |
| 2 | `l` `r` | 左右，右侧自动加 `mirror` 类做水平翻转 |
| 3 | `l` `c` `r` | 中间那位略微透明（CSS `.actor.c { opacity: .96 }`） |

人物图路径固定：`assets/chars/${角色名}.png`。**角色名必须与 `rig.json` 的 key 完全一致**，否则第四幕会找不到骨架（`Stage.enter` 里 `if (!info) return null`，表现为少一个人）。

### 4.2 戏箱（`.strip`）

```js
const thumbs = story.chars.map(c => `<div class="th" …><img src="assets/chars/${c}.png"><span>${c}</span></div>`)
```
最后额外拼一个 `.th.wide` 的布景缩略图，中间用 `.sep` 分隔。

### 4.3 右栏

`.side-body` 里依次是：`h3` 剧目名 → `.sub` 副标题 → `p.txt` 简介 → `.chips` 若干 `.chip`（来自 `story.notes`）。
底部 `.side-foot` 是 `#btnEnter`，点击 `go(3)`。

### 4.4 事件绑定

```js
$$('.tb-item', workspace).forEach(b => b.addEventListener('click', () => renderClassic(+b.dataset.i)));
$('#btnEnter').addEventListener('click', () => go(3));
```
因为每次重绘都重建了节点，**监听器也必须每次重绑**——这是本项目所有渲染函数的统一模式。

---

## 五、第三幕 B：自定义剧目 `renderCustom()`

### 5.1 两个 tab

```js
state.tab = 'char' | 'bg'
```
顶部两个 `.tb-item`，点击后 `state.tab = b.dataset.t; renderCustom();`（整页重绘）。

### 5.2 选择逻辑（**最容易改错的地方**）

```js
if (isChar) {
  const i = state.selChars.findIndex(p => p.id === it.id);
  if (i >= 0) state.selChars.splice(i, 1);        // 再点一次 = 取消
  else {
    if (state.selChars.length >= 2) state.selChars.shift();  // 超过 2 个就顶掉最早的
    state.selChars.push(it);
  }
} else {
  state.selBg = (state.selBg && state.selBg.id === it.id) ? null : it;  // 布景单选，可取消
}
renderCustom();                                    // 立即重绘
```

- 人物**最多 2 个**（左右手各领一影），第 3 个会挤掉第 1 个；
- 布景**单选**；
- 卡片上的「第 1 影 / 第 2 影」角标由 `state.selChars.findIndex` 实时算出来。

### 5.3 悬停预览 `show(it)`

```js
card.addEventListener('mouseenter', () => show(it));
card.addEventListener('focus', () => show(it));
```
只改 `#showcase` 的 `innerHTML`，不重绘整个页面——所以划过卡片很流畅。
**注意**：`show()` 是 `renderCustom()` 内部的闭包，重绘后旧闭包失效，所以每次重绘都要重新取 `#showcase`。

### 5.4 「进入」按钮的启用条件

```js
const ready = state.selChars.length > 0 && !!state.selBg;
```
只要**至少一个人物 + 一个布景**。只选 1 个人物时，第四幕会把这个人复制成两个（见 `buildStageConfig`）。

---

## 六、`buildStageConfig()` —— 第三幕到第四幕的桥

```js
// 经典剧目
{ bg: s.bg, title: s.title, meta: s.subtitle,
  chars: [{ key: '项羽', name: '项羽' }, …] }

// 自定义剧目
{ bg: selBg.file, title: '自定义剧目',
  meta: `${cs[0].name} · ${cs[1].name} ｜ ${selBg.name}`,
  chars: [{ key: 'c01', name: '素纱幽兰' }, …] }
```

`key` 是**查 `rig.json` 的键**（经典剧目用中文角色名，自定义用 `c01`~`c10`）；
`name` 是**显示名**。两者别混。

只选了一个人物时：

```js
const cs = state.selChars.length >= 2 ? state.selChars : [state.selChars[0], state.selChars[0]];
```
同一个人物会出现两次（一左一右），这是刻意的。

---

## 七、启动 `boot()`

```js
async function boot() {
  const res = await fetch('data/rig.json');     // ① 载骨架
  state.rig = await res.json();

  state.stage = new Stage({ … }, state.rig);    // ② 建舞台（此时不开摄像头）

  renderClassic(0);                             // ③ 先渲染一次第三幕，避免空白
  go(0, true);                                  // ④ 停在封面

  await Promise.race([ …preload…, 6s 超时 ]);   // ⑤ 预载常用图

  const ld = $('#loading'); ld.classList.add('off');   // ⑥ 关遮罩
  setTimeout(() => ld.remove(), 900);
}
boot();
```

关键点：

- **`fetch('data/rig.json')` 失败时会降级**：`state.rig = { chars: {} }`，页面还能翻，但第四幕没有人物。这是 `file://` 下的典型表现（不过现在会被 `index.html` 的自动跳转拦在前面）。
- `new Stage(els, rig)` 只是保存引用，**不耗资源**；真正的开销在 `enter()`。
- `preload` 里预载了：页面背景、5 张布景、前两段剧目的全部人物、前 6 个自定义人物、前 6 个布景。
  **加新剧目/新人物后，如果首屏出现"白一下"，把它加进这个数组。**
- `Promise.race` 的 6 秒兜底：网络再慢也不会永远卡在遮罩上。

### `new Stage()` 传入的 13 个节点

```js
root:      $('#scr4')        // 用于监听 pointermove（鼠标操影）
glCanvas / fxCanvas          // 两个画布
bg:        $('#stageBg')
title:     $('#stageTitle')  meta: $('#stageMeta')
video / camCanvas / camHud / camMsg / camDot   // 摄像头小窗内部
cam / camHead / camFold      // 小窗容器与收起按钮
```
**增删任何一个都要同步改 `stage.js` 的 `this.els.xxx` 引用。**

---

## 八、常见改动

### 1. 加一段经典剧目

只需改 `js/data.js` 的 `STORIES` 数组（见 `04`）。`main.js` 会自动多出一个 tab，
`POS` 会按 `chars.length` 自动选站位——**但只支持 1~3 个角色**，4 个以上需要自己扩 `POS`。

### 2. 改"最多选 2 个人物"的限制

```js
if (state.selChars.length >= 2) state.selChars.shift();
```
改成 1 就是单选。但第四幕只画两个影人（`chars.slice(0, 2)`），改成 3 没有意义。

### 3. 改翻幕灵敏度

| 想改 | 改哪 |
| --- | --- |
| 滚轮间隔 | `if (now - lock < 780 \|\| Math.abs(dy) < 4) return;` |
| 滚轮最小位移 | 上面那个 `4` |
| 触摸最小位移 | `if (Math.abs(dy) < 56 \|\| …) return;` |
| 动画时长 | `css/style.css` 的 `.deck { transition: transform .8s … }` |

### 4. 加一幕

见 `01-页面结构-index.html.md` 第四节第 3 条（三处都要改）。

### 5. 换第四幕的"结束"去向

```js
$('#btnEnd').addEventListener('click', () => { go(2); toast('已收影入箱'); });
```
改成 `go(1)` 就是回第二幕。

### 6. 想加"下载/分享"按钮

在 `index.html` 第四幕的 `.end-wrap` 里加按钮，然后在 `main.js` 末尾绑定即可。
注意第四幕的 `.end-wrap` 是 `z-index: 30`，新按钮放进去就能点到。
