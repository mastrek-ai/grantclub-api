'use strict'

const crypto = require('crypto')

const ALGORITHM = 'aes-256-gcm'
const KEY       = Buffer.from(process.env.ENCRYPTION_KEY || '', 'utf8').slice(0, 32)

/**
 * Chiffre une chaîne en AES-256-GCM
 */
function encrypt(text) {
  const iv         = crypto.randomBytes(16)
  const cipher     = crypto.createCipheriv(ALGORITHM, KEY, iv)
  const encrypted  = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const authTag    = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Déchiffre une chaîne AES-256-GCM
 */
function decrypt(payload) {
  const [ivHex, authTagHex, encryptedHex] = payload.split(':')
  const iv        = Buffer.from(ivHex, 'hex')
  const authTag   = Buffer.from(authTagHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const decipher  = crypto.createDecipheriv(ALGORITHM, KEY, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(encrypted) + decipher.final('utf8')
}

/**
 * Hash SHA-256
 */
function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex')
}

/**
 * Génère un token aléatoire sécurisé
 */
function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex')
}

module.exports = { encrypt, decrypt, sha256, generateToken }
