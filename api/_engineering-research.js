// Shared, keyless engineering literature search for NOVA Engineering Universe.
// This discovers public scholarly records; it does not verify experimental results or run physical tests.
function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}
function clean(value, max = 300) {
  return String(value || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}
function abstractFromInvertedIndex(index) {
  if (!index || typeof index !== "object") return "";
  const words = [];
  for (const [word, positions] of Object.entries(index)) {
    if (!Array.isArray(positions)) continue;
    for (const position of positions) {
      if (Number.isInteger(position) && position >= 0 && position < 5000) words[position] = word;
    }
  }
  return clean(words.filter(Boolean).join(" "), 1200);
}
async function getJson(url) {
  const timeout = withTimeout(6500);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "NOVA-Engineering-Universe/1.0 (public scholarly metadata search)" },
      signal: timeout.signal
    });
    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch {
    return null;
  } finally {
    timeout.done();
  }
}
function yearOf(dateParts) {
  return Array.isArray(dateParts) && Array.isArray(dateParts[0]) ? dateParts[0][0] : null;
}
async function researchEngineering(task, discipline) {
  const query = clean(task, 220);
  const encoded = encodeURIComponent(query);
  const [crossref, openAlex] = await Promise.all([
    getJson("https://api.crossref.org/works?query.bibliographic=" + encoded + "&rows=6&select=title,DOI,published,publisher,URL,type,author,container-title"),
    getJson("https://api.openalex.org/works?search=" + encoded + "&per-page=6&select=id,doi,title,publication_year,authorships,primary_location,open_access")
  ]);
  const records = [];
  const seen = new Set();
  for (const item of (crossref && crossref.message && crossref.message.items || [])) {
    const title = clean(item.title && item.title[0], 240);
    const url = item.DOI ? "https://doi.org/" + item.DOI : clean(item.URL, 500);
    if (!title || !url || seen.has(url)) continue;
    seen.add(url);
    records.push({
      title, url, year: yearOf(item.published && item.published["date-parts"]),
      publisher: clean(item.publisher, 120), venue: clean(item["container-title"] && item["container-title"][0], 160),
      abstract: clean(item.abstract, 1200), openAccessUrl: "",
      source: "Crossref scholarly metadata", doi: clean(item.DOI, 100)
    });
  }
  for (const item of (openAlex && openAlex.results || [])) {
    const title = clean(item.title, 240);
    const url = clean(item.doi, 500) || clean(item.id, 500);
    if (!title || !url || seen.has(url)) continue;
    seen.add(url);
    const location = item.primary_location || {};
    records.push({
      title, url, year: item.publication_year || null,
      publisher: clean(location.source && location.source.display_name, 120),
      venue: clean(location.source && location.source.display_name, 160),
      abstract: abstractFromInvertedIndex(item.abstract_inverted_index),
      openAccessUrl: clean(item.open_access && item.open_access.oa_url, 500),
      source: "OpenAlex scholarly metadata", doi: clean(item.doi, 100)
    });
  }
  const sources = records.slice(0, 8);
  return {
    query,
    discipline: clean(discipline, 80),
    status: sources.length ? "sources_found" : "no_sources_found",
    sources,
    searchedAt: new Date().toISOString(),
    note: sources.length
      ? "These are discoverable scholarly records, not proof that a design or material works. Verify full text, methods, conditions, units, and applicability."
      : "No usable scholarly records were returned by the available public indexes for this query. This does not prove that no suitable material exists."
  };
}
module.exports = { researchEngineering };
