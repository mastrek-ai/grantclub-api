'use strict'

const Stripe = require('stripe')
const db     = require('../config/database')

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

/**
 * Crée une session Checkout Stripe — paiement unique 3€/an
 */
async function createCheckoutSession(userId, email, successUrl, cancelUrl) {
  const session = await stripe.checkout.sessions.create({
    mode:                 'payment',
    payment_method_types: ['card'],
    customer_email:       email,
    line_items: [{
      price_data: {
        currency:     'eur',
        unit_amount:  300,
        product_data: {
          name:        'Grant Club IPTV — 1 an',
          description: 'Accès complet Android TV + Mobile pendant 12 mois',
        },
      },
      quantity: 1,
    }],
    metadata:    { userId: String(userId) },
    success_url: successUrl || `${process.env.APP_URL}/en/dashboard`,
    cancel_url:  cancelUrl  || `${process.env.APP_URL}/en/payment`,
  })

  return { url: session.url, sessionId: session.id }
}

/**
 * Active l'abonnement après paiement réussi (+365 jours)
 */
async function activateSubscription(userId, transactionId) {
  const endDate = new Date()
  endDate.setFullYear(endDate.getFullYear() + 1)

  await db('subscriptions')
    .where({ user_id: userId })
    .update({
      status:   'active',
      end_date: endDate,
      updated_at: new Date(),
    })

  await db('payments')
    .insert({
      user_id:        userId,
      provider:       'stripe',
      transaction_id: transactionId,
      amount:         3.00,
      currency:       'EUR',
      status:         'completed',
    })
    .onConflict('transaction_id')
    .ignore()

  return { status: 'active', endDate }
}

/**
 * Calcule les jours restants avant expiration
 */
function daysUntilExpiry(endDate) {
  const now  = new Date()
  const end  = new Date(endDate)
  return Math.ceil((end - now) / 86400000)
}

/**
 * Identifie les abonnements à notifier (J-30, J-15, J-7)
 * Appelé par un cron quotidien
 */
async function getRenewalReminders() {
  const REMIND_DAYS = [30, 15, 7]
  const reminders   = []

  for (const days of REMIND_DAYS) {
    const targetDate = new Date()
    targetDate.setDate(targetDate.getDate() + days)
    const dateStr = targetDate.toISOString().split('T')[0]

    const subs = await db('subscriptions as s')
      .join('users as u', 'u.id', 's.user_id')
      .whereRaw("DATE(s.end_date) = ?", [dateStr])
      .where('s.status', 'active')
      .select('u.id as userId', 'u.email', 's.end_date', db.raw('? as days_left', [days]))

    reminders.push(...subs)
  }

  return reminders
}

/**
 * Identifie les abonnements expirés à désactiver
 */
async function expireSubscriptions() {
  const now = new Date()
  const expired = await db('subscriptions')
    .where('status', 'active')
    .where('end_date', '<', now)
    .update({ status: 'expired', updated_at: now })

  return { expired }
}

/**
 * Gère les webhooks Stripe — paiement unique uniquement
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

  const obj = event.data.object

  switch (event.type) {
    case 'checkout.session.completed': {
      if (obj.payment_status === 'paid') {
        const userId = parseInt(obj.metadata?.userId)
        if (userId) await activateSubscription(userId, obj.id)
      }
      break
    }
    case 'payment_intent.payment_failed': {
      // Log uniquement — pas d'action sur abonnement
      console.log(`Payment failed: ${obj.id}`)
      break
    }
  }

  return { received: true, type: event.type }
}

module.exports = {
  createCheckoutSession,
  activateSubscription,
  getRenewalReminders,
  expireSubscriptions,
  handleWebhook,
}
