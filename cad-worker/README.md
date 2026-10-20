# Engineering Universe CAD worker

This service provides two controlled integrations from the website:
- FreeCAD: builds supported solid parts and exports STEP.
- Cascade Studio + OpenCascade.js: opens Cascade Studio in headless Chromium using Playwright, calls its documented `window.CascadeAPI.runCode()`, and returns execution status/code.

The worker accepts a restricted geometry schema only. It does not execute arbitrary AI-generated Python.

## Deploy with Render (mobile-friendly setup)

A root-level `render.yaml` Blueprint is included. It defines a Docker web service using `cad-worker/Dockerfile` and checks `/health`.

1. Open the official Render dashboard: https://dashboard.render.com/
2. Sign in and choose **New + → Blueprint**.
3. Connect the GitHub repository `dannywise093-crypto/NOVA-ENGINEERING-UNIVERSE` and choose the default branch.
4. Review the service named `engineering-universe-cad-worker`. The Blueprint asks for a secret named `CAD_WORKER_TOKEN`; enter a long random secret and save it somewhere private. Never put it in a source file or chat.
5. Click **Deploy Blueprint**. The first Docker build is large and can take several minutes. If the free instance runs out of memory or the build fails, inspect Render's build/runtime logs; a larger instance may be required and could cost money.
6. Wait until the service is live. Open its service URL plus `/health` (for example, `https://YOUR-SERVICE.onrender.com/health`). It should report `ok: true`, `freecad_available: true`, `cascade_playwright_available: true`, and `token_configured: true`.

## Connect the worker to Vercel

1. Open the Vercel dashboard: https://vercel.com/dashboard
2. Select the Engineering Universe project → **Settings → Environment Variables**.
3. Add `CAD_WORKER_URL` with the Render service's HTTPS base URL, without `/health` and without a trailing slash.
4. Add `CAD_WORKER_TOKEN` with exactly the same secret you entered in Render.
5. Apply both variables to Production (and Preview too if you use previews), save, then redeploy the project. Vercel only applies environment-variable changes to new deployments.
6. Open the site's **Real CAD Studio** page. Test **Build STEP with FreeCAD worker** and **Run in Cascade + OpenCascade** with a simple box.

## Environment variables

- `CAD_WORKER_TOKEN`: long random secret (required)
- `CAD_WORKER_HOST=0.0.0.0`: required in container hosting; already configured in the Dockerfile
- `PORT`: provided by the hosting service; the worker reads it automatically (fallback 8787)
- `CASCADE_STUDIO_URL`: optional; defaults to the official Cascade Studio website.

The worker must be reachable over HTTPS from Vercel. Do not expose it without TLS and a strong secret.

## Endpoints

- `GET /health`: reports whether FreeCAD, Playwright, and token configuration are available.
- `POST /v1/build-step`: authenticated FreeCAD STEP generation.
- `POST /v1/cascade-run`: authenticated Cascade Studio/OpenCascade execution in headless Chromium.

## Important limits

- The Cascade action executes against a separate headless Cascade Studio session. It does not manipulate the separately embedded cross-origin iframe in the user's page; browsers prohibit that without modifying/self-hosting the editor.
- Cascade primitive bridge supports box, cylinder, sphere and cone. FreeCAD supports those plus torus.
- Three.js remains the website's interactive browser preview; it is not a CAD constraint solver.
- This is a geometry-generation bridge, not FEA/CFD or engineering validation. Review dimensions, units, and models before real-world use.
