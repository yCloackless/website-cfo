/**
 * CFO CBMERJ - Real Anki .APKG Package Exporter & Importer
 * 
 * Complies with official Anki .apkg specifications (ankitects/anki):
 * - ZIP archive containing `collection.anki2` (SQLite 3 database)
 * - `media` file (JSON dictionary mapping file index to filename)
 * - Media assets (images, audio) mapped by index "0", "1", ...
 * - Schema tables: col, notes, cards, revlog, graves
 * - Preserves NoteTypes, Fields, CardTemplates, Decks, Scheduling, and Tags
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import JSZip from 'jszip';
import {
  AnkiCard,
  AnkiDeck,
  AnkiNote,
  AnkiNoteType,
  CardQueue,
  CardType,
} from './ankiTypes';

export interface ApkgExportData {
  decks: AnkiDeck[];
  notetypes: AnkiNoteType[];
  notes: AnkiNote[];
  cards: AnkiCard[];
  mediaFiles?: Array<{ filename: string; buffer: Buffer }>;
}

export interface ApkgImportResult {
  decksCount: number;
  notesCount: number;
  cardsCount: number;
  mediaCount: number;
  importedDecks: Array<{ name: string; cardCount: number }>;
}

export class AnkiApkgService {
  /**
   * Generates a valid .apkg file Buffer compatible with official Anki Desktop.
   */
  public static async exportApkg(data: ApkgExportData): Promise<Buffer> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anki-export-'));
    const dbPath = path.join(tempDir, 'collection.anki2');

    try {
      const db = new DatabaseSync(dbPath);

      // Create official Anki collection schema
      db.exec(`
        CREATE TABLE col (
          id integer primary key,
          crt integer,
          mod integer,
          scm integer,
          ver integer,
          dty integer,
          usn integer,
          ls integer,
          conf text,
          models text,
          decks text,
          dconf text,
          tags text
        );

        CREATE TABLE notes (
          id integer primary key,
          guid text not null,
          mid integer not null,
          mod integer not null,
          usn integer not null,
          tags text not null,
          flds text not null,
          sfld text not null,
          csum integer,
          flags integer not null,
          data text not null
        );

        CREATE TABLE cards (
          id integer primary key,
          nid integer not null,
          did integer not null,
          ord integer not null,
          mod integer not null,
          usn integer not null,
          type integer not null,
          queue integer not null,
          due integer not null,
          ivl integer not null,
          factor integer not null,
          reps integer not null,
          lapses integer not null,
          left integer not null,
          odue integer not null,
          odid integer not null,
          flags integer not null,
          data text not null
        );

        CREATE TABLE revlog (
          id integer primary key,
          cid integer not null,
          usn integer not null,
          ease integer not null,
          ivl integer not null,
          lastIvl integer not null,
          factor integer not null,
          time integer not null,
          type integer not null
        );

        CREATE TABLE graves (
          usn integer not null,
          oid integer not null,
          type integer not null
        );
      `);

      const nowSeconds = Math.floor(Date.now() / 1000);
      const nowMs = Date.now();

      // Build Anki models JSON
      const modelsObj: Record<string, any> = {};
      const modelIdMap = new Map<string, number>();

      let modelCounter = 1600000000000;
      for (const nt of data.notetypes) {
        modelCounter += 1;
        modelIdMap.set(nt.id, modelCounter);

        modelsObj[String(modelCounter)] = {
          id: modelCounter,
          name: nt.name,
          type: nt.kind === 'cloze' ? 1 : 0,
          mod: nowSeconds,
          usn: -1,
          sortf: 0,
          did: 1,
          tmpls: nt.templates.map((t, idx) => ({
            name: t.name || `Card ${idx + 1}`,
            ord: idx,
            qfmt: t.qfmt,
            afmt: t.afmt,
            bqfmt: t.bqfmt || '',
            bafmt: t.bafmt || '',
            did: null,
          })),
          flds: nt.fields.map((f, idx) => ({
            name: f.name,
            ord: idx,
            sticky: false,
            rtl: false,
            font: f.fontName || 'Arial',
            size: f.fontSize || 20,
            media: [],
          })),
          css: nt.css || '',
          latexPre: '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n',
          latexPost: '\\end{document}',
        };
      }

      // Build Anki decks JSON
      const decksObj: Record<string, any> = {
        '1': {
          id: 1,
          mod: nowSeconds,
          name: 'Default',
          usn: -1,
          maxTaken: 60,
          collapsed: false,
          browserCollapsed: false,
          desc: '',
          dyn: 0,
          conf: 1,
        }
      };
      const deckIdMap = new Map<string, number>();
      let deckCounter = 1700000000000;

      for (const d of data.decks) {
        deckCounter += 1;
        deckIdMap.set(d.id, deckCounter);
        decksObj[String(deckCounter)] = {
          id: deckCounter,
          mod: nowSeconds,
          name: d.name,
          usn: -1,
          maxTaken: 60,
          collapsed: d.isCollapsed ? true : false,
          browserCollapsed: false,
          desc: d.description || '',
          dyn: 0,
          conf: 1,
        };
      }

      // Insert col record
      const colConf = JSON.stringify({
        nextPos: 1,
        estTimes: true,
        activeDecks: [1],
        sortType: 'noteFld',
        timeLim: 0,
        sortBackwards: false,
        addToCur: true,
        curDeck: 1,
        curModel: modelCounter,
        collapseTime: 1200,
      });

      const dconf = JSON.stringify({
        '1': {
          id: 1,
          mod: nowSeconds,
          name: 'Default',
          usn: 0,
          maxTaken: 60,
          autoplay: true,
          timer: 0,
          replayq: true,
          new: {
            bury: true,
            delays: [1, 10],
            initialFactor: 2500,
            ints: [1, 4, 0],
            order: 1,
            perDay: 20,
          },
          rev: {
            bury: true,
            ease4: 1.3,
            ivlFct: 1,
            maxIvl: 36500,
            perDay: 200,
            minSpace: 1,
          },
          lapse: {
            delays: [10],
            leechAction: 0,
            leechFails: 8,
            minInt: 1,
            mult: 0,
          },
        }
      });

      db.prepare(`
        INSERT INTO col (id, crt, mod, scm, ver, dty, usn, ls, conf, models, decks, dconf, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        1,
        nowSeconds,
        nowMs,
        nowMs,
        11,
        0,
        0,
        0,
        colConf,
        JSON.stringify(modelsObj),
        JSON.stringify(decksObj),
        dconf,
        '{}'
      );

      // Insert notes
      const noteIdMap = new Map<string, number>();
      let noteCounter = 1800000000000;

      const insertNote = db.prepare(`
        INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const n of data.notes) {
        noteCounter += 1;
        noteIdMap.set(n.id, noteCounter);

        const mid = modelIdMap.get(n.notetypeId) || modelCounter;
        const fldsStr = n.fields.join('\x1f');
        const sfld = n.fields[0] || '';
        const tagsStr = n.tags && n.tags.length > 0 ? ` ${n.tags.join(' ')} ` : '';

        // Simple checksum of first field
        let csum = 0;
        if (sfld) {
          const hash = crypto.createHash('sha1').update(sfld).digest('hex');
          csum = parseInt(hash.substring(0, 8), 16);
        }

        insertNote.run(
          noteCounter,
          n.guid || crypto.randomUUID(),
          mid,
          nowSeconds,
          -1,
          tagsStr,
          fldsStr,
          sfld,
          csum,
          0,
          ''
        );
      }

      // Insert cards
      let cardCounter = 1900000000000;
      const insertCard = db.prepare(`
        INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const c of data.cards) {
        cardCounter += 1;
        const nid = noteIdMap.get(c.noteId);
        if (!nid) continue;

        const did = deckIdMap.get(c.deckId) || 1;
        const factor = Math.round((c.easeFactor || 2.5) * 1000);

        insertCard.run(
          cardCounter,
          nid,
          did,
          c.templateOrd || 0,
          nowSeconds,
          -1,
          c.cardType || CardType.New,
          c.queue || CardQueue.New,
          c.due || 0,
          c.intervalDays || 0,
          factor,
          c.reps || 0,
          c.lapses || 0,
          0,
          0,
          0,
          c.flags || 0,
          ''
        );
      }

      db.close();

      // Package everything into ZIP
      const zip = new JSZip();
      const dbBuffer = fs.readFileSync(dbPath);
      zip.file('collection.anki2', dbBuffer);

      // Media index mapping
      const mediaMap: Record<string, string> = {};
      if (data.mediaFiles && data.mediaFiles.length > 0) {
        data.mediaFiles.forEach((mf, idx) => {
          const idxStr = String(idx);
          mediaMap[idxStr] = mf.filename;
          zip.file(idxStr, mf.buffer);
        });
      }
      zip.file('media', JSON.stringify(mediaMap));

      return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  }

  /**
   * Imports an official .apkg package, parsing notes, decks, cards, templates and media.
   */
  public static async parseApkg(apkgBuffer: Buffer): Promise<{
    decks: Array<{ name: string; description?: string }>;
    notetypes: Array<{ name: string; kind: 'standard' | 'cloze'; fields: string[]; qfmt: string; afmt: string; css: string }>;
    notes: Array<{ deckName: string; notetypeName: string; fields: string[]; tags: string[] }>;
    mediaFiles: Array<{ filename: string; buffer: Buffer }>;
  }> {
    const zip = await JSZip.loadAsync(apkgBuffer);
    const colFile = zip.file('collection.anki2') || zip.file('collection.anki21');

    if (!colFile) {
      throw new Error('INVALID_APKG: collection.anki2 not found inside package');
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anki-import-'));
    const tempDbPath = path.join(tempDir, 'import.sqlite');

    try {
      const colBuffer = await colFile.async('nodebuffer');
      fs.writeFileSync(tempDbPath, colBuffer);

      const db = new DatabaseSync(tempDbPath);

      // Extract col metadata
      const colRow = db.prepare('SELECT models, decks FROM col LIMIT 1').get() as any;
      if (!colRow) {
        throw new Error('INVALID_APKG: col record is empty');
      }

      let modelsObj: Record<string, any> = {};
      let decksObj: Record<string, any> = {};

      try { modelsObj = JSON.parse(colRow.models); } catch {}
      try { decksObj = JSON.parse(colRow.decks); } catch {}

      // Map deckId -> deckName
      const deckIdToName = new Map<number, string>();
      const parsedDecks: Array<{ name: string; description?: string }> = [];

      for (const [idStr, d] of Object.entries(decksObj)) {
        const id = parseInt(idStr, 10);
        const rawName = d.name || 'Default';
        const cleanName = rawName.replace(/[<>]/g, '').trim().slice(0, 80) || 'Default';
        deckIdToName.set(id, cleanName);
        if (cleanName !== 'Default') {
          parsedDecks.push({ name: cleanName, description: (d.desc || '').slice(0, 500) });
        }
      }

      // Map modelId -> notetype details
      const modelIdToNotetype = new Map<number, any>();
      const parsedNotetypes: Array<{ name: string; kind: 'standard' | 'cloze'; fields: string[]; qfmt: string; afmt: string; css: string }> = [];

      for (const [idStr, m] of Object.entries(modelsObj)) {
        const id = parseInt(idStr, 10);
        const fields = (m.flds || []).map((f: any) => f.name || 'Field');
        const tmpl = (m.tmpls && m.tmpls[0]) || { qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr>{{Back}}' };
        const kind: 'standard' | 'cloze' = m.type === 1 ? 'cloze' : 'standard';

        const ntInfo = {
          name: m.name || 'Basic',
          kind,
          fields,
          qfmt: tmpl.qfmt || '',
          afmt: tmpl.afmt || '',
          css: m.css || '',
        };

        modelIdToNotetype.set(id, ntInfo);
        parsedNotetypes.push(ntInfo);
      }

      // Extract notes and map to their target decks via cards (capped to 2000 to prevent DoS)
      const MAX_IMPORT_NOTES = 2000;
      const notesRows = db.prepare(`
        SELECT n.id, n.mid, n.flds, n.tags, c.did
        FROM notes n
        LEFT JOIN cards c ON c.nid = n.id
        GROUP BY n.id
        LIMIT ?
      `).all(MAX_IMPORT_NOTES) as any[];

      const parsedNotes: Array<{ deckName: string; notetypeName: string; fields: string[]; tags: string[] }> = [];

      for (const row of notesRows) {
        const nt = modelIdToNotetype.get(row.mid);
        const deckName = deckIdToName.get(row.did) || 'Default';
        const fields = typeof row.flds === 'string' ? row.flds.split('\x1f') : [];
        const rawTags = typeof row.tags === 'string' ? row.tags.trim().split(/\s+/).filter(Boolean) : [];

        parsedNotes.push({
          deckName,
          notetypeName: nt ? nt.name : 'Basic',
          fields,
          tags: rawTags,
        });
      }

      db.close();

      // Extract media (safe whitelisted extensions only, max 150 files, max 10MB each)
      const MAX_MEDIA_FILES = 150;
      const MAX_MEDIA_FILE_BYTES = 10 * 1024 * 1024; // 10MB
      const ALLOWED_MEDIA_EXTS = new Set([
        '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
        '.mp3', '.ogg', '.wav', '.m4a'
      ]);

      const mediaFiles: Array<{ filename: string; buffer: Buffer }> = [];
      const mediaEntry = zip.file('media');

      if (mediaEntry) {
        try {
          const mediaMapStr = await mediaEntry.async('string');
          const mediaMap: Record<string, string> = JSON.parse(mediaMapStr);

          for (const [idxStr, originalFilename] of Object.entries(mediaMap)) {
            if (mediaFiles.length >= MAX_MEDIA_FILES) break;
            if (typeof originalFilename !== 'string') continue;
            const ext = path.extname(originalFilename).toLowerCase();
            if (!ALLOWED_MEDIA_EXTS.has(ext)) continue;

            const assetFile = zip.file(idxStr);
            if (assetFile) {
              const buffer = await assetFile.async('nodebuffer');
              if (buffer.length <= MAX_MEDIA_FILE_BYTES) {
                mediaFiles.push({ filename: originalFilename, buffer });
              }
            }
          }
        } catch {}
      }

      return {
        decks: parsedDecks,
        notetypes: parsedNotetypes,
        notes: parsedNotes,
        mediaFiles,
      };
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  }
}
