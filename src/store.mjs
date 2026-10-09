import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError, requireValue } from './errors.mjs';

export class Store {
  constructor(path = 'data/payguard.sqlite') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS authorizations (
        id TEXT PRIMARY KEY, owner TEXT NOT NULL, data TEXT NOT NULL,
        request_key TEXT NOT NULL, request_body TEXT NOT NULL,
        UNIQUE(owner, request_key));
      CREATE TABLE IF NOT EXISTS intents (
        id TEXT PRIMARY KEY, authorization_id TEXT NOT NULL UNIQUE REFERENCES authorizations(id),
        owner TEXT NOT NULL, data TEXT NOT NULL, lease_until INTEGER NOT NULL DEFAULT 0,
        lease_token TEXT);
      CREATE TABLE IF NOT EXISTS audit (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, intent_id TEXT, actor TEXT NOT NULL,
        event TEXT NOT NULL, at TEXT NOT NULL, details TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS auth_no_update BEFORE UPDATE ON authorizations
        BEGIN SELECT RAISE(ABORT, 'Immutable authorization'); END;
      CREATE TRIGGER IF NOT EXISTS auth_no_delete BEFORE DELETE ON authorizations
        BEGIN SELECT RAISE(ABORT, 'Immutable authorization'); END;
      CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit
        BEGIN SELECT RAISE(ABORT, 'Append-only audit'); END;
      CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit
        BEGIN SELECT RAISE(ABORT, 'Append-only audit'); END;`);
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  event(intentId, actor, event, details = {}) {
    this.db.prepare('INSERT INTO audit(intent_id,actor,event,at,details) VALUES(?,?,?,?,?)')
      .run(intentId, actor, event, new Date().toISOString(), JSON.stringify(details));
  }
  issue(auth, requestKey, requestBody) {
    return this.transaction(() => {
      const prior = this.db.prepare('SELECT data,request_body FROM authorizations WHERE owner=? AND request_key=?')
        .get(auth.owner, requestKey);
      if (prior) {
        requireValue(prior.request_body === requestBody, 409, 'Idempotency key was used for different consent');
        return JSON.parse(prior.data);
      }
      this.db.prepare('INSERT INTO authorizations VALUES(?,?,?,?,?)')
        .run(auth.id, auth.owner, JSON.stringify(auth), requestKey, requestBody);
      this.event(null, auth.owner, 'AUTHORIZATION_ISSUED', { authorizationId: auth.id });
      return auth;
    });
  }
  authorization(id) {
    const row = this.db.prepare('SELECT data FROM authorizations WHERE id=?').get(id);
    return row ? JSON.parse(row.data) : null;
  }
  get(id) {
    const row = this.db.prepare('SELECT data FROM intents WHERE id=?').get(id);
    if (!row) return null;
    return { ...JSON.parse(row.data), audit: this.db.prepare('SELECT seq,actor,event,at,details FROM audit WHERE intent_id=? ORDER BY seq')
      .all(id).map(e => ({ ...e, details: JSON.parse(e.details) })) };
  }
  byAuthorization(id) {
    const row = this.db.prepare('SELECT id FROM intents WHERE authorization_id=?').get(id);
    return row ? this.get(row.id) : null;
  }
  list(owner, operator = false) {
    const rows = operator ? this.db.prepare('SELECT id FROM intents ORDER BY rowid DESC LIMIT 100').all() :
      this.db.prepare('SELECT id FROM intents WHERE owner=? ORDER BY rowid DESC LIMIT 100').all(owner);
    return rows.map(row => this.get(row.id));
  }
  events() {
    return this.db.prepare('SELECT seq,intent_id,actor,event,at,details FROM audit ORDER BY seq DESC LIMIT 200')
      .all().map(event => ({ ...event, details: JSON.parse(event.details) }));
  }
  reserve(auth, mode) {
    return this.transaction(() => {
      const prior = this.byAuthorization(auth.id);
      if (prior) return { item: prior, fresh: false };
      requireValue(Date.now() < auth.expiresAt, 403, 'Original authorization expired');
      const item = { id: randomUUID(), authorizationId: auth.id, owner: auth.owner,
        createdAt: new Date().toISOString(), authorization: auth, agent: { mode, status: 'RUNNING' },
        decision: 'BLOCK', reasons: ['Agent evaluation pending; payment denied'],
        approval: 'NOT_REQUIRED', payment: { status: 'NOT_CREATED',
          createRequestId: randomUUID(), captureRequestId: randomUUID() } };
      this.db.prepare('INSERT INTO intents(id,authorization_id,owner,data) VALUES(?,?,?,?)')
        .run(item.id, auth.id, auth.owner, JSON.stringify(item));
      this.event(item.id, auth.owner, 'AGENT_STARTED', { mode });
      return { item, fresh: true };
    });
  }
  save(item) {
    const { audit, ...data } = item;
    this.db.prepare('UPDATE intents SET data=? WHERE id=?').run(JSON.stringify(data), item.id);
  }
  finishAgent(item, evaluation, agent) {
    this.transaction(() => {
      Object.assign(item, evaluation, { agent,
        approval: evaluation.decision === 'REVIEW' ? 'PENDING' : 'NOT_REQUIRED' });
      this.save(item);
      this.event(item.id, 'firewall', 'EVALUATED', { decision: item.decision, reasons: item.reasons });
    });
    return this.get(item.id);
  }
  review(id, actor, approve) {
    return this.transaction(() => {
      const item = this.get(id);
      requireValue(item && item.decision === 'REVIEW' && item.approval === 'PENDING', 409, 'Not pending review');
      requireValue(Date.now() < item.authorization.expiresAt, 403, 'Original authorization expired');
      item.approval = approve ? 'APPROVED' : 'REJECTED';
      this.save(item);
      this.event(id, actor, item.approval);
      return this.get(id);
    });
  }
  claim(id) {
    return this.transaction(() => {
      const item = this.get(id);
      requireValue(item, 404, 'Intent not found');
      const token = randomUUID();
      const result = this.db.prepare('UPDATE intents SET lease_until=?,lease_token=? WHERE id=? AND lease_until<=?')
        .run(Date.now() + 180000, token, id, Date.now());
      if (!result.changes) throw new AppError(409, 'Payment operation in progress; retry later', 'BUSY');
      return { item, token };
    });
  }
  checkpoint(item, token, event, details = {}, release = false) {
    this.transaction(() => {
      const row = this.db.prepare('SELECT lease_token FROM intents WHERE id=?').get(item.id);
      requireValue(row?.lease_token === token, 409, 'Operation lease lost; reconcile before retry');
      this.save(item);
      if (event) this.event(item.id, 'payments', event, details);
      if (release) this.db.prepare('UPDATE intents SET lease_until=0,lease_token=NULL WHERE id=?').run(item.id);
    });
  }
  close() { this.db.close(); }
}
