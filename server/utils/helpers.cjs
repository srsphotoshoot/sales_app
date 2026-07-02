const fs = require('fs');
const path = require('path');

// Helper to read JSON safely without crashing
const safeReadJSON = (filePath, defaultValue = []) => {
    try {
        if (!fs.existsSync(filePath)) return defaultValue;
        const data = fs.readFileSync(filePath, 'utf8');
        if (!data.trim()) return defaultValue;
        return JSON.parse(data);
    } catch (err) {
        console.error(`❌ JSON Parse Error (${filePath}):`, err.message);
        // If file is corrupted, preserve it as .bak and return default
        if (fs.existsSync(filePath)) {
            try { fs.copyFileSync(filePath, `${filePath}.bak-${Date.now()}`); } catch(e) {}
        }
        return defaultValue;
    }
};

const crypto = require('crypto');

const generateID = (prefix) => {
    const rand = crypto.randomBytes(4).toString('hex');
    return `${prefix}-${Date.now()}-${rand}`;
};

// Helper to save data atomically
const saveAtomic = (filePath, data) => {
    const tmpPath = `${filePath}.tmp-${Math.random().toString(36).substring(7)}`;
    try {
        fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
        fs.renameSync(tmpPath, filePath);
        return true;
    } catch (err) {
        console.error(`❌ Atomic Save Error (${filePath}):`, err);
        if (fs.existsSync(tmpPath)) {
            try { fs.unlinkSync(tmpPath); } catch(e) {}
        }
        return false;
    }
};

const getPublicUrl = (relativePath) => {
    if (!relativePath) return '';
    if (relativePath.startsWith('http')) return relativePath;
    const baseUrl = process.env.VITE_API_URL || '';
    const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const cleanRelative = relativePath.startsWith('/') ? relativePath : '/' + relativePath;
    return cleanBase + cleanRelative;
};

module.exports = {
    safeReadJSON,
    generateID,
    saveAtomic,
    getPublicUrl
};
