module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST." });
  }
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); }
    catch { return res.status(400).json({ error: "Invalid JSON." }); }
  }
  const params = body && body.params;
  if (!params || typeof params !== "object" || Array.isArray(params)) return res.status(400).json({ error: "Provide beam simulation parameters." });
  const bounds = {
    lengthM: [0.001, 10], forceN: [0, 1000000], elasticModulusPa: [1000000, 1000000000000],
    secondMomentOfAreaM4: [1e-12, 1], sectionModulusM3: [1e-12, 1], allowableStressPa: [1, 10000000000]
  };
  for (const [key, range] of Object.entries(bounds)) {
    const value = params[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < range[0] || value > range[1]) {
      return res.status(400).json({ error: key + " must be a finite number between " + range[0] + " and " + range[1] + "." });
    }
  }
  const base = String(process.env.CAD_WORKER_URL || "").trim().replace(/\/$/, "");
  const token = process.env.CAD_WORKER_TOKEN;
  if (!base || !token) return res.status(503).json({ error: "Simulation worker is not connected. Configure CAD_WORKER_URL and CAD_WORKER_TOKEN in Vercel, then redeploy." });
  try {
    const upstream = await fetch(base + "/v1/simulate-beam", {
      method: "POST", headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ params }), signal: AbortSignal.timeout(15000)
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return res.status(upstream.status >= 500 ? 502 : upstream.status).json({ error: data.error || "Simulation worker failed." });
    if (data.status !== "completed" || !data.resultsSI) return res.status(502).json({ error: "Worker did not return a completed simulation result." });
    return res.status(200).json(data);
  } catch (error) {
    console.error("Beam simulation worker request failed", error && error.message);
    return res.status(502).json({ error: "Could not reach the CAD worker. Check CAD_WORKER_URL and the Render service logs." });
  }
};
