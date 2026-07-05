const jwt = require('jsonwebtoken');

const checkAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Authorization required' });

    const secret = process.env.JWT_SECRET;
    if (!secret) return res.status(503).json({ success: false, message: 'Auth not configured. Set JWT_SECRET in server environment.' });

    const token = authHeader.replace('Bearer ', '');
    try {
        const decoded = jwt.verify(token, secret);
        // Kept as a plain 'Admin'/'Staff' string (not decoded object) so existing
        // req.user === 'Admin' checks elsewhere in the codebase keep working.
        req.user = decoded.role;
        req.staffName = decoded.name || null;
        req.userEmail = decoded.email || null;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Invalid or expired session' });
    }
};

const isAdmin = (req, res, next) => {
    if (req.user !== 'Admin') {
        return res.status(403).json({ success: false, message: 'Administrative access required' });
    }
    next();
};

module.exports = { checkAuth, isAdmin };
