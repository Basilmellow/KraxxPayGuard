import { readFileSync, realpathSync, accessSync, constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadConfig } from '../src/config.mjs';

// Containers must never put durable payment state on their writable image layer.
const config = loadConfig();
if (config.host !== '0.0.0.0' || config.port !== 80 || config.modelProvider !== 'astropods')
  throw new Error('Container requires HOST=0.0.0.0, PORT=80 and MODEL_PROVIDER=astropods');
const database = resolve(config.dbPath);
const directory = realpathSync(dirname(database));
if (directory !== '/data' || !database.startsWith('/data/'))
  throw new Error('Container DATABASE_PATH must be a file directly inside persistent /data');
const mounts = readFileSync('/proc/self/mountinfo', 'utf8').split('\n');
if (!mounts.some(line => line.split(' ')[4] === '/data'))
  throw new Error('Persistent /data mount is missing; refusing ephemeral payment storage');
accessSync('/data', constants.W_OK);
// No .env loading, privilege changes, or filesystem ownership changes at runtime.
const { startServer } = await import('../src/server.mjs');
startServer();
