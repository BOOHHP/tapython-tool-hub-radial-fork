import { createApp } from './app/createApp.js';
import { loadConfig } from './config/env.js';

const config = loadConfig();
const app = await createApp(config);

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}