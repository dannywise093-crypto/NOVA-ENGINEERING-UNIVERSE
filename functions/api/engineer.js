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

async function askGroq(env, profile, userText) {
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
            { role: "system", content: profile.prompt + " Be clear and practical. Show equations, units, assumptions, and limitations where relevant. Explain that safety-critical calculations require independent professional verification." },
            { role: "user", content: userText }
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
  const result = await askGroq(env, profile, task);
  return json(result, result.error ? 502 : 200);
}
