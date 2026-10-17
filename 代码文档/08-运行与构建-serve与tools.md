# 08 · 运行与构建 `serve.py` / `serve.mjs` / `启动.bat` / `tools/`

> 这几个文件**不参与页面运行**，只在"开服务器"和"重建素材"时用到。
> 日常改样式/改文案完全不碰它们。

---

## 一、为什么非要一个本地服务器

浏览器的安全模型对 `file://` 有三条硬限制，本项目**三条全踩**：

| 限制 | 本项目哪里踩到 |
| --- | --- |
| ES Module 的 `import` 被 CORS 拦 | `main.js` 里 `import { Stage } from './stage.js'` |
| `fetch()` 不支持 `file://` | `boot()` 里 `fetch('data/rig.json')` |
| WASM 需要正确的 `Content-Type` | MediaPipe 的 `vision_wasm_internal.wasm` |

`<img>` / `<video>` / `<canvas>` 在 `file://` 下反而正常——所以页面能显示，但"动不起来"。

**结论：必须走 `http://`。** 这一点无法通过改代码绕过（除非把所有资源 base64 内联，
而本项目 `assets/` 42MB + `vendor/` 27MB，内联后接近 100MB，不现实）。

> `index.html` 里的自动跳转（见 `01` 第三节）就是为这个前提服务的：
> **双击 `index.html` 时，只要服务器在跑，页面会自己换成 `http://127.0.0.1:8848/`。**

---

## 二、`serve.py`（Python 版，56 行）

```bash
python serve.py          # 默认 8848
python serve.py 9000     # 指定端口
```

### 关键实现

```python
mimetypes.add_type("text/javascript", ".mjs")   # ← 不注册的话 ES Module 会被当 octet-stream，直接报错
mimetypes.add_type("application/wasm", ".wasm") # ← WASM 必须是这个 MIME
mimetypes.add_type("font/woff2", ".woff2")

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")             # 改完刷新就生效，不用强刷
        self.send_header("Access-Control-Allow-Origin", "*")      # 让 file:// 页面能探测本服务
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "credentialless")
```

| 响应头 | 作用 |
| --- | --- |
| `Cache-Control: no-store` | **开发期必开**。否则改完 CSS 刷新没反应，会以为是代码没生效 |
| `Access-Control-Allow-Origin: *` | 让 `file://` 页面的探针请求能通过（虽然探针用的是 `<img>`，不强制要求，但加上更稳） |
| `COOP: same-origin` + `COEP: credentialless` | MediaPipe 某些版本在多线程 WASM 下需要跨源隔离；`credentialless` 比 `require-corp` 宽松，不会拦掉本地图片 |

启动后自动 `webbrowser.open(url)`。`Ctrl+C` 停止。

> `log_message` 被重写成空函数 —— 关掉了每条请求的日志，控制台只留启动横幅。

---

## 三、`serve.mjs`（Node 版，58 行）

```bash
node serve.mjs           # 默认 8848
node serve.mjs 9000
```

功能与 `serve.py` 等价，差异：

- 用 `MIME` 字典手动映射扩展名（`.task` 给 `application/octet-stream`，这是 MediaPipe 模型文件）；
- 有路径穿越防护：`if (!file.startsWith(ROOT)) { 403 }`；
- 用 `spawn(cmd, …, {detached:true})` 跨平台打开浏览器（win: `cmd /c start`，mac: `open`，linux: `xdg-open`）。

> **两个服务器任选一个即可**，不要同时启动（端口冲突）。
> `启动.bat` 会优先找 Python，找不到才用 Node。

---

## 四、`启动.bat`（Windows 一键启动）

### ⚠️ 两个硬性约束

1. **必须存为 GBK 编码 + CRLF 换行**。`cmd.exe` 按系统 ANSI 代码页解析批处理，
   存成 UTF-8 会让中文变成乱码，甚至让脚本自身解析失败（`goto` 标签找不到）。
2. **不要加 `chcp 65001`**。加了反而会让 `%errorlevel%` 判断在某些系统上失效。

改这个文件请用支持"另存为 GBK"的编辑器，或者用 Python 脚本写：

```python
open("启动.bat", "w", encoding="gbk", newline="\r\n").write(text)
```

### 执行流程

```
双击 启动.bat
  │
  ├─ cd /d "%~dp0"                    切到脚本所在目录（关键：从别的目录双击也能跑）
  ├─ set PORT=8848
  │
  ├─ PowerShell 探测 127.0.0.1:8848 是否已在监听
  │     ├─ 是 → :ALREADY  直接 start 浏览器打开，提示"关闭窗口不会停止服务"
  │     └─ 否 → 继续
  │
  ├─ 依次探测 Python（**必须真的能执行**，不是只判断文件存在）
  │     %LOCALAPPDATA%\Programs\Python\Python313/312/311\python.exe
  │     C:\Python313/312/311\python.exe
  │     %USERPROFILE%\.workbuddy-ai\binaries\python\envs\default\Scripts\python.exe
  │     python -c "import sys"   ← 排除"应用商店占位符"（文件存在但一执行就跳商店）
  │     py -3 -c "import sys"
  │     └─ 找到 → :RUNPY    %PY% serve.py %PORT%
  │
  ├─ 探测 node -v  → :RUNNODE   node serve.mjs %PORT%
  │
  └─ 都没有 → 打印安装指引（含"不要直接双击 index.html"的提醒）后 pause 退出
```

**"应用商店占位符"是什么**：Windows 10/11 自带的 `python.exe` 存根，
`where python` 能找到、文件也存在，但执行时会弹出 Microsoft Store。
所以脚本用 `python -c "import sys"` 的返回值来判断，而不是 `if exist`。

### 修改要点

| 想改 | 改哪 |
| --- | --- |
| 默认端口 | `set PORT=8848`（同时要改 `index.html` 里 `AUTO.port`） |
| 加新的 Python 路径 | 在 `:RUNPY` 之前插一行 `if exist "…\python.exe" set "PY=…"` |
| 启动后不自动开浏览器 | 删掉 `serve.py` 里的 `webbrowser.open(url)` |

---

## 五、`tools/build_assets.py`（素材预处理，约 340 行）

**这是"从原始素材到可运行资源"的唯一入口。** 日常不需要跑，只在换素材时跑。

```bash
pip install numpy pillow scipy
python tools/build_assets.py
```

### 它做三件事

#### 1. 抠底 `cutout()`

不是简单的"按颜色删背景"，而是**边界连通洪泛**：

```
① 取图像四边像素的中位数作为"背景色" bg
② 按背景亮度自动选模式：
     bg_lum > 195 → 'light'（浅底，阈值收紧：tight=9, loose=30, grow=2）
     bg_lum < 70  → 'dark' （深底，阈值放宽：tight=14, loose=58, grow=5）
     其他         → None   （背景复杂，放弃抠图，alpha 全 255）
③ 从四边出发，只标记"与背景色相近 且 与边界连通"的区域
④ 受限测地膨胀 grow 次（只向 loose 阈值内的像素扩散）—— 防止啃掉皮影本体
⑤ 额外删除"被人物包围的纯背景空隙"（手臂与躯干之间那种），
   要求：面积 > 0.22% 且 矩形填充率 > 42% 且 短边 > 1.2% 画面
⑥ alpha 高斯模糊 0.85，边缘柔化
⑦ 背景色去污染：(a - (1-α)·bg) / α  —— 消除半透明边缘的"白边/绿边"
⑧ 按 alpha > 12 裁切到内容包围盒
```

**为什么不能用"删掉所有接近背景色的像素"**：皮影本身有大片黑色镂空轮廓和暗部纹样，
粗暴抠会把这些"洞"也删掉，人物就散架了。**只删"与画面边缘连通"的区域**才能保住内部结构。

#### 2. 骨架提取 `extract_rig()`

```
① 取 alpha 通道作为剪影 mask
② torso_profile()：逐行求"包含主轴的中心段"，得到躯干主轴的 x 中心随 y 的变化
③ 由此定位 neck_y（颈部收窄处）、shoulder_y、hip_y
④ row_segments()：逐行求左右分段，用来找双腿分叉点 crotch_y
⑤ 手：左右极值点（最左/最右的剪影像素，取该行中心）
⑥ 脚：底部左右两簇的中心
⑦ 肘/膝：肩-手、胯-脚 连线的 52% 处
⑧ 归一化：坐标除以 w / h，保留 4 位小数
```

输出 15 个关节（`root neck head shL shR elL elR handL handR hipL hipR knL knR footL footR`）。

> **自动提取对"张臂站立、双腿分开"的姿势最准。**
> 坐姿、持械、大披风遮挡时关节会偏，需要手工改 `data/rig.json`
> （改完跑 `python tools/preview_rig.py` 生成核对图看效果）。

#### 3. 资源落盘 + 写 `rig.json`

| 输入 | 输出 |
| --- | --- |
| `故事/<角色>.jpg` | `assets/chars/<角色>.png`（透明） |
| `故事/<剧目>背景.jpg` | `assets/stories/<剧目>.jpg`（quality 90） |
| `自定义人物/*.jpg` | `assets/chars/c01..c10.png` |
| `自定义背景/*.jpg` | `assets/bgs/b01..b10.jpg` |
| `页面背景.jpg` | `assets/bg/page-bg.jpg` |

编号规则：**`sorted(glob(...))` 的字典序**。
⚠️ 注意中文文件名排序：`背景 (9).jpg` 会排在 `背景(3).jpg` **之前**（因为空格字符码更小）。
换素材时如果编号错位，就是这个原因。

`STORY_CHARS` / `STORY_BG` 两个字典是**剧目 → 角色 / 背景文件名**的映射，加新剧目要在这里登记。

---

## 六、`tools/build_fonts.py`（字体子集化）

```bash
python tools/build_fonts.py
```

从 `tools/fontsrc/` 里的源字体，按页面实际用到的字符做子集，输出：

- `vendor/fonts/PiyingBrush-400.woff2`（Ma Shan Zheng）
- `vendor/fonts/PiyingHei-400.woff2`（ZCOOL QingKe HuangYou）
- `vendor/fonts/PiyingTitle-400.woff2`（ZCOOL XiaoWei）
- `vendor/fonts/PiyingSong-400.woff2` / `-700.woff2`（Noto Serif SC）
- 同时重写 `css/fonts.css`

源字体的下载地址写在脚本头注释里（都是 SIL OFL 开源许可）。
**`tools/fontsrc/` 目录默认不存在**，需要自己建并放字体。

### 什么时候必须重跑

新增文案里出现了**当前子集没包含的汉字** → 标题显示成方块。
最保险的做法是：改完所有文案后重跑一次。

---

## 七、`tools/preview_rig.py`（骨架核对）

```bash
python tools/preview_rig.py
```

把 `data/rig.json` 里的骨架叠加到人物图上，输出核对图到 `.workbuddy-ai/tmp/`。

**排查"第四幕动作奇怪"时第一件该做的事**：先看骨架对不对，再看手势映射。
骨架歪了，怎么调 `gain` 都没用。

---

## 八、常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| 改了 CSS 刷新没变化 | 用了别的服务器（没发 `no-store`）→ 用 `启动.bat` / `serve.py`，或 `Ctrl+F5` |
| `python serve.py` 报 `ModuleNotFoundError` | 用了只装了 pip 的裸解释器 → 换系统 Python，或用 `serve.mjs` |
| 双击 `启动.bat` 一闪而过 | 说明它走到了"未检测到运行时"分支，但 `pause` 没生效 → 从命令行运行看输出 |
| 端口被占用 | `启动.bat` 会自动检测并直接开浏览器；手工改端口要同步改 `index.html` 的 `AUTO.port` |
| 第四幕没有手部追踪 | 检查 `vendor/mediapipe/wasm/` 是否完整，或看控制台是否有 WASM MIME 报错 |
| 换素材后编号全乱 | `sorted(glob)` 的字典序，中文文件名里的空格/括号会影响顺序 |
