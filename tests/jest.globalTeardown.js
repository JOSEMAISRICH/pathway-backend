/**
 * globalTeardown: para mongo-memory-server y limpia .tmp.
 */

const fs = require('fs/promises');
const path = require('path');

const TMP_ROOT = path.join(__dirname, '.tmp');

module.exports = async () => {
  try {
    if (globalThis.__MONGOD__) {
      await globalThis.__MONGOD__.stop();
    }
  } catch (e) {
    console.error('[globalTeardown] mongo stop:', e.message);
  }
  try {
    await fs.rm(TMP_ROOT, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
};
