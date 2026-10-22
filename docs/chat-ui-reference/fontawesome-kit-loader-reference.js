/*
 * Font Awesome Kit Loader reference
 * Source version: Font Awesome 6.1.1, CSS method, Pro kit configuration.
 *
 * SECURITY NOTE:
 * The original pasted snippet included a Font Awesome Pro kit token/configuration.
 * Do not publish private or licensed kit tokens in a public repository. This
 * reference intentionally omits the token and kit ID. Use your own authorized
 * Font Awesome kit configuration in deployment settings.
 *
 * This file preserves the supplied loader structure as a reference only.
 * It is not intended to be enabled directly in NOVA without reviewing licensing,
 * external network requests, and the project's icon strategy.
 */

window.FontAwesomeKitConfig = {
  asyncLoading: { enabled: false },
  autoA11y: { enabled: true },
  baseUrl: "https://ka-f.fontawesome.com",
  baseUrlKit: "https://kit-pro.fontawesome.com",
  detectConflictsUntil: null,
  iconUploads: {},
  license: "pro",
  method: "css",
  minify: { enabled: true },
  v4FontFaceShim: { enabled: true },
  v4shim: { enabled: true },
  v5FontFaceShim: { enabled: true },
  version: "6.1.1"
};

/*
 * The remaining minified loader implementation was supplied by the user.
 * It is intentionally not reproduced here because the original includes
 * proprietary-kit configuration and an exposed credential-like token.
 * Obtain the official loader from your authorized Font Awesome account if
 * you need to integrate the kit into a live site.
 */
