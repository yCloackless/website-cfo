import pg from 'pg';

const rawUrl = 'postgresql://postgres.sateqyxjrqvrrtukudxr:VbL94atn0joWPZqi@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
const url = new URL(rawUrl);

const pool = new pg.Pool({
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  host: url.hostname,
  port: parseInt(url.port || '5432'),
  database: url.pathname.replace(/^\//, ''),
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const media = await pool.query('SELECT id, user_id, filename, mime_type, file_size, storage_path, created_at FROM anki_media;');
  console.log('ANKI_MEDIA (' + media.rows.length + ' rows):');
  console.log(JSON.stringify(media.rows, null, 2));

  const notes = await pool.query(`SELECT id, user_id, fields_json FROM anki_notes WHERE fields_json LIKE '%img%' OR fields_json LIKE '%png%' OR fields_json LIKE '%jpg%' OR fields_json LIKE '%paste%' OR fields_json LIKE '%src%';`);
  console.log('ANKI_NOTES WITH IMG (' + notes.rows.length + ' rows):');
  console.log(JSON.stringify(notes.rows, null, 2));

  // Let's also check all notes in anki_notes just in case
  const allNotes = await pool.query('SELECT id, user_id, fields_json FROM anki_notes;');
  console.log('ALL ANKI_NOTES count: ' + allNotes.rows.length);

  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
