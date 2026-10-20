const openapi = {
  openapi: '3.1.1',
  info: {
    title: 'eWeLink Local Control API',
    version: '1.0.0',
    description: 'Local REST API for listing and controlling eWeLink/Sonoff devices. Authentication credentials remain on the server and are never part of this API.',
  },
  servers: [{ url: 'http://localhost:3000', description: 'Local development server' }],
  tags: [{ name: 'System' }, { name: 'Devices' }],
  paths: {
    '/api/health': {
      get: { tags: ['System'], summary: 'Check backend and eWeLink connectivity', responses: { 200: { description: 'Connected' }, 503: { $ref: '#/components/responses/AuthenticationUnavailable' } } },
    },
    '/api/devices': {
      get: { tags: ['Devices'], summary: 'List devices', responses: { 200: { description: 'Devices retrieved', content: { 'application/json': { schema: { type: 'object', required: ['devices'], properties: { devices: { type: 'array', items: { $ref: '#/components/schemas/Device' } } } } } } }, 503: { $ref: '#/components/responses/AuthenticationUnavailable' } } },
    },
    '/api/devices/{deviceId}': {
      get: { tags: ['Devices'], summary: 'Get one device', parameters: [{ $ref: '#/components/parameters/DeviceId' }], responses: { 200: { description: 'Device retrieved', content: { 'application/json': { schema: { type: 'object', properties: { device: { $ref: '#/components/schemas/Device' } } } } } }, 400: { $ref: '#/components/responses/InvalidDeviceId' }, 404: { $ref: '#/components/responses/DeviceNotFound' } } },
    },
    '/api/devices/{deviceId}/on': {
      post: { tags: ['Devices'], summary: 'Turn a device on', parameters: [{ $ref: '#/components/parameters/DeviceId' }], responses: { 200: { $ref: '#/components/responses/PowerChanged' }, 400: { $ref: '#/components/responses/InvalidDeviceId' }, 404: { $ref: '#/components/responses/DeviceNotFound' }, 409: { description: 'Device is offline' }, 502: { description: 'Unable to switch device' } } },
    },
    '/api/devices/{deviceId}/off': {
      post: { tags: ['Devices'], summary: 'Turn a device off', parameters: [{ $ref: '#/components/parameters/DeviceId' }], responses: { 200: { $ref: '#/components/responses/PowerChanged' }, 400: { $ref: '#/components/responses/InvalidDeviceId' }, 404: { $ref: '#/components/responses/DeviceNotFound' }, 409: { description: 'Device is offline' }, 502: { description: 'Unable to switch device' } } },
    },
  },
  components: {
    parameters: { DeviceId: { name: 'deviceId', in: 'path', required: true, description: 'eWeLink device identifier', schema: { type: 'string', pattern: '^[A-Za-z0-9_-]{4,128}$' } } },
    schemas: {
      Device: { type: 'object', required: ['id', 'name', 'type', 'online', 'state'], properties: { id: { type: 'string', example: '1000abcdef1234' }, name: { type: 'string', example: 'Living Room' }, type: { type: 'string', example: 'BASICR3' }, online: { type: 'boolean' }, state: { type: 'string', enum: ['ON', 'OFF'] }, uiid: { type: ['number', 'string'] }, firmwareVersion: { type: 'string' } } },
      Error: { type: 'object', required: ['error'], properties: { error: { type: 'string' } } },
    },
    responses: {
      PowerChanged: { description: 'Device state updated', content: { 'application/json': { schema: { type: 'object', required: ['success', 'device'], properties: { success: { type: 'boolean', example: true }, device: { $ref: '#/components/schemas/Device' } } } } } },
      InvalidDeviceId: { description: 'Invalid device identifier', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      DeviceNotFound: { description: 'Device not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      AuthenticationUnavailable: { description: 'eWeLink configuration is missing or authentication failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    },
  },
};

module.exports = { openapi };
