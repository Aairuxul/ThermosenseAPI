// Script temporaire pour créer le dossier middleware
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'middleware');
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
  console.log('Dossier middleware créé');
}
