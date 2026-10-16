import pg from 'pg';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
  max: 1,
  connectionTimeoutMillis: 5000,
});

async function run() {
  const [media, notes, allNotes] = await Promise.all([
    pool.query('SELECT count(*)::int AS count, coalesce(sum(file_size), 0)::bigint AS bytes FROM anki_media'),
    pool.query("SELECT count(*)::int AS count FROM anki_notes WHERE fields_json ILIKE ANY(ARRAY['%img%', '%png%', '%jpg%', '%paste%', '%src%'])"),
    pool.query('SELECT count(*)::int AS count FROM anki_notes'),
  ]);
  console.log(JSON.stringify({
    ankiMedia: media.rows[0],
    notesWithMediaReferences: notes.rows[0].count,
    allNotes: allNotes.rows[0].count,
  }));
}

run().catch(() => { console.error('DATABASE_MEDIA_AUDIT_FAILED'); process.exitCode = 1; }).finally(() => pool.end());
