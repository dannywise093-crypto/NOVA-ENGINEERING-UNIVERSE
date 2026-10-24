const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

const profiles = {
  mechanical: { key: 1, name: "Mechanical Engineering AI", prompt: "You are Mechanical Engineering AI. Focus on machine design, mechanics, thermodynamics, manufacturing, CAD, and mechanical systems." },
  civil: { key: 1, name: "Civil & Structural Engineering AI", prompt: "You are Civil & Structural Engineering AI. Focus on structural analysis, construction, materials, geotechnics, and civil infrastructure. Flag safety-critical assumptions and require licensed review for real structures." },
  electrical: { key: 2, name: "Electrical Engineering AI", prompt: "You are Electrical Engineering AI. Focus on circuits, power systems, electronics, controls, and electrical safety." },
  aerospace: { key: 2, name: "Aerospace & Flight AI", prompt: "You are Aerospace & Flight AI. Focus on aerodynamics, flight mechanics, propulsion, spacecraft, and aerospace systems. Treat flight-critical outputs as preliminary only." },
  chemical: { key: 3, name: "Chemical Engineering AI", prompt: "You are Chemical Engineering AI. Focus on process engineering, thermodynamics, transport phenomena, reaction engineering, and process safety." },
  materials: { key: 3, name: "Materials Science AI", prompt: "You are Materials Science AI. Focus on material properties, selection, metallurgy, polymers, ceramics, composites, and testing." },
  robotics: { key: 4, name: "Robotics & Mechatronics AI", prompt: "You are Robotics & Mechatronics AI. Focus on robot kinematics, sensors, actuators, embedded systems, and automation." },
  automotive: { key: 4, name: "Automotive Engineering AI", prompt: "You are Automotive Engineering AI. Focus on vehicle dynamics, powertrains, chassis, EV systems, and automotive design." },
  "formula-design": { key: 5, name: "Engineering Formula & Design AI", prompt: "You are Engineering Formula & Design AI. Your purpose is to explain engineering formulas, define variables and SI units, show transparent step-by-step calculations, state assumptions, check dimensions, and help develop preliminary designs. Ask for missing values when needed. Never invent input values silently." },
  energy: { key: 6, name: "Energy Systems AI", prompt: "You are Energy Systems AI. Focus on energy conversion, renewables, storage, efficiency, and power generation." },
  fluids: { key: 6, name: "Fluid Mechanics AI", prompt: "You are Fluid Mechanics AI. Focus on fluid statics, flow, pumps, pipes, turbomachinery, and heat/fluid systems." },
  biomedical: { key: 7, name: "Biomedical Engineering AI", prompt: "You are Biomedical Engineering AI. Focus on medical-device concepts, biomechanics, instrumentation, and biomedical systems; do not provide diagnoses." },
  software: { key: 7, name: "Engineering Software AI", prompt: "You are Engineering Software AI. Focus on engineering programming, simulation, numerical methods, automation, and software tools." }
};


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
  const queries = [
    q,
    q + ' peer-reviewed journal article DOI 2025 OR 2026',
    q + ' fatigue damage modelling life estimation machine learning',
    q + ' site:sciencedirect.com OR site:springer.com OR site:onlinelibrary.wiley.com OR site:mdpi.com'
  ];
  return [...new Set(queries)].slice(0, 4);
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
    const items = Array.isArray(data.message?.items) ? data.message.items : [];
    const records = items.map(item => {
      const dateParts = item["published-online"]?.["date-parts"]?.[0] || item.published?.["date-parts"]?.[0] || item["published-print"]?.["date-parts"]?.[0] || [];
      const date = dateParts.length >= 3 ? dateParts.map((v,i)=>i===0?String(v):String(v).padStart(2,"0")).join("-") : dateParts.length ? String(dateParts[0]) : "";
      return {
        title: Array.isArray(item.title) ? item.title[0] : "",
        authors: Array.isArray(item.author) ? item.author.map(a => [a.given,a.family].filter(Boolean).join(" ")).filter(Boolean) : [],
        publicationDate: date,
        journal: Array.isArray(item["container-title"]) ? item["container-title"][0] : "",
        doi: item.DOI || "",
        doiUrl: item.DOI ? "https://doi.org/" + item.DOI : "",
        crossrefRecord: item.URL || "",
        type: item.type || "",
        score: Number(item.score || 0)
      };
    }).filter(r => r.title && r.doi && /^journal-article$/i.test(r.type));
    return { ok: true, records };
  } catch {
    return { ok: false, reason: "Crossref request failed or timed out", records: [] };
  }
}

function formatSearchContext(results) {
  if (!results.length) return "";
  return "\n\nLIVE WEB SEARCH RESULTS (current search; snippets are leads, not guaranteed facts):\n" +
    results.slice(0, 6).map((r, i) => (i + 1) + ". " + r.title + "\nURL: " + r.url + (r.publishedDate ? "\nPublished date (search provider metadata; verify on article page): " + r.publishedDate : "") + "\nSnippet: " + String(r.snippet || "").slice(0, 250) + "\nProvider: " + (r.provider || "DuckDuckGo")).join("\n\n") +
    "\n\nUse these live search results as evidence, not as unquestionable truth. Cite relevant sources with clickable links using exact URLs, distinguish sourced facts from inference, and say when results are insufficient or conflicting. For research requests, prioritize journal publisher pages, DOI landing pages, PubMed, or institutional repositories; report publication dates only when supplied in search metadata or visible on the source page; label online-first versus issue publication dates when distinguishable. Exclude irrelevant shopping, profile, regulation, and general-news pages when the user asks for peer-reviewed research. Summarize each paper’s question, method, main finding, and limitation using only supported details. Never invent citations, authors, dates, DOI values, peer-review status, or claim a search succeeded if no results were retrieved. DuckDuckGo Instant Answer results are limited summaries, not a complete web-search listing.";
}

async function askGroq(env, profile, userMessages) {
  const keys = [profile.key, 1, 2, 3, 4, 5, 6, 7].filter((n, i, a) => a.indexOf(n) === i)
    .map(n => env["GROQ_API_KEY_" + n]).filter(Boolean);
  if (!keys.length) return { error: "AI is not configured: production Groq secrets are missing." };
  let lastError = "No AI response was returned.";
  let rateLimitFailure = null;
  for (const key of keys) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + key },
        body: JSON.stringify({
          model: env.GROQ_MODEL || "openai/gpt-oss-20b",
          temperature: 0.25,
          max_completion_tokens: 1200,
          messages: [
            { role: "system", content: profile.prompt + " STRICT SCOPE: You are an engineering-research assistant only. Help with engineering literature reviews, technical research questions, finding and evaluating peer-reviewed papers, standards and technical documentation, comparing engineering methods/materials, evidence synthesis, research planning, and engineering calculations only when they support an engineering research task. If a request is unrelated to engineering research, briefly explain that you only handle engineering research and ask for an engineering-focused question. Do not drift into general-purpose chat or unrelated advice. For recent-paper requests, do not treat an empty or poor search result as proof that no papers exist; explain the exact search limitation and return only verifiable records.  Apply a rigorous engineering quality protocol: do not claim to be a licensed human professional or guarantee 100% correctness. First identify the user's goal, application, operating environment, loads, performance targets, constraints, and applicable jurisdiction/standards. If critical inputs are missing, ask focused clarifying questions or give a clearly labeled preliminary answer with explicit assumptions—never silently invent specifications. Separate verified facts, estimates, assumptions, and recommendations. Show equations, symbol definitions, SI units, substitutions, dimensional checks, tolerances, uncertainty, and independent cross-checks when relevant. For build/materials requests, provide a bill of materials table with item, required specification/grade, quantity or sizing method, rationale, applicable standard, sourcing/inspection requirements, and unresolved data; do not invent exact quantities, grades, part numbers, or certifications without enough design inputs. Include manufacturing/assembly steps, tools, testing/acceptance criteria, failure modes, hazards, maintenance, and disposal where relevant. Cite standards and sources only when confident they exist; never fabricate citations, test results, simulations, or calculations. For safety-critical systems, legal compliance, medical devices, pressure systems, vehicles, structures, aircraft, mains electricity, or hazardous processes, clearly state that outputs are preliminary and require review by a qualified, appropriately licensed engineer and applicable code compliance before construction or use. Be candid about uncertainty and say when evidence or data is insufficient." },
            ...userMessages.map(m => ({ role: m.role, content: m.content }))
          ]
        })
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.choices?.[0]?.message?.content?.trim()) {
        return { answer: data.choices[0].message.content.trim(), model: data.model || env.GROQ_MODEL || "openai/gpt-oss-20b", assistant: profile.name };
      }
      if (response.status === 429 || /rate.?limit|tokens per minute|TPM|requests per day|tokens per day|quota exceeded/i.test(data.error?.message || "")) {
        const retryHeader = response.headers.get("retry-after");
        const errorText = String(data.error?.message || "");
        const embeddedDelay = errorText.match(/(?:try again in|retry in)\s*(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?/i);
        const isDailyLimit = /requests per day|tokens per day|RPD|TPD|daily limit|per day/i.test(errorText);
        const retryAfter = Math.max(1, Math.min(3600, Number(retryHeader) || (embeddedDelay ? Math.ceil(Number(embeddedDelay[1])) : 60)));
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
    } catch (e) { lastError = "Could not connect to the AI provider."; }
  }
  if (rateLimitFailure) return rateLimitFailure;
  return { error: lastError };
}


async function askCloudflareAI(env, messages, assistantName) {
  const endpoint = String(env.CLOUDFLARE_AI_URL || "https://dark-frost-f4f4.dannywise093.workers.dev/api/chat").trim();
  if (!endpoint.startsWith("https://")) return { error: "Cloudflare AI fallback URL must use HTTPS." };
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "accept": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: "You are NOVA Engineering Universe, an engineering research assistant. Answer engineering and formula-design questions only. Be accurate and transparent about uncertainty. Never invent sources, DOIs, papers, tests, or claim that a search succeeded when it did not. Treat supplied research results as evidence, not proof. Mark safety-critical design outputs as preliminary and require qualified engineering review. Return a helpful answer to the user's latest question." },
          ...messages
        ]
      }),
      signal: AbortSignal.timeout(20000)
    });
    const data = await response.json().catch(() => ({}));
    const answer = String(data.response || data.answer || data.choices?.[0]?.message?.content || "").trim();
    if (!response.ok || data.ok === false || !answer) {
      return { error: "Cloudflare Workers AI fallback failed (HTTP " + response.status + ")." };
    }
    return { answer, model: data.model || "@cf/meta/llama-3.1-8b-instruct", assistant: assistantName, provider: "cloudflare_workers_ai" };
  } catch {
    return { error: "Could not connect to the Cloudflare Workers AI fallback." };
  }
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
  const discipline = String(body.discipline || "mechanical").toLowerCase().replace(/[^a-z-]/g, "");
  const profile = profiles[discipline] || profiles.mechanical;
  const task = String(body.task || "").trim();
  if (!task) return json({ error: "Please enter an engineering question or task." }, 400);
  if (task.length > 12000) return json({ error: "Please keep the task under 12,000 characters." }, 413);
  const style = String(body.style || "design").toLowerCase();
  const wantsScene = style === "scene" || style === "design";
  const sceneInstructions = wantsScene ? `

CAD SCENE OUTPUT REQUIREMENT:
After your engineering explanation, include exactly one machine-readable block using this format:
<eu-scene>
{"units":"mm","objects":[{"type":"box","dimensions":{"width":40,"depth":30,"height":20},"position":[0,0,0],"rotation":[0,0,0],"color":"#49c9f5"}]}
</eu-scene>
Create a useful preliminary concept from the user's request. Supported primitive types are box, cylinder, sphere, cone, torus. Include 1-30 objects. All dimensions must be finite positive millimetres; positions and rotations are finite numbers in millimetres/degrees. For cylinders/cones, width and depth represent diameter; height is axial length. Use simple primitives only; do not claim complex surfaces, holes, fillets, simulation, or manufacturing-ready geometry unless represented. If essential dimensions are missing, clearly label reasonable illustrative assumptions in the explanation and keep geometry conceptual. Output valid JSON inside the tags, no markdown fences. Never place code or other text inside the tags.` : "";
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
        for (const rec of crossrefStatus.records || []) {
          if (!searchResults.some(r => r.url === rec.doiUrl)) searchResults.push({
            title: rec.title, url: rec.doiUrl, snippet: "Crossref metadata record. Authors: " + rec.authors.join(", ") + ". Journal: " + rec.journal + ". Publication date in Crossref: " + rec.publicationDate + ".",
            publishedDate: rec.publicationDate, provider: "Crossref DOI metadata", verifiedMetadata: true
          });
        }
      }
    } catch { /* Status is reported below; never claim a successful search. */ }
  }
  if (searchResults.length) conversation[conversation.length - 1].content += formatSearchContext(searchResults);
  if (isResearchQuery) {
    conversation[conversation.length - 1].content += "\n\nRESEARCH TOOL STATUS: " + JSON.stringify({
      webSearchAttempted: needsLiveSearch(searchQuery),
      webResultCount: searchResults.filter(r => r.provider !== "Crossref DOI metadata").length,
      webProviders: [...new Set(searchResults.map(r => r.provider))],
      crossrefAttempted: crossrefStatus.attempted,
      crossrefSucceeded: crossrefStatus.ok,
      crossrefRecordCount: (crossrefStatus.records || []).length,
      crossrefFailure: crossrefStatus.reason || null,
      crossrefRecords: (crossrefStatus.records || []).slice(0, 8)
    }) + "\nOnly claim a provider was queried if the status above confirms it. Crossref records verify only bibliographic metadata as recorded by Crossref; they do NOT independently establish peer-review status or prove a paper's findings. For each proposed citation, match the exact title and topic, year, journal-article type, DOI and author/date metadata. If evidence is weak, label it candidate/unverified. Never invent details to reach a target count. If search providers failed, say which layer failed.";
  } else if (!searchResults.length && needsLiveSearch(searchQuery)) {
    conversation[conversation.length - 1].content += "\n\nLIVE SEARCH STATUS: No usable web results were retrieved. Do not claim a comprehensive search or invent sources. State that live search returned no usable results.";
  }
  if (wantsScene) conversation[conversation.length - 1].content += sceneInstructions;
  // Prefer the configured Cloudflare Workers AI model for NOVA; use Groq only if it fails.
  let result = await askCloudflareAI(env, conversation, profile.name);
  if (result.error) {
    const cloudflareError = result.error;
    result = await askGroq(env, profile, conversation);
    if (result.error) result.fallbackError = cloudflareError;
  }
  if (searchResults.length) result.sources = searchResults.map(({title,url,publishedDate,provider}) => ({title,url,...(publishedDate ? {publishedDate} : {}),provider: provider || "DuckDuckGo"}));
  if (result.error && isResearchQuery && (searchResults.length || crossrefStatus.attempted)) {
    const papers = searchResults.slice(0, 20).map((paper, i) => {
      const year = paper.publishedDate ? String(paper.publishedDate).slice(0, 4) : "Year not supplied by source";
      return (i + 1) + ". " + paper.title +
        "\\n   Source: " + (paper.provider || "Web search") +
        "\\n   Year: " + year +
        "\\n   Original record: " + paper.url +
        (paper.doi ? "\\n   DOI: " + paper.doi : "\\n   DOI: not supplied in this result") +
        (paper.snippet ? "\\n   Source summary: " + String(paper.snippet).slice(0, 260) : "");
    }).join("\\n\\n");
    const statuses = [
      "General web search: " + (searchResults.some(r => r.provider !== "Crossref DOI metadata") ? "returned " + searchResults.filter(r => r.provider !== "Crossref DOI metadata").length + " usable results" : "returned no usable results"),
      "Crossref: " + (!crossrefStatus.attempted ? "not queried" : crossrefStatus.ok ? "queried; " + (crossrefStatus.records || []).length + " journal-article metadata records" : "unavailable" + (crossrefStatus.reason ? " (" + crossrefStatus.reason + ")" : ""))
    ].join("\\n");
    return json({
      answer: "The AI provider could not summarize this request, so NOVA is showing the source records retrieved directly instead. This is not a completed literature review.\\n\\nSEARCH STATUS\\n" + statuses + "\\n\\nRECORDS RETRIEVED\\n" + (papers || "No records were retrieved in this attempt.") + "\\n\\nVerify each original record before citing it. Search snippets and Crossref metadata do not independently establish peer-review status or validate a paper's findings. Missing authors, dates, or DOIs have not been inferred.",
      code: result.code || "AI_PROVIDER_UNAVAILABLE",
      sources: searchResults.map(({title,url,publishedDate,provider,doi}) => ({title,url,...(publishedDate ? {publishedDate} : {}),...(doi ? {doi} : {}),provider: provider || "Web search"})),
      crossref: { attempted: crossrefStatus.attempted, ok: crossrefStatus.ok, reason: crossrefStatus.reason || null, recordCount: (crossrefStatus.records || []).length }
    }, 200);
  }
  if (result.error) return json(result, result.code === "RATE_LIMITED" ? 429 : 502);
  if (wantsScene) {
    const match = result.answer.match(/<eu-scene>\s*([\s\S]*?)\s*<\/eu-scene>/i);
    if (match) {
      try {
        const raw = JSON.parse(match[1]);
        const allowed = new Set(["box", "cylinder", "sphere", "cone", "torus"]);
        const objects = Array.isArray(raw.objects) ? raw.objects.slice(0, 30).map((item) => {
          const type = String(item.type || "").toLowerCase();
          if (!allowed.has(type)) throw new Error("Unsupported CAD primitive: " + type);
          const d = item.dimensions || {};
          const dimensions = { width: Number(d.width), depth: Number(d.depth), height: Number(d.height) };
          if (!Object.values(dimensions).every(n => Number.isFinite(n) && n > 0 && n <= 1000000)) throw new Error("CAD dimensions must be finite positive millimetres.");
          const position = Array.isArray(item.position) ? item.position.slice(0,3).map(Number) : [0,0,0];
          const rotation = Array.isArray(item.rotation) ? item.rotation.slice(0,3).map(Number) : [0,0,0];
          if (position.length !== 3 || rotation.length !== 3 || ![...position,...rotation].every(n => Number.isFinite(n) && Math.abs(n) <= 1000000)) throw new Error("CAD position and rotation values must be finite.");
          return { type, dimensions, position, rotation, color: /^#[0-9a-f]{6}$/i.test(item.color || "") ? item.color : "#49c9f5" };
        }) : [];
        if (objects.length < 1) throw new Error("The AI did not provide any supported CAD objects.");
        result.scene = { units: "mm", objects };
        result.answer = result.answer.replace(match[0], "").trim();
      } catch (error) {
        result.scene_error = "AI explanation was returned, but its CAD scene could not be validated: " + error.message;
      }
    } else {
      result.scene_error = "AI explanation was returned without a valid <eu-scene> block. Try asking for a simpler primitive-based concept.";
    }
  }
  return json(result, 200);
}
