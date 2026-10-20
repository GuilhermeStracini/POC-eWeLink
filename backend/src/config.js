const path = require('path');
// quiet: dotenv 17+ otherwise prints an "injected env" line on every start, including in tests.
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const config = {
  port: Number(process.env.PORT || 3000),
  ewelink: {
    region: process.env.EWELINK_REGION,
    username: process.env.EWELINK_USERNAME,
    password: process.env.EWELINK_PASSWORD,
  },
};

function hasEwelinkConfiguration() {
  return Boolean(config.ewelink.region && config.ewelink.username && config.ewelink.password);
}

module.exports = { config, hasEwelinkConfiguration };
