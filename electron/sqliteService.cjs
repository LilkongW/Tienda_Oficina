const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let DB_DIR = null;
let SQL = null;
let initPromise = null;

const databases = new Map();

// Log de diagnóstico: <userData>/sqlite.log
let LOG_PATH = null;
function log(...parts) {
  try {
    if (!LOG_PATH) LOG_PATH = path.join(app.getPath('userData'), 'sqlite.log');
    fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${parts.join(' ')}\n`);
  } catch { /* el log nunca debe romper la app */ }
}


// Esquema local. Es una COPIA de lo que hay en Supabase, así que no lleva
// NOT NULL ni FOREIGN KEY (la integridad la garantiza Supabase; en local las
// filas offline usan ids negativos y llegan en cualquier orden).
// Las columnas que falten (created_at, sync_uid, etc.) también se añaden
// automáticamente al guardar, ver ensureColumns().
const SCHEMA_VERSION = 2;
const TABLES = {
  productos: {
    pk: 'id_producto',
    cols: [
      ['nombre', 'TEXT'], ['unidades_por_paquete', 'INTEGER'], ['costo_paquete', 'REAL'],
      ['costo_unitario', 'REAL'], ['precio_venta', 'REAL'], ['stock_actual', 'INTEGER'],
      ['created_at', 'TEXT'], ['sync_uid', 'TEXT']
    ]
  },
  clientes: {
    pk: 'id_cliente',
    cols: [['nombre_cliente', 'TEXT'], ['telefono', 'TEXT'], ['created_at', 'TEXT'], ['sync_uid', 'TEXT']]
  },
  ventas: {
    pk: 'id_venta',
    cols: [
      ['fecha', 'TEXT'], ['id_cliente', 'INTEGER'], ['estado_pago', 'TEXT'], ['monto_total', 'REAL'],
      ['created_at', 'TEXT'], ['sync_uid', 'TEXT']
    ]
  },
  detalle_venta: {
    pk: 'id_detalle',
    cols: [
      ['id_venta', 'INTEGER'], ['id_producto', 'INTEGER'], ['cantidad', 'INTEGER'],
      ['precio_unitario', 'REAL'], ['subtotal', 'REAL'], ['created_at', 'TEXT'], ['sync_uid', 'TEXT']
    ]
  }
};

// Tabla -> columna de clave primaria (lista blanca: evita inyección SQL por nombre de tabla)
function pkOf(table) {
  const def = TABLES[table];
  if (!def) throw new Error(`Tabla no permitida: ${table}`);
  return def.pk;
}

const q = (name) => `"${name}"`;

function createTableSql(name, def) {
  const cols = def.cols.map(([c, t]) => `${q(c)} ${t}`).join(', ');
  return `CREATE TABLE ${q(name)} (${q(def.pk)} INTEGER PRIMARY KEY, ${cols})`;
}

// Solo permite nombres de columna válidos
function safeColumns(row) {
  const keys = Object.keys(row);
  for (const k of keys) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) throw new Error(`Columna no válida: ${k}`);
  }
  return keys;
}

// sql.js exige que las claves de los parámetros lleven prefijo (":id") y no acepta undefined
function toParams(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    let value = v === undefined ? null : v;
    if (value !== null && typeof value === 'object' && !(value instanceof Uint8Array)) {
      value = JSON.stringify(value); // jsonb / arreglos de Supabase
    }
    out[`:${k}`] = value;
  }
  return out;
}

function initialize() {
  if (!initPromise) {
    initPromise = (async () => {
      DB_DIR = path.join(app.getPath('userData'), 'ventas-data');
      fs.mkdirSync(DB_DIR, { recursive: true });
      try { // rotación simple del log
        const lp = path.join(app.getPath('userData'), 'sqlite.log');
        if (fs.existsSync(lp) && fs.statSync(lp).size > 1_000_000) fs.truncateSync(lp, 0);
      } catch { /* ignorar */ }
      log(`INICIO userData=${app.getPath('userData')} packaged=${app.isPackaged} pid=${process.pid}`);

      SQL = await initSqlJs({
        // En el .exe empaquetado el .wasm vive en app.asar.unpacked
        locateFile: (file) =>
          require.resolve(`sql.js/dist/${file}`).replace('app.asar', 'app.asar.unpacked')
      });
    })();
  }
  return initPromise;
}

function getDatabasePath(profileId) {
  const safeId = String(profileId).replace(/[^A-Za-z0-9_-]/g, '_');
  return path.join(DB_DIR, `${safeId}.db`);
}

// Helpers sobre sql.js (siempre liberan el statement)
function queryAll(db, sql, params) {
  const stmt = db.prepare(sql);
  try {
    if (params) stmt.bind(toParams(params));
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

function exec(db, sql, params) {
  const stmt = db.prepare(sql);
  try {
    stmt.run(params ? toParams(params) : undefined);
  } finally {
    stmt.free();
  }
}

// ---------- Esquema y migraciones ----------
const columnCache = new WeakMap(); // db -> Map(tabla -> Set(columnas))

function tableColumns(db, table) {
  let perDb = columnCache.get(db);
  if (!perDb) columnCache.set(db, (perDb = new Map()));
  let cols = perDb.get(table);
  if (!cols) {
    cols = new Set(queryAll(db, `PRAGMA table_info(${q(table)})`).map((c) => c.name));
    perDb.set(table, cols);
  }
  return cols;
}

// Si la fila trae columnas que la tabla local no tiene (p. ej. created_at o
// columnas nuevas de Supabase), se añaden en caliente.
function ensureColumns(db, table, keys) {
  const cols = tableColumns(db, table);
  for (const k of keys) {
    if (!cols.has(k)) {
      db.run(`ALTER TABLE ${q(table)} ADD COLUMN ${q(k)}`);
      cols.add(k);
    }
  }
}

function getUserVersion(db) {
  return Number(db.exec('PRAGMA user_version')[0]?.values[0][0] ?? 0);
}

function ensureSchema(db) {
  const existing = new Set(
    queryAll(db, "SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => r.name)
  );
  const hadOldSchema = existing.has('productos') && getUserVersion(db) < SCHEMA_VERSION;

  db.run('BEGIN');
  try {
    for (const [name, def] of Object.entries(TABLES)) {
      if (!existing.has(name)) {
        db.run(createTableSql(name, def));
      } else if (hadOldSchema) {
        // Migración: reconstruye la tabla sin NOT NULL/FOREIGN KEY conservando los datos
        const oldCols = queryAll(db, `PRAGMA table_info(${q(name)})`).map((c) => c.name);
        const known = new Set([def.pk, ...def.cols.map(([c]) => c)]);
        const extra = oldCols.filter((c) => !known.has(c));
        const tmp = `${name}__new`;
        db.run(`DROP TABLE IF EXISTS ${q(tmp)}`);
        db.run(createTableSql(tmp, def));
        for (const c of extra) db.run(`ALTER TABLE ${q(tmp)} ADD COLUMN ${q(c)}`);
        const copy = oldCols.map(q).join(', ');
        db.run(`INSERT INTO ${q(tmp)} (${copy}) SELECT ${copy} FROM ${q(name)}`);
        db.run(`DROP TABLE ${q(name)}`);
        db.run(`ALTER TABLE ${q(tmp)} RENAME TO ${q(name)}`);
      }
    }
    db.run(`
      CREATE TABLE IF NOT EXISTS pending (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        action TEXT NOT NULL,
        rowId INTEGER NOT NULL,
        payload TEXT
      );
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    db.run(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
  columnCache.delete(db);
}

async function getDatabase(profileId) {
  await initialize();

  if (databases.has(profileId)) return databases.get(profileId);

  const dbPath = getDatabasePath(profileId);
  const db = fs.existsSync(dbPath)
    ? new SQL.Database(fs.readFileSync(dbPath))
    : new SQL.Database();

  ensureSchema(db);

  databases.set(profileId, db);
  const counts = Object.keys(TABLES)
    .map((t) => `${t}=${queryAll(db, `SELECT COUNT(*) AS n FROM ${q(t)}`)[0].n}`)
    .join(' ');
  const pend = queryAll(db, 'SELECT COUNT(*) AS n FROM pending')[0].n;
  log(`ABRIR perfil=${profileId} archivo=${dbPath} existia=${fs.existsSync(dbPath)} ${counts} pending=${pend}`);
  return db;
}

// Escritura atómica: evita corromper la BD si la app se cierra a mitad de guardado
function saveDatabase(profileId) {
  const db = databases.get(profileId);
  if (!db) return;
  const buffer = Buffer.from(db.export());
  const dbPath = getDatabasePath(profileId);
  const tmpPath = `${dbPath}.tmp`;
  try {
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, dbPath);
  } catch (err) {
    log(`ERROR_GUARDAR perfil=${profileId} ${err && err.message}`);
    throw err;
  }
  log(`GUARDAR perfil=${profileId} bytes=${buffer.length}`);
}

function closeDatabase(profileId) {
  const db = databases.get(profileId);
  if (!db) return;
  saveDatabase(profileId);
  db.close();
  databases.delete(profileId);
}

function closeAllDatabases() {
  for (const profileId of [...databases.keys()]) {
    try {
      closeDatabase(profileId);
    } catch (err) {
      console.error(`Error cerrando BD ${profileId}:`, err);
    }
  }
}

// ---------- Operaciones CRUD ----------
async function all(profileId, table) {
  pkOf(table);
  const db = await getDatabase(profileId);
  return queryAll(db, `SELECT * FROM ${table}`);
}

async function get(profileId, table, id) {
  const pk = pkOf(table);
  const db = await getDatabase(profileId);
  const rows = queryAll(db, `SELECT * FROM ${table} WHERE ${pk} = :id`, { id });
  return rows[0];
}

async function put(profileId, table, row) {
  pkOf(table);
  const db = await getDatabase(profileId);
  const keys = safeColumns(row);
  ensureColumns(db, table, keys);
  exec(
    db,
    `INSERT OR REPLACE INTO ${q(table)} (${keys.map(q).join(', ')}) VALUES (${keys.map(k => `:${k}`).join(', ')})`,
    row
  );
  saveDatabase(profileId);
}

async function remove(profileId, table, id) {
  const pk = pkOf(table);
  const db = await getDatabase(profileId);
  exec(db, `DELETE FROM ${table} WHERE ${pk} = :id`, { id });
  saveDatabase(profileId);
}

async function addPending(profileId, change) {
  const db = await getDatabase(profileId);
  exec(
    db,
    `INSERT INTO pending (table_name, action, rowId, payload)
     VALUES (:table, :action, :rowId, :payload)`,
    {
      table: change.table,
      action: change.action,
      rowId: change.rowId,
      payload: JSON.stringify(change.payload || {})
    }
  );
  saveDatabase(profileId);
}

async function getPending(profileId) {
  const db = await getDatabase(profileId);
  return queryAll(db, 'SELECT * FROM pending ORDER BY id').map(row => ({
    id: row.id,
    table: row.table_name,
    action: row.action,
    rowId: row.rowId,
    payload: row.payload ? JSON.parse(row.payload) : {}
  }));
}

async function clearPending(profileId, id) {
  const db = await getDatabase(profileId);
  exec(db, 'DELETE FROM pending WHERE id = :id', { id });
  saveDatabase(profileId);
}

async function getMeta(profileId, key) {
  const db = await getDatabase(profileId);
  const rows = queryAll(db, 'SELECT value FROM meta WHERE key = :key', { key });
  return rows.length > 0 ? rows[0].value : null;
}

async function setMeta(profileId, key, value) {
  const db = await getDatabase(profileId);
  exec(db, 'INSERT OR REPLACE INTO meta (key, value) VALUES (:key, :value)', {
    key,
    value: String(value)
  });
  saveDatabase(profileId);
}

async function replaceAll(profileId, table, rows) {
  pkOf(table);
  const db = await getDatabase(profileId);
  const before = queryAll(db, `SELECT COUNT(*) AS n FROM ${q(table)}`)[0].n;
  log(`REEMPLAZAR perfil=${profileId} tabla=${table} antes=${before} nuevas=${rows.length}`);

  {
    db.run('BEGIN');
    try {
      db.run(`DELETE FROM ${q(table)}`);
      if (rows.length > 0) {
        // Unión de columnas de todas las filas (por si alguna fila trae menos)
        const keys = [...new Set(rows.flatMap((r) => safeColumns(r)))];
        ensureColumns(db, table, keys);
        const stmt = db.prepare(
          `INSERT INTO ${q(table)} (${keys.map(q).join(', ')}) VALUES (${keys.map(k => `:${k}`).join(', ')})`
        );
        try {
          for (const row of rows) {
            const full = {};
            for (const k of keys) full[k] = row[k];
            stmt.run(toParams(full));
          }
        } finally {
          stmt.free();
        }
      }
      db.run('COMMIT');
    } catch (err) {
      db.run('ROLLBACK');
      throw err;
    }
  }
  saveDatabase(profileId);
}

async function updatePending(profileId, pendingChange) {
  const db = await getDatabase(profileId);
  exec(
    db,
    `UPDATE pending
     SET table_name = :table, action = :action, rowId = :rowId, payload = :payload
     WHERE id = :id`,
    {
      table: pendingChange.table,
      action: pendingChange.action,
      rowId: pendingChange.rowId,
      payload: JSON.stringify(pendingChange.payload || {}),
      id: pendingChange.id
    }
  );
  saveDatabase(profileId);
}

module.exports = {
  log,
  getDatabase,
  closeDatabase,
  closeAllDatabases,
  all,
  get,
  put,
  remove,
  addPending,
  getPending,
  clearPending,
  getMeta,
  setMeta,
  replaceAll,
  updatePending
};
