module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Use GET." });
  }

  const workerUrl = process.env.CAD_WORKER_URL;
  const workerToken = process.env.CAD_WORKER_TOKEN;
  const aiConfigured = Boolean(process.env.GROQ_API_KEY);
  const result = {
    checkedAt: new Date().toISOString(),
    ai: { configured: aiConfigured, status: aiConfigured ? "configured_not_live_tested" : "missing_key" },
    freecad: { status: "not_checked" },
    cascade: { status: "not_checked" },
    opencascade: { status: "bundled_with_cascade", statusDetail: "Uses Cascade Studio's OpenCascade.js kernel; not a separate remote service." }
  };

  if (!workerUrl || !workerToken) {
    result.worker = { status: "not_configured", message: "Set CAD_WORKER_URL and CAD_WORKER_TOKEN in Vercel server-side environment variables." };
    result.freecad = { status: "not_configured" };
    result.cascade = { status: "not_configured" };
    return res.status(200).json(result);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let response;
    try {
      response = await fetch((workerUrl.endsWith("/") ? workerUrl.slice(0, -1) : workerUrl) + "/health",
        method: "GET",
        headers: { "Authorization": "Bearer " + workerToken },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      result.worker = { status: "unhealthy", httpStatus: response.status };
      result.freecad = { status: "unhealthy" };
      result.cascade = { status: "unhealthy" };
      return res.status(200).json(result);
    }
    const health = await response.json();
    result.worker = { status: health.ok ? "ready" : "degraded" };
    result.freecad = { status: health.freecad_available ? "ready" : "unavailable" };
    result.cascade = { status: health.cascade_playwright_available ? "automation_available" : "unavailable" };
    // Never return the worker token or any environment-variable values.
    return res.status(200).json(result);
  } catch (error) {
    result.worker = { status: "unreachable", message: error && error.name === "AbortError" ? "CAD worker health check timed out." : "Could not reach the CAD worker." };
    result.freecad = { status: "unknown" };
    result.cascade = { status: "unknown" };
    return res.status(200).json(result);
  }
};
