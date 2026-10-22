const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export async function onRequestPost({ request, env }) {
  const base = String(env.CAD_WORKER_URL || "").trim().replace(/\/$/, "");
  const token = String(env.CAD_WORKER_TOKEN || "").trim();
  if (!base || !token) return json({ error: "CAD worker is not configured. Set CAD_WORKER_URL and CAD_WORKER_TOKEN in Cloudflare Pages production settings." }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
  const objects = body?.scene?.objects;
  if (!Array.isArray(objects) || objects.length < 1 || objects.length > 30) return json({ error: "Scene must contain between 1 and 30 supported CAD objects." }, 400);
  try {
    const response = await fetch(base + "/v1/build-step", {
      method: "POST",
      headers: { "content-type": "application/json", "accept": "application/json", "authorization": "Bearer " + token },
      body: JSON.stringify({ scene: body.scene }),
      signal: AbortSignal.timeout(55000)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) return json({ error: data?.error || "FreeCAD worker failed (HTTP " + response.status + ")." }, response.status >= 400 && response.status < 600 ? response.status : 502);
    return json(data, response.status);
  } catch (error) {
    return json({ error: error.name === "TimeoutError" ? "FreeCAD worker timed out while building STEP." : "Could not connect to the FreeCAD worker." }, 502);
  }
}
