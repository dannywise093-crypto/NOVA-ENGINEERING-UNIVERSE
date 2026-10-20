# Engineering Universe

A mobile-first engineering research and mechanical concept-design workspace.

## Current features
- Responsive engineering dashboard for phone and desktop.
- Structured research-brief builder (template-based; it is not connected to a live AI model yet).
- Lightweight shape preview with adjustable dimensions and rotation.
- Basic OBJ export for a block mesh.
- Introductory force, torque, and normal-stress calculators.
- Local project library using this browser's local storage, with JSON export.

## Run locally
Open `index.html` in a browser. No build step or dependency installation is required.

## Deploy
This is a static site. Import this repository into Vercel and use the **Other** framework preset with no build command and no output directory (the root `index.html` is served directly). Alternatively, publish the root folder using any static hosting service.

## Important engineering limitations
This starter is not a professional CAD package or validated simulation environment. Its preview is illustrative, and the current OBJ export is a basic block mesh. The calculators are educational and do not account for all failure modes, safety factors, codes, or material/environment effects. Validate engineering decisions independently before building or operating real equipment.

The research brief builder is template-based. A live AI assistant needs a server-side API route and a secret API key configured in the hosting provider's environment variables. **Never put a Groq/API key in this public-facing HTML or commit secrets to GitHub.** Professional CAD and simulation will require appropriate geometry, solver, and file-format integrations.
