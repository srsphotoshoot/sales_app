const fs = require('fs');
const { Readable } = require('stream');
const { google } = require('googleapis');
const { SERVICE_ACCOUNT_FILE } = require('./paths.cjs');

// Folder shared with each user — Drive permissions on a folder cascade to
// every file inside it (present and future), so sharing happens once per
// user, not once per image.
const DRIVE_FOLDER_ID = process.env.SALES_APP_DRIVE_FOLDER_ID;

let driveClient = null;

function getDriveClient() {
    if (driveClient) return driveClient;
    if (!fs.existsSync(SERVICE_ACCOUNT_FILE)) {
        throw new Error('service_account.json not found — see GCP setup steps in the deployment plan.');
    }
    const auth = new google.auth.GoogleAuth({
        keyFile: SERVICE_ACCOUNT_FILE,
        scopes: ['https://www.googleapis.com/auth/drive'],
    });
    driveClient = google.drive({ version: 'v3', auth });
    return driveClient;
}

// Shares the catalog images folder with a user's email. Drive sends its own
// "shared with you" notification email — no email-sending code needed here.
async function shareDriveFolder(email) {
    if (!DRIVE_FOLDER_ID) throw new Error('SALES_APP_DRIVE_FOLDER_ID is not set');
    const drive = getDriveClient();
    await drive.permissions.create({
        fileId: DRIVE_FOLDER_ID,
        sendNotificationEmail: true,
        requestBody: { role: 'reader', type: 'user', emailAddress: email },
        fields: 'id',
    });
}

// Uploads an image buffer into the shared catalog folder, returns the Drive fileId.
async function uploadImageToDrive(buffer, filename, mimeType) {
    if (!DRIVE_FOLDER_ID) throw new Error('SALES_APP_DRIVE_FOLDER_ID is not set');
    const drive = getDriveClient();
    const res = await drive.files.create({
        requestBody: { name: filename, parents: [DRIVE_FOLDER_ID] },
        media: { mimeType, body: Readable.from(buffer) },
        fields: 'id',
    });
    return res.data.id;
}

module.exports = { shareDriveFolder, uploadImageToDrive, DRIVE_FOLDER_ID };
