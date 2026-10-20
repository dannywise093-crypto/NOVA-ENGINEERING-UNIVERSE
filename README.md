# Engineering Universe

A mobile-first engineering research and concept-design workspace.

## Engineering research studios now included
The site includes 12 discipline-specific AI designer roles:
- Mechanical & CAD
- Civil & structural
- Electrical & electronics
- Aerospace & flight
- Chemical & process
- Materials science
- Robotics & mechatronics
- Automotive & mobility
- Energy & thermal
- Fluid systems
- Biomedical engineering
- Software & computer engineering

Each role has a different domain prompt and workflow. These are role-specialized assistants using the configured AI model, not twelve separate certified expert models.

## Current features
- Responsive engineering dashboard for phone and desktop.
- Selectable discipline-specific engineering AI workbench.
- Secure Vercel serverless API route at `/api/engineer` that calls Groq without exposing the API key to the browser.
- Response modes for research, concept design, calculation planning, design review, and code/simulation guidance.
- Structured research-brief builder.
- Lightweight shape preview with adjustable dimensions and rotation.
- Basic OBJ export for a block mesh.
- Introductory force, torque, and normal-stress calculators.
- Local project library using browser local storage, with JSON export.

## Configure the AI backend
1. Import this GitHub repository into Vercel.
2. In Vercel project **Settings → Environment Variables**, add `GROQ_API_KEY` with your private Groq API key. Never put it in `index.html`, client-side JavaScript, or GitHub.
3. Optionally add `GROQ_MODEL` with a model name enabled for your Groq account. The default in the API route is `llama-3.3-70b-versatile`; if Groq no longer offers it to your account, set a currently supported model.
4. Redeploy after saving environment variables.
5. Open the site, choose an engineering studio, enter a task, and press **Ask this engineering AI**.

The AI endpoint accepts POST requests only, limits tasks to 8,000 characters, uses server-side role instructions, and does not claim to run CAD or simulation solvers. For production, add user authentication, rate limiting/quotas, monitoring, and abuse protection before sharing broadly.

## Deploy
Import this repository into Vercel. The root `index.html` serves the frontend and the `api/engineer.js` file is a Vercel Node.js serverless function. If Vercel asks for a framework, use **Other**; no frontend build command is required.

## Important engineering limitations
The model preview is illustrative and the current OBJ export is a basic block mesh; the cylinder and gear-like preview are visual concepts, not exported parametric CAD. The calculators are educational and do not account for all failure modes, safety factors, codes, or material/environment effects. The AI can make mistakes and does not automatically retrieve live papers, browse the web, or execute a CAD/CAE solver. Check references, units, assumptions, equations, and results independently. Safety-critical construction, aircraft, pressure systems, electrical installations, vehicles, and medical devices require qualified professional review and validated analysis.

Full parametric CAD, dimensioned technical drawings, native STEP export, PCB editing, BIM, CFD, FEA, and other advanced simulation integrations are future phases and require appropriate CAD/solver engines and infrastructure.

## CAD automation bridge (FreeCAD + Cascade Studio/OpenCascade.js)

The repository now includes a secured CAD worker under `cad-worker/` and Vercel proxy endpoints:
- `POST /api/cad-control`: build a STEP file with FreeCAD.
- `POST /api/cascade-control`: execute supported generated geometry in a headless Cascade Studio session using its `window.CascadeAPI` and OpenCascade.js kernel.
- `cad-studio.html`: offers a FreeCAD macro download plus worker buttons for STEP generation and Cascade execution.

### Activate the real CAD worker
A Render Blueprint is included at the repository root as `render.yaml`.

1. Open https://dashboard.render.com/ and choose **New + → Blueprint**.
2. Connect `dannywise093-crypto/NOVA-ENGINEERING-UNIVERSE`, select its default branch, and review the `engineering-universe-cad-worker` service.
3. When prompted, enter a long random secret for `CAD_WORKER_TOKEN`. Keep it private. Deploy the Blueprint.
4. Wait for the service to become live, then open its HTTPS URL plus `/health`. It must report `ok: true`, `freecad_available: true`, `cascade_playwright_available: true`, and `token_configured: true`.
5. In Vercel **Project → Settings → Environment Variables**, add `CAD_WORKER_URL` (the worker HTTPS base URL without `/health` or a trailing slash) and `CAD_WORKER_TOKEN` (the exact same secret). Apply to Production and any Preview environment you use.
6. Redeploy Vercel, open `cad-studio.html`, and test both worker buttons with a simple box.
7. If the Docker build fails or the free instance runs out of memory, inspect the Render logs. The FreeCAD + Chromium image is large; a larger service may be needed and can cost money.

Security: keep the worker behind HTTPS and a strong secret; never place either Groq or CAD worker secrets in browser JavaScript or commit them to GitHub.

### Important integration limits
- The FreeCAD worker generates primitive solids and exports STEP; it is not a full GUI instance and does not run FEA/CFD.
- Cascade Studio/OpenCascade.js execution runs in a separate headless browser session. The external iframe on the page is not live-synchronized because of browser cross-origin security.
- Supported Cascade primitives are box, cylinder, sphere, and cone. FreeCAD also supports torus in this bridge.
- The FreeCAD Docker image is large and may need build-time adjustments depending on the hosting provider's architecture and available memory.
- AI-generated geometry is preliminary. Check dimensions and all engineering assumptions before fabrication or safety-critical use.
