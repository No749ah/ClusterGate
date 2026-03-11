import swaggerJsdoc from 'swagger-jsdoc'
import path from 'path'

// Read version from package.json
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require(path.join(__dirname, '..', '..', 'package.json'))

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'ClusterGate API',
      version: pkg.version,
      description: 'Kubernetes Routing Gateway Platform API',
    },
    servers: [{ url: '/' }],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'cg_session',
          description: 'JWT session cookie set on login',
        },
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Bearer token (JWT)',
        },
      },
      schemas: {
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            name: { type: 'string' },
            role: { type: 'string', enum: ['ADMIN', 'OPERATOR', 'VIEWER'] },
            isActive: { type: 'boolean' },
            twoFactorEnabled: { type: 'boolean' },
            lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Route: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string' },
            publicPath: { type: 'string' },
            targetUrl: { type: 'string', format: 'uri' },
            methods: { type: 'array', items: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] } },
            tags: { type: 'array', items: { type: 'string' } },
            isActive: { type: 'boolean' },
            status: { type: 'string', enum: ['DRAFT', 'ACTIVE', 'INACTIVE'] },
            timeout: { type: 'integer' },
            retryCount: { type: 'integer' },
            retryDelay: { type: 'integer' },
            stripPrefix: { type: 'boolean' },
            sslVerify: { type: 'boolean' },
            corsEnabled: { type: 'boolean' },
            requireAuth: { type: 'boolean' },
            rateLimitEnabled: { type: 'boolean' },
            rateLimitMax: { type: 'integer' },
            rateLimitWindow: { type: 'integer' },
            maintenanceMode: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        RouteBody: {
          type: 'object',
          required: ['name', 'publicPath', 'targetUrl', 'methods'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            description: { type: 'string', maxLength: 500 },
            publicPath: { type: 'string', description: 'Must start with /r/' },
            targetUrl: { type: 'string', format: 'uri' },
            methods: { type: 'array', items: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] }, minItems: 1 },
            tags: { type: 'array', items: { type: 'string' } },
            timeout: { type: 'integer', minimum: 1000, maximum: 120000, default: 30000 },
            retryCount: { type: 'integer', minimum: 0, maximum: 5, default: 0 },
            retryDelay: { type: 'integer', minimum: 100, maximum: 10000, default: 1000 },
            stripPrefix: { type: 'boolean', default: false },
            sslVerify: { type: 'boolean', default: true },
            requestBodyLimit: { type: 'string', default: '10mb' },
            addHeaders: { type: 'object', additionalProperties: { type: 'string' } },
            removeHeaders: { type: 'array', items: { type: 'string' } },
            rewriteRules: { type: 'array', items: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } } } },
            corsEnabled: { type: 'boolean', default: false },
            corsOrigins: { type: 'array', items: { type: 'string' } },
            ipAllowlist: { type: 'array', items: { type: 'string' } },
            requireAuth: { type: 'boolean', default: false },
            authType: { type: 'string', enum: ['NONE', 'API_KEY', 'BASIC', 'BEARER'], default: 'NONE' },
            authValue: { type: 'string' },
            webhookSecret: { type: 'string' },
            rateLimitEnabled: { type: 'boolean', default: false },
            rateLimitMax: { type: 'integer', minimum: 1, maximum: 100000, default: 100 },
            rateLimitWindow: { type: 'integer', minimum: 1000, maximum: 3600000, default: 60000 },
            maintenanceMode: { type: 'boolean', default: false },
            maintenanceMessage: { type: 'string' },
          },
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            pageSize: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
        },
      },
    },
    security: [
      { cookieAuth: [] },
      { bearerAuth: [] },
    ],
    tags: [
      { name: 'Auth', description: 'Authentication and authorization' },
      { name: 'Routes', description: 'Route management (CRUD, publishing, testing)' },
      { name: 'Users', description: 'User management and invitations' },
      { name: 'Logs', description: 'Request logs' },
      { name: 'Audit', description: 'Audit logs' },
      { name: 'API Keys', description: 'API key management for routes' },
      { name: 'Notifications', description: 'User notifications' },
      { name: 'System', description: 'System administration and maintenance' },
      { name: 'Analytics', description: 'Traffic analytics and performance metrics' },
      { name: 'Health', description: 'Health and readiness probes' },
      { name: 'Backups', description: 'Database backup and restore' },
    ],
  },
  apis: [path.join(__dirname, '..', 'routes', '*.router.{ts,js}')],
}

export const swaggerSpec = swaggerJsdoc(options)
