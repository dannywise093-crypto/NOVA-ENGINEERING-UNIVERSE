const MAX_BODY_BYTES = 12000;

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
    catch { return res.status(400).json({ error: "Request body must be valid JSON." }); }
  }
  if (!body || typeof body !== "object" || JSON.stringify(body).length > MAX_BODY_BYTES) {
    return res.status(413).json({ error: "Request is missing or too large." });
  }

  const workerUrl = String(process.env.CAD_WORKER_URL || "").trim().replace(/\/$/, "");
  const token = process.env.CAD_WORKER_TOKEN;
  if (!workerUrl || !token) {
    return res.status(503).json({
      ok: false,
      status: "worker_not_configured",
      message: "The CAD/simulation worker is not connected yet. Configure CAD_WORKER_URL and CAD_WORKER_TOKEN in Vercel, and CAD_WORKER_TOKEN on the existing Render CAD worker."
    });
  }

  const action = body.action || "status";
  if (!["status", "run"].includes(action)) {
    return res.status(400).json({ error: "action must be status or run." });
  }
  if (action === "run" && !["cad_box", "freecad_scene", "cascade_scene", "cantilever_beam"].includes(body.jobType)) {
    return res.status(400).json({ error: "Supported jobs: cad_box, freecad_scene, cascade_scene, cantilever_beam." });
  }

  try {
    let endpoint = "/health";
    let payload = null;
    if (action === "run") {
      if (body.jobType === "cantilever_beam") {
        endpoint = "/v1/simulate-beam";
        payload = { params: body.params || {} };
      } else {
        endpoint = body.jobType === "cascade_scene" ? "/v1/cascade-run" : "/v1/build-step";
        if (body.jobType === "cad_box") {
          const p = body.params || {};
          payload = { scene: { objects: [{ type: "box", name: "Generated box", dimensions: { width: p.widthMm, height: p.heightMm, depth: p.lengthMm } }] } };
        } else {
          payload = { scene: body.scene };
        }
      }
    }
    const response = await fetch(workerUrl + endpoint, {
      method: action === "status" ? "GET" : "POST",
      headers: {
        "Authorization": "Bearer " + token,
        ...(action === "run" ? { "Content-Type": "application/json" } : {})
      },
      ...(action === "run" ? { body: JSON.stringify(payload) } : {}),
      signal: AbortSignal.timeout(body.jobType === "cascade_scene" ? 110000 : 45000)
    });
    const text = await response.text();
    let result;
    try { result = JSON.parse(text); }
    catch { result = { error: "Worker returned a non-JSON response." }; }
    if (!response.ok) {
      return res.status(response.status >= 400 && response.status < 500 ? response.status : 502)
        .json({ ok: false, status: "worker_error", workerStatus: response.status, result });
    }
    return res.status(200).json(result);
  } catch (error) {
    console.error("CAD/simulation worker request failed", error && error.message);
    return res.status(502).json({ ok: false, status: "worker_unreachable", message: "The engineering worker could not be reached. Check the Render service status and URL." });
  }
};
