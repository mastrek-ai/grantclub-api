'use strict'

const Stripe = require('stripe')
const db     = require('../config/database')

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

/**
 * Crée une session Checkout Stripe
 */
async function createCheckoutSession(userId, email) {
  const session = await stripe.checkout.sessions.create({
    mode:               'subscription',
    payment_method_types: ['card'],
    customer_email:     email,
    line_items: [{
      price:    process.env.STRIPE_PRICE_ID,
      quantity: 1,
    }],
    metadata:    { userId: String(userId) },
    success_url: `${process.env.APP_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${process.env.APP_URL}/subscription`,
  })

  return { url: session.url, sessionId: session.id }
}

/**
 * Active l'abonnement après paiement réussi
 */
async function activateSubscription(userId, transactionId) {
  const endDate = new Date()
  endDate.setFullYear(endDate.getFullYear() + 1)

  await db('subscriptions')
    .where({ user_id: userId })
    .update({ status: 'active', end_date: endDate })

  // Enregistrer le paiement (idempotence)
  await db('payments')
    .insert({
      user_id:        userId,
      provider:       'stripe',
      transaction_id: transactionId,
      amount:         3.00,
      currency:       'GBP',
      status:         'completed',
    })
    .onConflict('transaction_id')
    .ignore()

  return { status: 'active', endDate }
}

/**
 * Renouvelle l'abonnement (+365 jours)
 */
async function renewSubscription(userId, transactionId) {
  const sub = await db('subscriptions').where({ user_id: userId }).first()

  const base    = sub && sub.end_date && new Date(sub.end_date) > new Date()
    ? new Date(sub.end_date)
    : new Date()

  const endDate = new Date(base)
  endDate.setFullYear(endDate.getFullYear() + 1)

  await db('subscriptions')
    .where({ user_id: userId })
    .update({ status: 'active', end_date: endDate })

  await db('payments')
    .insert({
      user_id:        userId,
      provider:       'stripe',
      transaction_id: transactionId,
      amount:         3.00,
      currency:       'GBP',
      status:         'completed',
    })
    .onConflict('transaction_id')
    .ignore()

  return { status: 'active', endDate }
}

/**
 * Gère les webhooks Stripe
 */
async function handleWebhook(rawBody, signature) {
  let event
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    const e = new Error(`WEBHOOK_SIGNATURE_INVALID: ${err.message}`)
    e.statusCode = 400
    throw e
  }

  const session = event.data.object

  switch (event.type) {
    case 'checkout.session.completed': {
      const userId = parseInt(session.metadata?.userId)
      if (userId) await activateSubscription(userId, session.id)
      break
    }
    case 'invoice.payment_succeeded': {
      const customerId = session.customer
      const sub = await stripe.subscriptions.retrieve(session.subscription)
      const userId = parseInt(sub.metadata?.userId)
      if (userId) await renewSubscription(userId, session.id)
      break
    }
    case 'invoice.payment_failed': {
      const sub = await stripe.subscriptions.retrieve(session.subscription)
      const userId = parseInt(sub.metadata?.userId)
      if (userId) {
        await db('subscriptions')
          .where({ user_id: userId })
          .update({ status: 'expired' })
      }
      break
    }
    case 'customer.subscription.deleted': {
      const userId = parseInt(session.metadata?.userId)
      if (userId) {
        await db('subscriptions')
          .where({ user_id: userId })
          .update({ status: 'cancelled' })
      }
      break
    }
  }

  return { received: true, type: event.type }
}

module.exports = {
  createCheckoutSession,
  activateSubscription,
  renewSubscription,
  handleWebhook
}
