# v0.2.0 正侧视生成素材

本次使用内置 imagegen 图片生成工具，原始 PNG 不裁切、不重绘，直接复制到项目。

| 文件 | 内容 |
| --- | --- |
| `public/assets/side-atlas.png` | 1254×1254 RGBA；侧面人物分件、设施、轮轴、机车 |
| `public/assets/side-landscape.png` | 1536×1024；平视雪山与水平路基 |

图集采用 `src/render/atlas-regions.ts` 中的像素区域直接采样，修正生成图边缘略超出规则格子的情况，避免截掉机车或混入相邻头像。人物左右镜像只影响身体，不翻转姓名；两层同时显示。脚底坐标分别为车内 2、车顶 -1.8，逻辑坐标统一使用横向通道 y=2。

轮轴修正：轮子区域按圆形轮缘中心采样为正方形，使用独立旋转骨骼；圆形轮箍定义接触半径。机车原图分为上部车身、后部踏板和前部汽缸/排障器三个区域，跳过原图中静止的轮子与连杆，由三个独立轮骨骼和随曲柄运动的连杆替代。所有轮心高度统一由轨面 y=3.2 减去半径计算；转角等于显示行驶距离除以半径，与轨枕滚动共用距离，遵守模拟暂停和倍速。

两张新图的无损 base64 分片、字节数和 SHA-256 记录在 `art/packed/manifest.json`，安装时校验并恢复。旧分片保留作历史素材，运行版本只引用新图。

## 图集最终提示（内置工具，透明背景）

Create a production GAME SPRITE ATLAS for a strictly SIDE-VIEW 2D horizontal train colony game. Asset type: stylized-concept sprite sheet, 2048x2048, transparent alpha background. EXACTLY 4 columns x 4 rows of equal square cells, aligned at quarter boundaries. Every sprite fully inside its own cell, centered with 10% transparent padding and no overlap. NO text, labels, borders, grid lines, ground shadows, checkerboard, perspective, isometric or overhead views. Hand-painted clean readable illustrated industrial winter-survival style, muted petrol teal, warm brass, brown wood; high quality sharp silhouette. All objects orthographic SIDE ELEVATION, camera level with them, absolutely no visible top surfaces. Row 1 left to right: (tile0) winter traveler HEAD ONLY in pure right-facing profile, cap goggles, ear and single visible eye; (tile1) torso only in right-facing profile wearing teal winter coat, no arms head or legs; (tile2) detached left ARM with glove straight down, seen from side; (tile3) detached right ARM with glove straight down seen from side. Row2: (tile4) detached left leg and boot seen from side pointing right; (tile5) detached right leg and boot same orientation; (tile6) round side-facing locomotive spoked wheel centered, perfectly circular; (tile7) whole small camp bed with mattress and pillow seen in flat side elevation, bed runs horizontally, NO visible mattress top. Row3: (tile8) coal stove and steaming cooking pot on top, flat side/front elevation no top surface; (tile9) simple workshop table with vise, flat elevation; (tile10) pile of wooden supply crates flat elevation; (tile11) brass radiator flat elevation. Row4: (tile12) seamless flat brown wooden wall square; (tile13) seamless flat muted teal riveted metal panel square; (tile14) an entire steam locomotive in TRUE RIGHT-FACING SIDE PROFILE, long horizontal boiler, cabin left chimney right, three round wheels, no visible front face or top plane; (tile15) raider HEAD ONLY in pure right-facing profile wearing red face scarf. IMPORTANT: usable detached body parts, genuine transparent background between objects. The atlas is an actual game asset, not a concept art scene.

## 背景最终提示（内置工具，不透明）

Use case stylized-concept. Asset type: parallax backdrop for a HORIZONTAL SIDE-SCROLLING 2D train game, wide panoramic landscape 3:2. Hand painted muted winter dieselpunk survival atmosphere. Strict eye-level side-view landscape, a horizontal ground line at 70% of image height, soft pale blue grey sky upper half, distant snowy mountain silhouette and layered pine forest in middle distance, scattered dark firs far behind the railway, snowy embankment across bottom. View looks horizontally ACROSS a winter valley, not downward. All strata run horizontally like a side-scrolling platform game background. Delicate painterly texture, attractive pale ivory sunlight near upper right and muted teal shadows. Leave center foreground clear for a long playable train. NO trains, NO characters, NO railway tracks, NO UI, NO text, NO aerial view, NO bird-eye view, NO oblique overhead perspective, NO paths receding toward horizon. This is a production game background, not a mockup.

---

以下保留 v0.1.x 历史素材记录，不作为当前视角规范。

# 生成素材与骨骼约定

本版使用内置图片生成能力制作两张游戏资产；没有使用外部游戏的角色或场景图片。

## 文件

| 文件 | 用途 |
| --- | --- |
| `public/assets/train-atlas.png` | 4×4 透明图集：人物分件、轮轴、家具、地板、车顶、机车、敌人头像 |
| `public/assets/tundra.png` | 北境背景，作为列车下方的环境画面 |

程序直接按 UV 使用图集区域，不要求每次运行离线裁切图片。源 PNG 保留透明通道。单文件交付包将两张图片以 data URL 嵌入，避免外部素材依赖。

仓库将图片的原始字节无损编码分片保存在 `art/packed/`。`npm ci` / `npm install` 的 postinstall 会自动还原上述 PNG，并核对 SHA-256；也可执行 `npm run assets`。该过程不重新生成或改变图片，没有联网素材依赖。

## 图集索引（从 0 开始）

| 行 | 第 1 格 | 第 2 格 | 第 3 格 | 第 4 格 |
| --- | --- | --- | --- | --- |
| 1 | 人物头部 0 | 躯干 1 | 左臂 2 | 右臂 3 |
| 2 | 左腿 4 | 右腿 5 | 轮轴 6 | 床 7 |
| 3 | 炉灶 8 | 工作台 9 | 储物箱 10 | 供暖器 11 |
| 4 | 地板 12 | 车顶 13 | 机车 14 | 敌人头部 15 |

## 骨骼

人物使用 hips、torso、head、leftArm、rightArm、leftLeg、rightLeg 等 Three.js Bone 节点。分件图片附着于骨骼，行走时左右手脚交替摆动；工作时复用手臂动作；睡眠和阵亡使用整体姿态。轮轴以独立 Bone 旋转。

人物行走相位来自实际移动距离；轮轴角度来自列车行程。模拟暂停时相位停止。当前为刚性分件骨骼，不做柔性网格蒙皮、IK 或布料。

## 图集生成提示

Use case: stylized-concept. Asset type: production 2D game sprite atlas, EXACT 4 by 4 uniform grid, square canvas, transparent background. Primary request: cohesive high quality hand-painted miniature dieselpunk train colony survival game sprites, clear silhouettes, muted petrol teal, warm brass, weathered cream and dark leather, gentle upper-left lighting, slightly overhead three-quarter view (not isometric diamond). Every object fits entirely within its own equal square tile with generous transparent margins; center of each tile exactly at 12.5%,37.5%,62.5%,87.5% of width and height. No grid lines, no captions, no numbers, no shadows extending across tiles. Row 1 left to right: standalone human head wearing dark travel cap with warm face, isolated teal coat torso WITHOUT head arms or legs, detached left sleeve and hand hanging vertically, detached right sleeve and hand hanging vertically. Row 2: detached left trouser leg with boot hanging vertically, detached right trouser leg with boot hanging vertically, a round steel steam train wheel seen directly side-on with brass spokes, a small cot bed seen from overhead with cream pillow and teal blanket. Row 3: small iron cooking stove with glowing amber pot, wooden crafting workbench with vise and tools, stack of two wooden supply crates with tins, compact brass radiator heater. Row 4: square worn wooden floor panel filling center 80% of tile, square riveted teal metal roof panel filling center 80% of tile, short chunky steam locomotive engine with chimney facing RIGHT seen three-quarter overhead, raider head wearing red scarf and goggles. Game-ready isolated assets, crisp illustrated outlines and painted texture, consistent scale within each item type, no text, no logos, no background.

## 背景生成提示

Use case: stylized-concept. Asset type: background environment painting for a 2D train colony survival strategy game called The Wandering Line. Wide horizontal 3:2 composition, very high quality painterly illustrated game landscape, muted desaturated blue-green slate, cream snow, sparse warm russet bushes. View from high overhead at a gentle oblique angle. Vast cold alpine steppe in autumn turning winter, weathered grassy gravel and patches of snow, scattered small dark fir trees and boulders on the outer upper and lower edges, distant faded mountains only in top fifth. The center horizontal half is a broad quiet nearly flat open strip of gravel and tundra with NO objects so a game train can be rendered over it. Subtle old telegraph poles along far side of the strip. Atmospheric hazy cold daylight and painted paper texture, understated and readable, elegant art direction for a detailed miniature survival game. Absolutely no people, no trains, no railroad tracks, no buildings in center, no text, no lettering, no interface. The image is a backdrop used underneath live game objects, not a gameplay screenshot.
