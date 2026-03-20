'use strict'

const { getRenewalReminders, expireSubscriptions } = require('../services/stripeService')

async function sendReminderEmail(email, daysLeft, renewUrl) {
  console.log(`[REMINDER] ${email} — J-${daysLeft} — ${renewUrl}`)
  // TODO: remplacer par envoi SMTP via Mailcow
}

async function runDailyJob() {
  console.log('[JOB] Démarrage', new Date().toISOString())

  const { expired } = await expireSubscriptions()
  console.log(`[JOB] ${expired} abonnement(s) expiré(s)`)

  const reminders = await getRenewalReminders()
  console.log(`[JOB] ${reminders.length} rappel(s) à envoyer`)

  const renewUrl = `${process.env.APP_URL}/en/payment`
  for (const r of reminders) {
    await sendReminderEmail(r.email, r.days_left, renewUrl)
  }

  console.log('[JOB] Terminé')
  process.exit(0)
}

runDailyJob().catch(err => {
  console.error('[JOB] Erreur:', err.message)
  process.exit(1)
})
