# PhysicLab

**Build It. Set It. Simulate It.**

PhysicLab is a browser-based 2D mechanics laboratory. Construct a scene, change the initial conditions, run Planck, and use the recorded data to compare the results.

## Local development

Use Node.js 24 with npm, matching the GitHub Pages build environment. Run these commands from this directory.

```sh
npm install
npm run dev
```

Open the local address printed by Vite. The overview is at `/`, the workspace at `/lab`, Geometry Studio at `/geometry`, and the experiment library at `/experiments`. The overview uses a restrained sci-fi HUD, a live Canvas2D projectile simulation, sparse telemetry and compact domain entry points. The responsive sidebar provides main navigation, recent experiments, and grouped template shortcuts; it becomes an icon rail on medium screens and a drawer with a mobile top bar on phones.

```sh
npm run test
npm run build
npm run preview
```

The build writes `dist/`. Install Playwright test browsers with `npx playwright install chromium firefox webkit`, then run `npm run test:e2e` after building. Set `PLAYWRIGHT_BROWSER` to `firefox` or `webkit` for cross-engine tests. Set `PLAYWRIGHT_CHANNEL=msedge` for a locally installed Edge and `PLAYWRIGHT_PORT` if the preview port is occupied. Run `npm run example` to regenerate the sample CSV.

## Project map

| Location | Purpose |
| --- | --- |
| [src/](src/) | React workbench, Planck adapter, Canvas2D drawing, model validation, Recharts, IndexedDB |
| [tests/](tests/) and [e2e/](e2e/) | Numerical, unit, storage, and browser acceptance checks |
| [examples/projectile.csv](examples/projectile.csv) | Data generated from a real run of the projectile template |
| [docs/PRD.md](docs/PRD.md) | Product scope and workflow |
| [docs/user-guide.md](docs/user-guide.md) | Editing, playback, comparisons, and saving |
| [docs/architecture.md](docs/architecture.md) | Technical design and architecture diagram |
| [docs/studio-2.0-phase-0.md](docs/studio-2.0-phase-0.md) | Studio 2.0 project audit, data migration, and rollback plan |
| [docs/physics-models.md](docs/physics-models.md) | Physical models, units, and assumptions |
| [docs/testing.md](docs/testing.md) | Validation cases, tolerances, and commands |
| [docs/deployment.md](docs/deployment.md) | Static hosting instructions |
| [docs/known-limitations.md](docs/known-limitations.md) | Simulation and persistence limits |
| [docs/competition-outline.md](docs/competition-outline.md) | Presentation outline |
| [docs/demo-script.md](docs/demo-script.md) | Three-minute competition demonstration |
| [docs/development-log.md](docs/development-log.md) | Development and verification record |

The application interface defaults to Simplified Chinese. Use **历史回放** to review a recorded run, scrub to a pose, or save the recording separately from the scene. The [三分钟中文演示](docs/中文演示脚本.md) uses the Chinese workbench and the inclined-plane template.

The app runs entirely client-side. The deploying host needs no API keys or server-side data storage.

Studio 3.0 also includes the **3D** workbench, with Rapier rigid-body contacts, spatial modeling, experiment templates, history and prediction, and a shared 2D/3D workspace file. Results, benchmark conditions, and supported models are described in the [Studio 3.0 validation record](docs/studio-3.0-validation.md).
