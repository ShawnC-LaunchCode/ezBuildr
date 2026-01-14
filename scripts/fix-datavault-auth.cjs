const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../tests/integration/datavault-v4-regression.test.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Replace .set('Authorization', ) with .set('Authorization', `Bearer ${authToken}`)
content = content.replace(
  /\.set\('Authorization',\s*\)/g,
  ".set('Authorization', `Bearer ${authToken}`)"
);

// Replace .set('Authorization', `Bearer ${otherUserCookie}`) with .set('Authorization', `Bearer ${otherUserToken}`)
// This handles the case where otherUserCookie was used
content = content.replace(
  /\.set\('Authorization',\s*`Bearer \${otherUserCookie}`\)/g,
  ".set('Authorization', `Bearer ${otherUserToken}`)"
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ Fixed all Authorization headers in datavault-v4-regression.test.ts');
