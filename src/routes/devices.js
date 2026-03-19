'use strict'
const deviceService = require('../services/deviceService')
const { verifyJWT } = require('../middlewares/auth')

async function deviceRoutes(fastify) {

  fastify.post('/api/devices/register', async (req, reply) => {
    try {
      const { deviceId, fingerprint, platform, appVersion } = req.body || {}
      const dId  = deviceId || require('crypto').randomBytes(16).toString('hex')
      const plat = platform || 'android_tv'
      const result = await deviceService.registerDevice(dId, fingerprint, plat, appVersion)
      return reply.status(201).send(result)
    } catch (err) {
      return reply.status(err.statusCode || 500).send({ error: err.message })
    }
  })

  fastify.post('/api/devices/activate', {
    preHandler: verifyJWT,
    schema: {
      body: {
        type: 'object',
        required: ['code'],
        properties: {
          code: { type: 'string', pattern: '^[A-Z0-9]{4}-[A-Z0-9]{4}$' }
        }
      }
    }
  }, async (req, reply) => {
    try {
      const result = await deviceService.activateDevice(req.user.sub, req.body.code)
      return reply.send(result)
    } catch (err) {
      return reply.status(err.statusCode || 500).send({ error: err.message })
    }
  })

  fastify.post('/api/devices/check', async (req, reply) => {
    try {
      const { code } = req.body || {}
      if (!code) return reply.status(400).send({ error: 'code required' })
      const result = await deviceService.checkActivation(code)
      return reply.send(result)
    } catch (err) {
      return reply.status(err.statusCode || 500).send({ error: err.message })
    }
  })

  fastify.post('/api/devices/auth', async (req, reply) => {
    try {
      const { deviceId, deviceKey } = req.body || {}
      if (!deviceKey) return reply.status(400).send({ error: 'deviceKey required' })
      const result = await deviceService.authenticateDevice(deviceId || 'unknown', deviceKey)
      return reply.send(result)
    } catch (err) {
      return reply.status(err.statusCode || 500).send({ error: err.message })
    }
  })
}

module.exports = deviceRoutes
