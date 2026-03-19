'use strict'

require('dotenv').config()

const Fastify = require('fastify')
const db      = require('./config/database')
const redis   = require('./config/redis')

const app = Fastify({ logger: true, bodyLimit: 1048576 })

// ── Plugins ───────────────────────────────────────────
app.register(require('@fastify/helmet'))
app.register(require('@fastify/cors'), {
  origin:      [process.env.APP_URL, 'http://localhost:3001'],
  credentials: true,
})
app.register(require('@fastify/rate-limit'), {
  max:        50,
  timeWindow: '1 minute',
  redis,
})
app.register(require('@fastify/jwt'), {
  secret: process.env.JWT_SECRET,
})

// ── Body RAW pour webhook Stripe uniquement ───────────
app.addContentTypeParser(
  'application/json',
  { parseAs: 'buffer' },
  function (req, body, done) {
    try {
      const parsed = JSON.parse(body.toString())
      req.rawBody   = body
      done(null, parsed)
    } catch (err) {
      err.statusCode = 400
      done(err)
    }
  }
)

// ── Routes ────────────────────────────────────────────
app.register(require('./routes/auth'))
app.register(require('./routes/devices'))
app.register(require('./routes/playlist'))
app.register(require('./routes/payment'))

// ── Healthcheck ───────────────────────────────────────
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
      cache:     'connected',
    })
  } catch (err) {
    return reply.status(503).send({ status: 'unhealthy', error: err.message })
  }
})

// ── 404 ───────────────────────────────────────────────
app.setNotFoundHandler((req, reply) => {
  reply.status(404).send({ error: 'NOT_FOUND', path: req.url })
})

// ── Error handler ─────────────────────────────────────
app.setErrorHandler((err, req, reply) => {
  app.log.error(err)
  reply.status(err.statusCode || 500).send({
    error:      err.message || 'INTERNAL_ERROR',
    statusCode: err.statusCode || 500,
  })
})

// ── Démarrage ─────────────────────────────────────────
const start = async () => {
  try {
    await app.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' })
    app.log.info('Grant Club IPTV API démarrée sur port ' + process.env.PORT)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
