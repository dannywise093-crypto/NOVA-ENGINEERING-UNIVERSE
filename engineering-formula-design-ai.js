/* Dedicated Engineering Formula & Design AI frontend.
 * Uses the existing secure /api/engineer endpoint; the Groq key stays server-side.
 * This assistant is separate from the general "Ask this engineering AI" panel.
 */
(function () {
  "use strict";

  function initFormulaDesignAI() {
    const originalButton = document.getElementById("euGeneratePackage");
    const taskInput = document.getElementById("euDesignTask");
    const status = document.getElementById("euPackageStatus");
    const output = document.getElementById("euPackageOutput");

    if (!originalButton || !taskInput || !status || !output) {
      console.error("Formula & Design AI could not initialize: required page elements are missing.");
      return;
    }

    // The older page script also attaches a click handler to this button.
    // Replace the button to remove that legacy listener and prevent duplicate requests.
    const button = originalButton.cloneNode(true);
    button.type = "button";
    originalButton.replaceWith(button);

    status.textContent = "Formula & Design AI is ready. Describe a design and tap Generate Design Package.";

    button.addEventListener("click", async function (event) {
      event.preventDefault();
      if (button.disabled) return;

      const task = taskInput.value.trim();
      if (task.length < 8) {
        status.textContent = "Please describe the design in at least 8 characters.";
        output.textContent = "Example: Design a small belt-driven gearbox. Explain the formulas, assumptions, dimensions, and materials.";
        taskInput.focus();
        return;
      }

      button.disabled = true;
      button.textContent = "Generating design…";
      status.textContent = "Connecting to the Formula & Design AI service…";
      output.textContent = "Preparing your engineering design package. Please wait…";

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      try {
        const response = await fetch("/api/engineer", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            assistant: "formula-design-ai",
            discipline: "mechanical",
            style: "design",
            task: task
          }),
          signal: controller.signal,
          cache: "no-store"
        });

        const raw = await response.text();
        let data;
        try {
          data = JSON.parse(raw);
        } catch (_) {
          throw new Error("The server returned an unreadable response (HTTP " + response.status + ").");
        }

        if (!response.ok) {
          throw new Error(data.error || "The engineering AI request failed (HTTP " + response.status + ").");
        }
        if (!data || typeof data.answer !== "string" || !data.answer.trim()) {
          throw new Error("The AI returned an empty response. Please try again.");
        }

        output.textContent = data.answer.trim();
        status.textContent = "Design package received" + (data.model ? " from " + data.model : "") + ". Verify all calculations and dimensions before use.";
      } catch (error) {
        const message = error && error.name === "AbortError"
          ? "The request timed out after 60 seconds. Please retry."
          : (error && error.message ? error.message : "Could not connect to the engineering AI.");
        status.textContent = "Formula & Design AI error: " + message;
        output.textContent = "No design package was received. Check the message above. Your working Ask this Engineering AI assistant has not been changed.";
      } finally {
        clearTimeout(timeoutId);
        button.disabled = false;
        button.textContent = "Generate Design Package ↗";
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFormulaDesignAI, { once: true });
  } else {
    initFormulaDesignAI();
  }
})();
