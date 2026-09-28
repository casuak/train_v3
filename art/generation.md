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
