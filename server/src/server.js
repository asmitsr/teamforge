const http = require('http');
const mongoose = require('mongoose');
const config = require('./config');
const { createApp } = require('./app');
const { connect } = require('./db');
const { initSocket } = require('./socket');

async function start() {
  await connect(config.mongoUri);
  // eslint-disable-next-line no-console
  console.log(`Connected to MongoDB (${config.mongoUri.replace(/\/\/.*@/, '//***@')})`);
  const app = createApp();
  const server = http.createServer(app);
  initSocket(server, config.clientUrl);
  server.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`TeamForge server listening on http://localhost:${config.port}`);
  });
  return server;
}
if (require.main === module) {
  start().catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { start, createApp };
