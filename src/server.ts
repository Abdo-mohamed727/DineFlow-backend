import { createApp } from './app';
import { connectDB } from './config/database';
import { env } from './config/env';

async function bootstrap() {
  await connectDB();
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`🚀 DineFlow API running on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`\n${signal} received - shutting down...`);
    server.close(async () => {
      const { disconnectDB } = await import('./config/database');
      await disconnectDB();
      // eslint-disable-next-line no-console
      console.log('✅ Closed out remaining connections.');
      process.exit(0);
    });
    // Force-close after 10s
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
