import { CreateMLCEngine } from "https://esm.run/@mlc-ai/web-llm";

const $ = id => document.getElementById(id);
let engine = null;
let busy = false;
let lastScene = null;
const history = [{
  role: "system",
  content: "You are NOVA, a helpful engineering and coding assistant. Give clear explanations, state assumptions and units, distinguish concept designs from validated engineering, and do not claim to have executed CAD software or verified safety."
}];

function status(message) { $("status").textContent = message; }
function addMessage(role, message) {
  const p = document.createElement("p");
  p.className = "msg";
  const label = document.createElement("b");
  label.textContent = role === "user" ? "You" : "NOVA Local AI";
  const body = document.createElement("span");
  body.textContent = message;
  p.append(label, body);
  $("log").append(p);
  $("log").scrollTop = $("log").scrollHeight;
}
function setBusy(value) {
  busy = value;
  $("load").disabled = value;
  $("send").disabled = value || !engine;
  $("generateScene").disabled = value || !engine;
}
function extractJson(text) {
  const fenced = text.match(/\x60\x60\x60\\s*(?:json|eu-scene)?\\s*\\n([\\s\\S]*?)\\n\x60\x60\x60/i);
  const source = (fenced ? fenced[1] : text).trim();
  const start = source.indexOf("{");
  if (start < 0) throw new Error("The model did not return a JSON scene. Try a simpler object description.");
  let depth = 0, quoted = false, escaped = false, end = -1;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === "\\\\") escaped = true;
      else if (ch === '"') quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end < 0) throw new Error("The model returned incomplete JSON. Try generating a simpler scene.");
  try { return JSON.parse(source.slice(start, end)); }
  catch { throw new Error("The model returned invalid JSON. Try a shorter, simpler prompt."); }
}
function validateScene(value) {
  const input = Array.isArray(value) ? value : value && value.objects;
  if (!Array.isArray(input) || input.length < 1) throw new Error("No scene parts were returned.");
  const allowed = new Set(["box", "cylinder", "sphere", "cone", "torus"]);
  const objects = input.slice(0, 20).map((item, index) => {
    if (!item || !allowed.has(item.type)) throw new Error("Scene part " + (index + 1) + " uses an unsupported shape.");
    const d = item.dimensions || {};
    const dim = key => {
      const n = Number(d[key]);
      if (!Number.isFinite(n) || n <= 0) throw new Error("Scene part " + (index + 1) + " needs positive width, height and depth in millimetres.");
      return Math.min(2000, n);
    };
    const vector = (value, fallback, limit) => {
      if (!Array.isArray(value) || value.length !== 3) return fallback;
      return value.map(n => {
        const number = Number(n);
        if (!Number.isFinite(number)) throw new Error("A scene position or rotation is not a valid number.");
        return Math.max(-limit, Math.min(limit, number));
      });
    };
    const color = /^#[0-9a-f]{6}$/i.test(String(item.color || "")) ? item.color : "#49c9f5";
    return {
      name: String(item.name || item.type + " " + (index + 1)).slice(0, 80),
      type: item.type,
      dimensions: { width: dim("width"), height: dim("height"), depth: dim("depth") },
      position: vector(item.position, [0, index * 20, 0], 5000),
      rotation: vector(item.rotation, [0, 0, 0], 3600),
      color
    };
  });
  return { units: "mm", objects };
}
async function postScene(path, label) {
  if (!lastScene) throw new Error("Generate a scene first.");
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ scene: lastScene })
  });
  let data;
  try { data = await response.json(); }
  catch { throw new Error(label + " returned an unreadable response."); }
  if (!response.ok) throw new Error(data.error || (label + " failed with HTTP " + response.status + "."));
  return data;
}
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

$("load").addEventListener("click", async () => {
  if (busy || engine) return;
  setBusy(true);
  status("Checking WebGPU and loading the model. First load can take several minutes and use substantial mobile data.");
  try {
    if (!("gpu" in navigator)) {
      throw new Error("WebGPU is unavailable in this browser. Local inference needs a compatible browser and device.");
    }
    engine = await CreateMLCEngine($("model").value, {
      initProgressCallback: progress => status(progress.text || "Loading local model…")
    });
    $("send").disabled = false;
    $("generateScene").disabled = false;
    status("Local model ready. Chat and scene generation use this device; no AI API key is used.");
    addMessage("assistant", "NOVA Local AI is ready. You can chat or generate a primitive CAD concept.");
  } catch (error) {
    engine = null;
    status("Could not load local AI: " + (error && error.message || String(error)) + " Try a compatible browser or a smaller model.");
  } finally {
    setBusy(false);
    $("load").disabled = Boolean(engine);
  }
});

$("send").addEventListener("click", async () => {
  const prompt = $("prompt").value.trim();
  if (!prompt || !engine || busy) return;
  setBusy(true);
  $("prompt").value = "";
  addMessage("user", prompt);
  history.push({ role: "user", content: prompt });
  try {
    const result = await engine.chat.completions.create({
      messages: history,
      temperature: 0.6,
      max_tokens: 700
    });
    const answer = result.choices?.[0]?.message?.content || "No response returned.";
    history.push({ role: "assistant", content: answer });
    addMessage("assistant", answer);
    status("Response generated locally on this device.");
  } catch (error) {
    history.pop();
    status("Generation failed: " + (error && error.message || String(error)));
  } finally {
    setBusy(false);
    $("load").disabled = Boolean(engine);
  }
});
$("prompt").addEventListener("keydown", event => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) $("send").click();
});
$("clear").addEventListener("click", () => {
  $("log").replaceChildren();
  history.splice(1);
  addMessage("assistant", "Chat cleared. The loaded local model is still available.");
});

$("generateScene").addEventListener("click", async () => {
  const prompt = $("scenePrompt").value.trim();
  if (!engine || busy) return;
  if (prompt.length < 5) {
    $("sceneStatus").textContent = "Describe the object you want to model first.";
    return;
  }
  setBusy(true);
  lastScene = null;
  $("sceneOutput").hidden = true;
  $("runCascade").disabled = true;
  $("buildStep").disabled = true;
  $("downloadScene").disabled = true;
  $("sceneStatus").textContent = "Asking the local model for a primitive scene. Small models may need simpler prompts.";
  const system = "You create simple 3D concept scenes for a CAD application. Return ONLY valid JSON with top-level units set to mm and an objects array. Include 1 to 12 objects. Every object must contain name, type, dimensions with positive numeric width, height, depth, position as three numbers, rotation as three numbers, and color as a six-digit hex color. Allowed type values are box, cylinder, sphere, cone, torus. Use millimetres for dimensions and positions, degrees for rotation. No markdown, no comments, no prose. This is concept geometry only, not validated engineering.";
  try {
    const result = await engine.chat.completions.create({
      messages: [
        { role: "system", content: system },
        { role: "user", content: "Create a useful primitive 3D concept for: " + prompt + ". Place parts so the assembly is visually coherent. Return JSON only." }
      ],
      temperature: 0.1,
      max_tokens: 1300
    });
    const raw = result.choices?.[0]?.message?.content || "";
    lastScene = validateScene(extractJson(raw));
    $("sceneOutput").textContent = JSON.stringify(lastScene, null, 2);
    $("sceneOutput").hidden = false;
    $("runCascade").disabled = false;
    $("buildStep").disabled = false;
    $("downloadScene").disabled = false;
    $("sceneStatus").textContent = "Generated " + lastScene.objects.length + " concept part(s). Choose a CAD action below; worker configuration is checked when you run it.";
  } catch (error) {
    lastScene = null;
    $("sceneStatus").textContent = "Could not generate a usable scene: " + (error && error.message || String(error));
  } finally {
    setBusy(false);
    $("load").disabled = Boolean(engine);
    if (!lastScene) {
      $("runCascade").disabled = true;
      $("buildStep").disabled = true;
      $("downloadScene").disabled = true;
    }
  }
});

$("downloadScene").addEventListener("click", () => {
  if (!lastScene) return;
  saveBlob(new Blob([JSON.stringify(lastScene, null, 2)], { type: "application/json;charset=utf-8" }), "nova-local-scene.json");
  $("sceneStatus").textContent = "Scene JSON download started.";
});
$("runCascade").addEventListener("click", async () => {
  if (!lastScene) return;
  $("runCascade").disabled = true;
  $("sceneStatus").textContent = "Sending concept geometry to the secured Cascade Studio/OpenCascade.js worker…";
  try {
    const data = await postScene("/api/cascade-control", "Cascade Studio");
    $("sceneStatus").textContent = "Cascade worker reported success. Result: " + JSON.stringify(data.result || {});
    $("sceneOutput").textContent = JSON.stringify(lastScene, null, 2) + "\n\nCascade result:\n" + JSON.stringify(data.result || {}, null, 2) + (data.code ? "\n\nGenerated CAD code:\n" + data.code : "");
  } catch (error) {
    $("sceneStatus").textContent = "Cascade run unavailable: " + (error && error.message || String(error)) + " Confirm the Render worker and Vercel CAD worker settings are ready.";
  } finally { $("runCascade").disabled = false; }
});
$("buildStep").addEventListener("click", async () => {
  if (!lastScene) return;
  $("buildStep").disabled = true;
  $("sceneStatus").textContent = "Sending concept geometry to the secured FreeCAD STEP worker…";
  try {
    const data = await postScene("/api/cad-control", "FreeCAD");
    if (!data.content_base64) throw new Error("Worker reported success but returned no STEP file.");
    const binary = atob(data.content_base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    saveBlob(new Blob([bytes], { type: "application/step" }), data.filename || "nova-local-concept.step");
    $("sceneStatus").textContent = "FreeCAD worker generated a STEP file for " + (data.parts || lastScene.objects.length) + " part(s). This is concept geometry, not validated engineering.";
  } catch (error) {
    $("sceneStatus").textContent = "FreeCAD STEP export unavailable: " + (error && error.message || String(error)) + " Confirm the secured worker is deployed and configured.";
  } finally { $("buildStep").disabled = false; }
});
