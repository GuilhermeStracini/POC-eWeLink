const express = require('express');
const { EwelinkAuthorizationStateError } = require('../ewelink');

function oauthRoutes(ewelink, { frontendUrl }) {
  const router = express.Router();

  router.get('/login', (_req, res, next) => {
    try { res.redirect(ewelink.createAuthorizationUrl()); } catch (error) { next(error); }
  });

  // eWeLink sends the browser back here with ?code=…&region=…&state=… once the user approves.
  router.get('/callback', async (req, res, next) => {
    try {
      const { code, region, state } = req.query;
      await ewelink.completeAuthorization({ code, region, state });
      res.redirect(frontendUrl);
    } catch (error) {
      if (error instanceof EwelinkAuthorizationStateError) {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  });

  return router;
}

module.exports = { oauthRoutes };
