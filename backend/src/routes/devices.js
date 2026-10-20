const express = require('express');

const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{4,128}$/;

function validateDeviceId(req, res, next) {
  if (!DEVICE_ID_PATTERN.test(req.params.deviceId)) {
    return res.status(400).json({ error: 'Invalid device ID' });
  }
  next();
}

function deviceRoutes(ewelink) {
  const router = express.Router();

  router.get('/', async (_req, res, next) => {
    try { res.json({ devices: await ewelink.getDevices() }); } catch (error) { next(error); }
  });

  router.get('/:deviceId', validateDeviceId, async (req, res, next) => {
    try {
      const device = await ewelink.getDevice(req.params.deviceId);
      if (!device?.id) return res.status(404).json({ error: 'Device not found' });
      res.json({ device });
    } catch (error) { next(error); }
  });

  for (const [action, method] of [['on', 'turnOn'], ['off', 'turnOff']]) {
    router.post(`/:deviceId/${action}`, validateDeviceId, async (req, res, next) => {
      try {
        const current = await ewelink.getDevice(req.params.deviceId);
        if (!current?.id) return res.status(404).json({ error: 'Device not found' });
        if (!current.online) return res.status(409).json({ error: 'Device is offline' });
        const device = await ewelink[method](req.params.deviceId);
        res.json({ success: true, device });
      } catch (error) { next(error); }
    });
  }
  return router;
}

module.exports = { deviceRoutes };
