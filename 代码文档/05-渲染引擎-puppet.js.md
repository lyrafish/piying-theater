# 05 · 渲染引擎 `js/puppet.js`

> 369 行。**整个项目技术含量最高的一个文件**：把一张静态 PNG 变成能被 5 根手指牵动的皮影。
> 用的是 **WebGL 1 + 线性混合蒙皮（LBS）+ 双骨 IK**，没有引入任何第三方 3D 库。

---

## 一、它到底做了什么（一句话版）

> 把人物 PNG 切成一张 **96×72 的三角网格**，给每个顶点按"离哪根骨头近"分配 10 根骨骼的权重；
> 每帧根据 5 个控制点用 IK 算出 10 根骨骼的变换矩阵，交给**顶点着色器**一次性把整张图"揉"成新姿势。

因为变形发生在 GPU 的顶点着色器里，所以：
- 一张 1000×1500 的图，每帧只有一次 `drawElements`；
- 肢体转折处是**平滑过渡**的，不会像"分块贴图"那样出现硬接缝。

---

## 二、行号地图

| 行 | 内容 |
| --- | --- |
| 7~32 | 顶点着色器 `VS`（LBS 核心） |
| 34~48 | 片元着色器 `FS`（透明裁切 + 暖色调 + 边缘透光） |
| 51~64 | 3×3 矩阵工具：`matMul` `matTrans` `matRot` `boneMatrix` `applyM` `clamp` `wrapPi` |
| 67~78 | `BONES` 骨骼定义表（10 根） |
| 79 | `SIGMA` 权重半径（10 个） |
| 81~88 | `distSeg` 点到线段距离 |
| 93~141 | `class Puppet` 构造函数 |
| 143~148 | `_bendSign` 判定肘/膝的弯曲方向 |
| 150~209 | `_buildMesh` 生成网格与蒙皮权重 |
| 212~229 | `_ik` 双骨 IK |
| 231~274 | `solve` 每帧解算 |
| 277~285 | `jointPos` 取关节屏幕位置 |
| 287~319 | `draw` 提交绘制 |
| 321~326 | `dispose` 释放显存 |
| 332~359 | `createGL` 建上下文 + 编译着色器 |
| 361~369 | `loadImage` Promise 包装 |

---

## 三、着色器

### 3.1 顶点着色器（LBS）

```glsl
attribute vec2 a_pos;   // 静止姿态下的图像像素坐标（y 向下）
attribute vec2 a_uv;
attribute vec4 a_wA;    // 骨骼 0..3 的权重
attribute vec4 a_wB;    // 骨骼 4..7
attribute vec4 a_wC;    // 骨骼 8..9（只用 xy）

uniform mat3 u_bones[10];   // 10 根骨骼的 3×3 仿射矩阵
uniform vec2 u_scale;       // 图像像素 → NDC 的缩放（含镜像符号）
uniform vec2 u_offset;      // 图像像素 → NDC 的平移

void main() {
  vec3 p = vec3(a_pos, 1.0);
  vec3 acc =
      a_wA.x * (u_bones[0] * p) + a_wA.y * (u_bones[1] * p) + … ;
  v_uv = a_uv;
  gl_Position = vec4(acc.x * u_scale.x + u_offset.x,
                     acc.y * u_scale.y + u_offset.y, 0.0, 1.0);
}
```

**这就是 LBS 的全部**：一个顶点的新位置 = 10 根骨骼各自变换后的位置，按权重加权平均。

### 3.2 片元着色器

```glsl
vec4 c = texture2D(u_tex, v_uv);
if (c.a < 0.02) discard;                       // 抠掉透明边，避免黑边
vec3 warm = vec3(1.07, 0.98, 0.85);            // 暖色系数
vec3 rgb = mix(c.rgb, c.rgb * warm, u_warm);   // 按 u_warm 混合暖色
rgb += u_warm * 0.05 * (1.0 - c.a) * vec3(1.0, .9, .68);   // 边缘透光（模拟皮子薄处透灯）
gl_FragColor = vec4(rgb, c.a * u_alpha);
```

`(1.0 - c.a)` 这一项让**半透明边缘**（皮影的镂空边）额外提亮一点，产生"透光"感。
想更"灯下透亮"就调大这个 `0.05`；想更"实"就调小。

---

## 四、骨骼与权重

### 4.1 `BONES` 表（索引**固定**，不要重排）

```js
const BONES = [
  { k:'body',  p:'root', t:'neck',  parent:-1 },  // 0
  { k:'head',  p:'neck', t:'head',  parent: 0 },  // 1
  { k:'armLu', p:'shL',  t:'elL',   parent: 0 },  // 2
  { k:'armLl', p:'elL',  t:'handL', parent: 2 },  // 3
  { k:'armRu', p:'shR',  t:'elR',   parent: 0 },  // 4
  { k:'armRl', p:'elR',  t:'handR', parent: 4 },  // 5
  { k:'legLu', p:'hipL', t:'knL',   parent: 0 },  // 6
  { k:'legLl', p:'knL',  t:'footL', parent: 6 },  // 7
  { k:'legRu', p:'hipR', t:'knR',   parent: 0 },  // 8
  { k:'legRl', p:'knR',  t:'footR', parent: 8 },  // 9
];
```

> 索引被硬编码在 `solve()` 的 `limb(…, 2, 3)` 和 `jointPos()` 的 `tipBone` 映射里。
> **插入一根新骨骼要同时改这两处，否则会错位。**

### 4.2 `SIGMA` —— 权重半径（**调"肉感"的旋钮**）

```js
const SIGMA = [0.60, 0.150, 0.135, 0.125, 0.135, 0.125, 0.165, 0.150, 0.165, 0.150];
//             躯干    头    左上臂  左小臂  右上臂  右小臂  左大腿  左小腿  右大腿  右小腿
```

含义：顶点到该骨段的距离除以 `SIGMA[i] * H` 后，取 `exp(-r²)` 作为权重。

| 现象 | 调法 |
| --- | --- |
| 手臂一动，半边身子跟着扯 | **减小**对应骨的 SIGMA |
| 手臂弯折处"断开"、有裂缝 | **增大**对应骨的 SIGMA |
| 躯干太"软"，整个人像果冻 | 减小 `SIGMA[0]`（0.60 已经很大，是刻意的：让躯干主导大部分像素） |
| 头发/披风被头骨拽得乱飞 | 减小 `SIGMA[1]`（头） |

> `SIGMA[0] = 0.60` 是躯干，故意给得很大，让画面里"没有明确归属"的像素（披风、背景装饰）都跟着躯干走，整体才不会散。

### 4.3 网格精度

```js
const NX = Math.min(72, Math.max(24, Math.round(this.W / 24)));   // 横向格数
const NY = Math.min(96, Math.max(32, Math.round(this.H / 24)));   // 纵向格数
```

- 1000px 宽的图 → `NX = 42`；1500px 高 → `NY = 62`。
- 上限 72×96 = 6912 顶点，约 13k 三角形，对 GPU 完全无压力。
- **调大**：边缘更圆润，但权重计算（一次性，构造时）更慢。
- **调小**：极端姿势下会出现多边形棱角。

---

## 五、IK（反向动力学）

### 5.1 问题

给定"手应该在哪"（控制点 `T`），求"肩转多少度、肘转多少度"。

### 5.2 解法（余弦定理，`_ik`）

```js
// L1 = 上臂长，L2 = 小臂长，d = 肩到目标的距离
d = clamp(d, |L1-L2|*1.03, (L1+L2)*0.995);   // 够不到就伸直，太近就弯曲到底

const cosA = (L1² + d² - L2²) / (2·L1·d);    // 余弦定理求肩角
const A = acos(clamp(cosA, -1, 1));

const a1 = base + bend * A;                  // 上臂方向（bend 决定肘朝哪边弯）
const ex = S.x + L1·cos(a1), ey = S.y + L1·sin(a1);   // 肘的位置
const a2 = atan2(T.y-ey, T.x-ex);            // 小臂方向（直接指向目标）

thU = wrapPi(a1 - rest[iU]);                 // 上臂相对静止姿态的旋转
thL = wrapPi(a2 - rest[iL]) - thU;           // 小臂相对上臂的旋转（局部角）
```

**`bend` 从哪来**：`_bendSign()` 在构造时根据静止姿态里"肘在肩-手连线的哪一侧"自动判定，
所以左手肘朝外、右手肘朝内都能正确。**改人物骨架后不需要手动调这个。**

`dmax = (L1+L2)*0.995` 留了 0.5% 余量，防止 `acos` 因浮点误差炸成 NaN。

---

## 六、`solve(dt)` 每帧解算流程

```
1. 控制点平滑
   k = 1 - pow(0.0009, dt)          // 与帧率无关的指数平滑，1 秒内收敛 99.9%
   smooth[i] += (ctrl[i] - smooth[i]) * k

2. 建躯干矩阵
   M[0] = boneMatrix(root, bodySway, bodyOff)

3. 头
   T = toLocal(smooth.head)          // 先把控制点变换到躯干局部系
   a = clamp(atan2(T-neck) - rest[1], -0.6, 0.6)      // 限幅 ±34°
   hx/hy = clamp(head - ctrlRest.head, ±0.062H / ±0.055H)   // 头部平移限幅
   M[1] = M[0] · boneMatrix(neck, a, hx, hy)

4. 四肢（左臂、右臂、左腿、右腿，各一次）
   limb(肩, 肘, 手, ctrlKey, bend, iU, iL):
     T = toLocal(smooth[ctrlKey])
     [thU, thL, ex, ey] = _ik(...)
     M[iU] = M[0] · boneMatrix(肩, thU)
     M[iL] = M[iU] · boneMatrix(肘, thL)      // ← 注意是乘在 M[iU] 上（父子链）

5. this.pose = M
```

**为什么头/肢都要先 `toLocal`**：`ctrl` 是屏幕空间的控制点，而 IK 要在"躯干未旋转时的局部坐标系"里算。
`toLocal()` 把控制点先减掉 `bodyOff`、再反向旋转 `bodySway`，这样"整体摆动"和"肢体动作"就解耦了。

---

## 七、`draw(rect, canvasW, canvasH)`

### 7.1 图像像素 → NDC

```js
const sx = (rect.w / this.W) * 2 / canvasW * (this.mirror ? -1 : 1);
const sy = -(rect.h / this.H) * 2 / canvasH;              // ← 必须为负！
const ox = (this.mirror ? rect.x + rect.w : rect.x) * 2 / canvasW - 1;
const oy = 1 - rect.y * 2 / canvasH;
```

- 图像 y 向下，NDC y 向上 → **`sy` 必须取负**，否则影人上下颠倒。
- 镜像时 `sx` 取负，同时 `ox` 用 `rect.x + rect.w`（从右边缘开始往左铺）。
- `oy = 1 - rect.y*2/H` 是把"矩形顶边的 y"换算成 NDC 的顶边。

### 7.2 矩阵上传（**行主序 → 列主序**）

```js
for (let i = 0; i < 10; i++) {
  const m = this.pose[i];
  bb[i*9+0]=m[0]; bb[i*9+1]=m[3]; bb[i*9+2]=m[6];
  bb[i*9+3]=m[1]; bb[i*9+4]=m[4]; bb[i*9+5]=m[7];
  bb[i*9+6]=m[2]; bb[i*9+7]=m[5]; bb[i*9+8]=m[8];
}
```

内部矩阵是**行主序**（`[m00,m01,m02, m10,m11,m12, m20,m21,m22]`），
而 `uniformMatrix3fv` 期望**列主序**，所以这里做了一次转置。
**删掉这段转置，影人会完全乱掉。**

### 7.3 GL 状态（`createGL`）

```js
gl.clearColor(0, 0, 0, 0);       // 透明底，让底下 .sbg 透出来
gl.disable(gl.DEPTH_TEST);       // 2D 平面，不需要深度
gl.disable(gl.CULL_FACE);        // 镜像后三角形绕序会反，不能剔除
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
```

`premultipliedAlpha: false` + 上面这个 blendFunc 是配套的，**改成 `true` 会导致边缘发黑**。

---

## 八、`jointPos(key)` —— 提线的锚点

```js
const tipBone = { head:1, handL:3, handR:5, footL:7, footR:9, elL:3, elR:5, knL:7, knR:9 };
```

给定关节名，用**该关节所属骨骼的矩阵**把静止坐标变换到当前位置。
`stage.js` 的 `_drawFx()` 就是靠它算提线终点的。

> 注意 `elL` 映射到骨骼 3（小臂），因为肘是"小臂的起点"——它跟着小臂矩阵走才对。

---

## 九、常见改动

### 1. 让影人更暖 / 更透

| 目标 | 改哪 |
| --- | --- |
| 更暖 | `stage.js` `enter()` 里 `warm: 0.40` → 调大（0~1） |
| 更透 | 同上加 `alpha: 0.9` |
| 边缘透光更强 | `FS` 里 `0.05` 调大 |

### 2. 让动作更"跟手"（减少延迟）

```js
const k = 1 - Math.pow(0.0009, Math.min(dt, 0.05));
```
`0.0009` 越小 → 越快跟上（但越抖）。建议范围 `0.0001 ~ 0.02`。

### 3. 让头部转动幅度更大

```js
a = clamp(a, -0.6, 0.6);      // 弧度，0.6 ≈ 34°
```
改到 `0.9` 就是 ±51°，但皮影的脖子处会开始明显拉伸。

### 4. 加一根骨骼（例如"披风"）

1. `rig.json` 里加两个关节（如 `capeA` `capeB`）
2. `BONES` 追加 `{ k:'cape', p:'capeA', t:'capeB', parent: 0 }`（索引变成 10）
3. `SIGMA` 追加一个值
4. 着色器 `u_bones[10]` → `u_bones[11]`，`a_wC` 的 `z` 分量启用
5. `_buildMesh` 里 `new Array(10)` → `11`，`wC[id*4+2]` 填权重
6. `boneBuf` 长度 `90` → `99`
7. `draw()` 的循环 `i < 10` → `11`

⚠️ 这是一个"牵一发动全身"的改动，**除非确有必要，建议用现有 10 骨近似**。

### 5. 性能不够（低端设备掉帧）

优先调小网格：

```js
const NX = Math.min(48, Math.max(20, Math.round(this.W / 32)));
const NY = Math.min(64, Math.max(28, Math.round(this.H / 32)));
```

其次是 `stage.js` 里 `Math.min(2, devicePixelRatio)` 改成 `1.5`。

---

## 十、调试技巧

| 现象 | 最可能的原因 |
| --- | --- |
| 影人完全不出现 | `rig.json` 缺关节 → `NaN`；或 `glCtx` 为 null（WebGL 不可用） |
| 影人上下颠倒 | `draw()` 里 `sy` 忘了取负 |
| 影人左右反了 | `mirror` 传错；或 `sx` 少乘了 `mirrorSign` |
| 影人整体偏出画面 | `_layout()` 的 `rect` 算错；或 `oy` 公式写错 |
| 手臂弯折处有裂缝 | 该骨的 `SIGMA` 太小 |
| 整个人像果冻 | `SIGMA[0]` 太小，或 `solve` 的平滑系数太小 |
| 只有一半身体动 | `a_wA/a_wB` 权重写错（`_buildMesh` 里索引对不上） |
| 边缘发黑 | `premultipliedAlpha` 与 `blendFunc` 不配套 |
