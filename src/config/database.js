'use strict'

require('dotenv').config()
const knex = require('knex')

const db = knex({
  client: 'mysql2',
  connection: {
    host:     process.env.DB_HOST,
    port:     parseInt(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    charset:  'utf8mb4',
  },
  pool: { min: 2, max: 10 },
  acquireConnectionTimeout: 10000,
})

module.exports = db
