const fs = require('fs');
const content = fs.readFileSync('src/lib/firebaseService.ts', 'utf8');
let newContent = content.replace(/if \(firestoreDb\)/g, 'if (isFirebaseActive() && firestoreDb)');
newContent = newContent.replace(/console\.error\('\[FirebaseService\].*?', err\);/g, `
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}
`);
fs.writeFileSync('src/lib/firebaseService.ts', newContent);
console.log('Replaced');
