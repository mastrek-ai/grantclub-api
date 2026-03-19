'use strict'

const authService = require('../services/authService')

async function authRoutes(fastify) {

  // POST /api/auth/register
  fastify.post('/api/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email:    { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 }
        }
      }
    }
  }, async (req, reply) => {
    try {
      const { email, password } = req.body
      const result = await authService.register(email, password)
      // TODO: envoyer email de vérification (Sprint emailService)
      return reply.status(201).send({
        message:      'Compte créé. Vérifiez votre email.',
        userId:       result.userId,
        verify_token: result.verify_token // temporaire — sera envoyé par email
      })
    } catch (err) {
      const code = err.statusCode || 500
      return reply.status(code).send({ error: err.message })
    }
  })

  // GET /api/auth/verify-email/:token
  fastify.get('/api/auth/verify-email/:token', async (req, reply) => {
    try {
      const { token } = req.params
      await authService.verifyEmail(token)
      return reply.send({ message: 'Email vérifié avec succès.' })
    } catch (err) {
      const code = err.statusCode || 500
      return reply.status(code).send({ error: err.message })
    }
  })

  // POST /api/auth/login
  fastify.post('/api/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email:    { type: 'string', format: 'email' },
          password: { type: 'string' }
        }
      }
    }
  }, async (req, reply) => {
    try {
      const { email, password } = req.body
      const user   = await authService.login(email, password)
      const tokens = await authService.generateTokens(fastify, user.userId, user.email)
      return reply.send({
        accessToken:  tokens.accessToken,
        refreshToken: tokens.refreshToken,
        userId:       user.userId,
        email:        user.email
      })
    } catch (err) {
      const code = err.statusCode || 500
      return reply.status(code).send({ error: err.message })
    }
  })

  // POST /api/auth/refresh
  fastify.post('/api/auth/refresh', {
    schema: {
      body: {
        type: 'object',
        required: ['userId', 'refreshToken'],
        properties: {
          userId:       { type: 'integer' },
          refreshToken: { type: 'string' }
        }
      }
    }
  }, async (req, reply) => {
    try {
      const { userId, refreshToken } = req.body
      const tokens = await authService.refreshAccessToken(fastify, userId, refreshToken)
      return reply.send(tokens)
    } catch (err) {
      const code = err.statusCode || 500
      return reply.status(code).send({ error: err.message })
    }
  })
}

module.exports = authRoutes
