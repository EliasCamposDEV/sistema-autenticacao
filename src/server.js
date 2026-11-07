import { createApp } from './app.js';
import { config } from './config.js';
import { connectDatabase, disconnectDatabase } from './db.js';

try {
  await connectDatabase();
} catch (error) {
  console.error('[startup] Falha ao conectar ao MongoDB:', error.message);
  process.exit(1);
}

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`[server] sistema-autenticacao ouvindo em http://localhost:${config.port} (${config.env})`);
});

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`[server] ${signal} recebido, encerrando...`);

  const forceExit = setTimeout(() => {
    console.error('[server] Encerramento forcado apos 10s');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async () => {
    await disconnectDatabase();
    clearTimeout(forceExit);
    console.log('[server] Encerrado com sucesso');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
