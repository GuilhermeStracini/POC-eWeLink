const express = require('express');
const { apiReference } = require('@scalar/express-api-reference');
const { config } = require('./config');
const { openapi } = require('./openapi');
const { EwelinkService, EwelinkConfigurationError, EwelinkAuthenticationError } = require('./ewelink');
const { deviceRoutes } = require('./routes/devices');

const app = express();
const ewelink = new EwelinkService();
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

app.use((error, _req, res, _next) => {
  if (error instanceof EwelinkConfigurationError || error instanceof EwelinkAuthenticationError) {
    return res.status(503).json({ error: 'Unable to authenticate with eWeLink' });
  }
  console.error('eWeLink request failed:', error.message);
  res.status(502).json({ error: 'Unable to switch device' });
});

app.listen(config.port, () => console.log(`Backend listening on http://localhost:${config.port}`));
