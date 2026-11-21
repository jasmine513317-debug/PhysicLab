# Known limitations

- The simulation covers 2D rigid-body mechanics. It excludes air resistance, fluids, deformable bodies, fracture, 3D, and relativistic effects.
- Finite steps, the contact solver, and the engine's movement limits affect very fast bodies or extreme mass and size ratios. Spring stiffness is constrained by the frequency limit. An off-center spring attachment changes the effective oscillation dynamics.
- The projectile reference assumes constant gravity and air resistance of zero. Comparisons against a flat floor assume the projectile reaches its top without first hitting another object.
- Energy is tracked per body, including an allocated share of spring potential energy. External work, friction, damping, and collisions can change it.
- Data samples are retained for roughly four minutes per body at the full sample rate. Comparisons after the recording window rolls over describe the retained portion. The scene editor caps a scene at 100 bodies and 200 joints. Scenes with at least 40 bodies render the live canvas at up to 30 frames per second while retaining 60 Hz fixed physics steps and 15 Hz recording.
- The workspace keeps one saved replay per experiment and one recently completed run in memory. Replay preserves recorded poses, velocity, and acceleration for up to about four minutes, including the last step. It omits historical force vectors. Baselines and active applied forces are session data. Export CSV to keep measurements outside the browser.
- IndexedDB is local to the current origin and browser profile. A private browsing policy, storage quota, or cleared site data can affect the library. Export scene JSON to keep a portable copy.
- Automated browser coverage uses Edge, Playwright Firefox, and Playwright WebKit on Windows. Mobile coverage uses viewport and touch emulation. Native Safari and physical phone and tablet testing require the corresponding devices.
