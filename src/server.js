'use strict'

require('dotenv').config()
const Fastify = require('fastify')
const knex    = require('knex')
const Redis   = require('ioredis')

const app = Fastify({ logger: true })

// ── Connexion MariaDB ──────────────────────────────────
const db = knex({
  client: 'mysql2',
  connection: {
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT,
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
  pool: { min: 2, max: 10 }
})

// ── Connexion Redis ────────────────────────────────────
const redis = new Redis({
  host:     process.env.REDIS_HOST,
  port:     process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
})

// ── Healthcheck ────────────────────────────────────────
app.get('/api/health', async (req, reply) => {
  try {
    await db.raw('SELECT 1')
    await redis.ping()
    return reply.send({
      status:    'healthy',
      service:   'Grant Club IPTV API',
      version:   '1.0.0',
      timestamp: new Date().toISOString(),
      database:  'connected',
      cache:     'connected'
    })
  } catch (err) {
    return reply.status(503).send({
      status:  'unhealthy',
      error:   err.message
    })
  }
})

// ── Démarrage ──────────────────────────────────────────
const start = async () => {
  try {
    await app.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' })
    app.log.info(`Grant Club IPTV API démarrée sur port ${process.env.PORT}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
