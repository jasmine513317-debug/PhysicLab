# Scientific and software verification

Run `npm run test` for 23 numerical, unit, load, and repository tests. Run `npm run build` to type-check and bundle. Run `npm run test:e2e` after building for the browser acceptance suite.

| Case | Expected result and tolerance |
| --- | --- |
| Free fall | From 10 m, y = 5.095 m and vᵧ = −9.81 m/s at 1 s. Accept 0.085 m displacement error and compare velocity to eight decimal places. |
| Projectile | 10 m/s at 45°. Accept 0.065 m peak error, 0.018 s flight-time error, 0.13 m range error, and 0.125 m vertical path error. |
| Mass–spring | 1 kg, 100 N/m, zero damping. Accept period error within 4% of 2π√(m/k). |
| Collisions | Equal masses, one initially moving at 4 m/s. Compare total momentum to six decimal places and separation speed and kinetic energy to five for e = 1, 0.5 and 0. |
| Friction | Accept up to 0.001 m/s drift in the friction-free contact case. With friction, test that a higher coefficient reduces sliding speed. |
| Stress workload | Step 10, 30, and 50 dynamic bodies for 360 steps in each case with contacts, four springs, and continuous sampling. Verify all per-body sample counts. |

Other checks cover mixed-shape collisions, the collision switch, force tracking, fixed-step scheduling, pixel-to-meter conversion, scene validation, energy accounting, CSV headers, serialization, initial-condition restoration, and IndexedDB transaction behavior. Completion checks cover editable bounds, geometry recognition, spring extension, final velocity components, recorded replay poses, and upgrading a version 1 experiment library.

Final verification on 2026-11-21 passed all 23 Vitest checks and all 11 acceptance scenarios in each of Microsoft Edge, Playwright Firefox, and Playwright WebKit against the production bundle. All three engines ran the mobile touch-emulation scenario. It covers template launch, invalid and valid edits, runs, baseline and CSV, single-step and reset, saving and reloading, library CRUD, drag construction, spring creation, rotation, zoom, deletion, mobile gravity editing, an inclined-plane comparison, and scene JSON import with invalid-file rejection. It also covers timeline playback, saving and restoring a recording after refresh, automatic drawing recognition and manual override, spring displacement, velocity components, editable bounds, and panel resizing. The engine load checks measure simulation and sampling in Node. The browser stress case runs 50 dynamic bodies, five springs, canvas rendering, and chart recording. After warm-up, it logs the 90th percentile of 45 browser animation-frame intervals and verifies chart switching, pausing, and CSV availability during the workflow. Reported frame intervals depend on the host and browser.
