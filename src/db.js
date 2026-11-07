import mongoose from 'mongoose';
import { config } from './config.js';

let memoryServer = null;

export async function connectDatabase() {
  let uri = config.mongoUri;

  if (!uri) {
    if (config.isProduction) {
      throw new Error('MONGODB_URI e obrigatoria em producao');
    }

    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create({ instance: { dbName: 'autenticacao' } });
    uri = memoryServer.getUri();
    console.log('[db] MongoDB em memoria iniciado para desenvolvimento');
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log(`[db] MongoDB conectado ao banco "${mongoose.connection.name}"`);
}

export async function disconnectDatabase() {
  await mongoose.disconnect();

  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

export function isDatabaseUp() {
  return mongoose.connection.readyState === 1;
}
