# Engineering Universe CAD worker

This optional service creates real FreeCAD solids and exports STEP from a restricted scene schema. It never executes arbitrary AI-generated Python.

## Requirements and deployment
Run on a trusted host with a compatible FreeCAD Python runtime where `import FreeCAD` and `import Part` work. This does not run as a normal Vercel function because Vercel does not provide the FreeCAD runtime by default.

Set `CAD_WORKER_TOKEN` to a long random secret; optional `CAD_WORKER_HOST` defaults to `127.0.0.1` and `CAD_WORKER_PORT` defaults to `8787`. Start with the Python interpreter that can import FreeCAD:

```sh
CAD_WORKER_TOKEN='replace-with-a-long-random-secret' python server.py
```

Configure Vercel Environment Variables `CAD_WORKER_URL` (HTTPS base URL, no trailing slash) and `CAD_WORKER_TOKEN` (same secret), then redeploy. Keep the worker behind TLS and network restrictions; do not expose it publicly without access controls.

## Integration boundaries
- FreeCAD: generates simple primitive solids and exports STEP when this worker is deployed correctly.
- OpenCascade.js: still requires a deliberate browser-side WebAssembly integration/build step; this worker does not pretend to load it.
- Cascade Studio: the existing editor is on a different origin. Browser security prevents control of its internals unless a self-hosted/forked build implements an authenticated `postMessage` command receiver. STEP file exchange is the bridge meanwhile.
- Geometry is preliminary concept geometry, not validated engineering or simulation.
