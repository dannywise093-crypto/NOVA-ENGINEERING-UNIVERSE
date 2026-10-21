# NOVA Engineering CAD and Simulation Worker

This is an optional Render Docker web service that provides a protected execution boundary for engineering jobs.

## Deploy on Render
1. Create a **Web Service** from this repository and use the repository's `render.yaml` Blueprint configuration, or set the service root directory to `worker` and Dockerfile to `worker/Dockerfile`.
2. Set a strong random `ENGINEERING_WORKER_TOKEN` secret on the Render service. Do not commit it.
3. Deploy and confirm the service's `/docs` page opens. The `/health` endpoint requires the bearer token.
4. In Vercel Production Environment Variables, set `ENGINEERING_WORKER_URL` to the Render service's base URL and `ENGINEERING_WORKER_TOKEN` to the exact same secret. Redeploy the Vercel project.

## API
POST `/api/cad-simulation` on the Vercel site:
- `{"action":"status"}`
- `{"action":"run","jobType":"cad_box","params":{"lengthMm":100,"widthMm":50,"heightMm":20}}`
- `{"action":"run","jobType":"cantilever_beam","params":{"lengthM":1,"forceN":100,"elasticModulusPa":200000000000,"secondMomentOfAreaM4":0.000001,"sectionModulusM3":0.00001,"allowableStressPa":150000000}}`

The CAD task creates a simple box with FreeCAD and returns base64 STEP, STL, and FCStd artifacts. The beam task executes Euler-Bernoulli analytical beam equations. It is **not FEA**. Although the container attempts to install CalculiX, this first version does not execute a CalculiX finite-element solve. It never accepts arbitrary code from clients.

## Important
- Treat all output as preliminary engineering work. Review inputs, units, assumptions, and results independently.
- The worker is stateless and does not yet store project files durably.
- Keep the token private; the Vercel API proxy keeps it server-side.
- Verify the build and actual FreeCAD exports on the deployed service before relying on it.
