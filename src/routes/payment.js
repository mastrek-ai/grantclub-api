'use strict'

const { verifyJWT }    = require('../middlewares/auth')
const stripeService    = require('../services/stripeService')
const db               = require('../config/database')

async function paymentRoutes(fastify) {

  // POST /api/payment/stripe/create — portail (JWT requis)
  fastify.post('/api/payment/stripe/create', {
    preHandler: verifyJWT,
  }, async (req, reply) => {
    try {
      const userId = req.user.sub
      const user   = await db('users').where({ id: userId }).first()
      if (!user) return reply.status(404).send({ error: 'USER_NOT_FOUND' })

      const { successUrl, cancelUrl } = req.body || {}
      const result = await stripeService.createCheckoutSession(
        userId, user.email, successUrl, cancelUrl
      )
      return reply.send(result)
    } catch (err) {
      fastify.log.error(err)
      return reply.status(500).send({ error: err.message })
    }
  })

  // POST /api/payment/stripe/webhook — Stripe (sans auth)
  fastify.post('/api/payment/stripe/webhook', {
    config: { rawBody: true }
  }, async (req, reply) => {
    try {
      const sig    = req.headers['stripe-signature']
      const result = await stripeService.handleWebhook(req.rawBody, sig)
      return reply.send(result)
    } catch (err) {
      fastify.log.error(err)
      return reply.status(400).send({ error: err.message })
    }
  })

  // GET /api/payment/reminders — cron interne (clé secrète)
  fastify.get('/api/payment/reminders', async (req, reply) => {
    const key = req.headers['x-cron-key']
    if (key !== process.env.CRON_SECRET) {
      return reply.status(401).send({ error: 'UNAUTHORIZED' })
    }
    try {
      const reminders = await stripeService.getRenewalReminders()
      const expired   = await stripeService.expireSubscriptions()
      return reply.send({ reminders, expired })
    } catch (err) {
      return reply.status(500).send({ error: err.message })
    }
  })
}

module.exports = paymentRoutes
