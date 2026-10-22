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
  return /\b(live research|live search|search the web|web search|browse the web|look up|latest|current|currently|today|right now|real[- ]time|recent|newest|up[- ]to[- ]date|202[5-9]|20[3-9][0-9]|documentation|datasheet|technical spec|specification|standard(?:s)?|code requirement|regulation|compliance|research|paper|journal|study|benchmark|release notes|version|manufacturer|product comparison|market price|cost estimate|source|citation|reference|browse|internet|news)\b/i.test(text);
}
function decodeHtml(s) {
  return String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}
async function liveWebSearch(query, env) {
  // Prefer configured Tavily for real web results; fall back to keyless DuckDuckGo.
  if (env.TAVILY_API_KEY) {
    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ api_key: env.TAVILY_API_KEY, query: query.slice(0, 1800), max_results: 6, search_depth: "basic", include_answer: false }),
        signal: AbortSignal.timeout(9000)
      });
      if (response.ok) {
        const data = await response.json();
        const results = (data.results || []).filter(r => typeof r.url === "string" && /^https?:\/\//i.test(r.url)).map(r => ({
          title: String(r.title || "Web search result").slice(0, 200), url: r.url,
          snippet: String(r.content || "").slice(0, 900),
          publishedDate: typeof r.published_date === "string" ? r.published_date.slice(0, 40) : "",
          provider: "Tavily"
        })).filter((r, i, a) => a.findIndex(x => x.url === r.url) === i).slice(0, 6);
        if (results.length) return results;
      }
    } catch { /* Fall back to keyless DuckDuckGo. */ }
  }
  // Official DuckDuckGo Instant Answer API: free/keyless, but not a full web search API.
  try {
    const apiUrl = new URL("https://api.duckduckgo.com/");
    apiUrl.searchParams.set("q", query.slice(0, 500));
    apiUrl.searchParams.set("format", "json");
    apiUrl.searchParams.set("no_html", "1");
    apiUrl.searchParams.set("skip_disambig", "1");
    apiUrl.searchParams.set("t", "novaengineeringuniverse");
    const response = await fetch(apiUrl, { headers: { "accept": "application/json" }, signal: AbortSignal.timeout(6000) });
    if (response.ok) {
      const data = await response.json();
      const results = [];
      const add = (title, url, snippet = "") => {
        if (typeof url === "string" && /^https?:\/\//i.test(url) && !results.some(r => r.url === url)) {
          results.push({ title: String(title || snippet || "DuckDuckGo result").slice(0, 200), url, snippet: String(snippet || "").slice(0, 600), provider: "DuckDuckGo" });
        }
      };
      if (data.AbstractText) add(data.Heading || data.AbstractSource, data.AbstractURL, data.AbstractText);
      if (typeof data.Answer === "string" && data.Answer) add(data.Heading || "DuckDuckGo Instant Answer", "https://duckduckgo.com/?q=" + encodeURIComponent(query), data.Answer);
      if (data.Definition) add(data.DefinitionSource || "Definition", data.DefinitionURL, data.Definition);
      for (const item of data.Results || []) add(item.Text, item.FirstURL, item.Text);
      const flatten = items => { for (const item of items || []) { if (item.Topics) flatten(item.Topics); else add(item.Text, item.FirstURL, item.Text); } };
      flatten(data.RelatedTopics);
      if (results.length) return results.slice(0, 6);
    }
  } catch { /* Continue to HTML fallback. */ }

  const headers = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "referer": "https://html.duckduckgo.com/",
    "sec-fetch-dest": "document", "sec-fetch-mode": "navigate", "sec-fetch-site": "same-site"
  };
  const endpoints = [
    "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query.slice(0, 500)),
    "https://lite.duckduckgo.com/lite/?q=" + encodeURIComponent(query.slice(0, 500))
  ];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { headers, redirect: "follow", signal: AbortSignal.timeout(8000) });
      const html = await response.text();
      if (!response.ok || response.status === 202 || /challenge-form|anomaly-modal|captcha|select all squares/i.test(html)) continue;
      const results = [];
      const pattern = /<a\b[^>]*class=["'][^"']*(?:result__a|result-link)[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let match;
      while ((match = pattern.exec(html)) && results.length < 6) {
        let url = match[1] || "";
        const title = decodeHtml(match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
        if (url.startsWith("//")) url = "https:" + url;
        const wrapped = url.match(/[?&](?:uddg|u)=([^&]+)/i);
        if (wrapped) { try { url = decodeURIComponent(wrapped[1]); } catch {} }
        if (/^https?:\/\//i.test(url) && title && !results.some(r => r.url === url)) results.push({ title, url, snippet: "", provider: "DuckDuckGo" });
      }
      if (results.length) return results;
    } catch { /* Search failure must not block assistant responses. */ }
  }
  return [];
}

function buildResearchQueries(query) {
  const q = String(query || "").replace(/\s+/g, " ").trim().slice(0, 700);
  return [...new Set([q, q + ' peer-reviewed journal article DOI 2025 OR 2026', q + ' fatigue damage modelling life estimation machine learning', q + ' site:sciencedirect.com OR site:springer.com OR site:onlinelibrary.wiley.com OR site:mdpi.com'])].slice(0, 4);
}
async function crossrefLookup(query) {
  try {
    const url = new URL("https://api.crossref.org/works");
    url.searchParams.set("query.bibliographic", String(query || "").slice(0, 700));
    url.searchParams.set("rows", "8");
    url.searchParams.set("select", "DOI,title,author,published,published-online,published-print,container-title,type,URL,score");
    const response = await fetch(url, { headers: { "accept": "application/json", "user-agent": "NOVA-Engineering-Universe/1.0 (bibliographic verification)" }, signal: AbortSignal.timeout(7000) });
    if (!response.ok) return { ok: false, reason: "Crossref returned HTTP " + response.status, records: [] };
    const data = await response.json();
    const records = (Array.isArray(data.message?.items) ? data.message.items : []).map(item => {
      const p = item["published-online"]?.["date-parts"]?.[0] || item.published?.["date-parts"]?.[0] || item["published-print"]?.["date-parts"]?.[0] || [];
      const date = p.length >= 3 ? p.map((v,i)=>i===0?String(v):String(v).padStart(2,"0")).join("-") : p.length ? String(p[0]) : "";
      return { title: Array.isArray(item.title) ? item.title[0] : "", authors: Array.isArray(item.author) ? item.author.map(a => [a.given,a.family].filter(Boolean).join(" ")).filter(Boolean) : [], publicationDate: date, journal: Array.isArray(item["container-title"]) ? item["container-title"][0] : "", doi: item.DOI || "", doiUrl: item.DOI ? "https://doi.org/" + item.DOI : "", crossrefRecord: item.URL || "", type: item.type || "", score: Number(item.score || 0) };
    }).filter(r => r.title && r.doi && /^journal-article$/i.test(r.type));
    return { ok: true, records };
  } catch { return { ok: false, reason: "Crossref request failed or timed out", records: [] }; }
}

function formatSearchContext(results) {
  if (!results.length) return "";
  return "\n\nLIVE WEB SEARCH RESULTS (current search; snippets are leads, not guaranteed facts):\n" +
    results.slice(0, 6).map((r, i) => (i + 1) + ". " + r.title + "\nURL: " + r.url + (r.publishedDate ? "\nPublished date (search provider metadata; verify on article page): " + r.publishedDate : "") + "\nSnippet: " + String(r.snippet || "").slice(0, 250) + "\nProvider: " + (r.provider || "DuckDuckGo")).join("\n\n") +
    "\n\nUse these live search results as evidence, not as unquestionable truth. Cite relevant sources with clickable links using exact URLs, distinguish sourced facts from inference, and say when results are insufficient or conflicting. For research requests, prioritize journal publisher pages, DOI landing pages, PubMed, or institutional repositories; report publication dates only when supplied in search metadata or visible on the source page; label online-first versus issue publication dates when distinguishable. Exclude irrelevant shopping, profile, regulation, and general-news pages when the user asks for peer-reviewed research. Summarize each paper’s question, method, main finding, and limitation using only supported details. Never invent citations, authors, dates, DOI values, peer-review status, or claim a search succeeded if no results were retrieved. DuckDuckGo Instant Answer results are limited summaries, not a complete web-search listing.";
}

  let conversation = Array.isArray(body.messages) ? body.messages : [{ role: "user", content: task }];
  conversation = conversation.filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim()).slice(-8).map(m => ({ role: m.role, content: m.content.slice(-3500) }));
  if (!conversation.length || conversation[conversation.length - 1].role !== "user") conversation.push({ role: "user", content: task });
  const meaningfulUserMessage = [...conversation].reverse().find(m => m.role === "user" && m.content.trim().length > 20 && !/^(continue|retry|try again|go on|proceed)$/i.test(m.content.trim()));
  const latestUserQueryRaw = meaningfulUserMessage?.content || task;
  const latestUserQuery = latestUserQueryRaw.includes("User request:") ? latestUserQueryRaw.split("User request:").pop().trim() : latestUserQueryRaw;
  const isResearchQuery = /\b(research|peer[- ]reviewed|journal|paper|papers|studies|study|literature review|scientific evidence)\b/i.test(latestUserQuery);
  const searchQuery = (latestUserQuery.slice(0, 1400) + (isResearchQuery ? " peer-reviewed journal research publication date DOI" : "")).slice(0, 1800);
  let searchResults = [];
  let crossrefStatus = { attempted: false, ok: false, reason: "Not needed for this query", records: [] };
  if (needsLiveSearch(searchQuery)) {
    try {
      const queries = isResearchQuery ? buildResearchQueries(searchQuery) : [searchQuery];
      const batches = await Promise.all(queries.map(q => liveWebSearch(q, env).catch(() => [])));
      const seen = new Set();
      searchResults = batches.flat().filter(r => r && r.url && !seen.has(r.url) && seen.add(r.url)).slice(0, 16);
      if (isResearchQuery) {
        crossrefStatus = { attempted: true, ...(await crossrefLookup(latestUserQuery)) };
        for (const rec of crossrefStatus.records || []) if (!searchResults.some(r => r.url === rec.doiUrl)) searchResults.push({
          title: rec.title, url: rec.doiUrl, snippet: "Crossref metadata record. Authors: " + rec.authors.join(", ") + ". Journal: " + rec.journal + ". Publication date in Crossref: " + rec.publicationDate + ".",
          publishedDate: rec.publicationDate, provider: "Crossref DOI metadata", verifiedMetadata: true
        });
      }
    } catch { /* Report actual status; do not claim a successful search. */ }
  }
  if (searchResults.length) conversation[conversation.length - 1].content += formatSearchContext(searchResults);
  if (isResearchQuery) {
    conversation[conversation.length - 1].content += "\n\nRESEARCH TOOL STATUS: " + JSON.stringify({
      webSearchAttempted: needsLiveSearch(searchQuery), webResultCount: searchResults.filter(r => r.provider !== "Crossref DOI metadata").length,
      webProviders: [...new Set(searchResults.map(r => r.provider))], crossrefAttempted: crossrefStatus.attempted,
      crossrefSucceeded: crossrefStatus.ok, crossrefRecordCount: (crossrefStatus.records || []).length,
      crossrefFailure: crossrefStatus.reason || null, crossrefRecords: (crossrefStatus.records || []).slice(0, 8)
    }) + "\nOnly claim a provider was queried if the status confirms it. Crossref records verify bibliographic metadata as recorded by Crossref; they do NOT independently establish peer-review status or prove findings. Match title, topic, year, journal-article type, DOI, authors and dates. If evidence is weak, label it candidate/unverified. Never invent details to reach a target count. If providers failed, say which layer failed.";
  } else if (!searchResults.length && needsLiveSearch(searchQuery)) {
    conversation[conversation.length - 1].content += "\n\nLIVE SEARCH STATUS: No usable web results were retrieved. Do not claim a comprehensive search or invent sources. State that live search returned no usable results.";
  }

  const keys = [5, 1, 2, 3, 4, 6, 7].map(n => env["GROQ_API_KEY_" + n]).filter(Boolean);
  if (!keys.length) return json({ error: "Engineering Formula & Design AI is not configured. Add encrypted production Groq secrets in Cloudflare." }, 503);
  let lastError = "The AI provider returned an empty response.";
  let rateLimitFailure = null;
  for (const key of keys) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + key },
        body: JSON.stringify({
          model: env.GROQ_MODEL || "openai/gpt-oss-20b",
          temperature: 0.2,
          max_completion_tokens: 1200,
          messages: [
            { role: "system", content: "You are Engineering Formula & Design AI, a rigorous engineering research and calculation assistant. STRICT SCOPE: Handle engineering research only, including engineering literature reviews, technical evidence, peer-reviewed papers, standards and technical documentation, comparisons of engineering methods/materials, research planning, and calculations when they support an engineering research task. For unrelated requests, briefly redirect to engineering research. Mode: " + mode + ". Do not claim to be a licensed human professional or promise 100% correctness. Explain the applicable formula and why it applies; define every symbol and SI unit; substitute only provided values; show each calculation step; check dimensions, significant figures, boundary conditions, and plausibility; and cross-check independently when possible. Ask for critical missing inputs instead of inventing them. Separate given data, assumptions, derived results, estimates, and unknowns. For build/materials requests, provide a bill of materials with item, specification/grade, quantity or sizing method, reason, applicable standard, inspection/testing, and unresolved choices; do not invent exact grades, quantities, certifications, or source citations. Identify relevant standards only when confident, and never fabricate references or claim a simulation/test occurred. Include hazards, failure modes, and validation/acceptance tests where relevant. Clearly mark safety-critical results as preliminary and require qualified professional review and applicable code compliance before construction or use." },
            ...conversation
          ]
        })
      });
      const data = await response.json().catch(() => ({}));
      const answer = data.choices?.[0]?.message?.content?.trim();
      if (response.ok && answer) return json({ answer, model: data.model || env.GROQ_MODEL || "openai/gpt-oss-20b", assistant: "Engineering Formula & Design AI", sources: searchResults.map(({title,url,publishedDate,provider}) => ({title,url,...(publishedDate ? {publishedDate} : {}),provider: provider || "DuckDuckGo"})) });
      if (response.status === 429 || /rate.?limit|tokens per minute|TPM|requests per day|tokens per day|quota exceeded/i.test(data.error?.message || "")) {
        const retryHeader = response.headers.get("retry-after");
        const errorText = String(data.error?.message || "");
        const embeddedDelay = errorText.match(/(?:try again in|retry in)\\s*(\\d+(?:\\.\\d+)?)\\s*s(?:ec(?:ond)?s?)?/i);
        const isDailyLimit = /requests per day|tokens per day|RPD|TPD|daily limit|per day/i.test(errorText);
        const retryAfter = Math.max(1, Math.min(3600, Number(retryHeader) || (embeddedDelay ? Math.ceil(Number(embeddedDelay[1])) : 60));
        rateLimitFailure = {
          error: isDailyLimit
            ? "NOVA's AI provider has reached a daily quota. Waiting a few seconds may not fix it; check the provider's usage limits or configure another active API key."
            : "NOVA's AI provider is temporarily rate-limited. Please wait about " + retryAfter + " seconds before trying again.",
          code: "RATE_LIMITED",
          retryAfter: isDailyLimit ? null : retryAfter,
          limitType: isDailyLimit ? "daily" : "temporary"
        };
        // Try the next configured key before failing the request.
        continue;
      }
      lastError = data.error?.message || ("AI provider returned HTTP " + response.status);
    } catch { lastError = "Could not connect to the AI provider."; }
  }
  if (rateLimitFailure) return json(rateLimitFailure, 429);
  return json({ error: lastError }, 502);
}
