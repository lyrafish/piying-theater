# 02 · 样式系统 `css/style.css` + `css/fonts.css`

> 780 行。全站样式集中在这一个文件里，**按幕分区**，顶部 `:root` 是唯一的设计系统入口。
> 改配色、改字号、改间距，99% 的情况只需动 `:root`，不要散落改硬编码值。

---

## 一、文件分区（按行号）

| 行 | 分区 | 内容 |
| --- | --- | --- |
| 1 | **设计系统** `:root` | 颜色 / 字体 / 尺寸变量 |
| 35~65 | 基础重置 | `*` `html` `body` `img` `button`、宣纸底纹 `.paper-tex` |
| 67 | 页面容器 | `.app` `.deck` `.screen` `.bg-layer` |
| 100 | 通用组件 | `.frame` 描金四角、`.btn`、`.tag-v` 竖排标签、`.seal` 印章、`.dots` 页码点、`.hint-scroll` 下滑提示 |
| 205 | 页面一 · 封面 | `.cover` `.cover-title` 逐字动画 `.cover-rule` `.cover-seal` |
| 244 | 页面二 · 选择 | `.choose` `.gcard` 黄金比例卡片 |
| 319 | 页面三 · 通用壳 | `.workspace` `.topbar` `.tb-item` `.stage-col` `.stage` `.strip` `.side` |
| 464 | 页面三B · 自定义 | `.picker` `.grid` `.card` `.showcase` `.pick-status` |
| 548 | 页面四 · 演绎 | `.stage-page` `#glCanvas` `#fxCanvas` `.stage-title` `.cam` `.end-wrap` `.toast` `.loading` |
| 662 | 运行环境提示 | `.diag` 浮层（含本次新增的 `.diag-auto` 自动探测状态条） |
| 770 | 响应式 | `@media (max-aspect-ratio: 1/1)` 竖屏改上下分栏；`3/4` 时隐藏 tab 副标题 |

---

## 二、`:root` 变量（改这里等于换皮肤）

```css
:root {
  /* 色 */
  --ink:        #1b1510;   /* 墨 —— 正文主色 */
  --ink-2:      #2c231b;   /* 次级正文 */
  --ink-3:      #463829;   /* 辅助说明 */
  --paper:      #f3e8d0;   /* 宣纸 */
  --paper-2:    #e9dcbe;   /* 宣纸渐深 */
  --paper-3:    #dcc9a2;
  --paper-4:    #c9b184;   /* 最浅的提示字 */
  --cinnabar:   #a5302a;   /* 朱砂 —— 强调色、选中态 */
  --cinnabar-l: #c2453a;
  --vermilion:  #d9604f;   /* 提线红、指尖点 */
  --gold:       #b8933f;   /* 描金 —— 边框、分割线 */
  --gold-l:     #e2c274;   /* 亮金 —— 深底上的文字 */
  --gold-d:     #8a6d2b;
  --ochre:      #9d6a33;   /* 赭石 —— 小标签 */
  --stone:      #4f6f6a;   /* 石青 —— 状态点"未激活" */
  --jade:       #4d7a5c;
  --shadow:     rgba(27,21,16,.45);

  /* 字 */
  --f-title: 'PiyingBrush', 'Ma Shan Zheng', 'STXingkai', '华文行楷', 'STKaiti', 'KaiTi', serif;
  --f-label: 'PiyingHei', 'ZCOOL QingKe HuangYou', 'STHeiti', 'Microsoft YaHei', sans-serif;
  --f-body:  'PiyingSong', 'Noto Serif SC', 'Songti SC', 'STSong', 'SimSun', serif;

  /* 尺 */
  --pad: clamp(10px, 1.6vmin, 30px);   /* 全站内边距 */
  --rad: clamp(4px, .5vmin, 10px);     /* 全站圆角 */
}
```

**字体分工**（写新样式时按这个选）：

| 变量 | 用在哪 | 气质 |
| --- | --- | --- |
| `--f-title` | 封面大标题、剧目名、栏目名、题签 | 毛笔行楷，**只用于标题，不要用于正文** |
| `--f-label` | 按钮、标签、英文小字、状态文字 | 黄油体，方硬、有设计感 |
| `--f-body` | 简介正文、说明文字 | 宋体，可长读 |

---

## 三、自适应机制（最重要的一节）

```css
html {
  font-size: clamp(11px, 0.62vmin + 0.62vw, 34px);
}
```

**全站不用 `px` 定尺寸，全部用 `rem`。** 于是：

- 屏幕变大 → 根字号变大 → 所有 `rem` 等比放大；
- 用 `vmin + vw` 的**加权和**而不是单纯 `vw`，是为了让"很宽很矮"和"很窄很高"的屏幕都不会畸形；
- `clamp` 保证极小屏（11px 下限）和大屏（34px 上限）都不失控。

因此：

> ⚠️ **加新样式请用 `rem` / `em` / `vmin` / `%`，不要用 `px`。**
> 一旦混入固定 `px`，在大屏上就会变成"别人都在长，只有它不长"。

`.screen` 是 `position:absolute` 的四块，`.deck` 高 `400%`：

```css
.deck { height: 400%; transition: transform .8s cubic-bezier(.7,0,.2,1); }
.deck[data-index="0"] { transform: translateY(0); }
.deck[data-index="1"] { transform: translateY(-100%); }
.deck[data-index="2"] { transform: translateY(-200%); }
.deck[data-index="3"] { transform: translateY(-300%); }
.screen:nth-child(1) { top: 0; }  …  .screen:nth-child(4) { top: 300%; }
```

---

## 四、通用组件速查

| 类名 | 长相 | 怎么用 |
| --- | --- | --- |
| `.frame` | 四角描金细线框 | 需要"裱起来"的容器；配合子元素 `<span class="cnr-b"></span>` 补齐另两角 |
| `.btn` | 朱砂实心按钮，hover 上浮 | `<button class="btn">` |
| `.btn-ghost` | 描边透明按钮 | `<button class="btn btn-ghost">` |
| `.seal` | 方形印章（朱底白字、竖排） | `<div class="seal">皮影<br>剧场</div>` |
| `.tag-v` | 竖排小标签 | 右栏头部"净·旦"那类 |
| `.dots` | 右侧页码点 | 由 `main.js` 生成 `<button>` |
| `.hint-scroll` | 底部"下滑继续" | 第一、二幕各一个 |

---

## 五、第三幕两套布局

### A. 经典剧目（`renderClassic` 生成）

```
.workspace (flex column)
 ├─ .topbar        五个 .tb-item（剧目 tab），.on 为当前
 └─ .ws-body (flex row)
     ├─ .stage-col (flex:1)
     │   ├─ .stage      布景 + 人物 .actor.l/.c/.r + 底部 .plate 题签
     │   └─ .strip      戏箱缩略条（.th 缩略图 / .th.wide 布景 / .sep 分隔）
     └─ .side (宽 11~20rem)
         ├─ .side-head   "简介" + .tag-v 行当
         ├─ .side-body   h3 / .sub / p.txt / .chips>.chip
         └─ .side-foot   #btnEnter
```

`.stage .actor` 的三个位置类是硬编码的：

```css
.stage .actor.l { left: 6%; }
.stage .actor.r { right: 6%; }
.stage .actor.c { left: 50%; transform: translateX(-50%); height: 62%; }
.stage .actor.r.mirror { transform: scaleX(-1); }   /* 右侧人物镜像相对 */
```

> `.actor.c` 和 `.actor.r.mirror` 都改 `transform`，**同时命中会互相覆盖**。
> 目前靠"只有两人时右侧才加 `mirror`"来规避（见 `main.js` 的 `POS` 逻辑）。

### B. 自定义剧目（`renderCustom` 生成）

```
.ws-body (flex row)
 ├─ .showcase   左：悬停放大预览（.big / .big.is-bg / .empty / .cap）
 └─ .picker     右：.grid > .card（.card.wide 用于布景，.card.on 为已选）
.pick-status   底部：人物 / 布景 已选状态 + #btnEnter
```

`.card.on::after` 会自动加一个"已选"角标——**这是纯 CSS 的**，JS 只负责加 `.on` 类。

---

## 六、第四幕叠层顺序（z-index）

改第四幕前务必理解这个层级，否则会"点不到按钮"或"线被挡住"。

```
.stage-page (position: relative, overflow: hidden)
  z 0  .sbg        布景图
  z 1  #glCanvas   WebGL 皮影（透明底）
  z 1  #fxCanvas   提线 / 投影（pointer-events: none）
  z -  .sglow/.svig 光晕与暗角（pointer-events: none）
  z 20 .stage-title 顶部题签
  z 30 .cam         摄像头小窗（可点标题栏收起）
  z 30 .end-wrap    右下角提示 + 结束按钮
```

`.cam` 收起状态：

```css
.cam.min .cam-body { display: none; }
.cam.min { width: clamp(7rem, 17vmin, 13rem); }
```
`stage.js` 的 `_bind()` 里 `cam.classList.toggle('min')` 控制。

---

## 七、响应式

```css
@media (max-aspect-ratio: 1/1) {   /* 竖屏 / 接近正方 */
  .ws-body { flex-direction: column; }      /* 第三幕改上下分栏 */
  .side { max-height: 42%; }
  .picker { max-height: 46%; }
  .choose-row { flex-direction: column; }   /* 第二幕两张卡改竖排 */
  .gcard { width: min(78vw, 30rem); }
  .cover-title { font-size: clamp(2.6rem, 15vmin, 6rem); }
}
@media (max-aspect-ratio: 3/4) {   /* 手机竖屏 */
  .topbar .tb-item .s { display: none; }   /* 隐藏 tab 副标题 */
}
```

只有这两处媒体查询。其余全靠 `rem` + `clamp` 自然伸缩——**这是有意的设计，不要随手加断点**。

---

## 八、常见改动

### 1. 换主色（比如把朱砂换成靛蓝）

只改 `:root` 的 `--cinnabar` / `--cinnabar-l` / `--vermilion` 三个值。
但注意：`js/stage.js` 里提线颜色和 `js/hand.js` 里指尖颜色是**硬编码的 `rgba(190,46,40,.72)` / `#e2564a`**，
那是 Canvas 绘制，吃不到 CSS 变量，要一并改（搜 `190,46,40` 和 `e2564a`）。

### 2. 换字体

1. 把新的 woff2 放进 `vendor/fonts/`
2. 改 `css/fonts.css` 的 `src: url(...)`
3. 改 `:root` 里对应的 `--f-title` / `--f-label` / `--f-body`

### 3. 改卡片比例（黄金比例 1.618:1）

```css
.gcard { aspect-ratio: 1.618 / 1; }
```
改这一行即可，卡片宽度由 `.choose-row` 的 `flex` 决定。

### 4. 改摄像头小窗大小

```css
.cam { width: clamp(9rem, 25vmin, 20rem); }
```
三个值分别是：最小宽 / 视口比例 / 最大宽。`.cam-body { aspect-ratio: 4/3 }` 决定高。

### 5. 让某个元素在竖屏下隐藏

加到文件末尾的 `@media (max-aspect-ratio: 1/1)` 块里，别新开断点。

---

## 九、`css/fonts.css`

只有 6 行，5 条 `@font-face`：

```css
@font-face{font-family:'PiyingBrush'; … src:url('../vendor/fonts/PiyingBrush-400.woff2') format('woff2');}
@font-face{font-family:'PiyingHei';   …}
@font-face{font-family:'PiyingTitle'; …}
@font-face{font-family:'PiyingSong';  … 400}
@font-face{font-family:'PiyingSong';  … 700}
```

这 5 个文件是**按需子集化**的（只保留页面用到的字），由 `tools/build_fonts.py` 生成。
**如果新增了页面文案里没出现过的汉字，字会变成"豆腐块"** —— 那时需要重跑 `build_fonts.py` 扩充子集。
`font-display: swap` 保证字体没到时先用系统字体顶上，不阻塞渲染。
