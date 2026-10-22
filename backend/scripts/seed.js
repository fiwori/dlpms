require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../src/lib/prisma');

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed default accounts in production.');
  process.exit(1);
}

const PASSWORD = 'Staff12345'; // development only

const staff = [
  { phone_number: '0911000100', email: 'admin@dlpms.local',   role: 'SYSTEM_ADMIN' },
  { phone_number: '0911000200', email: 'officer@dlpms.local', role: 'LAND_OFFICER' },
  { phone_number: '0911000300', email: 'tax@dlpms.local',     role: 'TAX_OFFICIAL' },
  { phone_number: '0911000400', email: 'gis@dlpms.local',     role: 'GIS_OFFICER' },
];

async function main() {
  const password_hash = await bcrypt.hash(PASSWORD, 12);
  for (const s of staff) {
    const user = await prisma.user.upsert({
      where: { phone_number: s.phone_number },
      update: { role: s.role, is_active: true },
      create: { ...s, password_hash },
    });
    console.log(`${user.role.padEnd(13)} ${user.phone_number}  (id ${user.id})`);
  }
  console.log(`\nDefault password for all staff: ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());