const fs = require('node:fs');

// Keeps the OAuth tokens across restarts so the browser authorization is only needed
// once every 60 days. The file holds live credentials: it is gitignored and owner-only.
function loadTokens(file) {
  try {
    const tokens = JSON.parse(fs.readFileSync(file, 'utf8'));
    return tokens?.at && tokens?.rt && tokens?.region ? tokens : null;
  } catch {
    return null;
  }
}

function saveTokens(file, tokens) {
  fs.writeFileSync(file, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

function clearTokens(file) {
  fs.rmSync(file, { force: true });
}

module.exports = { loadTokens, saveTokens, clearTokens };
