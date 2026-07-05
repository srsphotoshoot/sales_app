const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

module.exports = {
    DATA_DIR,
    KEYS_FILE: path.join(DATA_DIR, 'keys.json'),
    PRODUCTS_FILE: path.join(DATA_DIR, 'products.json'),
    SALES_FILE: path.join(DATA_DIR, 'sales_history.json'),
    LOGS_FILE: path.join(DATA_DIR, 'inventory_logs.json'),
    USERS_FILE: path.join(DATA_DIR, 'users.json'),
    UPLOADS_DIR: path.join(DATA_DIR, 'uploads'),
    SYNC_ERRORS_LOG: path.join(DATA_DIR, 'sync_errors.log'),
    PRODUCT_IMAGES_DIR: path.join(DATA_DIR, 'uploads', 'products'),
    BRANDING_FILE: path.join(DATA_DIR, 'branding.json'),
    EXHIBITION_FILE: path.join(DATA_DIR, 'exhibition.json'),
    SERVICE_ACCOUNT_FILE: path.join(__dirname, '..', 'service_account.json'),
};
