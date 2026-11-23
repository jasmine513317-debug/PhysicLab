# User guide

1. From Overview, create a blank experiment or open an experiment template. **曲线轨道** starts a ball above a shallow parabolic track.
2. Choose **绘制** and draw with the left mouse button on a computer or with a finger or stylus on touch screens. A quick stroke stays freehand: open curves become static ramps or collision curves, and closed shapes become dynamic bodies. Hold still at the end for 1.5 seconds before lifting to regularize the stroke into a line, circle, rectangle, polygon, or smooth curve. Click **绘制** again to choose red, blue, white, or a custom color. Choose **橡皮** to delete whole strokes, or click it again and switch to drag mode to cut curves and delete bodies.
3. With Select active, drag a body to move it or drag empty canvas to pan. Right-click a body or spring to highlight it and show the delete action. On touch screens, press and hold the target. For keyboard access, select a target and press Shift+F10 on the canvas. Rotate by 15° with R or enter a rotation in the inspector.
4. To connect a spring, choose Spring and click an attachment point on each of two bodies. At least one must be dynamic. Use **初始位移** to set the initial anchor separation relative to the rest length. The inspector moves one dynamic endpoint along the line between the anchors. Adjust local anchor coordinates in the inspector.
5. Use the Object tab for mass, density, geometry and initial velocity. Use Environment for gravity, collisions, and the four adjustable bounds. The gravity presets fill in Earth (9.81), Moon (1.62), Mars (3.71) or weightlessness (0) with one click; you can still type any other value. Press Enter or leave a numeric field to apply an edit. An invalid value shows a field or scene error.
6. Run, pause, single-step, or reset. Keyboard shortcuts are P for run/pause, . for a single 1/60 s step and Shift+R for reset; they are ignored while a form control has focus, and R alone still rotates the selected body. Reset rebuilds the initial scene so the run can be repeated. Wheel to zoom around the pointer or use the bottom buttons. Drag empty canvas in Select, middle-drag, or hold Space and drag to pan.
7. Turn on vectors and trails from Display options. Use Clear trail to clear the visual trace while retaining chart samples. To apply a constant force, enter X and Y in the inspector and choose **Apply constant force**. Set both components to zero to stop applying it. Reset clears run-time forces.
8. Pause a run and choose **Set baseline**. Edit an initial parameter, run again, and open **Compare**. The lavender line in the viewport is the baseline path. The comparison includes final speed and both velocity components. Free fall and projectile motion also show the uniform-gravity reference and pre-impact RMS trajectory error when the scene meets the model assumptions.
9. Choose a dynamic body in Data analysis. Switch tabs or toggle series in the chart legend. Drag the handle above the data panel to resize it, or focus the handle and press the up and down arrows. Export CSV to get the retained samples for all dynamic bodies.
10. Choose **历史回放** after stepping or running. Scrub the timeline or use its Play control, then choose **保存回放** to keep the recording with the experiment in this browser. Exit replay to edit or run the scene again. Saving another recording replaces the saved recording for that experiment.
11. Edit the title at the top of the workspace or add notes in the inspector. Save the experiment and reopen it from Library. Library also supports rename, duplicate, and delete. Export scene JSON from the workspace title menu. Use **导入实验** in the library to validate and open a copy from another browser.

On a phone, the tool strip sits above the canvas, the color palette spans the screen width, and Parameters is below the charts.

Open **动量** in the analysis panel to view signed momentum components. Switch between **全体动态物体** and an individual object. The summary compares the first and last retained samples and includes the change in kinetic energy. **导出动量 CSV** includes momentum and kinetic energy at every retained sample for the selected scope.

## Studio navigation and backups

- Use the domain navigation to switch between mechanics, electrostatics, and astrophysics. Switching away from a running simulation pauses it. Return to resume work on the same scene.
- Undo and redo scene edits from the toolbar. With focus on the canvas, use `Ctrl` or `⌘` plus `Z` to undo and add `Shift` to redo.
- Choose **导出实验备份** in the experiment menu to download the scene and its recording, if available. The export prefers the currently open replay, then the saved replay, then a recording of the current or most recent run. In the library, **导入实验** creates a separate experiment and restores the recording. **导出场景 JSON** writes the scene in its existing format version.

## Geometry Studio

1. Open **几何工作室**. In **手绘与贝塞尔**, draw a new stroke or start with a primitive. Drag points and handles or enter coordinates in the inspector. **添加节点** divides the selected curve segment where possible. Undo and redo work with both drawing and parameter edits.
2. Choose **函数曲线**, **参数曲线**, or **极坐标** to enter equations and ranges. Press Enter or leave a field to apply the edit. Write `*` for multiplication and `^` for powers. Angles are in radians.
3. To run a curve as a collision track, set the discretization tolerance and choose **创建轨道实验**. The workspace opens an independent saved experiment. Leave **添加测试小球** checked for a quick drop test. A track experiment uses scene format 2. The library can still open and export format 1 scenes.
4. In **三维曲面**, enter `z = f(x, y)` and a rectangular domain. Drag to rotate or choose **平移**. Use the arrow keys when the canvas has focus. Toggle the mesh, shading, and sampled normals. **导出 OBJ** saves the generated mesh.
5. Geometry Studio keeps the latest draft in the current browser. Use **导出 JSON** and **导入 JSON** to move editable geometry between browsers.

## Electrostatics

1. Choose **电磁学** in the domain navigation or open **电偶极子电场** or **等势线** in the experiment library.
2. Pick **正电荷** or **负电荷**, then click the canvas to place a charge. Drag a charge with **选择** active. Edit its strength in nC or its coordinates in meters in the parameter panel.
3. Toggle **电场线**, **电场矢量**, **电势热力图**, or **等势线**. The contour interval controls the spacing of the plotted potential levels in volts. The heat map displays four intervals in either polarity.
4. Use **探针** to click a position or enter its coordinates. The readout shows voltage, field magnitude, and both components. A probe at a nonzero point charge shows a singularity message.
5. **保存实验** stores the charges, probe, camera, and display settings in the experiment library. To transfer a scene, choose **导出场景 JSON** and import it in the experiment library.

## Two-body orbits

1. Open **椭圆轨道** or **开普勒定律** in the experiment library. In a blank scene, add two stars, planets, or satellites and edit their mass, radius, initial position, and initial velocity.
2. Choose **运行轨道**, pause, single-step, or reset. The canvas uses the center-of-mass frame. Enable **扫过面积** to display the first and latest completed equal-time sectors. The analysis panel reports the numerical period after a full revolution.
3. Choose **验证开普勒第三定律** to integrate three ellipses with the same masses and eccentricity. The table compares measured periods with the predicted periods and lists their measured T²/a³ values.
4. Export orbital samples to CSV. Save the scene to the library or use the JSON export to transfer the initial configuration to another browser.

## Extended experiments

- Open **弹簧振子** and select **对比** to see the ideal underdamped period alongside the measured period. **单摆** compares the small-angle and finite-amplitude predictions with the measured period between upward crossings.
- **逃逸速度** displays the initial relative speed, separation, and escape threshold. Apply a preset multiple to set a tangential relative velocity, then run the orbit.
- **带电粒子运动** uses an in-plane electric field and a perpendicular magnetic field. Change the charge sign or field direction to reverse the curvature. The readout includes speed, kinetic energy, and the pure-magnetic reference radius.
- **RC 电路暂态** plots capacitor voltage and current. The run-time switch keeps the capacitor voltage continuous. The readout compares the voltage one time constant after each switch with the predicted value.
- Export samples to CSV or save the initial settings in the library. Scene JSON can be imported in another browser.

## Advanced experiments

- **双摆与混沌** overlays the reference and perturbed lower-bob trajectories. Adjust **对照组第二摆角扰动** to change only the comparison's starting angle. Compare the separation with **半步长轨迹差** to judge when the numerical resolution is sufficient.
- **三体引力** starts from an equal-mass figure-eight orbit. Expand an object's parameters to set its mass, position, and velocity. Adjust **对照组天体 3 的 X 位移** to compare initial conditions. The measurements include the center of mass and changes in the conserved quantities.
- **引力弹弓** records an inbound and outbound crossing of the same measurement circle. **飞掠前后对比** displays the spacecraft's speed and specific kinetic energy in both the star and planet frames. Choose a frame for the canvas independently of the table.
- **电磁感应** plots flux and electromotive force in a ten-second window. Change **回路状态** to compare the open and closed circuits. The initial parameters control the field, projected loop area, and resistance.
