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
