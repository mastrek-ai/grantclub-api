'use strict'

const bcrypt          = require('bcrypt')
const db              = require('../config/database')
const redis           = require('../config/redis')
const { generateToken } = require('../utils/crypto')

const SALT_ROUNDS     = 12
const TRIAL_DAYS      = parseInt(process.env.TRIAL_DAYS) || 9

/**
 * Inscription d'un nouvel utilisateur
 */
async function register(email, password) {
  // Vérifier si email existe déjà
  const existing = await db('users').where({ email }).first()
  if (existing) {
    const err = new Error('EMAIL_EXISTS')
    err.statusCode = 409
    throw err
  }

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS)
  const verify_token  = generateToken(32)

  // Créer l'utilisateur
  const [userId] = await db('users').insert({
    email,
    password_hash,
    verify_token,
    email_verified: 0,
  })

  // Créer l'abonnement trial
  const trialEnd = new Date()
  trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS)

  await db('subscriptions').insert({
    user_id:   userId,
    status:    'trial',
    trial_end: trialEnd,
  })

  return { userId, verify_token, email }
}

/**
 * Vérification email
 */
async function verifyEmail(token) {
  const user = await db('users').where({ verify_token: token }).first()
  if (!user) {
    const err = new Error('INVALID_TOKEN')
    err.statusCode = 400
    throw err
  }
  if (user.email_verified) {
    const err = new Error('ALREADY_VERIFIED')
    err.statusCode = 409
    throw err
  }

  await db('users').where({ id: user.id }).update({
    email_verified: 1,
    verify_token:   null,
  })

  return { userId: user.id, email: user.email }
}

/**
 * Connexion
 */
async function login(email, password) {
  const user = await db('users').where({ email }).first()
  if (!user) {
    const err = new Error('INVALID_CREDENTIALS')
    err.statusCode = 401
    throw err
  }

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) {
    const err = new Error('INVALID_CREDENTIALS')
    err.statusCode = 401
    throw err
  }

  if (!user.email_verified) {
    const err = new Error('EMAIL_NOT_VERIFIED')
    err.statusCode = 403
    throw err
  }

  return { userId: user.id, email: user.email }
}

/**
 * Génère les tokens JWT
 */
async function generateTokens(fastify, userId, email) {
  const accessToken = fastify.jwt.sign(
    { sub: userId, email },
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  )

  const refreshToken = generateToken(64)
  const refreshKey   = `refresh:${userId}:${refreshToken}`

  // Stocker le refresh token dans Redis (30 jours)
  await redis.setex(refreshKey, 30 * 24 * 3600, '1')

  return { accessToken, refreshToken }
}

/**
 * Rafraîchir l'access token
 */
async function refreshAccessToken(fastify, userId, refreshToken) {
  const refreshKey = `refresh:${userId}:${refreshToken}`
  const exists     = await redis.exists(refreshKey)

  if (!exists) {
    const err = new Error('INVALID_REFRESH_TOKEN')
    err.statusCode = 401
    throw err
  }

  const user = await db('users').where({ id: userId }).first()
  if (!user) {
    const err = new Error('USER_NOT_FOUND')
    err.statusCode = 404
    throw err
  }

  // Rotation du refresh token
  await redis.del(refreshKey)
  return generateTokens(fastify, userId, user.email)
}

module.exports = { register, verifyEmail, login, generateTokens, refreshAccessToken }
