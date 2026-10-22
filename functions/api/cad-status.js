const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export async function onRequestGet({ env }) {
  const aiConfigured = [1,2,3,4,5,6,7].some(n => Boolean(env["GROQ_API_KEY_" + n]));
  const workerUrl = String(env.CAD_WORKER_URL || "").trim().replace(/\/$/, "");
  const tokenConfigured = Boolean(String(env.CAD_WORKER_TOKEN || "").trim());
  const result = {
    ok: false,
    ai: { configured: aiConfigured, status: aiConfigured ? "ready" : "not_configured" },
    freecad: { status: "unknown" },
    cascade: { status: "unknown" },
    worker: { configured: Boolean(workerUrl && tokenConfigured), status: !workerUrl ? "not_configured" : (!tokenConfigured ? "token_missing" : "unreachable") },
    message: ""
  };
  if (!workerUrl) {
    result.freecad.status = "unavailable";
    result.cascade.status = "unavailable";
    result.message = "Set CAD_WORKER_URL and CAD_WORKER_TOKEN as Cloudflare Pages production secrets/variables.";
    return json(result);
  }
  if (!tokenConfigured) {
    result.message = "CAD_WORKER_TOKEN is missing from Cloudflare Pages production environment.";
    return json(result);
  }
  try {
    const response = await fetch(workerUrl + "/health", { headers: { "accept": "application/json" }, signal: AbortSignal.timeout(30000) });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || data.ok !== true) {
      result.worker.status = "unhealthy";
      result.freecad.status = "unavailable";
      result.cascade.status = "unavailable";
      result.message = "CAD worker health check failed (HTTP " + response.status + ").";
      return json(result);
    }
    result.worker.status = "ready";
    result.freecad.status = data.freecad_available ? "ready" : "unavailable";
    result.cascade.status = data.cascade_playwright_available ? "ready" : "unavailable";
    result.ok = result.ai.configured && data.freecad_available === true && data.cascade_playwright_available === true;
    result.message = result.ok ? "Configuration and worker health checks passed. Test an actual model/export to verify operation." : "Worker is reachable, but one or more components are not ready.";
    return json(result);
  } catch (error) {
    result.worker.status = "unreachable";
    result.freecad.status = "unavailable";
    result.cascade.status = "unavailable";
    result.message = "Could not reach the CAD worker. Check CAD_WORKER_URL and the Render service health endpoint.";
    return json(result);
  }
}
