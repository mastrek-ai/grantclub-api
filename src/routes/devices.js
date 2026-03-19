'use strict'

const deviceService    = require('../services/deviceService')
const { verifyJWT }    = require('../middlewares/auth')

async function deviceRoutes(fastify) {

  // POST /api/devices/register — App Android (sans auth)
  fastify.post('/api/devices/register', {
    schema: {
      body: {
        type: 'object',
        required: ['deviceId', 'platform'],
        properties: {
          deviceId:    { type: 'string' },
          fingerprint: { type: 'string' },
          platform:    { type: 'string', enum: ['android_tv', 'android_mobile'] },
          appVersion:  { type: 'string' }
        }
      }
    }
  }, async (req, reply) => {
    try {
      const { deviceId, fingerprint, platform, appVersion } = req.body
      const result = await deviceService.registerDevice(deviceId, fingerprint, platform, appVersion)
      return reply.status(201).send(result)
    } catch (err) {
      const code = err.statusCode || 500
      return reply.status(code).send({ error: err.message })
    }
  })

  // POST /api/devices/activate — Portail web (avec auth JWT)
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
      const userId = req.user.sub
      const { code } = req.body
      const result = await deviceService.activateDevice(userId, code)
      return reply.send(result)
    } catch (err) {
      const code = err.statusCode || 500
      return reply.status(code).send({ error: err.message })
    }
  })

  // POST /api/devices/auth — App Android (sans auth JWT)
  fastify.post('/api/devices/auth', {
    schema: {
      body: {
        type: 'object',
        required: ['deviceId', 'deviceKey'],
        properties: {
          deviceId:   { type: 'string' },
          deviceKey:  { type: 'string' },
          platform:   { type: 'string' },
          appVersion: { type: 'string' }
        }
      }
    }
  }, async (req, reply) => {
    try {
      const { deviceId, deviceKey } = req.body
      const result = await deviceService.authenticateDevice(deviceId, deviceKey)
      return reply.send(result)
    } catch (err) {
      const code = err.statusCode || 500
      return reply.status(code).send({ error: err.message })
    }
  })
}

module.exports = deviceRoutes
