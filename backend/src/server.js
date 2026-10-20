const { config } = require('./config');
const { createApp } = require('./app');
const { EwelinkService } = require('./ewelink');

const app = createApp(new EwelinkService());

app.listen(config.port, () => console.log(`Backend listening on http://localhost:${config.port}`));
