module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Use GET." });
  }

  const workerUrl = process.env.CAD_WORKER_URL;
  const tokenConfigured = Boolean(process.env.CAD_WORKER_TOKEN);
  const aiConfigured = Boolean(process.env.GROQ_API_KEY);
  const result = {
    ai: { configured: aiConfigured, status: aiConfigured ? "configured" : "missing_configuration" },
    freecad: { status: "unknown" },
    cascade: { status: "unknown" },
    worker: { configured: Boolean(workerUrl && tokenConfigured), status: "not_checked" }
  };

  if (!workerUrl || !tokenConfigured) {
    result.worker.status = "missing_configuration";
    result.freecad.status = "unavailable";
    result.cascade.status = "unavailable";
    return res.status(200).json({
      ok: false,
      ...result,
      message: "Configure CAD_WORKER_URL and CAD_WORKER_TOKEN in the deployment environment."
    });
  }

  let url;
  try {
    url = new URL("/health", workerUrl);
    if (url.protocol !== "https:") throw new Error("Worker URL must use HTTPS.");
  } catch {
    result.worker.status = "invalid_url";
    return res.status(200).json({ ok: false, ...result, message: "CAD worker URL must be a valid HTTPS URL." });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    let response;
    try {
      response = await fetch(url.toString(), { method: "GET", headers: { "Accept": "application/json" }, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    const data = await response.json().catch(() => ({}));
    result.worker.status = response.ok && data.ok === true ? "ready" : "unhealthy";
    result.freecad.status = data.freecad_available === true ? "available" : "unavailable";
    result.cascade.status = data.cascade_playwright_available === true ? "automation_available" : "unavailable";
    return res.status(200).json({
      ok: response.ok && data.ok === true && aiConfigured,
      ...result,
      message: response.ok && data.ok === true ? "Worker health check completed." : "Worker responded but reports missing dependencies or configuration."
    });
  } catch (error) {
    result.worker.status = "unreachable";
    result.freecad.status = "unknown";
    result.cascade.status = "unknown";
    return res.status(200).json({ ok: false, ...result, message: "Could not reach the CAD worker health endpoint." });
  }
};
