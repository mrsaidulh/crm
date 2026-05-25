const fs = require('fs');
let content = fs.readFileSync('src/lib/firebaseService.ts', 'utf8');

content = content.replace(/console\.error\(err\);/g, `
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}
`);

fs.writeFileSync('src/lib/firebaseService.ts', content);
console.log('Replaced all console.error(err);');
