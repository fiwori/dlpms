const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'prisma', 'schema.prisma');
let s = fs.readFileSync(file, 'utf8');

if (s.includes('model TaxRate')) {
  console.log('Schema already patched.');
  process.exit(0);
}

function replaceOnce(re, replacement, label) {
  if (!re.test(s)) {
    console.error('Could not find: ' + label + '. Nothing was changed.');
    process.exit(1);
  }
  s = s.replace(re, replacement);
}

// Payment status: "processing" replaces my wrong guess "expired"
replaceOnce(/(enum PaymentStatus \{[^}]*?)\bexpired\b/, '$1processing', 'PaymentStatus value');
// Counter payments have no user account: payer becomes optional, with a name
replaceOnce(/(\n[ \t]*payer_id[ \t]+)Int([ \t]*\r?\n)/, '$1Int?$2  payer_name      String?\n', 'payer_id field');
replaceOnce(/(payer[ \t]+)User([ \t]+@relation\("Payer")/, '$1User?$2', 'payer relation');

s += `
model TaxRate {
  id           Int      @id @default(autoincrement())
  land_use     String
  kebele       String?
  rate_per_sqm Decimal  @db.Decimal(10, 4)
  is_active    Boolean  @default(true)
  created_at   DateTime @default(now())
  updated_at   DateTime @updatedAt

  @@index([land_use, kebele])
  @@map("tax_rates")
}
`;

fs.writeFileSync(file, s);
console.log('Schema patched.');