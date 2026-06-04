import { createApp } from './bootstrap.js';
import { env } from './env.js';
import { logger } from './lib/logger.js';
import { prisma } from './db/client.js';

const app = await createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'eshu-server listening');
});

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'shutting down');
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => logger.error({ reason }, 'unhandledRejection'));
process.on('uncaughtException', (err) => logger.fatal({ err }, 'uncaughtException'));
