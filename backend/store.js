import { DatabaseSync } from 'node:sqlite';
import { createHmac } from 'node:crypto';

export function createStore(path, secret) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS registrations (
      id INTEGER PRIMARY KEY, event_id INTEGER NOT NULL, student_hash TEXT NOT NULL,
      wallet TEXT NOT NULL, checked_in INTEGER NOT NULL DEFAULT 0,
      UNIQUE(event_id,student_hash), UNIQUE(event_id,wallet));
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY, registration_id INTEGER NOT NULL UNIQUE REFERENCES registrations(id),
      status TEXT NOT NULL DEFAULT 'pending', raw_tx TEXT, tx_hash TEXT, error TEXT,
      attempts INTEGER NOT NULL DEFAULT 0);`);
  return {
    db,
    register(eventId, studentId, wallet) {
      const hash = createHmac('sha256', secret).update(studentId.trim().toLowerCase()).digest('hex');
      const existing = db.prepare('SELECT * FROM registrations WHERE event_id=? AND student_hash=?').get(eventId, hash);
      if (existing) {
        if (existing.wallet !== wallet) throw new Error('Registration already bound to another wallet');
        return existing;
      }
      const result = db.prepare('INSERT INTO registrations(event_id,student_hash,wallet) VALUES(?,?,?)').run(eventId, hash, wallet);
      return db.prepare('SELECT * FROM registrations WHERE id=?').get(result.lastInsertRowid);
    },
    checkIn(id) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const registration = db.prepare('SELECT * FROM registrations WHERE id=?').get(id);
        if (!registration) throw new Error('Registration not found');
        db.prepare('UPDATE registrations SET checked_in=1 WHERE id=?').run(id);
        db.prepare('INSERT OR IGNORE INTO jobs(registration_id) VALUES(?)').run(id);
        db.exec('COMMIT');
        return db.prepare('SELECT id,status,tx_hash,error FROM jobs WHERE registration_id=?').get(id);
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    }
  };
}
