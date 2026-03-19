'use strict'

const playlistService = require('../services/playlistService')
const { verifyJWT }   = require('../middlewares/auth')

async function playlistRoutes(fastify) {

  // POST /api/playlist/m3u
  fastify.post('/api/playlist/m3u', {
    preHandler: verifyJWT,
    schema: {
      body: {
        type: 'object',
        required: ['m3uUrl'],
        properties: {
          m3uUrl: { type: 'string', format: 'uri' }
        }
      }
    }
  }, async (req, reply) => {
    try {
      const userId = req.user.sub
      const result = await playlistService.saveM3uPlaylist(userId, req.body.m3uUrl)
      return reply.send(result)
    } catch (err) {
      const code = err.statusCode || 500
      return reply.status(code).send({ error: err.message })
    }
  })

  // POST /api/playlist/xtream
  fastify.post('/api/playlist/xtream', {
    preHandler: verifyJWT,
    schema: {
      body: {
        type: 'object',
        required: ['host', 'username', 'password'],
        properties: {
          host:     { type: 'string', format: 'uri' },
          username: { type: 'string' },
          password: { type: 'string' }
        }
      }
    }
  }, async (req, reply) => {
    try {
      const userId = req.user.sub
      const { host, username, password } = req.body
      const result = await playlistService.saveXtreamPlaylist(userId, host, username, password)
      return reply.send(result)
    } catch (err) {
      const code = err.statusCode || 500
      return reply.status(code).send({ error: err.message })
    }
  })

  // GET /api/playlist
  fastify.get('/api/playlist', {
    preHandler: verifyJWT
  }, async (req, reply) => {
    try {
      const userId  = req.user.sub
      const playlist = await playlistService.getPlaylist(userId)
      if (!playlist) return reply.status(404).send({ error: 'NO_PLAYLIST' })
      return reply.send(playlist)
    } catch (err) {
      const code = err.statusCode || 500
      return reply.status(code).send({ error: err.message })
    }
  })
}

module.exports = playlistRoutes
