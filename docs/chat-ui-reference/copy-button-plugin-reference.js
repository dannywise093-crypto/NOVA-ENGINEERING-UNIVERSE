class CopyButtonPlugin {
  constructor(options = {}) {
    this.hook = options.hook;
    this.callback = options.callback;
  }

  "after:highlightElement"({ el, text }) {
    let button = Object.assign(document.createElement("button"), {
      innerHTML: "Copy",
      className: "hljs-copy-button"
    });

    button.dataset.copied = false;
    el.parentElement.classList.add("hljs-copy-wrapper");
    el.parentElement.appendChild(button);
    el.parentElement.style.setProperty(
      "--hljs-theme-background",
      window.getComputedStyle(el).backgroundColor
    );

    button.onclick = function () {
      if (!navigator.clipboard) return;

      let newText = text;
      if (typeof this.hook === "function") {
        newText = this.hook(text, el) || text;
      }

      navigator.clipboard.writeText(newText).then(function () {
        button.innerHTML = "Copied!";
        button.dataset.copied = true;

        let alert = Object.assign(document.createElement("div"), {
          role: "status",
          className: "hljs-copy-alert",
          innerHTML: "Copied to clipboard"
        });

        el.parentElement.appendChild(alert);

        setTimeout(() => {
          button.innerHTML = "Copy";
          button.dataset.copied = false;
          el.parentElement.removeChild(alert);
        }, 2000);
      }).then(() => {
        if (typeof this.callback === "function") {
          return this.callback(newText, el);
        }
      });
    }.bind(this);
  }
}
