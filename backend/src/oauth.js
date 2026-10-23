const crypto = require('node:crypto');

const LOGIN_PAGE = 'https://c2ccdn.coolkit.cc/oauth/index.html';

// eWeLink signs app requests with HMAC-SHA256 of the exact body (or string) using the app secret.
function sign(appSecret, message) {
  return crypto.createHmac('sha256', appSecret).update(message).digest('base64');
}

function apiUrl(region, uri) {
  return `https://${region}-apia.coolkit.cc/v2${uri}`;
}

function createLoginUrl({ appId, appSecret, redirectUrl, state }) {
  const seq = String(Date.now());
  const params = new URLSearchParams({
    clientId: appId,
    redirectUrl,
    grantType: 'authorization_code',
    state,
    nonce: crypto.randomBytes(4).toString('hex'),
    seq,
    authorization: sign(appSecret, `${appId}_${seq}`),
  });
  return `${LOGIN_PAGE}?${params}`;
}

async function signedPost({ appId, appSecret, region, uri, body }) {
  const payload = JSON.stringify(body);
  const response = await fetch(apiUrl(region, uri), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CK-Appid': appId,
      Authorization: `Sign ${sign(appSecret, payload)}`,
    },
    body: payload,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) {
    const code = result.error || response.status;
    throw Object.assign(new Error(`eWeLink error ${code}: ${result.msg || 'no message'}`), { code });
  }
  return result.data;
}

// Exchanges the code eWeLink appended to the redirect URL for an access/refresh token pair.
async function exchangeCode({ appId, appSecret, region, code, redirectUrl }) {
  const data = await signedPost({
    appId, appSecret, region, uri: '/user/oauth/token',
    body: { code, redirectUrl, grantType: 'authorization_code' },
  });
  return { at: data.accessToken, rt: data.refreshToken, region: data.region || region };
}

// Access tokens last 30 days and refresh tokens 60; a refresh returns a new pair.
async function refreshTokens({ appId, appSecret, region, rt }) {
  const data = await signedPost({ appId, appSecret, region, uri: '/user/refresh', body: { rt } });
  return { at: data.at, rt: data.rt, region };
}

module.exports = { createLoginUrl, exchangeCode, refreshTokens, sign };
