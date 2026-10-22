const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

function sceneToCode(scene) {
  const allowed = new Set(["box", "cylinder", "sphere", "cone", "torus"]);
  const objects = scene.objects;
  if (!Array.isArray(objects) || objects.length < 1 || objects.length > 30) throw new Error("Scene must contain between 1 and 30 supported CAD objects.");
  const lines = ["// Generated from Engineering Universe scene; dimensions are millimetres.", "const shapes = [];"];
  for (const [index, item] of objects.entries()) {
    const type = String(item.type || item.shape || "").toLowerCase();
    if (!allowed.has(type)) throw new Error("Unsupported CAD primitive at object " + (index + 1) + ": " + type);
    const p = item.parameters || item.dimensions || item;
    const x = Number(item.position?.x ?? item.x ?? 0), y = Number(item.position?.y ?? item.y ?? 0), z = Number(item.position?.z ?? item.z ?? 0);
    const vals = [x,y,z,Number(p.width ?? p.length ?? p.radius ?? 10),Number(p.depth ?? p.radius ?? 10),Number(p.height ?? p.radius ?? 10)];
    if (!vals.every(Number.isFinite) || vals.slice(3).some(n => n <= 0) || vals.some(n => Math.abs(n) > 1000000)) throw new Error("Invalid or out-of-range dimensions/position for object " + (index + 1) + ".");
    lines.push("// Object " + (index + 1) + ": " + type + " at (" + x + ", " + y + ", " + z + ") mm");
    lines.push("shapes.push({ type: " + JSON.stringify(type) + ", x: " + x + ", y: " + y + ", z: " + z + ", width: " + vals[3] + ", depth: " + vals[4] + ", height: " + vals[5] + " });");
  }
  return lines.join("\n");
}

export async function onRequestPost({ request, env }) {
  const base = String(env.CAD_WORKER_URL || "").trim().replace(/\/$/, "");
  const token = String(env.CAD_WORKER_TOKEN || "").trim();
  if (!base || !token) return json({ error: "CAD worker is not configured. Set CAD_WORKER_URL and CAD_WORKER_TOKEN in Cloudflare Pages production settings." }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
  if (!body?.scene || typeof body.scene !== "object") return json({ error: "A generated scene is required." }, 400);
  let code;
  try { code = sceneToCode(body.scene); } catch (error) { return json({ error: error.message || "Invalid CAD scene." }, 400); }
  try {
    const response = await fetch(base + "/v1/cascade-run", {
      method: "POST",
      headers: { "content-type": "application/json", "accept": "application/json", "authorization": "Bearer " + token },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(65000)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) return json({ error: data?.error || "Cascade worker failed (HTTP " + response.status + ")." }, response.status >= 400 && response.status < 600 ? response.status : 502);
    return json(data, response.status);
  } catch (error) {
    return json({ error: error.name === "TimeoutError" ? "Cascade Studio worker timed out." : "Could not connect to the Cascade Studio worker." }, 502);
  }
}
