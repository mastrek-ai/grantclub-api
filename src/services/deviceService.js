'use strict'

const crypto  = require('crypto')
const db      = require('../config/database')
const redis   = require('../config/redis')
const { generateToken } = require('../utils/crypto')

const ACTIVATION_CODE_TTL     = 10 * 60 // 10 minutes
const MAX_DEVICES_PER_USER    = 5

/**
 * Normalise l'adresse MAC en uppercase avec tirets
 * A4:DB:30:AF:0E:02 → A4-DB-30-AF-0E-02
 */
function normalizeMac(deviceId) {
  if (!deviceId) return null
  return deviceId.toUpperCase().replace(/[:\-\.]/g, '-')
}

/**
 * Génère un code d'activation XXXX-XXXX
 * Sans caractères ambigus : 0, O, 1, I, L
 */
function generateActivationCode() {
  const charset = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let code      = ''
  const bytes   = crypto.randomBytes(8)
  for (let i = 0; i < 8; i++) {
    code += charset[bytes[i] % charset.length]
    if (i === 3) code += '-'
  }
  return code
}

/**
 * Génère un device_key décimal 9 chiffres (format box IPTV)
 */
function generateDeviceKey() {
  const min = 100000000
  const max = 999999999
  return String(Math.floor(Math.random() * (max - min + 1)) + min)
}

/**
 * Enregistre un device et retourne le code d'activation XXXX-XXXX
 * deviceId = adresse MAC ou identifiant unique
 */
async function registerDevice(deviceId, fingerprint, platform, appVersion) {
  const normalizedId = normalizeMac(deviceId) || deviceId

  // Vérifier si device déjà enregistré et activé
  const existing = await db('devices')
    .where({ device_id: normalizedId })
    .whereNotNull('user_id')
    .first()

  const code = generateActivationCode()

  if (existing) {
    // Device connu — nouveau code pour re-lier
    await redis.setex(`activation:${code}`, ACTIVATION_CODE_TTL, JSON.stringify({
      deviceId:         normalizedId,
      existingDeviceId: existing.id,
      platform:         existing.platform,
      isNew:            false
    }))
  } else {
    // Nouveau device
    await redis.setex(`activation:${code}`, ACTIVATION_CODE_TTL, JSON.stringify({
      deviceId:    normalizedId,
      fingerprint,
      platform:    platform || 'android_tv',
      appVersion,
      isNew:       true
    }))
  }

  return { code, deviceId: normalizedId }
}

/**
 * Active un device depuis le portail web (JWT requis)
 */
async function activateDevice(userId, code) {
  const raw = await redis.get(`activation:${code}`)
  if (!raw) {
    const err = new Error('INVALID_CODE')
    err.statusCode = 400
    throw err
  }

  const data      = JSON.parse(raw)
  const deviceKey = generateDeviceKey()

  if (data.isNew) {
    // Vérifier limite devices par user
    const count = await db('devices').where({ user_id: userId }).count('id as cnt').first()
    if (parseInt(count.cnt) >= MAX_DEVICES_PER_USER) {
      const err = new Error('DEVICE_LIMIT')
      err.statusCode = 403
      throw err
    }

    await db('devices').insert({
      user_id:         userId,
      device_id:       data.deviceId,
      device_key:      deviceKey,
      fingerprint:     data.fingerprint || null,
      platform:        data.platform || 'android_tv',
      app_version:     data.appVersion || null,
      activation_code: code,
      activated_at:    new Date(),
    })
  } else {
    await db('devices')
      .where({ id: data.existingDeviceId })
      .update({
        user_id:      userId,
        device_key:   deviceKey,
        activated_at: new Date(),
      })
  }

  await redis.del(`activation:${code}`)
  return { deviceKey }
}

/**
 * Vérifie si un code a été activé — polling app Android
 */
async function checkActivation(code) {
  const raw = await redis.get(`activation:${code}`)
  if (raw !== null) return { activated: false }

  const device = await db('devices')
    .where({ activation_code: code })
    .whereNotNull('device_key')
    .first()

  if (!device) return { activated: false }

  return {
    activated: true,
    deviceKey: device.device_key,
    deviceId:  device.device_id,
  }
}

/**
 * Authentifie un device par deviceId + deviceKey
 * Retourne statut abonnement + URL playlist
 */
async function authenticateDevice(deviceId, deviceKey) {
  const normalizedId = normalizeMac(deviceId) || deviceId

  const result = await db('devices as d')
    .join('users as u',         'u.id', 'd.user_id')
    .join('subscriptions as s', 's.user_id', 'u.id')
    .leftJoin('playlists as p', 'p.user_id', 'u.id')
    .where('d.device_id',  normalizedId)
    .where('d.device_key', deviceKey)
    .select(
      'd.id as deviceDbId',
      'd.platform',
      'u.id as userId',
      'u.email',
      's.status',
      's.trial_end',
      's.end_date',
      'p.type as playlist_type',
      'p.m3u_url',
      'p.xtream_host',
      'p.xtream_user'
    )
    .first()

  if (!result) {
    const err = new Error('DEVICE_NOT_FOUND')
    err.statusCode = 404
    throw err
  }

  const now = new Date()
  let daysRemaining = 0
  let status        = result.status

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
    userId:     result.userId,
    email:      result.email,
    platform:   result.platform,
    renewalUrl: status === 'expired' ? `${process.env.APP_URL}/payment` : null,
    playlist:   result.playlist_type ? {
      type:        result.playlist_type,
      m3u_url:     result.m3u_url,
      xtream_host: result.xtream_host,
      xtream_user: result.xtream_user,
    } : null
  }
}

module.exports = { registerDevice, activateDevice, authenticateDevice, checkActivation }
