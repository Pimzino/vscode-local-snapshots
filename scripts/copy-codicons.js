const fs = require('fs');
const path = require('path');

// Source paths
const codiconsDir = path.join(__dirname, '..', 'node_modules', '@vscode', 'codicons', 'dist');
const codiconsCss = path.join(codiconsDir, 'codicon.css');
const codiconsFont = path.join(codiconsDir, 'codicon.ttf');

// Destination paths
const mediaDir = path.join(__dirname, '..', 'media');
const mediaCodiconsDir = path.join(mediaDir, 'codicons');

// Create media/codicons directory if it doesn't exist
if (!fs.existsSync(mediaCodiconsDir)) {
    fs.mkdirSync(mediaCodiconsDir, { recursive: true });
}

// Copy files
fs.copyFileSync(codiconsCss, path.join(mediaCodiconsDir, 'codicon.css'));
fs.copyFileSync(codiconsFont, path.join(mediaCodiconsDir, 'codicon.ttf'));

console.log('Codicons files copied successfully!'); 