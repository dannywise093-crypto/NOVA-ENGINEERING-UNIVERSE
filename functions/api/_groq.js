const PROFILES = {
  mechanical: ["Mechanical CAD AI Assistant", "mechanical design, mechanisms, CAD planning, materials, tolerances, manufacturability, and equations"],
  civil: ["Civil & Structural AI Assistant", "structural concepts, load paths, geotechnical uncertainty, codes to research, and conservative verification; never certify safety"],
  electrical: ["Electrical & Electronics AI Assistant", "circuit analysis, electrical safety, ratings, grounding, power integrity, netlists, and test plans"],
  aerospace: ["Aerospace & Flight AI Assistant", "aerodynamics, flight mechanics, airworthiness research, uncertainty, and simulation setup"],
  chemical: ["Chemical & Process AI Assistant", "process flowsheets, mass and energy balances, thermodynamics, process safety, and hazard review"],
  materials: ["Materials Science AI Assistant", "material-property evidence, environment, fatigue, corrosion, manufacturing, and test standards"],
  robotics: ["Robotics & Mechatronics AI Assistant", "kinematics, dynamics, actuators, sensors, embedded systems, controls, and testable code"],
  automotive: ["Automotive & Mobility AI Assistant", "vehicle subsystems, load cases, dynamics, thermal constraints, braking, reliability, and validation"],
  energy: ["Energy & Thermal AI Assistant", "energy balances, thermodynamics, heat transfer, HVAC, renewables, and efficiency"],
  fluids: ["Fluid Systems AI Assistant", "fluid mechanics, continuity, Bernoulli assumptions, pressure losses, pump curves, and dimensional checks"],
  biomedical: ["Biomedical Engineering AI Assistant", "biomedical research, biocompatibility evidence, device risk management, and validation; no patient-specific medical advice"],
  software: ["Software & Computer Engineering AI Assistant", "maintainable engineering software, numerical stability, tests, reproducibility, security, and algorithms"]
};
const KEY_FOR = { mechanical:1,civil:1,electrical:2,aerospace:2,chemical:3,materials:3,robotics:4,automotive:4,energy:6,fluids:6,biomedical:7,software:7 };
const STYLES = {
 research: "Provide a research brief, assumptions, evidence to verify, and credible references only when known. Never invent citations.",
 design: "Provide design intent, requirements, dimensioned parameters with units, equations and assumptions, components, preliminary materials, manufacturing notes, risks, verification plan, and suitable editable starter code when appropriate. Clearly label placeholders and unvalidated concepts.",
 calculate: "Define equations, variables, SI units, assumptions and uncertainty. Show arithmetic only when inputs suffice; ask for missing inputs.",
 review: "Review failure modes, hazards, standards to investigate, missing inputs, verification tests and red flags. Do not certify safety.",
 code: "Give a practical implementation plan, safe starter code, input validation, tests and limitations.",
 scene: "Return a valid JSON object only with units:'mm' and objects:[{name,type,dimensions:{width,height,depth},position:[x,y,z],rotation:[x,y,z],color:'#49c9f5'}]. Use 4-12 useful parts; types box, cylinder, sphere, cone, torus; positive dimensions. This is only a visual concept, not validated CAD."
};
export async function runEngineeringAI(request, env, { formula = false } = {}) {
  const cors = { "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store", "Access-Control-Allow-Origin":"*" };
  if (request.method === "OPTIONS") return new Response(null,{status:204,headers:{...cors,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type"}});
  if (request.method !== "POST") return Response.json({error:"Use POST."},{status:405,headers:cors});
  let body;
  try { body = await request.json(); } catch { return Response.json({error:"Request body must be valid JSON."},{status:400,headers:cors}); }
  const task = String(body.task || "").trim();
  if (task.length < 8) return Response.json({error:"Please provide an engineering task of at least 8 characters."},{status:400,headers:cors});
  if (task.length > 8000) return Response.json({error:"Task must be under 8,000 characters."},{status:413,headers:cors});
  const formulaMode = formula || body.assistant === "formula-design-ai";
  const discipline = formulaMode ? String(body.discipline || "mechanical") : String(body.discipline || "mechanical");
  const profile = PROFILES[discipline];
  if (!profile) return Response.json({error:"Choose a supported engineering studio."},{status:400,headers:cors});
  const style = formulaMode ? (["calculate","design","research","review","code"].includes(body.mode) ? body.mode : "calculate") : (Object.hasOwn(STYLES,String(body.style)) ? String(body.style) : "research");
  const keyNums = formulaMode ? [5,1,2,3,4,6,7] : [KEY_FOR[discipline],1,2,3,4,5,6,7];
  const keys = [...new Set(keyNums)].map(n=>({n,key:env["GROQ_API_KEY_"+n]})).filter(x=>typeof x.key==="string"&&x.key.trim());
  if (!keys.length) return Response.json({error:"No Groq API keys are configured for this Cloudflare Pages production deployment. Add GROQ_API_KEY_1 through GROQ_API_KEY_7 as production secrets, then redeploy."},{status:503,headers:cors});
  const scene = style === "scene";
  const system = scene ? STYLES.scene : "You are "+profile[0]+" in NOVA Engineering Universe. Focus on "+profile[1]+". If asked who you are, explain this exact role, 3-5 relevant tasks, and limitations. Be rigorous: label assumptions, units, uncertainty and verification; never claim certification, physical testing, CAD execution or simulations that did not happen. Safety-critical designs require qualified professional review.\n\nOutput style: "+STYLES[style];
  const user = (formulaMode ? "Engineering Formula & Design AI request. " : "Discipline: "+discipline+". ") + task;
  let lastStatus=502;
  for (const entry of keys) {
    for (const model of [env.GROQ_MODEL || "openai/gpt-oss-20b","llama-3.3-70b-versatile"]) {
      try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+entry.key,"Content-Type":"application/json"},body:JSON.stringify({model,temperature:0.2,max_tokens:scene?1800:3000,messages:[{role:"system",content:system},{role:"user",content:user}]}),signal:AbortSignal.timeout(45000)});
        const data = await response.json().catch(()=>null);
        if (!response.ok) { lastStatus=response.status; if ([401,403,400,404].includes(response.status)) break; continue; }
        const answer = data?.choices?.[0]?.message?.content;
        const text = Array.isArray(answer)?answer.map(p=>typeof p==="string"?p:(p?.text||p?.content||"")).join(""):String(answer||"");
        if (!text.trim()) { lastStatus=502; continue; }
        let objects = null;
        if (scene) { try { const parsed=JSON.parse(text); objects=Array.isArray(parsed.objects)?parsed.objects:[]; } catch {} }
        return Response.json({ok:true,answer:text.trim(),model, ...(scene?{scene:{units:"mm",objects}}:{})},{status:200,headers:cors});
      } catch { lastStatus=502; }
    }
  }
  const status = lastStatus===429?429:(lastStatus===401||lastStatus===403?502:503);
  return Response.json({error:lastStatus===429?"All configured Groq keys are rate-limited. Please retry shortly.": "Groq did not return a usable response. Check that the production secrets are valid and enabled.",status:lastStatus},{status,headers:cors});
}
