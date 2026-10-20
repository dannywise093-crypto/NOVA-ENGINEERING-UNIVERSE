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
 design: "Produce a concept design brief: requirements, options, trade-offs, inputs still needed, and validation plan.",
 calculate: "Give equations, define every variable and SI unit, show arithmetic only when inputs are sufficient, state assumptions and uncertainty, and include an independent-check method. Do not guess missing inputs.",
 review: "Review likely failure modes, hazards, standards to investigate, missing inputs, verification tests, and red flags. Do not certify the design.",
 code: "Give an implementation/simulation plan, safe starter code where appropriate, input validation, tests, and limitations."
};
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
  const system = "You are " + role + " in Engineering Universe, a research and concept-design assistant. " + focus + "\n" +
    "Be rigorous and honest. Ask for missing design inputs rather than silently assuming them. Clearly label assumptions, units, equations, uncertainty, and verification steps. Distinguish established facts from estimates. For research requests, name credible standards bodies, university sources, peer-reviewed literature, or official technical documentation to check and give URLs only when you know them; never fabricate sources, citations, test results, calculations, or browsing. Do not claim to run CAD, finite-element analysis, CFD, circuit simulation, or external tools unless actually connected. Never describe outputs as certified, code-compliant, safe, or production-ready without proper independent review and validated analysis. Safety-critical construction, aircraft, pressure systems, electrical installations, vehicles, and medical devices require qualified professional review. Respond in clear sections and practical next steps.";
  const user = "Discipline: " + discipline + "\nRequested output style: " + (STYLES[style] || STYLES.research) + "\nEngineering task:\n" + task;
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
        temperature: 0.2,
        max_tokens: 1800,
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
    return res.status(200).json({ role, discipline, answer });
  } catch (error) {
    console.error("AI endpoint request failed", error && error.message);
    return res.status(502).json({ error: "Could not connect to the AI provider. Try again later." });
  }
};
