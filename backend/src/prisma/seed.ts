import { PrismaClient, Role, RouteStatus, AuthType } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // ============================================================================
  // Users
  // ============================================================================

  const adminPassword = await bcrypt.hash('Admin@ClusterGate1', 12)
  const operatorPassword = await bcrypt.hash('Operator@1234', 12)

  const admin = await prisma.user.upsert({
    where: { email: 'admin@clustergate.local' },
    update: {},
    create: {
      email: 'admin@clustergate.local',
      passwordHash: adminPassword,
      name: 'Admin User',
      role: Role.ADMIN,
      isActive: true,
    },
  })
  console.log(`✅ Created admin user: ${admin.email}`)

  const operator = await prisma.user.upsert({
    where: { email: 'operator@clustergate.local' },
    update: {},
    create: {
      email: 'operator@clustergate.local',
      passwordHash: operatorPassword,
      name: 'Operator User',
      role: Role.OPERATOR,
      isActive: true,
    },
  })
  console.log(`✅ Created operator user: ${operator.email}`)

  // ============================================================================
  // Routes
  // ============================================================================

  const routes = [
    {
      name: 'n8n Webhooks',
      description: 'Forward webhooks to the n8n automation platform',
      domain: 'api.example.com',
      publicPath: '/webhook',
      targetUrl: 'http://n8n.default.svc.cluster.local:5678/webhook',
      methods: ['POST', 'GET'],
      status: RouteStatus.PUBLISHED,
      isActive: true,
      tags: ['webhooks', 'n8n', 'automation'],
      timeout: 30000,
      retryCount: 2,
      retryDelay: 1000,
      addHeaders: { 'X-Forwarded-By': 'ClusterGate' } as Record<string, string>,
      createdById: admin.id,
      updatedById: admin.id,
    },
    {
      name: 'LangFlow API',
      description: 'LangFlow AI workflow builder API',
      domain: 'api.example.com',
      publicPath: '/langflow',
      targetUrl: 'http://langflow.default.svc.cluster.local:7860',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      status: RouteStatus.DRAFT,
      isActive: false,
      tags: ['ai', 'langflow'],
      timeout: 60000,
      retryCount: 0,
      stripPrefix: true,
      corsEnabled: true,
      corsOrigins: ['https://app.example.com'],
      createdById: admin.id,
      updatedById: admin.id,
    },
    {
      name: 'Internal Production API v1',
      description: 'Main internal microservice API - production namespace',
      domain: 'api.example.com',
      publicPath: '/api/v1',
      targetUrl: 'http://myservice.production.svc.cluster.local:8080/v1',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      status: RouteStatus.PUBLISHED,
      isActive: true,
      tags: ['production', 'api', 'v1'],
      timeout: 15000,
      retryCount: 3,
      retryDelay: 500,
      requireAuth: false,
      ipAllowlist: [] as string[],
      addHeaders: { 'X-Internal-Service': 'clustergate-proxy' } as Record<string, string>,
      createdById: admin.id,
      updatedById: admin.id,
    },
  ]

  for (const routeData of routes) {
    const existing = await prisma.route.findFirst({
      where: { domain: routeData.domain, publicPath: routeData.publicPath, deletedAt: null },
    })

    if (!existing) {
      const route = await prisma.route.create({
        data: routeData,
      })

      // Create initial version
      await prisma.routeVersion.create({
        data: {
          routeId: route.id,
          version: 1,
          snapshot: route as any,
          createdById: admin.id,
        },
      })

      console.log(`✅ Created route: ${route.name} (${route.domain}${route.publicPath})`)
    } else {
      console.log(`⏭️  Route already exists: ${routeData.name}`)
    }
  }

  console.log('\n🎉 Seed complete!')
  console.log('\n📋 Default credentials:')
  console.log('  Admin:    admin@clustergate.local / Admin@ClusterGate1')
  console.log('  Operator: operator@clustergate.local / Operator@1234')
  console.log('\n⚠️  Please change these passwords after first login!\n')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
