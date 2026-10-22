const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
  const task = String(body.task || "").trim();
  const mode = String(body.mode || "calculate").slice(0, 80);
  if (!task) return json({ error: "Please enter a formula, calculation, or design question." }, 400);
  if (task.length > 12000) return json({ error: "Please keep the task under 12,000 characters." }, 413);

  const keys = [5, 1, 2, 3, 4, 6, 7].map(n => env["GROQ_API_KEY_" + n]).filter(Boolean);
  if (!keys.length) return json({ error: "Engineering Formula & Design AI is not configured. Add encrypted production Groq secrets in Cloudflare." }, 503);
  let lastError = "The AI provider returned an empty response.";
  for (const key of keys) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + key },
        body: JSON.stringify({
          model: env.GROQ_MODEL || "openai/gpt-oss-20b",
          temperature: 0.2,
          messages: [
            { role: "system", content: "You are Engineering Formula & Design AI, a rigorous engineering calculation and preliminary design assistant. Mode: " + mode + ". Do not claim to be a licensed human professional or promise 100% correctness. Explain the applicable formula and why it applies; define every symbol and SI unit; substitute only provided values; show each calculation step; check dimensions, significant figures, boundary conditions, and plausibility; and cross-check independently when possible. Ask for critical missing inputs instead of inventing them. Separate given data, assumptions, derived results, estimates, and unknowns. For build/materials requests, provide a bill of materials with item, specification/grade, quantity or sizing method, reason, applicable standard, inspection/testing, and unresolved choices; do not invent exact grades, quantities, certifications, or source citations. Identify relevant standards only when confident, and never fabricate references or claim a simulation/test occurred. Include hazards, failure modes, and validation/acceptance tests where relevant. Clearly mark safety-critical results as preliminary and require qualified professional review and applicable code compliance before construction or use." },
            { role: "user", content: task }
          ]
        })
      });
      const data = await response.json().catch(() => ({}));
      const answer = data.choices?.[0]?.message?.content?.trim();
      if (response.ok && answer) return json({ answer, model: data.model || env.GROQ_MODEL || "openai/gpt-oss-20b", assistant: "Engineering Formula & Design AI" });
      lastError = data.error?.message || ("AI provider returned HTTP " + response.status);
    } catch { lastError = "Could not connect to the AI provider."; }
  }
  return json({ error: lastError }, 502);
}
