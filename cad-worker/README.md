# Engineering Universe CAD worker

This optional service provides two controlled integrations from the website:
- FreeCAD: builds primitive solid parts and exports STEP.
- Cascade Studio + OpenCascade.js: opens Cascade Studio in a headless Chromium browser using Playwright, calls its documented `window.CascadeAPI.runCode()`, and returns execution status/code.

The worker accepts a restricted geometry schema only. It does not execute arbitrary AI-generated Python.

## Deploy as a Docker web service
Use this folder as the Docker build context on a container host that supports a long-running web service. The included Dockerfile installs Debian FreeCAD and Playwright/Chromium. FreeCAD and browser dependencies are large, so the first build may take time; check build logs and the `/health` endpoint after deployment.

Set environment variables:
- `CAD_WORKER_TOKEN`: long random secret (required)
- `CAD_WORKER_HOST=0.0.0.0` (required in container hosting)
- `CAD_WORKER_PORT`: use the port provided by your host if it requires one; default 8787
- Optional `CASCADE_STUDIO_URL`: defaults to the official Cascade Studio website.

The worker must be reachable over HTTPS from Vercel. Restrict access at the hosting layer if possible. Do not expose it without TLS and a strong secret.

Then add these Vercel environment variables:
- `CAD_WORKER_URL`: HTTPS base URL of the deployed worker, no trailing slash
- `CAD_WORKER_TOKEN`: exactly the same secret as the worker

Redeploy the Vercel project after adding environment variables.

## Endpoints
- `GET /health`: reports whether FreeCAD, Playwright, and token configuration are available.
- `POST /v1/build-step`: authenticated FreeCAD STEP generation.
- `POST /v1/cascade-run`: authenticated Cascade Studio/OpenCascade execution in headless Chromium.

## Important limits
- The Cascade action executes against a separate headless Cascade Studio session. It does not manipulate the separately embedded cross-origin iframe in the user's page; browsers prohibit that without modifying/self-hosting the editor.
- Cascade primitive bridge supports box, cylinder, sphere and cone. FreeCAD supports those plus torus.
- This is a geometry-generation bridge, not FEA/CFD or engineering validation. Review all dimensions and models before real-world use.
