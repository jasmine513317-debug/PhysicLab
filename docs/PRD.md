# PhysicLab product requirements

PhysicLab gives students, teachers, and independent learners an editable laboratory for classical mechanics. A learner should be able to create, configure, simulate, observe, analyze, and repeat in a single workspace.

| Surface | User outcome |
| --- | --- |
| Overview | Open a blank experiment, resume a saved scene, or launch one of five templates. |
| Workspace | Place circles, rectangles, ramps, boundaries, convex polygons, and springs. Set geometry and initial conditions in SI units. |
| Playback | Run, pause, step, or reset. Inspect trajectories and velocity, acceleration, gravity, applied force, and spring reactions. |
| Analysis | Inspect position, velocity, acceleration, and energy. Compare runs and export recorded data. |
| Library | Keep versioned initial scenes in IndexedDB. Open, rename, duplicate, or delete a scene. |

The five starting experiments are Projectile Motion, Elastic Collision, Mass–Spring Oscillator, Inclined Plane, and Free Fall. They use the same scene schema and Planck adapter. The primary workspace is desktop-oriented. Tablets and phones retain canvas, playback, and parameter controls.

Success requires reproducible fixed-step physics, explicitly bounded numerical error, validated inputs, and a complete browser workflow. AI, cloud synchronization, accounts, 3D, and advanced material or fluid models are outside this release.
