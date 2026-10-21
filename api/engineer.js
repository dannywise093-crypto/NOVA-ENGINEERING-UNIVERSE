const { researchEngineering } = require("./_engineering-research");

const PROFILES = {
  mechanical: ["Mechanical CAD AI Assistant", "Focus on mechanical design, CAD feature planning, mechanisms, materials, tolerances, manufacturability, and explicit equations."],
  civil: ["Civil & Structural AI Assistant", "Focus on structural concepts, load paths, boundary conditions, geotechnical uncertainty, applicable-code research, and conservative verification. Never certify safety."],
  electrical: ["Electrical & Electronics AI Assistant", "Focus on circuit analysis, electrical safety, ratings, grounding, power integrity, simulation-ready netlists, and test plans."],
  aerospace: ["Aerospace & Flight AI Assistant", "Focus on aerodynamics, flight mechanics, airworthiness research, uncertainty, and simulation setup. Treat estimates as preliminary."],
  chemical: ["Chemical & Process AI Assistant", "Focus on process flowsheets, mass and energy balances, thermodynamics, process safety, and hazard review. Avoid unsafe operating instructions."],
  materials: ["Materials Science AI Assistant", "Focus on traceable material-property evidence, environment, fatigue, corrosion, manufacturability, and test standards."],
  robotics: ["Robotics & Mechatronics AI Assistant", "Focus on kinematics, dynamics, actuators, sensors, embedded systems, controls, collision risks, and testable code."],
  automotive: ["Automotive & Mobility AI Assistant", "Focus on vehicle subsystems, load cases, dynamics, thermal constraints, braking, reliability, and validation."],
  energy: ["Energy & Thermal AI Assistant", "Focus on energy balances, thermodynamics, heat transfer, HVAC, renewables, efficiency, and assumptions."],
  fluids: ["Fluid Systems AI Assistant", "Focus on fluid mechanics, continuity, Bernoulli assumptions, pressure losses, pump/system curves, and dimensional checks."],
  biomedical: ["Biomedical Engineering AI Assistant", "Focus on biomedical engineering research, biocompatibility evidence, device risk management, and validation. Do not give patient-specific medical advice or claim regulatory compliance."],
  software: ["Software & Computer Engineering AI Assistant", "Focus on maintainable engineering software, numerical stability, unit tests, reproducibility, security, and clear algorithms."]
};
const STYLES = {
 research: "Produce a research brief with scope, assumptions, evidence to locate, and credible official references or URLs to verify. Do not invent citations or claim you browsed sources.",
 design: "Produce a CAD-oriented concept design package with: (1) design intent and requirements, (2) a dimensioned parameter table with units and clearly marked placeholder values, (3) components and assembly layout, (4) equations and assumptions, (5) preliminary bill of materials, (6) manufacturing notes, (7) risks and verification plan, and (8) a complete editable OpenSCAD starter script in a fenced openscad code block when a geometric model is appropriate. The script must define named parameters at the top, use safe simple solids/boolean operations, include comments and avoid claiming validated engineering performance. If OpenSCAD is unsuitable for the discipline, provide the most useful structured schematic, netlist, URDF, or simulation starter instead. Clearly separate calculated values from illustrative placeholders. For geometrical mechanical concepts, also include a fenced eu-scene JSON block for the website 3D viewport. The block must be valid JSON using this schema: {\"units\":\"mm\",\"objects\":[{\"type\":\"box\",\"dimensions\":{\"width\":80,\"height\":20,\"depth\":40},\"position\":[0,0,0],\"rotation\":[0,0,0],\"color\":\"#49c9f5\"}]}. Allowed types: box, cylinder, sphere, cone, torus. Dimensions and positions are millimetres; rotations are degrees; color is optional hex. Use 1–20 simple parts with positive dimensions and meaningful assembly positions. Put no prose inside the JSON block. This is a visual concept preview, not validated CAD.",
 calculate: "Give equations, define every variable and SI unit, show arithmetic only when inputs are sufficient, state assumptions and uncertainty, and include an independent-check method. Do not guess missing inputs.",
 review: "Review likely failure modes, hazards, standards to investigate, missing inputs, verification tests, and red flags. Do not certify the design.",
 code: "Give an implementation/simulation plan, safe starter code where appropriate, input validation, tests, and limitations."
};
function parseSceneAnswer(text) {
  if (typeof text !== "string") return null;
  // Prefer the labelled scene block so braces in CAD/code examples do not interfere.
  const labelled = text.match(/```\s*eu-scene\s*\n([\s\S]*?)\n```/i);
  const cleaned = (labelled ? labelled[1] : text.replace(/```(?:json|eu-scene)?/gi, "").replace(/```/g, "")).trim();
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  let depth = 0, quoted = false, escaped = false, end = -1;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
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
    const objects = input.filter(o => o && ["box", "cylinder", "sphere", "cone", "torus"].includes(o.type)).slice(0, 30).map((o, i) => {
      const d = o.dimensions || o;
      const number = (v, fallback) => Number.isFinite(Number(v)) ? Math.max(1, Math.min(2000, Number(v))) : fallback;
      const vector = (v, fallback) => Array.isArray(v) ? [0,1,2].map(j => Number.isFinite(Number(v[j])) ? Math.max(-5000, Math.min(5000, Number(v[j]))) : fallback[j]) : fallback;
      return { name: String(o.name || (o.type + " " + (i + 1))).slice(0, 80), type: o.type, dimensions: { width: number(d.width, 30), height: number(d.height, 30), depth: number(d.depth, 30) }, position: vector(o.position, [0, i * 20, 0]), rotation: vector(o.rotation, [0, 0, 0]).map(v => Math.max(-3600, Math.min(3600, v))), color: /^#[0-9a-f]{6}$/i.test(String(o.color || "")) ? o.color : "#49c9f5" };
    });
    return objects.length ? { units: "mm", objects } : null;
  } catch { return null; }
}
module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Use POST." }); }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const discipline = String(body && body.discipline || "");
  const task = String(body && body.task || "").trim();
  const requestedStyle = String(body && body.style || "research");
  const style = Object.prototype.hasOwnProperty.call(STYLES, requestedStyle) || requestedStyle === "scene" ? requestedStyle : "research";
  if (!PROFILES[discipline]) return res.status(400).json({ error: "Choose a supported engineering studio." });
  const keyVariableByDiscipline = {
    mechanical: "GROQ_API_KEY_1", civil: "GROQ_API_KEY_1", electrical: "GROQ_API_KEY_1",
    aerospace: "GROQ_API_KEY_2", chemical: "GROQ_API_KEY_2", materials: "GROQ_API_KEY_2",
    robotics: "GROQ_API_KEY_3", automotive: "GROQ_API_KEY_3", energy: "GROQ_API_KEY_3",
    fluids: "GROQ_API_KEY_4", biomedical: "GROQ_API_KEY_4", software: "GROQ_API_KEY_4"
  };
  const keyVariable = body && body.assistant === "formula-design-ai" ? "GROQ_API_KEY_5" : keyVariableByDiscipline[discipline];
  // Use the discipline-specific key when configured; retain the old key as a safe migration fallback.
  const key = process.env[keyVariable] || process.env.GROQ_API_KEY;
  if (!key) return res.status(503).json({ error: keyVariable + " is not configured in Vercel Production. Add this variable for the selected engineering assistant (or configure GROQ_API_KEY as a shared fallback)." });
  if (task.length < 8) return res.status(400).json({ error: "Please provide a more detailed engineering task (at least 8 characters)." });
  if (task.length > 8000) return res.status(413).json({ error: "Task is too long. Keep it under 8,000 characters." });
  const [role, focus] = PROFILES[discipline];
  // Search public scholarly indexes before generating an answer. Scene-only output remains strict JSON.
  const research = style === "scene" ? null : await researchEngineering(task, discipline);
  const sceneMode = style === "scene";
  const system = sceneMode
    ? "You generate basic 3D concept scenes for Engineering Universe. Return ONLY one valid JSON object, with no markdown or prose. The top level must have units set to mm and an objects array. Each object must have name, type (box, cylinder, sphere, cone, or torus), dimensions (width, height, depth), position (three numbers), rotation (three numbers), and color (hex such as #49c9f5). Create 4 to 24 useful separate parts that visually represent the requested object. Use positive dimensions in millimetres, positions in millimetres, and rotations in degrees. Do not use placeholder text, ellipses, comments, or fields outside the schema. This is a visual concept only, not validated CAD."
    : "You are " + role + " in NOVA Engineering Universe. Your identity and primary purpose are to serve as the dedicated " + role + " for this discipline. " + focus + "\\n" +
      "IDENTITY AND PURPOSE RULE: If the user asks who you are, what you are, what you do, what you are built for, what you can help with, or similar questions, answer directly in the first person. Identify yourself by the exact role name above, explain your specific engineering purpose in plain language, name 3–5 tasks you are designed to help with from this discipline, and briefly state your limits. Do not answer with a generic AI introduction. Make clear you are NOVA Engineering Universe’s specialized AI assistant, not a human engineer and not a certified professional. For all other requests, apply the same specialized role to the task. " +
      "Stay strictly within the selected discipline and its focus above. Do not answer as a generic all-purpose chatbot or drift into unrelated engineering fields. If the task is outside this discipline, say so briefly and redirect the user to the appropriate NOVA assistant. Be rigorous and honest. Ask for missing design inputs rather than silently assuming them. Clearly label assumptions, units, equations, uncertainty, and verification steps. Distinguish established facts from estimates. For research requests, name credible standards bodies, university sources, peer-reviewed literature, or official technical documentation to check and give URLs only when you know them; never fabricate sources, citations, test results, calculations, or browsing. Do not claim to run CAD, finite-element analysis, CFD, circuit simulation, or external tools unless actually connected. Never describe outputs as certified, code-compliant, safe, or production-ready without proper independent review and validated analysis. Safety-critical construction, aircraft, pressure systems, electrical installations, vehicles, and medical devices require qualified professional review. Respond in clear sections and practical next steps.";
  const user = sceneMode
    ? "Create an actual multi-part 3D scene for this request: " + task + "\\nReturn the JSON object only."
    : "Discipline: " + discipline + "\\nRequested output style: " + (STYLES[style] || STYLES.research) + "\\nEngineering task:\\n" + task +
      (research ? "\\n\\nLIVE PUBLIC RESEARCH SEARCH (retrieved for this request):\\n" + (research.sources.length ? research.sources.map((s, i) => (i + 1) + ". " + s.title + (s.year ? " (" + s.year + ")" : "") + " — " + s.url + (s.venue ? " — " + s.venue : "") + (s.abstract ? " — Abstract/summary: " + s.abstract : "") + (s.openAccessUrl ? " — Open-access full-text link: " + s.openAccessUrl : "")).join("\\n") : "No usable records were returned from Crossref/OpenAlex for this query.") + "\\nResearch status: " + research.status + ". " + research.note + "\\nUse only relevant records, distinguish metadata from full-text verification, do not imply these sources prove a design works, and explicitly state when the evidence is insufficient. Never claim you physically tested a material or ran a simulation." : "");
  try {
    const endpoint = "https://api.groq.com/openai/v1/chat/completions";
    const primaryModel = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
    const fallbackModel = "llama-3.3-70b-versatile";
    async function askGroq(model) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: sceneMode ? 1800 : 3200,
          messages: [{ role: "system", content: system }, { role: "user", content: user }]
        })
      });
      let data;
      try { data = await response.json(); } catch { data = null; }
      if (!response.ok) {
        const providerError = data && data.error;
        console.error("Groq API error", JSON.stringify({
          status: response.status,
          model,
          code: providerError && providerError.code,
          type: providerError && providerError.type,
          message: providerError && providerError.message
        }));
        return { error: true, status: response.status, data };
      }
      const message = data && data.choices && data.choices[0] && data.choices[0].message;
      let answer = message && message.content;
      if (Array.isArray(answer)) {
        answer = answer.map(part => typeof part === "string" ? part : (part && (part.text || part.content) || "")).join("");
      }
      if (typeof answer !== "string") answer = "";
      answer = answer.trim();
      if (!answer) {
        console.error("Groq returned no text", JSON.stringify({
          model,
          finish_reason: data && data.choices && data.choices[0] && data.choices[0].finish_reason,
          message_keys: message && typeof message === "object" ? Object.keys(message) : [],
          has_refusal: Boolean(message && message.refusal)
        }));
      }
      return { answer, data, model };
    }

    // Give each provider attempt a bounded time so the UI does not wait forever.
    // Retry the fallback model on provider errors as well as empty responses.
    let result = await askGroq(primaryModel);
    if ((result.error || !result.answer) && primaryModel !== fallbackModel) {
      console.warn("Primary Groq model failed or returned empty text; retrying fallback model", {
        primaryModel,
        status: result.status || null,
        emptyAnswer: !result.error && !result.answer
      });
      result = await askGroq(fallbackModel);
    }
    if (result.error) {
      const status = result.status;
      const providerError = result.data && result.data.error;
      const providerMessage = providerError && typeof providerError.message === "string" ? providerError.message : "";
      console.error("Groq fallback failed", JSON.stringify({ status, model: result.model, code: providerError && providerError.code }));
      if (status === 401 || status === 403) {
        return res.status(502).json({ error: "Groq rejected the configured API key. Check that GROQ_API_KEY_5 is valid and enabled in Vercel Production." });
      }
      if (status === 429) {
        return res.status(503).json({ error: "Groq rate limit or free-tier quota reached for both models. Wait for the quota to reset, or use another valid Groq key in Vercel Production." });
      }
      if (status === 400 && /model|decommission|not found|does not exist/i.test(providerMessage)) {
        return res.status(502).json({ error: "Groq rejected both configured model choices. Check model availability for your Groq account." });
      }
      return res.status(502).json({ error: "Groq could not complete the request with either model. Check the API key, quota, model access, and Vercel runtime logs." });
    }
    const answer = result.answer;
    if (!answer) return res.status(502).json({ error: "Both Groq models returned no text. Try again with a shorter task and check the Groq model access and quota." });
    if (sceneMode) {
      const scene = parseSceneAnswer(answer);
      if (!scene) {
        console.error("Groq scene response was not valid scene JSON");
        return res.status(502).json({ error: "Groq returned an invalid 3D scene. Try a shorter description, such as a small car with four wheels." });
      }
      return res.status(200).json({ role, discipline, answer, scene, model: result.model });
    }
    const scene = style === "design" ? parseSceneAnswer(answer) : null;
    return res.status(200).json({ role, discipline, answer, ...(scene ? { scene } : {}), ...(research ? { research } : {}), model: result.model });
  } catch (error) {
    console.error("AI endpoint request failed", error && error.message);
    return res.status(502).json({ error: "Could not connect to the AI provider. Try again later." });
  }
};
