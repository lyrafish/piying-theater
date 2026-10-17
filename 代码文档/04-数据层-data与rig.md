# 04 · 数据层 `js/data.js` 与 `data/rig.json`

> 项目有**两份**数据，职责完全不同，别搞混：
>
> | 文件 | 内容 | 谁在用 |
> | --- | --- | --- |
> | `js/data.js` | 剧目文案、人物/布景的**名称与图片路径** | `main.js`（第三幕 UI） |
> | `data/rig.json` | 每个人物的**15 个关节坐标**（骨架） | `stage.js` → `Puppet`（第四幕渲染） |
>
> 加一个新人物 = **两份都要加**。

---

## 一、`js/data.js`（101 行，纯数据，无 import）

### 1.1 `ROLES` —— 行当标注

```js
export const ROLES = {
  '项羽': '净 · 霸王',
  '虞姬': '旦 · 虞美人',
  '孙悟空': '武生 · 齐天大圣',
  '白骨精': '妖 · 白骨夫人',
  '唐太宗': '生 · 大唐天子',
  '杨贵妃': '旦 · 贵妃',
  '梁山伯': '生 · 书生',
  '祝英台': '旦 · 才女',
  '牛郎': '生 · 耕者',
  '织女': '旦 · 天孙',
};
```

**key 必须与 `rig.json` 里的角色 key 一字不差。** 用途：第三幕戏箱缩略图的 `title` 提示（`项羽 · 净 · 霸王`）。

### 1.2 `STORIES` —— 五段经典剧目

每条记录的字段：

| 字段 | 类型 | 说明 | 用在哪 |
| --- | --- | --- | --- |
| `id` | string | 与 `title` 相同，目前没被读取 | — |
| `title` | string | 剧目名，**也是 `assets/chars/<角色>.png` 之外唯一的中文标识** | tab、题签、第四幕标题 |
| `subtitle` | string | 副标题（八字对仗） | tab 小字、第四幕 meta |
| `tone` | string[] | 行当标签 | 右栏 `.tag-v` |
| `chars` | string[] | 角色名数组，**长度 1~3** | 站位、戏箱、第四幕加载 |
| `bg` | string | 布景图路径 | 舞台底图、戏箱宽缩略图、第四幕背景 |
| `intro` | string | 简介正文（约 100 字） | 右栏 `p.txt` |
| `notes` | string[] | 2 条表演特色 | 右栏 `.chip` |

> `chars` 长度决定站位：1→居中，2→左右，3→左中右（见 `main.js` 的 `POS`）。
> **超过 3 个会走 `|| ['l','c','r']` 兜底，第 4 个人物会叠在右边**。

### 1.3 `CUSTOM_CHARS` —— 10 个自定义皮影人物

```js
{ id: 'c01', name: '素纱幽兰', file: 'assets/chars/c01.png' }
```

| 字段 | 说明 |
| --- | --- |
| `id` | **必须与 `rig.json` 的 `chars` key 一致**（`c01`…`c10`） |
| `name` | 展示名，可随便改（纯文案） |
| `file` | 图片路径，必须与 `rig.json` 里该角色的 `file` 一致 |

### 1.4 `CUSTOM_BGS` —— 10 张自定义布景

```js
{ id: 'b01', name: '云野长天', file: 'assets/bgs/b01.jpg' }
```
布景不需要骨架，只用于展示与第四幕背景。

---

## 二、`data/rig.json`

### 2.1 顶层结构

```jsonc
{
  "chars":       { "<角色key>": { "file": "...", "rig": { …15 个关节… } }, … },  // 20 条，真正被用的
  "stories":     { "<剧目名>": { "chars": [...], "bg": "..." }, … },              // 5 条，历史遗留，未被读取
  "customChars": [ { "id": "c01", "file": "...", "name": "皮影人物 01" }, … ],    // 10 条，未被读取
  "customBgs":   [ { "id": "b01", "file": "...", "name": "皮影布景 01" }, … ]     // 10 条，未被读取
}
```

⚠️ **代码只读 `chars`**。后三个是 `tools/build_assets.py` 顺手写出的产物，改名/删掉都不影响运行。

### 2.2 `chars` 里的单条

```jsonc
"项羽": {
  "file": "assets/chars/项羽.png",
  "rig": {
    "root":  [0.4795, 0.4957],   // 盆骨（躯干骨骼的原点）
    "neck":  [0.4795, 0.1140],   // 颈（躯干骨骼的末端 / 头的支点）
    "head":  [0.4795, 0.0593],   // 头顶
    "shL":   [0.0787, 0.3958],   // 左肩
    "elL":   [0.0378, 0.3940],   // 左肘
    "handL": [0.0000, 0.3923],   // 左手
    "shR":   [0.8803, 0.3958],   // 右肩
    "elR":   [0.9417, 0.4526],   // 右肘
    "handR": [0.9984, 0.5051],   // 右手
    "hipL":  [0.0898, 0.4496],   // 左胯
    "knL":   [ … ],              // 左膝
    "footL": [ … ],              // 左脚
    "hipR":  [ … ],
    "knR":   [ … ],
    "footR": [ … ]
  }
}
```

**坐标系**：相对图片宽高的归一化值，`0~1`，**y 向下**（图片坐标系）。
`Puppet` 构造时 `this.J[k] = [rig[k][0]*W, rig[k][1]*H]` 转成像素。

**左右约定**：`L` / `R` 是**图片自身视角**的左右（即画面左侧 = `L`）。
右侧影人通过 `mirror: true` 整体水平翻转，骨架不需要另做一套。

**15 个关节缺一不可**——`BONES` 表里任何一根骨头的起止点缺失，`solve()` 会直接 NaN，影人消失。

### 2.3 关节与骨骼的对应（`puppet.js` 的 `BONES`）

| 骨骼索引 | 名字 | 起点关节 | 终点关节 | 父骨骼 |
| --- | --- | --- | --- | --- |
| 0 | body | root | neck | — |
| 1 | head | neck | head | 0 |
| 2 | armLu | shL | elL | 0 |
| 3 | armLl | elL | handL | 2 |
| 4 | armRu | shR | elR | 0 |
| 5 | armRl | elR | handR | 4 |
| 6 | legLu | hipL | knL | 0 |
| 7 | legLl | knL | footL | 6 |
| 8 | legRu | hipR | knR | 0 |
| 9 | legRl | knR | footR | 8 |

---

## 三、怎么加一个新人物（完整流程）

假设要加 `c11`（第 11 个自定义皮影）。

### 步骤 1：放原图

把 PNG 放到 `自定义人物/` 里（文件名会决定排序，见 `tools/build_assets.py` 的字典序规则）。

### 步骤 2：跑预处理脚本

```bash
# 需要 numpy / pillow / scipy
python tools/build_assets.py
```

它会：
1. 抠底（保留皮影自身的黑色镂空轮廓）
2. 裁到内容包围盒
3. **自动提取 15 个关节**，写进 `data/rig.json`
4. 输出到 `assets/chars/c11.png`

### 步骤 3：核对骨架

```bash
python tools/preview_rig.py
```
生成一张叠加了骨架线的核对图（在 `.workbuddy-ai/tmp/` 下）。
**自动提取对"张开双臂、双腿分开"的站姿最准**；如果人物是坐姿、持械、披风遮挡，关节会偏，需要手工调 `rig.json`。

### 步骤 4：登记到 `js/data.js`

```js
export const CUSTOM_CHARS = [
  …
  { id: 'c11', name: '你起的名字', file: 'assets/chars/c11.png' },
];
```

### 步骤 5（可选）：加进预载

`main.js` 的 `boot()` 里：
```js
...CUSTOM_CHARS.slice(0, 6).map(c => c.file),   // 只预载前 6 个
```
如果希望它也预载，把 `6` 调大。

---

## 四、怎么加一段新剧目

只需改 `js/data.js` 的 `STORIES`，**前提是角色已存在**。

```js
{
  id: '白蛇传',
  title: '白蛇传',
  subtitle: '断桥相会 · 水漫金山',
  tone: ['旦', '生'],
  chars: ['白素贞', '许仙'],                       // ← 必须已在 rig.json 的 chars 里
  bg: 'assets/stories/白蛇传.jpg',                 // ← 图片要先放好
  intro: '……（约 100 字，注意与既有五段文风统一）',
  notes: ['水袖功 · 断桥步', '伞影翻转 · 水幕灯影'],
}
```

同时把布景图放到 `assets/stories/白蛇传.jpg`。
tab 会自动多出一个，`POS` 会自动按 2 人排左右。

> 如果 `chars` 里的名字在 `rig.json` 中不存在，第四幕会出现"只有一个人"甚至黑屏（`Stage.enter` 里 `if (!info) return null` 会跳过）。

---

## 五、改文案时注意

1. **字体会掉字**。`vendor/fonts/*.woff2` 是**按现有文案子集化**的。
   如果新文案里有没出现过的汉字，标题/标签位置会显示成方块。
   解决：`python tools/build_fonts.py` 重新子集化（需要 `tools/fontsrc/` 里的源字体）。
   正文用的 `PiyingSong` 子集较大，一般不容易缺字；**标题用的 `PiyingBrush` 最容易缺**。

2. **字数会影响布局**。
   `subtitle` 建议保持 8 字（`垓下悲歌 · 末路情深`），`notes` 建议每条 8~12 字。
   超长会把 `.tb-item` 撑开，五个 tab 挤在一起。

3. **`intro` 不要用 `<br>`**。它是直接塞进 `<p class="txt">` 的，靠 CSS `text-indent: 2em` 排版。
   如果确实要换行，用 `<br>` 也能生效（因为是 `innerHTML` 注入），但会破坏"两端对齐 + 首行缩进"的观感。
