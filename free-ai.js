import { CreateMLCEngine } from "https://esm.run/@mlc-ai/web-llm";
import * as THREE from "https://esm.run/three@0.170.0";
import { OrbitControls } from "https://esm.run/three@0.170.0/examples/jsm/controls/OrbitControls.js";

const $ = id => document.getElementById(id);
let engine = null;
let busy = false;
let lastScene = null;
const history = [{
  role: "system",
  content: "You are NOVA, a helpful engineering and coding assistant. Give clear explanations, state assumptions and units, distinguish concept designs from validated engineering, and do not claim to have executed CAD software or verified safety."
}];

function status(message) { $("status").textContent = message; }
let previewRenderer = null, previewScene = null, previewCamera = null, previewControls = null, previewResizeObserver = null, previewAnimation = 0;
function renderScenePreview(sceneData) {
  const host = $("scenePreview");
  if (!host) return;
  if (!previewRenderer) {
    host.replaceChildren();
    previewScene = new THREE.Scene();
    previewScene.background = new THREE.Color("#07111d");
    previewCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 100000);
    previewCamera.position.set(180, 150, 220);
    previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(previewRenderer.domElement);
    previewControls = new OrbitControls(previewCamera, previewRenderer.domElement);
    previewControls.enableDamping = true;
    previewControls.dampingFactor = 0.07;
    previewScene.add(new THREE.HemisphereLight(0xd9edff, 0x243348, 2.0));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(120, 180, 100);
    previewScene.add(keyLight);
    const grid = new THREE.GridHelper(500, 25, 0x3a718d, 0x20394e);
    grid.position.y = -0.01;
    previewScene.add(grid);
    previewResizeObserver = new ResizeObserver(() => {
      const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
      previewRenderer.setSize(w, h, false);
      previewCamera.aspect = w / h;
      previewCamera.updateProjectionMatrix();
    });
    previewResizeObserver.observe(host);
    const animate = () => {
      previewAnimation = requestAnimationFrame(animate);
      previewControls.update();
      previewRenderer.render(previewScene, previewCamera);
    };
    animate();
  }
  const old = previewScene.getObjectByName("generated-parts");
  if (old) previewScene.remove(old);
  const group = new THREE.Group();
  group.name = "generated-parts";
  for (const item of sceneData.objects) {
    const d = item.dimensions;
    const w = d.width, h = d.height, depth = d.depth;
    let geometry;
    if (item.type === "box") geometry = new THREE.BoxGeometry(w, h, depth);
    else if (item.type === "sphere") geometry = new THREE.SphereGeometry(Math.min(w, h, depth) / 2, 24, 16);
    else if (item.type === "cylinder") geometry = new THREE.CylinderGeometry(Math.min(w, depth) / 2, Math.min(w, depth) / 2, h, 24);
    else if (item.type === "cone") geometry = new THREE.ConeGeometry(Math.min(w, depth) / 2, h, 24);
    else geometry = new THREE.TorusGeometry(Math.min(w, h, depth) / 2, Math.max(1, Math.min(w, h, depth) / 8), 12, 28);
    const material = new THREE.MeshStandardMaterial({ color: item.color || "#49c9f5", metalness: 0.18, roughness: 0.48 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...item.position);
    mesh.rotation.set(...item.rotation.map(n => THREE.MathUtils.degToRad(n)));
    mesh.name = item.name;
    group.add(mesh);
  }
  previewScene.add(group);
  const box = new THREE.Box3().setFromObject(group);
  if (!box.isEmpty()) {
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    group.position.sub(center);
    const span = Math.max(size.x, size.y, size.z, 20);
    previewCamera.position.set(span * 1.35, span * 1.0, span * 1.65);
    previewCamera.near = Math.max(0.1, span / 10000);
    previewCamera.far = Math.max(10000, span * 100);
    previewCamera.updateProjectionMatrix();
    previewControls.target.set(0, 0, 0);
    previewControls.minDistance = Math.max(5, span * 0.15);
    previewControls.maxDistance = span * 20;
    previewControls.update();
  }
}

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
  $("send").disabled = value;
  $("generateScene").disabled = value || !engine;
}
function extractJson(text) {
  const source = text.replaceAll(String.fromCharCode(96).repeat(3), "").replace(/^\s*(?:json|eu-scene)\s*/i, "").trim();
  const start = source.indexOf("{");
  if (start < 0) throw new Error("The model did not return a JSON scene. Try a simpler object description.");
  let depth = 0, quoted = false, escaped = false, end = -1;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
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
    if (!("gpu" in navigator) || !navigator.gpu) {
      throw new Error("This browser does not expose WebGPU. Update Chrome and Android System WebView, then try again. If WebGPU is still unavailable, this device/browser cannot run NOVA Local AI locally.");
    }
    status("Checking whether this device can create a WebGPU adapter…");
    let adapter;
    try {
      adapter = await navigator.gpu.requestAdapter();
    } catch (adapterError) {
      throw new Error("WebGPU was detected but the device could not start it: " + (adapterError?.message || String(adapterError)));
    }
    if (!adapter) {
      throw new Error("WebGPU is present, but no compatible graphics adapter is available. Try the latest Chrome, disable battery saver, close other heavy apps, and reload. No model has been downloaded yet.");
    }
    const modelId = $("model").value;
    status("WebGPU is available. Preparing " + modelId + "… The first load downloads model files and may take several minutes.");
    engine = await CreateMLCEngine(modelId, {
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
  if (!prompt || busy) return;
  setBusy(true);
  $("prompt").value = "";
  addMessage("user", prompt);
  try {
    let answer;
    if (engine) {
      history.push({ role: "user", content: prompt });
      try {
        const result = await engine.chat.completions.create({
          messages: history,
          temperature: 0.6,
          max_tokens: 700
        });
        answer = result.choices?.[0]?.message?.content || "No response returned.";
        history.push({ role: "assistant", content: answer });
        status("Response generated locally on this device.");
      } catch (error) {
        history.pop();
        throw error;
      }
    } else {
      status("Local model is not loaded. Trying NOVA's secure website AI service…");
      const response = await fetch("/api/engineer", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ discipline: "mechanical", style: "research", task: prompt })
      });
      let data;
      try { data = await response.json(); }
      catch { throw new Error("NOVA's website AI returned an unreadable response."); }
      if (!response.ok) throw new Error(data.error || ("Website AI request failed (HTTP " + response.status + ")."));
      answer = String(data.answer || "").trim();
      if (!answer) throw new Error("NOVA's website AI returned an empty answer.");
      status("Response received from NOVA's secure website AI service. Local model remains unloaded.");
    }
    addMessage("assistant", answer);
  } catch (error) {
    const message = error && error.message || String(error);
    status("Could not send to NOVA: " + message + (engine ? "" : " If the website AI service is not configured, local chat requires a compatible WebGPU browser and a loaded model."));
    addMessage("assistant", "I couldn't answer this message. " + message);
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
  const previewHost = $("scenePreview"); if (previewHost) previewHost.innerHTML = '<div class="preview-empty">Generating a new concept…</div>';
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
    renderScenePreview(lastScene);
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
