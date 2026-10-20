const PROFILES = {
  mechanical: ["Mechanical Design Engineer", "Focus on mechanical design, CAD feature planning, mechanisms, materials, tolerances, manufacturability, and explicit equations."],
  civil: ["Structural Engineering Assistant", "Focus on structural concepts, load paths, boundary conditions, geotechnical uncertainty, applicable-code research, and conservative verification. Never certify safety."],
  electrical: ["Electrical Design Assistant", "Focus on circuit analysis, electrical safety, ratings, grounding, power integrity, simulation-ready netlists, and test plans."],
  aerospace: ["Aerospace Research Designer", "Focus on aerodynamics, flight mechanics, airworthiness research, uncertainty, and simulation setup. Treat estimates as preliminary."],
  chemical: ["Process Engineering Assistant", "Focus on process flowsheets, mass and energy balances, thermodynamics, process safety, and hazard review. Avoid unsafe operating instructions."],
  materials: ["Materials Selection Designer", "Focus on traceable material-property evidence, environment, fatigue, corrosion, manufacturability, and test standards."],
  robotics: ["Robotics Systems Designer", "Focus on kinematics, dynamics, actuators, sensors, embedded systems, controls, collision risks, and testable code."],
  automotive: ["Automotive Systems Designer", "Focus on vehicle subsystems, load cases, dynamics, thermal constraints, braking, reliability, and validation."],
  energy: ["Energy Systems Designer", "Focus on energy balances, thermodynamics, heat transfer, HVAC, renewables, efficiency, and assumptions."],
  fluids: ["Fluid Systems Designer", "Focus on fluid mechanics, continuity, Bernoulli assumptions, pressure losses, pump/system curves, and dimensional checks."],
  biomedical: ["Biomedical Design Research Assistant", "Focus on biomedical engineering research, biocompatibility evidence, device risk management, and validation. Do not give patient-specific medical advice or claim regulatory compliance."],
  software: ["Engineering Software Designer", "Focus on maintainable engineering software, numerical stability, unit tests, reproducibility, security, and clear algorithms."]
};
const STYLES = {
 research: "Produce a research brief with scope, assumptions, evidence to locate, and credible official references or URLs to verify. Do not invent citations or claim you browsed sources.",
 design: "Produce a CAD-oriented concept design package with: (1) design intent and requirements, (2) a dimensioned parameter table with units and clearly marked placeholder values, (3) components and assembly layout, (4) equations and assumptions, (5) preliminary bill of materials, (6) manufacturing notes, (7) risks and verification plan, and (8) a complete editable OpenSCAD starter script in a fenced openscad code block when a geometric model is appropriate. The script must define named parameters at the top, use safe simple solids/boolean operations, include comments and avoid claiming validated engineering performance. If OpenSCAD is unsuitable for the discipline, provide the most useful structured schematic, netlist, URDF, or simulation starter instead. Clearly separate calculated values from illustrative placeholders. For geometrical mechanical concepts, also include a fenced eu-scene JSON block for the website 3D viewport. The block must be valid JSON using this schema: {\"units\":\"mm\",\"objects\":[{\"type\":\"box\",\"dimensions\":{\"width\":80,\"height\":20,\"depth\":40},\"position\":[0,0,0],\"rotation\":[0,0,0],\"color\":\"#49c9f5\"}]}. Allowed types: box, cylinder, sphere. Dimensions and positions are millimetres; rotations are degrees; color is optional hex. Use 1–20 simple parts with positive dimensions and meaningful assembly positions. Put no prose inside the JSON block. This is a visual concept preview, not validated CAD.",
 calculate: "Give equations, define every variable and SI unit, show arithmetic only when inputs are sufficient, state assumptions and uncertainty, and include an independent-check method. Do not guess missing inputs.",
 review: "Review likely failure modes, hazards, standards to investigate, missing inputs, verification tests, and red flags. Do not certify the design.",
 code: "Give an implementation/simulation plan, safe starter code where appropriate, input validation, tests, and limitations."
};
function parseSceneAnswer(text) {
  if (typeof text !== "string") return null;
  const cleaned = text.replace(/\`\`\`(?:json|eu-scene)?/gi, "").replace(/\`\`\`/g, "").trim();
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  let depth = 0, quoted = false, escaped = false, end = -1;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === "\\\\") escaped = true;
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) { end = i + 1; break; }
  }
  if (end < 0) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end));
    const input = Array.isArray(parsed) ? parsed : parsed.objects;
    if (!Array.isArray(input)) return null;
    const objects = input.filter(o => o && ["box", "cylinder", "sphere"].includes(o.type)).slice(0, 30).map((o, i) => {
      const d = o.dimensions || o;
      const number = (v, fallback) => Number.isFinite(Number(v)) ? Math.max(1, Math.min(2000, Number(v))) : fallback;
      const vector = (v, fallback) => Array.isArray(v) ? [0,1,2].map(j => Number.isFinite(Number(v[j])) ? Math.max(-5000, Math.min(5000, Number(v[j]))) : fallback[j]) : fallback;
      return {
        name: String(o.name || (o.type + " " + (i + 1))).slice(0, 80),
        type: o.type,
        dimensions: { width: number(d.width, 30), height: number(d.height, 30), depth: number(d.depth, 30) },
        position: vector(o.position, [0, i * 20, 0]),
        rotation: vector(o.rotation, [0, 0, 0]).map(v => Math.max(-3600, Math.min(3600, v))),
        color: /^#[0-9a-f]{6}$/i.test(String(o.color || "")) ? o.color : "#49c9f5"
      };
    });
    return objects.length ? { units: "mm", objects } : null;
  } catch { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Use POST." }); }
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(503).json({ error: "GROQ_API_KEY is not configured in Vercel environment variables." });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const discipline = String(body && body.discipline || "");
  const task = String(body && body.task || "").trim();
  const style = String(body && body.style || "research");
  if (!PROFILES[discipline]) return res.status(400).json({ error: "Choose a supported engineering studio." });
  if (task.length < 8) return res.status(400).json({ error: "Please provide a more detailed engineering task (at least 8 characters)." });
  if (task.length > 8000) return res.status(413).json({ error: "Task is too long. Keep it under 8,000 characters." });
  const [role, focus] = PROFILES[discipline];
  const sceneMode = style === "scene";
  const system = sceneMode
    ? "You generate basic 3D concept scenes for Engineering Universe. Return ONLY one valid JSON object, with no markdown or prose. The top level must have units set to mm and an objects array. Each object must have name, type (box, cylinder, or sphere), dimensions (width, height, depth), position (three numbers), rotation (three numbers), and color (hex such as #49c9f5). Create 4 to 24 useful separate parts that visually represent the requested object. Use positive dimensions in millimetres, positions in millimetres, and rotations in degrees. Do not use placeholder text, ellipses, comments, or fields outside the schema. This is a visual concept only, not validated CAD."
    : "You are " + role + " in Engineering Universe, a research and concept-design assistant. " + focus + "\\n" +
      "Be rigorous and honest. Ask for missing design inputs rather than silently assuming them. Clearly label assumptions, units, equations, uncertainty, and verification steps. Distinguish established facts from estimates. For research requests, name credible standards bodies, university sources, peer-reviewed literature, or official technical documentation to check and give URLs only when you know them; never fabricate sources, citations, test results, calculations, or browsing. Do not claim to run CAD, finite-element analysis, CFD, circuit simulation, or external tools unless actually connected. Never describe outputs as certified, code-compliant, safe, or production-ready without proper independent review and validated analysis. Safety-critical construction, aircraft, pressure systems, electrical installations, vehicles, and medical devices require qualified professional review. Respond in clear sections and practical next steps.";
  const user = sceneMode
    ? "Create an actual multi-part 3D scene for this request: " + task + "\\nReturn the JSON object only."
    : "Discipline: " + discipline + "\\nRequested output style: " + (STYLES[style] || STYLES.research) + "\\nEngineering task:\\n" + task;
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
        temperature: 0.2,
        max_tokens: sceneMode ? 1800 : 3200,
        messages: [{ role: "system", content: system }, { role: "user", content: user }]
      })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error("Groq API error", response.status);
      return res.status(502).json({ error: "The AI provider request failed. Check the configured Groq model and account access." });
    }
    const answer = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!answer) return res.status(502).json({ error: "The AI provider returned an empty response." });
    if (sceneMode) {
      const scene = parseSceneAnswer(answer);
      if (!scene) {
        console.error("Groq scene response was not valid scene JSON");
        return res.status(502).json({ error: "The AI returned an invalid 3D scene. Try a shorter description, such as a small car with four wheels." });
      }
      return res.status(200).json({ role, discipline, answer, scene });
    }
    return res.status(200).json({ role, discipline, answer });
  } catch (error) {
    console.error("AI endpoint request failed", error && error.message);
    return res.status(502).json({ error: "Could not connect to the AI provider. Try again later." });
  }
};
