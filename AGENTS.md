# AGENTS.md · 皮影剧场

> 给 AI 编辑器（Trae / Cursor / Claude Code / Copilot）的工程说明。
> 人类读者请先看 `README.md`，需要改代码细节时看 `代码文档/`，想通读全部源码双击 `代码总览.html`。

---

## 1. 这是什么

中国非物质文化遗产「皮影戏」主题的四幕式互动网页：封面 → 择幕 → 剧目 → 演绎。
第四幕用摄像头捕捉双手，五指各牵一线，实时驱动两个 WebGL 蒙皮皮影。

**纯前端、零依赖、零构建、完全离线。** 没有 npm、没有打包器、没有 CDN。

## 2. 运行

```bash
双击 启动.bat          # Windows 一键（自动探测 Python/Node，打开 http://127.0.0.1:8848/）
python serve.py        # 或
node serve.mjs
```

**必须经本地服务器**（`http://`），不能双击 `index.html`（`file://` 会禁用 ES Module / WASM / fetch）。
`index.html` 里已内置自动跳转：`file://` 下探测到 8848 有服务就自动跳过去。

## 3. 目录与职责

| 路径 | 职责 |
| --- | --- |
| `index.html` | 四幕 DOM 骨架 + 运行环境自检（`<head>` 内联脚本） |
| `css/style.css` | 全部样式；顶部 `:root` 是唯一设计系统入口 |
| `css/fonts.css` | 5 条本地 `@font-face` |
| `js/main.js` | 入口：翻幕、第三幕渲染、第四幕配置、启动 |
| `js/data.js` | 剧目/人物/布景的文案与路径 |
| `js/stage.js` | 第四幕编排：布局、手势→关节映射、提线、HUD |
| `js/puppet.js` | WebGL 线性混合蒙皮 + 双骨 IK |
| `js/hand.js` | MediaPipe HandLandmarker 封装 |
| `data/rig.json` | 20 个人物的 15 个关节归一化坐标 |
| `assets/` | 构建产物（抠好的 png / 布景 jpg），**页面只加载这里** |
| `vendor/` | MediaPipe 运行时与字体，**不要修改** |
| `tools/` | 构建脚本（素材预处理 / 字体子集 / 代码总览生成） |
| `代码文档/` | 每个模块的详细说明 + 修改配方 |

## 4. 硬性约束（改代码前必须遵守）

1. **不引入任何 npm 包、CDN、打包器、框架。** 加一行 `import` 就意味着破坏"双击即用"。
2. **样式用 `rem` / `em` / `vmin` / `%`，不要用 `px`。** 全站靠 `html { font-size: clamp(...) }` 等比缩放。
3. **颜色优先用 `:root` 变量**（`--cinnabar` `--gold` `--paper` …）。例外：Canvas 2D 里绘制的颜色（`stage.js` 的提线、`hand.js` 的线框）是硬编码的，换色时要单独改。
4. **`启动.bat` 必须保持 GBK 编码 + CRLF 换行**，且不要加 `chcp 65001`。用 UTF-8 保存会让它自身崩解。
5. **`index.html` 里 `window.__piyingBooted = true` 不能删**（`main.js` 第 8 行）。它是"模块成功加载"的信号，删了会导致提示浮层在正常环境下也弹出。
6. **不要动 `vendor/mediapipe/`**。模型与 wasm 的路径被 `hand.js` 硬编码引用。
7. **改 `assets/` 里的图，必须同步 `data/rig.json`**（骨架坐标是按图片尺寸归一化的）。

## 5. 关键接口（改内部实现可以，改签名要同步调用方）

```js
// puppet.js
new Puppet(gl, prog, loc, img, rig, { mirror, side, warm, alpha })
puppet.ctrl[key]      // key ∈ head | handL | handR | footL | footR（图像像素坐标）
puppet.ctrlRest[key]  // 静止位（只读）
puppet.bodyOff[2] / puppet.bodySway
puppet.solve(dt) / puppet.draw(rect, canvasW, canvasH) / puppet.jointPos(key) / puppet.dispose()

// hand.js
new HandTracker({ video, canvas })
tracker.start() → Promise<boolean>;  tracker.hands / status / message / fps
TIPS = {thumb:4, index:8, middle:12, ring:16, pinky:20};  PALM = 9
```

`rig.json` 的关节键：`root neck head shL shR elL elR handL handR hipL hipR knL knR footL footR`（15 个，缺一不可）。

骨骼索引（`puppet.js` 的 `BONES`，**顺序不可变**）：
`0 body, 1 head, 2 armLu, 3 armLl, 4 armRu, 5 armRl, 6 legLu, 7 legLl, 8 legRu, 9 legRl`

## 6. 常见改动的入口

| 需求 | 去哪 |
| --- | --- |
| 改配色/字体 | `css/style.css` 的 `:root`（+ Canvas 里的硬编码色） |
| 改剧目文案 | `js/data.js` 的 `STORIES` |
| 加人物 | 跑 `tools/build_assets.py` → 登记 `js/data.js` |
| 改手势映射 | `js/stage.js` 的 `FINGER_FOR` |
| 调手感（幅度/抖动/延迟） | `js/stage.js` 的 `_applyHands()`（`gain` / `dead` / `r`） |
| 调肢体柔度 | `js/puppet.js` 的 `SIGMA` |
| 改影人大小/间距 | `js/stage.js` 的 `_layout()` |
| 改摄像头参数 | `js/hand.js` 的 `start()` |

完整配方见 `代码文档/10-常见修改指南.md`。

## 7. 编码风格

- 中文注释，注释说明"为什么"而不是"是什么"。
- 2 空格缩进；JS 用 `const`/`let`，不用 `var`（`index.html` 内联脚本除外，那里为了兼容老浏览器用了 `var`）。
- 模块只导出必要的符号；`main.js` 里用 `$` / `$$` 做选择器简写。
- 新函数尽量短，超过 60 行考虑拆分。

## 8. 交付要求

改完之后请说明：

1. 改了哪个文件、哪个函数；
2. 影响了哪一幕、哪些元素；
3. 有没有需要同步改的地方（如 CSS 变量、Canvas 硬编码色、`rig.json`）；
4. 是否需要在浏览器里强制刷新（`serve.py` 发了 `no-store`，一般普通刷新即可）。
