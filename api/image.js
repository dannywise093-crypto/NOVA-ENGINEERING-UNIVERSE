module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST." });
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
  const key = process.env.POLLINATIONS_API_KEY;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);

  try {
    // Prefer the authenticated current API when configured. If no key is set,
    // try Pollinations' legacy Free API Classic instead of failing immediately.
    const providers = key
      ? [{
          url: "https://gen.pollinations.ai/image/" + encodeURIComponent(prompt) +
            "?model=black-forest-labs%2Fflux.1-schnell&width=" + width +
            "&height=" + height + "&safe=true&private=true",
          headers: { "Authorization": "Bearer " + key, "Accept": "image/*" }
        }]
      : [{
          url: "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt) +
            "?width=" + width + "&height=" + height + "&nologo=true&safe=true",
          headers: { "Accept": "image/*" }
        }];

    let lastStatus = 0;
    for (const provider of providers) {
      const upstream = await fetch(provider.url, {
        method: "GET",
        headers: provider.headers,
        signal: controller.signal
      });
      const type = upstream.headers.get("content-type") || "";
      if (upstream.ok && type.startsWith("image/")) {
        const bytes = Buffer.from(await upstream.arrayBuffer());
        res.setHeader("Content-Type", type);
        res.setHeader("Content-Length", String(bytes.length));
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).send(bytes);
      }

      lastStatus = upstream.status;
      let details = "";
      try { details = (await upstream.text()).slice(0, 300); } catch {}
      console.error("Pollinations image request failed:", upstream.status, details);
    }

    return res.status(502).json({
      error: key
        ? "The image provider could not generate this image. Check the Pollinations key/account or try again."
        : "The free image provider is temporarily unavailable. The page will show a local schematic instead; no API key was configured.",
      provider_status: lastStatus || undefined
    });
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
