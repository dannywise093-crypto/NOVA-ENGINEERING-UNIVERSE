# Highlight.js Reference

This reference records the Highlight.js library used by the supplied classic chat-interface code.

- Library: Highlight.js
- Version shown in the pasted bundle: 11.7.0
- Purpose: syntax highlighting for code blocks in chat messages.
- Related reference: `chat-interface-reference.js`

## Important note

The pasted JavaScript bundle ends partway through the language definitions (at `V=[... "em`) and is incomplete. It cannot safely be treated as a complete runnable Highlight.js distribution. To preserve the reference accurately, please provide the remaining portion or the original `highlight.min.js` file.

For implementation, use a complete, version-pinned Highlight.js distribution rather than appending this truncated excerpt to NOVA's production JavaScript. The reference chat JavaScript also expects Highlight.js to be loaded before it calls `hljs.addPlugin(...)`.
