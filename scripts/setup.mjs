import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

try {
  await writeFile('.env', `HOST=127.0.0.1\nPORT=3000\nAPP_ORIGIN=http://127.0.0.1:3000\nDATABASE_PATH=data/payguard.sqlite\nSHOPPER_TOKEN=${randomBytes(32).toString('hex')}\nOPERATOR_TOKEN=${randomBytes(32).toString('hex')}\nPAYPAL_CLIENT_ID=\nPAYPAL_CLIENT_SECRET=\nPAYPAL_MERCHANT_ID=\nMODEL_PROVIDER=astropods\nASTRO_GATEWAY_URL=\nASTRO_GATEWAY_API_KEY=\nMODEL_DEFAULT=claude-haiku-4-5\n`, { flag: 'wx', mode: 0o600 });
  console.log('Created ignored .env with distinct local access tokens. Read them locally to unlock the dashboard. See docs/FREE-SETUP.md for sponsor AI access; no model credentials are needed for deterministic mode.');
} catch (error) {
  if (error.code === 'EEXIST') console.log('.env already exists; preserved without modification.');
  else throw error;
}
