module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST." });
  }

  const key = process.env.POLLINATIONS_API_KEY;
  if (!key) {
    return res.status(503).json({
      error: "AI image generation is not connected yet. Add POLLINATIONS_API_KEY in Vercel → Project Settings → Environment Variables, then redeploy."
    });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const prompt = String(body && body.prompt || "").trim();
  if (prompt.length < 8) {
    return res.status(400).json({ error: "Please provide a more detailed image prompt." });
  }
  if (prompt.length > 1800) {
    return res.status(413).json({ error: "Image prompt is too long. Keep it under 1,800 characters." });
  }

  const width = [768, 1024].includes(Number(body && body.width)) ? Number(body.width) : 1024;
  const height = [768, 1024].includes(Number(body && body.height)) ? Number(body.height) : 1024;
  const url = "https://gen.pollinations.ai/image/" + encodeURIComponent(prompt) +
    "?model=black-forest-labs%2Fflux.1-schnell&width=" + width +
    "&height=" + height + "&safe=true&private=true";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);

  try {
    const upstream = await fetch(url, {
      method: "GET",
      headers: { "Authorization": "Bearer " + key, "Accept": "image/*" },
      signal: controller.signal
    });

    const type = upstream.headers.get("content-type") || "";
    if (!upstream.ok || !type.startsWith("image/")) {
      let details = "";
      try { details = (await upstream.text()).slice(0, 500); } catch {}
      console.error("Pollinations image request failed:", upstream.status, details);
      return res.status(502).json({
        error: upstream.status === 401 || upstream.status === 403
          ? "The image provider rejected POLLINATIONS_API_KEY. Check the key in Vercel."
          : "The image provider could not generate this image. Check the provider key/credits and try again."
      });
    }

    const bytes = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", type);
    res.setHeader("Content-Length", String(bytes.length));
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(bytes);
  } catch (error) {
    console.error("Image generation request failed:", error && error.message);
    return res.status(502).json({
      error: error && error.name === "AbortError"
        ? "Image generation took too long. Try again with a shorter prompt."
        : "Could not connect to the image provider. Try again later."
    });
  } finally {
    clearTimeout(timeout);
  }
};
