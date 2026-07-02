const AsyncLock = require('./lock.cjs');
const globalLock = new AsyncLock();

module.exports = { globalLock };
