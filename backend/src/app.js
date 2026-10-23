const express = require('express');
const { apiReference } = require('@scalar/express-api-reference');
const { openapi } = require('./openapi');
const { config } = require('./config');
const {
  EwelinkConfigurationError,
  EwelinkAuthenticationError,
  EwelinkAuthorizationRequiredError,
} = require('./ewelink');
const { deviceRoutes } = require('./routes/devices');
const { oauthRoutes } = require('./routes/oauth');

const AUTHORIZE_PATH = '/api/oauth/login';
const authorizationRequired = { error: 'eWeLink authorization required', authorizeUrl: AUTHORIZE_PATH };

function createApp(ewelink, { frontendUrl = config.frontendUrl } = {}) {
  const app = express();
  app.use(express.json());

  app.get('/openapi.json', (_req, res) => res.json(openapi));
  app.use('/api-docs', apiReference({
    spec: { url: '/openapi.json' },
    pageTitle: 'eWeLink Local Control API',
    theme: 'purple',
  }));

  app.get('/api/health', async (_req, res) => {
    try {
      await ewelink.authenticate();
      res.json({ status: 'ok', ewelink: 'connected' });
    } catch (error) {
      if (error instanceof EwelinkAuthorizationRequiredError) {
        return res.status(503).json({ status: 'unavailable', ...authorizationRequired });
      }
      res.status(error instanceof EwelinkConfigurationError ? 503 : 502)
        .json({ status: 'unavailable', error: 'Unable to authenticate with eWeLink' });
    }
  });

  app.use('/api/oauth', oauthRoutes(ewelink, { frontendUrl }));
  app.use('/api/devices', deviceRoutes(ewelink));

  // eslint-disable-next-line no-unused-vars
  app.use((error, _req, res, _next) => {
    if (error instanceof EwelinkAuthorizationRequiredError) {
      return res.status(503).json(authorizationRequired);
    }
    if (error instanceof EwelinkConfigurationError || error instanceof EwelinkAuthenticationError) {
      return res.status(503).json({ error: 'Unable to authenticate with eWeLink' });
    }
    console.error('eWeLink request failed:', error.message);
    res.status(502).json({ error: 'eWeLink request failed' });
  });

  return app;
}

module.exports = { createApp };
