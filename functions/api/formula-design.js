const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
  const task = String(body.task || "").trim();
  const mode = String(body.mode || "calculate").slice(0, 80);
  if (!task) return json({ error: "Please enter a formula, calculation, or design question." }, 400);
  if (task.length > 12000) return json({ error: "Please keep the task under 12,000 characters." }, 413);


function needsLiveSearch(text) {
  return /\b(latest|current|currently|today|right now|real[- ]time|recent|newest|up[- ]to[- ]date|202[5-9]|20[3-9][0-9]|documentation|datasheet|technical spec|specification|standard(?:s)?|code requirement|regulation|compliance|research|paper|journal|study|benchmark|release notes|version|manufacturer|product comparison|market price|cost estimate|source|citation|reference|web search|browse|internet|news)\b/i.test(text);
}
function decodeHtml(s) {
  return String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}
async function liveWebSearch(query) {
  const response = await fetch("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query.slice(0, 500)), {
    headers: { "user-agent": "Mozilla/5.0 (compatible; NOVAEngineeringResearch/1.0)", "accept": "text/html" },
    signal: AbortSignal.timeout(9000)
  });
  if (!response.ok) throw new Error("Web search returned HTTP " + response.status);
  const html = await response.text();
  const results = [];
  const re = /<div class="result__body">[\s\S]*?<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>|<div[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/div>)/gi;
  let m;
  while ((m = re.exec(html)) && results.length < 6) {
    let url = decodeHtml(m[1]);
    const wrapped = url.match(/[?&]uddg=([^&]+)/);
    if (wrapped) { try { url = decodeURIComponent(wrapped[1]); } catch {} }
    const title = decodeHtml(m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ")).trim();
    const snippet = decodeHtml((m[3] || m[4] || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ")).trim();
    if (/^https?:\/\//i.test(url) && title && !results.some(r => r.url === url)) results.push({ title, url, snippet });
  }
  return results;
}
function formatSearchContext(results) {
  if (!results.length) return "";
  return "\n\nLIVE WEB SEARCH RESULTS (current search; snippets are leads, not guaranteed facts):\n" +
    results.map((r, i) => (i + 1) + ". " + r.title + "\nURL: " + r.url + "\nSnippet: " + r.snippet).join("\n\n") +
    "\n\nGround current claims in these sources. Cite relevant sources using their exact URLs, distinguish facts from inference, and say when results are insufficient or conflicting.";
}

  let conversation = Array.isArray(body.messages) ? body.messages : [{ role: "user", content: task }];
  conversation = conversation.filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim()).slice(-24).map(m => ({ role: m.role, content: m.content.slice(0, 12000) }));
  if (!conversation.length || conversation[conversation.length - 1].role !== "user") conversation.push({ role: "user", content: task });
  const searchQuery = conversation.filter(m => m.role === "user").slice(-4).map(m => m.content).join("\\n").slice(-1800);
  let searchResults = [];
  if (needsLiveSearch(searchQuery)) {
    try { searchResults = await liveWebSearch(searchQuery); } catch { /* Search failure should not block ordinary AI responses. */ }
  }
  if (searchResults.length) conversation[conversation.length - 1].content += formatSearchContext(searchResults);

  const keys = [5, 1, 2, 3, 4, 6, 7].map(n => env["GROQ_API_KEY_" + n]).filter(Boolean);
  if (!keys.length) return json({ error: "Engineering Formula & Design AI is not configured. Add encrypted production Groq secrets in Cloudflare." }, 503);
  let lastError = "The AI provider returned an empty response.";
  for (const key of keys) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + key },
        body: JSON.stringify({
          model: env.GROQ_MODEL || "openai/gpt-oss-20b",
          temperature: 0.2,
          messages: [
            { role: "system", content: "You are Engineering Formula & Design AI, a rigorous engineering calculation and preliminary design assistant. Mode: " + mode + ". Do not claim to be a licensed human professional or promise 100% correctness. Explain the applicable formula and why it applies; define every symbol and SI unit; substitute only provided values; show each calculation step; check dimensions, significant figures, boundary conditions, and plausibility; and cross-check independently when possible. Ask for critical missing inputs instead of inventing them. Separate given data, assumptions, derived results, estimates, and unknowns. For build/materials requests, provide a bill of materials with item, specification/grade, quantity or sizing method, reason, applicable standard, inspection/testing, and unresolved choices; do not invent exact grades, quantities, certifications, or source citations. Identify relevant standards only when confident, and never fabricate references or claim a simulation/test occurred. Include hazards, failure modes, and validation/acceptance tests where relevant. Clearly mark safety-critical results as preliminary and require qualified professional review and applicable code compliance before construction or use." },
            ...conversation
          ]
        })
      });
      const data = await response.json().catch(() => ({}));
      const answer = data.choices?.[0]?.message?.content?.trim();
      if (response.ok && answer) return json({ answer, model: data.model || env.GROQ_MODEL || "openai/gpt-oss-20b", assistant: "Engineering Formula & Design AI", sources: searchResults.map(({title,url}) => ({title,url})) });
      lastError = data.error?.message || ("AI provider returned HTTP " + response.status);
    } catch { lastError = "Could not connect to the AI provider."; }
  }
  return json({ error: lastError }, 502);
}
