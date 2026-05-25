const fs = require('fs');
const content = fs.readFileSync('src/lib/firebaseService.ts', 'utf8');
const newContent = content.replace(/if \(firestoreDb\)/g, 'if (isFirebaseActive() && firestoreDb)');
fs.writeFileSync('src/lib/firebaseService.ts', newContent);
console.log('Replaced');
