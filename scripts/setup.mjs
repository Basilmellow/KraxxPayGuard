import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

try {
  await writeFile('.env', `HOST=127.0.0.1\nPORT=3000\nAPP_ORIGIN=http://127.0.0.1:3000\nDATABASE_PATH=data/payguard.sqlite\nSHOPPER_TOKEN=${randomBytes(32).toString('hex')}\nOPERATOR_TOKEN=${randomBytes(32).toString('hex')}\nPAYPAL_CLIENT_ID=\nPAYPAL_CLIENT_SECRET=\nPAYPAL_MERCHANT_ID=\nOPENAI_API_KEY=\nOPENAI_MODEL=\n`, { flag: 'wx', mode: 0o600 });
  console.log('Created ignored .env with distinct local access tokens. Read them locally to unlock the dashboard. Add provider credentials when ready.');
} catch (error) {
  if (error.code === 'EEXIST') console.log('.env already exists; preserved without modification.');
  else throw error;
}
