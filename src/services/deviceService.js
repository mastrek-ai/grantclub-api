'use strict'

const crypto    = require('crypto')
const db        = require('../config/database')
const redis     = require('../config/redis')
const { generateToken, sha256 } = require('../utils/crypto')

const ACTIVATION_CODE_TTL = 10 * 60 // 10 minutes
const MAX_DEVICES_PER_FINGERPRINT = 3

/**
 * Génère un code d'activation XXXX-XXXX
 * Sans caractères ambigus : 0, O, 1, I, L
 */
function generateActivationCode() {
  const charset = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let code = ''
  const bytes = crypto.randomBytes(8)
  for (let i = 0; i < 8; i++) {
    code += charset[bytes[i] % charset.length]
    if (i === 3) code += '-'
  }
  return code
}

/**
 * Enregistre un nouveau device et retourne le code d'activation
 */
async function registerDevice(deviceId, fingerprint, platform, appVersion) {

  // Détection émulateur
  if (fingerprint && fingerprint.includes('generic')) {
    const err = new Error('EMULATOR_DETECTED')
    err.statusCode = 403
    throw err
  }

  // Vérifier anti-abus : max 3 comptes par fingerprint
  if (fingerprint) {
    const count = await db('devices')
      .where({ fingerprint })
      .countDistinct('user_id as cnt')
      .first()
    if (parseInt(count.cnt) >= MAX_DEVICES_PER_FINGERPRINT) {
      const err = new Error('ABUSE_DETECTED')
      err.statusCode = 403
      throw err
    }
  }

  // Vérifier si device déjà enregistré
  const existing = await db('devices').where({ device_id: deviceId }).first()
  if (existing) {
    // Générer un nouveau code d'activation
    const code = generateActivationCode()
    await redis.setex(`activation:${code}`, ACTIVATION_CODE_TTL, JSON.stringify({
      deviceId,
      existingDeviceId: existing.id
    }))
    return { code, deviceId }
  }

  // Nouveau device — créer en base sans user_id (en attente activation)
  const code = generateActivationCode()
  await redis.setex(`activation:${code}`, ACTIVATION_CODE_TTL, JSON.stringify({
    deviceId,
    fingerprint,
    platform,
    appVersion,
    isNew: true
  }))

  return { code, deviceId }
}

/**
 * Active un device depuis le portail web
 */
async function activateDevice(userId, code) {
  const raw = await redis.get(`activation:${code}`)
  if (!raw) {
    const err = new Error('INVALID_CODE')
    err.statusCode = 400
    throw err
  }

  const data = JSON.parse(raw)

  // Vérifier 1 essai par device_id
  const trialUsed = await db('devices')
    .where({ device_id: data.deviceId })
    .whereNotNull('user_id')
    .first()

  if (trialUsed && trialUsed.user_id !== userId) {
    const err = new Error('DEVICE_LIMIT')
    err.statusCode = 403
    throw err
  }

  const deviceKey = generateToken(32)

  if (data.isNew) {
    await db('devices').insert({
      user_id:         userId,
      device_id:       data.deviceId,
      device_key:      deviceKey,
      fingerprint:     data.fingerprint,
      platform:        data.platform,
      app_version:     data.appVersion,
      activation_code: code,
      activated_at:    new Date(),
    })
  } else {
    await db('devices')
      .where({ id: data.existingDeviceId })
      .update({
        user_id:     userId,
        device_key:  deviceKey,
        activated_at: new Date(),
      })
  }

  // Supprimer le code utilisé
  await redis.del(`activation:${code}`)

  return { deviceKey }
}

/**
 * Authentifie un device — jointure unique < 200ms
 */
async function authenticateDevice(deviceId, deviceKey) {
  const result = await db('devices as d')
    .join('users as u',         'u.id', 'd.user_id')
    .join('subscriptions as s', 's.user_id', 'u.id')
    .leftJoin('playlists as p', 'p.user_id', 'u.id')
    .where('d.device_id',  deviceId)
    .where('d.device_key', deviceKey)
    .select(
      'd.id as deviceDbId',
      'd.activated_at',
      'u.id as userId',
      'u.email',
      's.status',
      's.trial_end',
      's.end_date',
      'p.type as playlist_type',
      'p.m3u_url',
      'p.xtream_host',
      'p.xtream_user',
      'p.xtream_pass_enc'
    )
    .first()

  if (!result) {
    const err = new Error('DEVICE_NOT_FOUND')
    err.statusCode = 404
    throw err
  }

  // Calculer jours restants
  const now      = new Date()
  let daysRemaining = 0
  let status     = result.status

  if (status === 'trial' && result.trial_end) {
    daysRemaining = Math.max(0, Math.ceil((new Date(result.trial_end) - now) / 86400000))
    if (daysRemaining === 0) status = 'expired'
  } else if (status === 'active' && result.end_date) {
    daysRemaining = Math.max(0, Math.ceil((new Date(result.end_date) - now) / 86400000))
    if (daysRemaining === 0) status = 'expired'
  }

  return {
    status,
    daysRemaining,
    userId:       result.userId,
    email:        result.email,
    renewalUrl:   status === 'expired' ? `${process.env.APP_URL}/payment` : null,
    playlist: result.playlist_type ? {
      type:        result.playlist_type,
      m3u_url:     result.m3u_url,
      xtream_host: result.xtream_host,
      xtream_user: result.xtream_user,
    } : null
  }
}

module.exports = { registerDevice, activateDevice, authenticateDevice }
