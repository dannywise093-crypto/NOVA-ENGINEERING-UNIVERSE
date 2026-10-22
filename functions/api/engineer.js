const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

const profiles = {
  mechanical: { key: 1, name: "Mechanical Engineering AI", prompt: "You are Mechanical Engineering AI. Focus on machine design, mechanics, thermodynamics, manufacturing, CAD, and mechanical systems." },
  civil: { key: 1, name: "Civil & Structural Engineering AI", prompt: "You are Civil & Structural Engineering AI. Focus on structural analysis, construction, materials, geotechnics, and civil infrastructure. Flag safety-critical assumptions and require licensed review for real structures." },
  electrical: { key: 2, name: "Electrical Engineering AI", prompt: "You are Electrical Engineering AI. Focus on circuits, power systems, electronics, controls, and electrical safety." },
  aerospace: { key: 2, name: "Aerospace & Flight AI", prompt: "You are Aerospace & Flight AI. Focus on aerodynamics, flight mechanics, propulsion, spacecraft, and aerospace systems. Treat flight-critical outputs as preliminary only." },
  chemical: { key: 3, name: "Chemical Engineering AI", prompt: "You are Chemical Engineering AI. Focus on process engineering, thermodynamics, transport phenomena, reaction engineering, and process safety." },
  materials: { key: 3, name: "Materials Science AI", prompt: "You are Materials Science AI. Focus on material properties, selection, metallurgy, polymers, ceramics, composites, and testing." },
  robotics: { key: 4, name: "Robotics & Mechatronics AI", prompt: "You are Robotics & Mechatronics AI. Focus on robot kinematics, sensors, actuators, embedded systems, and automation." },
  automotive: { key: 4, name: "Automotive Engineering AI", prompt: "You are Automotive Engineering AI. Focus on vehicle dynamics, powertrains, chassis, EV systems, and automotive design." },
  "formula-design": { key: 5, name: "Engineering Formula & Design AI", prompt: "You are Engineering Formula & Design AI. Your purpose is to explain engineering formulas, define variables and SI units, show transparent step-by-step calculations, state assumptions, check dimensions, and help develop preliminary designs. Ask for missing values when needed. Never invent input values silently." },
  energy: { key: 6, name: "Energy Systems AI", prompt: "You are Energy Systems AI. Focus on energy conversion, renewables, storage, efficiency, and power generation." },
  fluids: { key: 6, name: "Fluid Mechanics AI", prompt: "You are Fluid Mechanics AI. Focus on fluid statics, flow, pumps, pipes, turbomachinery, and heat/fluid systems." },
  biomedical: { key: 7, name: "Biomedical Engineering AI", prompt: "You are Biomedical Engineering AI. Focus on medical-device concepts, biomechanics, instrumentation, and biomedical systems; do not provide diagnoses." },
  software: { key: 7, name: "Engineering Software AI", prompt: "You are Engineering Software AI. Focus on engineering programming, simulation, numerical methods, automation, and software tools." }
};


function needsLiveSearch(text) {
  return /\b(latest|current|currently|today|right now|real[- ]time|recent|newest|up[- ]to[- ]date|202[5-9]|20[3-9][0-9]|documentation|datasheet|technical spec|specification|standard(?:s)?|code requirement|regulation|compliance|research|paper|journal|study|benchmark|release notes|version|manufacturer|product comparison|market price|cost estimate|source|citation|reference|web search|browse|internet|news)\b/i.test(text);
}
function decodeHtml(s) {
  return String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}
async function liveWebSearch(query) {
  const headers = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "referer": "https://html.duckduckgo.com/",
    "sec-fetch-dest": "document", "sec-fetch-mode": "navigate", "sec-fetch-site": "same-site"
  };
  const endpoints = [
    "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query.slice(0, 500)),
    "https://lite.duckduckgo.com/lite/?q=" + encodeURIComponent(query.slice(0, 500))
  ];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { headers, redirect: "follow", signal: AbortSignal.timeout(8000) });
      const html = await response.text();
      if (!response.ok || response.status === 202 || /challenge-form|anomaly-modal|captcha|select all squares/i.test(html)) continue;
      const results = [];
      const pattern = /<a\b[^>]*class=["'][^"']*(?:result__a|result-link)[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      while ((m = pattern.exec(html)) && results.length < 6) {
        let url = m[1] || "";
        const title = decodeHtml(m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
        if (url.startsWith("//")) url = "https:" + url;
        const wrapped = url.match(/[?&](?:uddg|u)=([^&]+)/i);
        if (wrapped) { try { url = decodeURIComponent(wrapped[1]); } catch {} }
        if (/^https?:\/\//i.test(url) && title && !results.some(r => r.url === url)) results.push({ title, url, snippet: "" });
      }
      if (results.length) return results;
    } catch { /* try the keyless HTML fallback */ }
  }
  return [];
}
function formatSearchContext(results) {
  if (!results.length) return "";
  return "\n\nLIVE WEB SEARCH RESULTS (current search; snippets are leads, not guaranteed facts):\n" +
    results.map((r, i) => (i + 1) + ". " + r.title + "\nURL: " + r.url + "\nSnippet: " + r.snippet).join("\n\n") +
    "\n\nGround current claims in these sources. Cite relevant sources using their exact URLs, distinguish facts from inference, and say when results are insufficient or conflicting.";
}

async function askGroq(env, profile, userMessages) {
  const keys = [profile.key, 1, 2, 3, 4, 5, 6, 7].filter((n, i, a) => a.indexOf(n) === i)
    .map(n => env["GROQ_API_KEY_" + n]).filter(Boolean);
  if (!keys.length) return { error: "AI is not configured: production Groq secrets are missing." };
  let lastError = "No AI response was returned.";
  for (const key of keys) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + key },
        body: JSON.stringify({
          model: env.GROQ_MODEL || "openai/gpt-oss-20b",
          temperature: 0.25,
          messages: [
            { role: "system", content: profile.prompt + " Apply a rigorous engineering quality protocol: do not claim to be a licensed human professional or guarantee 100% correctness. First identify the user's goal, application, operating environment, loads, performance targets, constraints, and applicable jurisdiction/standards. If critical inputs are missing, ask focused clarifying questions or give a clearly labeled preliminary answer with explicit assumptions—never silently invent specifications. Separate verified facts, estimates, assumptions, and recommendations. Show equations, symbol definitions, SI units, substitutions, dimensional checks, tolerances, uncertainty, and independent cross-checks when relevant. For build/materials requests, provide a bill of materials table with item, required specification/grade, quantity or sizing method, rationale, applicable standard, sourcing/inspection requirements, and unresolved data; do not invent exact quantities, grades, part numbers, or certifications without enough design inputs. Include manufacturing/assembly steps, tools, testing/acceptance criteria, failure modes, hazards, maintenance, and disposal where relevant. Cite standards and sources only when confident they exist; never fabricate citations, test results, simulations, or calculations. For safety-critical systems, legal compliance, medical devices, pressure systems, vehicles, structures, aircraft, mains electricity, or hazardous processes, clearly state that outputs are preliminary and require review by a qualified, appropriately licensed engineer and applicable code compliance before construction or use. Be candid about uncertainty and say when evidence or data is insufficient." },
            ...userMessages.map(m => ({ role: m.role, content: m.content }))
          ]
        })
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.choices?.[0]?.message?.content?.trim()) {
        return { answer: data.choices[0].message.content.trim(), model: data.model || env.GROQ_MODEL || "openai/gpt-oss-20b", assistant: profile.name };
      }
      lastError = data.error?.message || ("AI provider returned HTTP " + response.status);
    } catch (e) { lastError = "Could not connect to the AI provider."; }
  }
  return { error: lastError };
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
  const discipline = String(body.discipline || "mechanical").toLowerCase().replace(/[^a-z-]/g, "");
  const profile = profiles[discipline] || profiles.mechanical;
  const task = String(body.task || "").trim();
  if (!task) return json({ error: "Please enter an engineering question or task." }, 400);
  if (task.length > 12000) return json({ error: "Please keep the task under 12,000 characters." }, 413);
  const style = String(body.style || "design").toLowerCase();
  const wantsScene = style === "scene" || style === "design";
  const sceneInstructions = wantsScene ? `

CAD SCENE OUTPUT REQUIREMENT:
After your engineering explanation, include exactly one machine-readable block using this format:
<eu-scene>
{"units":"mm","objects":[{"type":"box","dimensions":{"width":40,"depth":30,"height":20},"position":[0,0,0],"rotation":[0,0,0],"color":"#49c9f5"}]}
</eu-scene>
Create a useful preliminary concept from the user's request. Supported primitive types are box, cylinder, sphere, cone, torus. Include 1-30 objects. All dimensions must be finite positive millimetres; positions and rotations are finite numbers in millimetres/degrees. For cylinders/cones, width and depth represent diameter; height is axial length. Use simple primitives only; do not claim complex surfaces, holes, fillets, simulation, or manufacturing-ready geometry unless represented. If essential dimensions are missing, clearly label reasonable illustrative assumptions in the explanation and keep geometry conceptual. Output valid JSON inside the tags, no markdown fences. Never place code or other text inside the tags.` : "";
  let conversation = Array.isArray(body.messages) ? body.messages : [{ role: "user", content: task }];
  conversation = conversation.filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim()).slice(-24).map(m => ({ role: m.role, content: m.content.slice(0, 12000) }));
  if (!conversation.length || conversation[conversation.length - 1].role !== "user") conversation.push({ role: "user", content: task });
  const searchQuery = conversation.filter(m => m.role === "user").slice(-4).map(m => m.content).join("\\n").slice(-1800);
  let searchResults = [];
  if (needsLiveSearch(searchQuery)) {
    try { searchResults = await liveWebSearch(searchQuery); } catch { /* Search failure should not block ordinary AI responses. */ }
  }
  if (searchResults.length) conversation[conversation.length - 1].content += formatSearchContext(searchResults);
  if (wantsScene) conversation[conversation.length - 1].content += sceneInstructions;
  const result = await askGroq(env, profile, conversation);
  if (searchResults.length) result.sources = searchResults.map(({title,url}) => ({title,url}));
  if (result.error) return json(result, 502);
  if (wantsScene) {
    const match = result.answer.match(/<eu-scene>\s*([\s\S]*?)\s*<\/eu-scene>/i);
    if (match) {
      try {
        const raw = JSON.parse(match[1]);
        const allowed = new Set(["box", "cylinder", "sphere", "cone", "torus"]);
        const objects = Array.isArray(raw.objects) ? raw.objects.slice(0, 30).map((item) => {
          const type = String(item.type || "").toLowerCase();
          if (!allowed.has(type)) throw new Error("Unsupported CAD primitive: " + type);
          const d = item.dimensions || {};
          const dimensions = { width: Number(d.width), depth: Number(d.depth), height: Number(d.height) };
          if (!Object.values(dimensions).every(n => Number.isFinite(n) && n > 0 && n <= 1000000)) throw new Error("CAD dimensions must be finite positive millimetres.");
          const position = Array.isArray(item.position) ? item.position.slice(0,3).map(Number) : [0,0,0];
          const rotation = Array.isArray(item.rotation) ? item.rotation.slice(0,3).map(Number) : [0,0,0];
          if (position.length !== 3 || rotation.length !== 3 || ![...position,...rotation].every(n => Number.isFinite(n) && Math.abs(n) <= 1000000)) throw new Error("CAD position and rotation values must be finite.");
          return { type, dimensions, position, rotation, color: /^#[0-9a-f]{6}$/i.test(item.color || "") ? item.color : "#49c9f5" };
        }) : [];
        if (objects.length < 1) throw new Error("The AI did not provide any supported CAD objects.");
        result.scene = { units: "mm", objects };
        result.answer = result.answer.replace(match[0], "").trim();
      } catch (error) {
        result.scene_error = "AI explanation was returned, but its CAD scene could not be validated: " + error.message;
      }
    } else {
      result.scene_error = "AI explanation was returned without a valid <eu-scene> block. Try asking for a simpler primitive-based concept.";
    }
  }
  return json(result, 200);
}
