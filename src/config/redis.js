'use strict'

require('dotenv').config()
const Redis = require('ioredis')

const redis = new Redis({
  host:     process.env.REDIS_HOST,
  port:     parseInt(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => Math.min(times * 50, 2000),
})

redis.on('connect',  () => console.log('Redis connecté'))
redis.on('error',    (err) => console.error('Redis erreur:', err.message))

module.exports = redis
