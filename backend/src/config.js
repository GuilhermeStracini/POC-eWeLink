const path = require('path');
// quiet: dotenv 17+ otherwise prints an "injected env" line on every start, including in tests.
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const port = Number(process.env.PORT || 3000);

const config = {
  port,
  ewelink: {
    region: process.env.EWELINK_REGION,
    username: process.env.EWELINK_USERNAME,
    password: process.env.EWELINK_PASSWORD,
    // With your own developer app, eWeLink only accepts OAuth logins: password login and
    // the shared app ID built into ewelink-api are refused (error 407) on most paths.
    appId: process.env.EWELINK_APP_ID || undefined,
    appSecret: process.env.EWELINK_APP_SECRET || undefined,
    // Must match the redirect URL registered for the app at dev.ewelink.cc.
    oauthRedirectUrl: process.env.EWELINK_OAUTH_REDIRECT_URL || `http://localhost:${port}/api/oauth/callback`,
    tokenFile: process.env.EWELINK_TOKEN_FILE || path.resolve(__dirname, '../.ewelink-token.json'),
  },
  // Where the browser is sent back to once eWeLink authorization completes.
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
};

function usesOAuth() {
  return Boolean(config.ewelink.appId && config.ewelink.appSecret);
}

function hasEwelinkConfiguration() {
  if (usesOAuth()) return true;
  return Boolean(config.ewelink.region && config.ewelink.username && config.ewelink.password);
}

module.exports = { config, hasEwelinkConfiguration, usesOAuth };
