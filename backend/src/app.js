const express = require('express');
const { apiReference } = require('@scalar/express-api-reference');
const { openapi } = require('./openapi');
const { EwelinkConfigurationError, EwelinkAuthenticationError } = require('./ewelink');
const { deviceRoutes } = require('./routes/devices');

function createApp(ewelink) {
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
      res.status(error instanceof EwelinkConfigurationError ? 503 : 502)
        .json({ status: 'unavailable', error: 'Unable to authenticate with eWeLink' });
    }
  });

  app.use('/api/devices', deviceRoutes(ewelink));

  // eslint-disable-next-line no-unused-vars
  app.use((error, _req, res, _next) => {
    if (error instanceof EwelinkConfigurationError || error instanceof EwelinkAuthenticationError) {
      return res.status(503).json({ error: 'Unable to authenticate with eWeLink' });
    }
    console.error('eWeLink request failed:', error.message);
    res.status(502).json({ error: 'eWeLink request failed' });
  });

  return app;
}

module.exports = { createApp };
