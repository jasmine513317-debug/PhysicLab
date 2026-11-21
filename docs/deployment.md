# Deployment

## GitHub Pages

Select **GitHub Actions** as the Pages publishing source. The workflow in `.github/workflows/pages.yml` tests and builds the app on pushes to `main`, using the base path published by GitHub Pages. It publishes only `dist/`. The generated `lab/index.html` and `experiments/index.html` support direct links and reloads on the project site.

To validate the Pages artifact locally, run `npm run build -- --base /PhysicLab/` and `node scripts/pages-routes.mjs`. Serve `dist/` at `/PhysicLab/` on a local static host. Saved experiments are scoped to the browser and site origin. Scene JSON export and import can transfer a local experiment to the deployed site.

## Vercel

Import the repository and select the directory containing `package.json` and `vercel.json` as the project root. Select a supported Node.js version that meets the project's 22.12 minimum. The configuration installs from the npm lockfile, runs the production build, and serves `dist/`. The application routes `/lab` and `/experiments` load the app directly, including experiment links such as `/lab?template=projectile`. No environment variables are required. [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)

## Other static hosts

Run `npm install`, `npm run test`, and `npm run build`. Serve the resulting `dist/` directory from the root of a static HTTPS host. Set its SPA fallback to serve `index.html` for `/lab` and `/experiments`. Leave ordinary files under `/assets/` served as files. HTTPS is required for production browser APIs. Localhost works for development and preview.

Example Nginx routing inside a site that already terminates TLS

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
location /assets/ {
    try_files $uri =404;
}
```

Validate the production output locally with `npm run preview`. Open the overview, navigate to a template, save an experiment, and then directly reload the saved workspace URL. Repeat that smoke test on the deployed origin. Browser IndexedDB is scoped to the origin and browser profile. Local preview saves do not follow a later deployment.
