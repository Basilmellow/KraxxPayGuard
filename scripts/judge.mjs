import { randomBytes } from 'node:crypto';
import { makeServer } from '../src/server.mjs';
const port = Number(process.env.PORT || 3005);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid judge port');
// No .env loading, provider keys, public access principals or durable customer DB.
const config = { host: '127.0.0.1', port, origin: `http://127.0.0.1:${port}`, dbPath: ':memory:',
  operatorToken: randomBytes(32).toString('hex'), shopperToken: randomBytes(32).toString('hex'),
  payeeId: 'synthetic-recipient', paypalClientId: '', paypalClientSecret: '',
  paypalMerchantConfigured: false, openaiKey: '', openaiModel: '', rateLimit: 120 };
const server = makeServer({ config, judgeOnly: true });
server.listen(port, '127.0.0.1', () => console.log(`Read-only judge demo: ${config.origin}/judge — synthetic proposals, no model or payment calls`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(() => process.exit(0)); server.closeAllConnections();
});
