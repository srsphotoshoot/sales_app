const { safeReadJSON, saveAtomic, generateID } = require('./helpers.cjs');
const { globalLock } = require('./shared.cjs');
const { LOGS_FILE } = require('../config/paths.cjs');

// Helper to log inventory actions
const logInventoryAction = async (action, details) => {
    const release = await globalLock.acquire();
    try {
        const logs = safeReadJSON(LOGS_FILE);
        const newLog = {
            id: generateID('LOG'),
            timestamp: new Date().toISOString(),
            action, // ADD, UPDATE, SALE, BULK
            ...details
        };
        logs.unshift(newLog);
        
        // Strictly maintain only last 1000 entries
        const truncatedLogs = logs.slice(0, 1000);
        saveAtomic(LOGS_FILE, truncatedLogs);
    } catch (err) {
        console.error('Logging Error:', err);
    } finally {
        release();
    }
};

module.exports = { logInventoryAction };
