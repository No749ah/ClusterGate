import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Checking database...')

  const userCount = await prisma.user.count()

  if (userCount === 0) {
    console.log('\n⚠️  No users found.')
    console.log('   Start the application and complete the setup wizard to create your admin account.')
  } else {
    console.log(`✅ ${userCount} user(s) found. Database is ready.`)
  }
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
