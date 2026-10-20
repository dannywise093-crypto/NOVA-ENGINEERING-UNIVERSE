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
