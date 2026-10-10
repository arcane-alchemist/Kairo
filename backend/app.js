import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { getAddress, ZeroAddress } from 'ethers';
import { z } from 'zod';

const positiveId = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const registration = z.object({ eventId: positiveId, studentId: z.string().trim().min(1).max(100),
  wallet: z.string().transform((value, ctx) => {
    try { const address = getAddress(value); if (address === ZeroAddress) throw Error(); return address; }
    catch { ctx.addIssue({ code: 'custom', message: 'Invalid Ethereum address' }); return z.NEVER; }
  }) });

export function createApp(store, staffToken, chain) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.get('/health', (_, res) => res.json({ status: 'ok' }));
  // shortcut: one trusted operator token, replace with club-scoped staff sessions before public rollout.
  app.use((req, res, next) => {
    const actual = Buffer.from(req.headers.authorization || '');
    const expected = Buffer.from(`Bearer ${staffToken}`);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return res.sendStatus(401);
    next();
  });
  app.post('/registrations', async (req, res) => {
    const body = registration.parse(req.body);
    await chain.assertEvent(body.eventId, false);
    const result = store.register(body.eventId, body.studentId, body.wallet);
    res.status(201).json({ id: result.id, eventId: result.event_id, wallet: result.wallet });
  });
  app.post('/registrations/:id/check-in', async (req, res) => {
    const id = positiveId.parse(req.params.id);
    z.object({ physicallyVerified: z.literal(true), permanentCollectibleConsent: z.literal(true) }).parse(req.body);
    const row = store.db.prepare('SELECT * FROM registrations WHERE id=?').get(id);
    if (!row) return res.sendStatus(404);
    await chain.assertEvent(row.event_id, true);
    res.status(202).json(store.checkIn(id));
  });
  app.get('/jobs/:id', (req, res) => {
    const id = positiveId.parse(req.params.id);
    const job = store.db.prepare('SELECT id,status,tx_hash,error FROM jobs WHERE id=?').get(id);
    if (!job) return res.sendStatus(404);
    res.json(job);
  });
  app.use((error, req, res, next) => {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input', issues: error.issues });
    if (error instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON' });
    if (error.message.startsWith('Registration already') || error.code?.startsWith('ERR_SQLITE')) {
      return res.status(409).json({ error: 'Student or wallet already registered for this event' });
    }
    if (error.message === 'Event unavailable') return res.status(409).json({ error: error.message });
    console.error('Request failed:', error.name);
    res.status(503).json({ error: 'Request could not be completed' });
  });
  return app;
}
