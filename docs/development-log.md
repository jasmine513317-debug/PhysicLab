# Development log

## 2026-11-21 · MVP implementation and validation

| Work | Files and outcome |
| --- | --- |
| Environment | Inspected the empty workspace, initialized Git, and verified Node 24.22.3. Used the bundled pnpm to download dependencies and bootstrapped the npm CLI to verify a clean install and the requested npm scripts. |
| Engine | Inspected the installed Planck 1.5.1 API and passed the independent free-fall and distance-joint smoke test. Implemented the SI world, validation, fixed-step scheduler, sampling, and force tracking in `src/model.ts`, `src/physics.ts`, and `src/analysis.ts`. |
| Editor and workflow | Added overview, library and lab routes, five templates, Canvas2D tools and rendering, validated inspector, Recharts analysis, CSV export, scene JSON, and IndexedDB persistence. Built and inspected desktop and phone layouts. |
| Validation | Added reference cases for free fall, projectile motion, springs, collisions and friction. The first friction-free run exposed a small numerical contact drift. The final test uses a declared 0.001 m/s tolerance, while higher-friction trials still require measurably more deceleration. Separated Vitest unit discovery from Playwright specs. |
| Handoff | Added the example CSV, user guide, physics and architecture documentation, static hosting instructions, competition outline, and timed script. |

## Final verification

- Clean npm installation, local development server, TypeScript check, and production build completed.
- Planck API smoke test and all 18 Vitest checks passed. The last Node run stepped and recorded 10, 30, and 50 bodies for six simulated seconds in 33 ms, 261 ms, and 345 ms respectively.
- Five Playwright scenarios each passed twice in Microsoft Edge against Vite's production preview. The competition rehearsal increased block friction from 0.1 to 0.9 and confirmed that the higher-friction run had a lower final speed.
- Reviewed the desktop overview and workbench and the 390 px mobile workbench. Adjusted the projectile camera and viewport controls after checking the initial captures.
- Generated the projectile CSV from two seconds of simulation at 15 Hz.

Runtime limits are documented in [Known limitations](known-limitations.md). The deployment artifact is the Vite `dist/` build. Public hosting can be configured using the [deployment instructions](deployment.md).

## 2026-11-21 · 简体中文界面和演示验收

- 首页、实验台、实验库、模板、参数、画布标注、图表、校验和无障碍标签已本地化。新增中文文件名支持，保留已有实验的标题、笔记、数据格式和 SI 单位。
- 查看了 1440 px 桌面首页和实验台、820 px 平板实验台与 390 px 手机实验台，确认页面没有横向溢出。
- 生产构建通过，18 项 Vitest 检查通过，5 个 Edge 端到端场景各通过两轮。
- 使用中文界面完成两轮斜面摩擦对比彩排。把滑块摩擦系数从 0.1 调到 0.9 后，同一模拟时段内测得的末速降低。操作步骤见 [中文演示脚本](中文演示脚本.md)。

## 2026-11-21 · Day 2 复验与部署准备

- 接手时，`main` 的最新提交为 `f37b3c4`，前一提交 `7618a72` 已交付实验台、Planck 模拟、数据分析、五个模板和本地实验库。Day 2 的顶部导航、左侧工具栏、中央画布、右侧参数面板和底部数据分析均已实现。原预览地址 `127.0.0.1:42870` 当时未响应，Git 仓库尚未配置远程地址。工作区中已有正在并行开发的回放文件。
- 复验发现，390 px 下两个分析按钮隐藏文字后失去无障碍名称。为「设为基准」和「导出 CSV」补充名称，并将两项检查加入手机端回归用例。
- 新增 `vercel.json` 和 Vercel 部署说明。使用 npm 锁文件和 Vite 生产构建，直接访问或刷新 `/lab` 和 `/experiments` 时加载应用入口。用按该配置运行的本地静态服务器验证了直达链接、模板查询参数和缺失资源的 404。
- TypeScript 和 Vite 生产构建通过，22 项 Vitest 检查和 Planck 冒烟测试通过。Edge 的 5 个工作台场景全部通过，补充断言后的手机端用例也通过。额外验证了 1440、820 和 390 px 下五个区域可访问且页面无横向溢出，以及画布平移、缩放和保存页面刷新。
- 已知限制与下一步。Vite 构建仍有 Zod 注释位置警告，构建成功。Vercel 配置已在本地验证，线上待发布后复验。回放、绘图识别、弹簧初始位移和末速度分量由并行开发继续验收，之后再用最终提交的生产包复跑完整流程。

## 2026-11-21 · 剩余本地功能与跨浏览器验收

- 实验台可记录真实物理采样，支持时间轴、播放和暂停，回放与场景分别保存。数据库升级保留了版本 1 的旧实验。
- 补齐绘图识别和手动改选、弹簧初始位移、末速度分量、可编辑的四条世界边界，以及数据面板高度调整。保留中文版默认排布。
- 优化高负载画布，减少静止时重绘，并降低 40 个及以上物体的画布刷新频率。物理步长保持 60 Hz，采样保持 15 Hz。
- 生产构建、Planck 冒烟测试和 23 项 Vitest 检查通过。Edge、Playwright Firefox 和 WebKit 各通过 11 项生产包端到端场景，包含 50 动态物体和 5 根弹簧、移动触控模拟、回放刷新恢复与斜面摩擦彩排。
- 当前公开发布与原生 Safari、实体触屏设备上的现场验收仍待完成。浏览器行为的覆盖方式见 [验收文档](testing.md)。

## 2026-11-21 · 选择工具和深蓝配色

- 选择工具合并物体拖动与画布平移，工具栏移除独立的平移和删除按钮。右键或触屏长按可高亮目标并显示删除动作，键盘可用 Shift+F10 打开。右键命中物体或弹簧时显示动态虚线，系统启用减少动态效果时使用静态虚线。
- 首页、实验台、实验库、图表和画布换用深蓝底色、冰蓝强调色与冷灰蓝分隔线。检查了 1440 px 桌面和 390 px 手机视图。
- 生产构建与 23 项 Vitest 检查通过。Edge 全量回归通过，另在 Edge、Firefox 和 WebKit 验证了拖动、右键删除、键盘操作及弹簧端点移动。触屏长按由 Edge 的 Chromium 触控模拟验证。

## 2026-11-22 · 重力预设与播放快捷键

- 环境面板新增地球 9.81、月球 1.62、火星 3.71、失重 0 四个重力预设，数值统一定义在 `src/model.ts` 的 `GRAVITY_PRESETS`。预设只填充重力字段，继续复用原有的场景校验、世界重建和「回到初始状态」提示，未改动物理内核。
- 新增播放快捷键：`P` 运行或暂停，`.` 单步推进 1/60 s，`Shift+R` 重置。空格仍保留给画布的按住拖动平移，单独按 `R` 仍是旋转 15°。输入框、下拉框和按钮保持原生键盘行为，运行、单步和重置按钮补充 `aria-keyshortcuts` 与帮助说明。
- 新增 3 项 Vitest 检查（预设通过场景校验、名称与数值唯一、空白实验默认地球重力）和 4 个 Playwright 场景（预设切换并重置模拟、键盘播放与单步、表单控件原生行为、空格不触发运行）。
- 生产构建、26 项 Vitest 检查和 Edge 的 19 个生产包端到端场景全部通过。本机 Playwright 浏览器 CDN 下载无进展，改用已安装的 Edge（`PLAYWRIGHT_CHANNEL=msedge`）完成验收，50 物体压力场景帧间隔 p90 为 8.1 ms。
- 排错记录：键盘用例最初在页面加载后立即按键，此时懒加载的实验台尚未挂载全局监听，按键被遗漏。用例改为先点击画布再发送按键，避免把挂载时序误判为功能缺陷。

## 2026-11-24 · Studio 侧边栏与响应式排版

- 在最新 Studio 2.0 代码上重做应用外壳：左侧固定侧边栏集中主导航、最近实验、三大领域模板和本地存储提示；首页与实验库移除重复的最近实验和模板展示，只保留侧边栏统一入口。实验库与侧边栏共用同一份 IndexedDB 状态，重命名、复制、删除和导入后两侧同步刷新。
- 宽屏使用 260 px 完整侧边栏，901–1199 px 折叠为 78 px 图标栏，900 px 以下改为带遮罩的抽屉和顶部移动栏。抽屉支持关闭按钮、点击遮罩和 Escape 关闭，关闭时不可聚焦；实验台与帮助面板高度按新外壳重新计算。
- 保留三领域切换与历史记录、几何工作室、扩展实验、统一实验库、导入导出和全部物理功能。新增 3 个导航端到端场景，并为实验内同名模板入口补充明确的作用域，避免与侧边栏快捷入口混淆。
- 生产构建、86 项 Vitest 和 Edge 的 57 个生产包端到端场景全部通过。完成 1440 px、1024 px 和 390 px 视觉检查；50 物体压力场景帧间隔 p90 为 6.1 ms。窄屏回归曾发现侧边栏外边距过渡造成瞬时横向溢出，移除该过渡后复测通过。

## 2026-11-25 · 首页视觉升级

- 重做首页首屏为深色实验室控制台构图：分层网格与氛围光、渐变标题、物理引擎状态、斜抛轨迹和最高点/滞空时间/射程数据卡，保留原有模板直达入口。
- 三大实验领域加入独立强调色、领域编号、模板数量与统一进入动作；下方功能改为搭建、模拟、分析的三步工作流。侧边栏仍是模板和最近实验的唯一入口。
- 完善 1440、1024、390 和 320 px 响应式排版与减少动态效果支持。首屏光晕曾造成 7–13 px 横向溢出，收回装饰层边界后复测通过。
- 生产构建、86 项 Vitest 和 Edge 的 57 个生产包端到端场景全部通过；50 物体压力场景帧间隔 p90 为 6.1 ms。

## 2026-11-25 · 科幻 HUD 首页与动态模拟

- 参考科幻仪表与 HUD 的视觉语言，减少卡片堆叠，改用细线、青色遥测、大留白和单一视觉焦点。首屏加入系统状态、领域索引、扫描线与可点击的实时模拟控制台。
- 新增 `src/HeroSimulation.tsx`：用真实斜抛方程循环绘制预测轨迹、已运动轨迹、速度矢量、最高点、粒子与轨道环；支持 DPR、尺寸变化、指针视差和约 30 fps 节流。
- 三大领域改为紧凑入口，固定物理步长、采样频率、SI 单位与 BUILD / SIMULATE / ANALYZE 浓缩为一条能力带。侧边栏继续作为模板和最近实验的唯一入口。
- 完成 1440、1024、390 和 320 px 视觉检查，均无横向溢出；正常模式确认画布持续变化，减少动态效果模式确认画布与 CSS 动画停止。
- 生产构建、86 项 Vitest 和 Edge 的 57 个生产包端到端场景全部通过；本次 50 物体压力场景帧间隔 p90 为 16.8 ms。

## 2026-11-25 · Studio 3.0 审计与首页收敛

- 以用户提供的 `physicslab 3.0.docx` 为批准需求基线，从 `4036f65` 创建 `studio-3.0` 分支。完成 UI、物理、数据、测试、依赖与部署只读审计，记录在 `docs/studio-3.0-audit.md`。
- 首页移除 HUD、演示模拟、领域卡、营销文案、流程带与页脚，仅保留“让想法，成为实验”、创建实验入口和 60 Hz / 15 Hz / SI 三项指标。创建实验直接打开空白二维场景。
- 新增 `src/simulation.ts` 统一物理与采样配置；首页不加载 Planck。场景时间步从同一 60 Hz 常量派生。
- 力学场景读取增加版本解码注册；v1/v2 保持原语义，未来或缺失版本在解析前明确拒绝且不修改源记录。`tests/versioning.test.ts` 的 3 项测试通过。
- 生产构建通过；首页与导航 8 项 Edge 端到端测试通过，覆盖 1366×768、390×844、844×390 单屏无滚动。浏览器实际点击创建实验后确认空白画布加载。
- 阶段二实施计划见 `docs/superpowers/plans/2026-11-25-studio-3.0-workbench.md`。尚未提交、推送或部署。

## 2026-11-25 · Studio 3.0 二维工作台

- `src/Lab.tsx` 将顶部控制、中央画布、底部绘图工具整合为三区域工作台；移除重复领域导航和独立定时模块。属性与分析默认关闭、按需挂载，关闭分析不停止 `Physics.step()` 的 15 Hz 采样。手机保留运行、单步、重置、保存和画布，低频控件进入可开合的“更多”。
- `src/Viewport.tsx` 让双击/双击触控打开属性，同时保留右键“变换物体”、缩放手柄和删除；`src/Inspector.tsx` 增加关闭按钮并同步顶栏环境/属性页签；`src/AnalysisPanel.tsx` 支持真实关闭；`src/styles.css` 实现覆盖层、沉浸模式和响应式布局。沉浸只隐藏工具，不重置相机、物理或采样。
- `e2e/helpers.ts` 统一按需打开属性/分析，并限定手机“更多”按钮，避免与画笔上下文菜单重名。现有端到端测试改为显式准备面板状态，保留物理、绘图、选择、弹簧、回放、存储、导入导出和跨领域模板回归；静电实验保存状态按该组件真实可访问名称断言。
- 最新验证：15 个 Vitest 文件、89 项测试通过；TypeScript 与 Vite 生产构建通过；Microsoft Edge 的 Playwright 生产包端到端套件 60/60 通过。50 物体、5 弹簧压力场景帧间隔 p90 为 3.5 ms。
- 使用生产预览和 Edge 检查 `/`、`/lab?new=1`、`/lab?template=spring`、`/experiments`、`/geometry`，覆盖 1366×768、390×844、844×390 共 15 张截图；均无横向溢出或页面脚本错误，参数/分析默认关闭。实验库与几何工作室在窄横屏保留正常纵向滚动。
- 独立审查发现 1366×600、1366×568、1024×600 打开分析后，常规 Flex 最小高度会裁掉底部工具。先以端到端测试复现 619 px 底边越界，再仅在宽度大于 900 px、高度不超过 650 px 时把分析面板改为画布覆盖层；三种尺寸均通过边界断言和绘制/橡皮/弹簧真实点击，生产截图无横向溢出或页面脚本错误。
- 构建仍有 Zod `util.js`、`regexes.js` 两条既有非致命注释位置警告。高频采样混叠、连续外力确定性回放、自由曲线碰撞近似等审计风险仍按后续阶段处理。本阶段未加入 2D/3D 开关，因为真实 3D 求解、转换和回退尚未通过门槛；没有用禁用按钮冒充 3D。
- 所有修改仍在 `studio-3.0` 工作树，未提交、未推送、未部署。

## 2026-11-26 · Studio 3.0 统一视觉设计系统

- 以 `src/styles.css` 的语义令牌统一字体、间距、圆角、按钮/图标尺寸、面板层级、焦点、禁用和选中状态；主工作台、静电、几何、扩展实验与天文工具引用同一套反色选中令牌，同时刻对比和图表 Tooltip 恢复中性面板。保留物理矢量、数据曲线、警告和选中状态的语义色。
- 新增 `src/numberFormat.ts`，统一力学属性、几何、天文、静电、扩展实验和测量时间六类数值入口。普通值最多 6 位有效数字，绝对值小于 `0.0001` 或大于等于 `1000000` 时使用 3 位小数科学计数法；提交比较基于格式化显示值，未编辑字段不会静默改写场景原始精度。
- `e2e/design-system.spec.ts` 现有 21 项验收，覆盖共享令牌、控件几何、禁用/提示/焦点、跨领域选中色、四个领域输入的科学计数法、领域缩放按钮原生提示、数值字体与精度、五类视口、生产截图矩阵及 DPR 2。五类视口为 390×844、844×390、768×1024、1366×768、1920×1080；每个视口检查首页、二维实验台、实验库、几何、静电和天文六个入口。
- DPR 2 验证物理场景、二维几何画布、电场画布和轨道画布的 CSS 尺寸与 drawing buffer 同步。生产截图矩阵共 10 张，在原有 8 张之外增加“设为基准后的同一时刻对比”和“图表 Tooltip 悬浮”状态；逐张读取确认已检查画面无横向溢出、控件遮挡或异常蓝色面板。1366×768 分析截图中的侧栏是当前桌面共享导航，不是旧版残留。
- 独立审查曾发现四个数值入口把科学计数法转回小数、主工作台选中色未统一、两个面板残留深蓝、领域缩放按钮缺少 `title`。先补失败测试确认缺陷，再做最小修复；11 项聚焦验收通过后执行完整回归。
- 最终复核进一步发现通用 `.tool:not(:disabled):hover` 覆盖力学选中工具的反色状态，悬浮后近黑文字落在深灰背景上。回归测试先确认背景与边框在悬浮时变化，再提高选中态选择器特异性；主工作台、静电、扩展 RC 与几何的 resting/hover 背景、文字和边框均保持一致。
- 本机 Git Bash 使用 Node 24.22.3。最新验证命令与结果：`npm test` 为 16 个文件、94 项测试通过；`npm run build` 通过 TypeScript 与 Vite 生产构建；`PLAYWRIGHT_CHANNEL=msedge PLAYWRIGHT_PORT=42875 npx playwright test --reporter=line` 为 81/81 通过，50 物体压力场景帧间隔 p90 为 3.5 ms。
- 构建仅保留 Zod `core/regexes.js`、`core/util.js` 两条既有非致命注释位置警告。本轮未运行 Firefox/WebKit、实体触屏设备或线上环境；没有 `DESIGN.md`/像素级批准基线，视觉结论以批准任务书、语义令牌和实际生产截图为依据。所有修改未提交、未推送、未部署。

## 2026-11-26 · Studio 3.0 绘制系统全面升级

- `src/ink.ts` 增加笔迹去重、等距重采样、直线/折线/椭圆/圆/矩形/三角形/多边形识别，以及长度、闭合程度、曲率、拟合误差、顶点分布、角度和采样密度判断。识别置信不足时保留抽稀后的原始路径，不强制套用最近标准图形；自动规整继续进入同一编辑历史，可撤销。
- `src/inkHold.ts` 与 `src/Viewport.tsx` 在指针仍按住时启动 900 ms 静止识别，使用屏幕坐标的 2 px 径向容差过滤触控抖动；明显移动会重新计时并取消已就绪状态。绘制覆盖层使用当前画笔颜色、宽度和实线显示原始笔迹。
- v3 场景增加对象角色、识别来源、电荷与椭圆几何。视觉标记不参与碰撞，动态刚体保留真实质量与碰撞，静态边界使用碰撞链，轨道使用 Chain，弹簧使用 DistanceJoint，场源按实时位置施加库仑力。属性面板可编辑角色，渲染器以填充、边框、虚线和徽标区分角色；弹簧模板和新建弹簧均记录 `constraint`。
- 动态手绘封闭物块以与视觉一致的多三角形 fixtures 参与 Planck 碰撞；无法三角化时明确拒绝，不再静默改用凸包。静态开放边界继续使用碰撞链。
- 独立复核修正四项缺陷：场源电荷由错误的 `1e-9` 换算改为 nC 对应的 `1e-18`，100 nC 电荷在 1 m 处的作用力为 `8.98755179e-5 N`；橡皮擦切分保留角色、电荷、识别来源、颜色、线宽、摩擦与恢复，并保持轨道几何类型；实验库优先读取最高有效版本，损坏的 v3 记录可回退到有效 v2，列表按 ID 去重，回放跟随场景版本，删除时清理全部力学版本副本；绘制覆盖层读取最新画笔设置，不再固定使用首次挂载的颜色和粗细。
- 几何工作室新增“导入实验画布”配置：轨道、碰撞边界、刚体、视觉标记和场源，以及离散容差、重力、质量、摩擦、恢复、电荷和测试球。导入只接受通过连续性、自相交、最小边长和动态封闭轮廓校验的几何，保存场景注明几何工作室来源和有损离散；曲面预览仍只属于几何工作室，实验工作台保持二维。
- 本机 Node 24.22.3 最终验证：20 个 Vitest 文件、116/116 项通过；TypeScript 与 Vite 生产构建通过；Microsoft Edge 生产包端到端套件 87/87 项通过。覆盖按住识别与移动取消、实时笔迹颜色与粗细、角色视觉和保存、场源电荷、几何边界/刚体导入、撤销、损坏记录回退、跨版本回放与删除及动态 freeform 碰撞一致性。生产截图矩阵随全套回归重新生成并逐张查看，10 张画面未见横向溢出、核心控件遮挡或异常面板；1920×1080 几何工作室画面中的导入角色及物理属性面板完整可用。
- 构建仍只有 Zod `core/util.js`、`core/regexes.js` 两条既有非致命注释位置警告。手绘自由曲线碰撞仍是有损离散近似；本轮未运行 Firefox/WebKit、实体触屏设备或线上环境。所有修改仍在 `studio-3.0` 工作树，未提交、未推送、未部署。

## 2026-11-26 · Studio 3.0 数值与跨设备补验

- 支持力反算从单一水平面扩展至方向一致的固定接触，按真实法线施力并保留切向外力。无活动接触的合力、加速度反算计入阻尼。极小持续力可跨过 Planck 的低速休眠阈值，二维动力学的电荷场源加入有限核心。
- 空间双体可编辑轨道倾角、独立保存显示半径。数值回归覆盖转动轨道平面时的质心位置与速度、相对距离和相对速率。
- 补充逐模板数值验收矩阵、二维轨道步长对照、空间斜面和曲面接触、双摆铰点与等边三体约束。页面隐藏暂停推进，回前台后续算。Pages 路由复制脚本可指定构建目录。
