const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

const b64url = (value) => btoa(String.fromCharCode(...new Uint8Array(value)))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const encodeText = (value) => b64url(new TextEncoder().encode(value));

async function getGoogleAccessToken(serviceAccountJson) {
  const account = JSON.parse(serviceAccountJson);
  if (!account.client_email || !account.private_key || !account.token_uri) {
    throw new Error("GCE_SERVICE_ACCOUNT_JSON is missing client_email, private_key, or token_uri.");
  }
  const now = Math.floor(Date.now() / 1000);
  const header = encodeText(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = encodeText(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/compute.readonly",
    aud: account.token_uri,
    iat: now,
    exp: now + 3600
  }));
  const unsigned = header + "." + claims;
  const pem = account.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8", binary,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const assertion = unsigned + "." + b64url(signature);
  const response = await fetch(account.token_uri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    }),
    signal: AbortSignal.timeout(10000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error("Google OAuth token exchange failed (HTTP " + response.status + "). Check the service account and its permissions.");
  }
  return data.access_token;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (url.searchParams.get("action") !== "status") {
    return json({ error: "Use ?action=status to inspect connector configuration." }, 400);
  }
  return json({
    ok: true,
    connectors: [{
      id: "google-compute-engine",
      name: "Google Compute Engine",
      configured: Boolean(env.GCE_SERVICE_ACCOUNT_JSON && env.GCE_PROJECT_ID),
      permission: "Read-only instance inventory",
      requiredSecrets: ["GCE_SERVICE_ACCOUNT_JSON", "GCE_PROJECT_ID"]
    }],
    note: "Secret values are never returned by this endpoint."
  });
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
  if (body.provider !== "google-compute-engine") {
    return json({ error: "This connector is not supported yet. Google Compute Engine is the first supported provider." }, 400);
  }
  if (body.action !== "test" && body.action !== "list-instances") {
    return json({ error: "Supported actions: test, list-instances." }, 400);
  }
  if (!env.GCE_SERVICE_ACCOUNT_JSON || !env.GCE_PROJECT_ID) {
    return json({
      ok: false,
      configured: false,
      error: "Google Compute Engine is not configured yet. Add GCE_SERVICE_ACCOUNT_JSON and GCE_PROJECT_ID as Cloudflare Pages environment secrets/variables."
    }, 503);
  }
  try {
    const token = await getGoogleAccessToken(env.GCE_SERVICE_ACCOUNT_JSON);
    const url = "https://compute.googleapis.com/compute/v1/projects/" +
      encodeURIComponent(env.GCE_PROJECT_ID) + "/aggregated/instances?maxResults=500";
    const response = await fetch(url, {
      headers: { authorization: "Bearer " + token, accept: "application/json" },
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return json({ ok: false, configured: true, error: "Google Compute Engine API returned HTTP " + response.status + ".", detail: data.error?.message || "Check that the Compute Engine API is enabled and the service account has read-only access." }, response.status === 401 || response.status === 403 ? 502 : 502);
    }
    const instances = [];
    for (const [zone, group] of Object.entries(data.items || {})) {
      for (const item of group.instances || []) {
        instances.push({
          name: item.name || "Unknown instance",
          zone: zone.split("/").pop(),
          status: item.status || "UNKNOWN",
          machineType: item.machineType ? item.machineType.split("/").pop() : "",
          creationTimestamp: item.creationTimestamp || "",
          selfLink: item.selfLink || ""
        });
      }
    }
    return json({
      ok: true,
      provider: "Google Compute Engine",
      projectId: env.GCE_PROJECT_ID,
      action: body.action,
      instanceCount: instances.length,
      instances: body.action === "test" ? [] : instances.slice(0, 200),
      message: body.action === "test" ? "Google authentication and Compute Engine API access succeeded." : "Read-only instance inventory retrieved.",
      truncated: instances.length > 200
    });
  } catch (error) {
    return json({ ok: false, error: error?.message || "Google Compute Engine connector failed." }, 502);
  }
}
