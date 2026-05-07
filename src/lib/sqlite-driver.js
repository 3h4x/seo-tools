import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);

class NodeSqliteStatement {
  constructor(statement) {
    this.statement = statement;
  }

  get(...params) {
    return this.statement.get(...params);
  }

  all(...params) {
    return this.statement.all(...params);
  }

  run(...params) {
    return this.statement.run(...params);
  }
}

class NodeSqliteDatabase {
  constructor(filename) {
    this.db = new DatabaseSync(filename);
  }

  pragma(value) {
    this.db.exec(`PRAGMA ${value}`);
  }

  exec(sql) {
    this.db.exec(sql);
  }

  prepare(sql) {
    return new NodeSqliteStatement(this.db.prepare(sql));
  }

  transaction(fn) {
    return (...args) => {
      this.db.exec('BEGIN');
      try {
        const result = fn(...args);
        this.db.exec('COMMIT');
        return result;
      } catch (error) {
        try {
          this.db.exec('ROLLBACK');
        } catch {
          // Ignore rollback errors and rethrow the original failure.
        }
        throw error;
      }
    };
  }

  close() {
    this.db.close();
  }
}

export function openDatabase(filename) {
  try {
    const mod = require('better-sqlite3');
    const Database = mod.default ?? mod;
    return new Database(filename);
  } catch {
    return new NodeSqliteDatabase(filename);
  }
}
