module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST for Engineering Formula & Design AI." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const task = String(body && body.task || "").trim();
  if (task.length < 8) return res.status(400).json({ error: "Please describe the engineering task in at least 8 characters." });
  if (task.length > 8000) return res.status(413).json({ error: "Task is too long. Keep it under 8,000 characters." });

  const key = process.env.GROQ_API_KEY_5 || process.env.GROQ_API_KEY;
  if (!key) {
    return res.status(503).json({ error: "Formula & Design AI is not connected: add GROQ_API_KEY_5 to the Vercel Production environment and redeploy." });
  }

  const system = [
    "You are Engineering Formula and Design AI inside NOVA Engineering Universe.",
    "Your dedicated purpose is engineering calculations, formulas, concept design, dimensions, material selection, CAD starter models, and design verification planning.",
    "When asked who you are, explain your exact role and limitations. Stay focused on engineering formula and design work.",
    "For each design task, organize the response into: 1) design intent and requirements, 2) known inputs and missing inputs, 3) assumptions, 4) formulas with each variable and SI unit defined, 5) worked calculations only when sufficient inputs exist, 6) preliminary dimension/parameter table with units and placeholder values clearly identified, 7) components/materials, 8) manufacturing considerations, 9) verification tests and risks, and 10) editable starter code when useful.",
    "Never invent user inputs, measured data, standards citations, test results, or calculations. If key information is missing, ask concise follow-up questions and provide only a clearly labeled preliminary example.",
    "For a simple 3D mechanical concept, include an optional fenced eu-scene JSON block with schema {\"units\":\"mm\",\"objects\":[{\"type\":\"box\",\"dimensions\":{\"width\":80,\"height\":20,\"depth\":40},\"position\":[0,0,0],\"rotation\":[0,0,0],\"color\":\"#49c9f5\"}]}. Allowed types: box, cylinder, sphere, cone, torus. Use 1-20 parts, positive dimensions in mm, and valid JSON only inside the block.",
    "Clearly label all results as preliminary concepts, not certified engineering. Safety-critical structures, aircraft, pressure systems, electrical installations, vehicles, and medical devices need qualified review.",
    "Use readable Markdown, equations, units, and practical next steps. Do not return an empty response."
  ].join("\n");

  const primaryModel = process.env.GROQ_FORMULA_MODEL || "llama-3.3-70b-versatile";
  const fallbackModel = "openai/gpt-oss-20b";
  const models = primaryModel === fallbackModel ? [primaryModel] : [primaryModel, fallbackModel];

  async function ask(model) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 3500,
          messages: [
            { role: "system", content: system },
            { role: "user", content: "Prepare an engineering formula and design response for this task:\n\n" + task }
          ]
        }),
        signal: controller.signal
      });
      let data = null;
      try { data = await response.json(); } catch (_) {}
      if (!response.ok) {
        const detail = data && data.error && data.error.message ? String(data.error.message) : "";
        console.error("Formula Design AI provider failure", JSON.stringify({ model, status: response.status, detail: detail.slice(0, 300) }));
        return { ok: false, status: response.status, detail };
      }
      const message = data && data.choices && data.choices[0] && data.choices[0].message;
      let answer = message && message.content;
      if (Array.isArray(answer)) answer = answer.map(x => typeof x === "string" ? x : (x && (x.text || x.content) || "")).join("");
      if (typeof answer !== "string" || !answer.trim()) {
        console.error("Formula Design AI provider returned empty content", JSON.stringify({ model, finish_reason: data && data.choices && data.choices[0] && data.choices[0].finish_reason }));
        return { ok: false, status: 502, detail: "The model returned no text." };
      }
      return { ok: true, answer: answer.trim(), model };
    } catch (error) {
      const timeout = error && error.name === "AbortError";
      console.error("Formula Design AI request exception", JSON.stringify({ model, message: error && error.message, timeout }));
      return { ok: false, status: timeout ? 504 : 502, detail: timeout ? "The model request timed out." : "Could not connect to Groq." };
    } finally {
      clearTimeout(timer);
    }
  }

  let last = null;
  for (const model of models) {
    last = await ask(model);
    if (last.ok) {
      return res.status(200).json({ ok: true, assistant: "formula-design-ai", role: "Engineering Formula and Design AI", answer: last.answer, model: last.model });
    }
  }

  const detail = last && last.detail || "";
  if (last && (last.status === 401 || last.status === 403)) {
    return res.status(502).json({ error: "Groq rejected GROQ_API_KEY_5. Verify that the key is valid and active in Vercel Production." });
  }
  if (last && last.status === 429) {
    return res.status(503).json({ error: "Groq quota or rate limit reached for both models. Wait for the quota to reset or configure another valid Groq key." });
  }
  if (last && last.status === 504) {
    return res.status(504).json({ error: "Formula & Design AI timed out while waiting for Groq. Please retry with a shorter task." });
  }
  return res.status(502).json({ error: "Formula & Design AI could not get a usable answer from either Groq model. " + (detail ? detail.slice(0, 220) : "Check Vercel runtime logs and model availability.") });
};
