'use strict'

const stripeService = require('../services/stripeService')
const { verifyJWT } = require('../middlewares/auth')

async function paymentRoutes(fastify) {

  // POST /api/payment/stripe/create — Créer session Checkout
  fastify.post('/api/payment/stripe/create', {
    preHandler: verifyJWT
  }, async (req, reply) => {
    try {
      const userId = req.user.sub
      const email  = req.user.email
      const result = await stripeService.createCheckoutSession(userId, email)
      return reply.send(result)
    } catch (err) {
      const code = err.statusCode || 500
      return reply.status(code).send({ error: err.message })
    }
  })

  // POST /api/payment/stripe/webhook — Body RAW obligatoire
  fastify.post('/api/payment/stripe/webhook', {
    config: { rawBody: true }
  }, async (req, reply) => {
    try {
      const signature = req.headers['stripe-signature']
      const result    = await stripeService.handleWebhook(req.rawBody, signature)
      return reply.send(result)
    } catch (err) {
      const code = err.statusCode || 400
      return reply.status(code).send({ error: err.message })
    }
  })
}

module.exports = paymentRoutes
