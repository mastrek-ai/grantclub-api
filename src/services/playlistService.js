'use strict'

const https   = require('https')
const http    = require('http')
const db      = require('../config/database')
const { encrypt, decrypt } = require('../utils/crypto')

/**
 * Valide une URL M3U via requête HEAD
 */
function validateM3uUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const req = client.request(url, { method: 'HEAD', timeout: 5000 }, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        resolve(true)
      } else {
        reject(new Error(`HTTP ${res.statusCode}`))
      }
    })
    req.on('error',   reject)
    req.on('timeout', () => reject(new Error('TIMEOUT')))
    req.end()
  })
}

/**
 * Valide des credentials Xtream Codes
 */
function validateXtreamCredentials(host, username, password) {
  return new Promise((resolve, reject) => {
    const url    = `${host}/player_api.php?username=${username}&password=${password}`
    const client = url.startsWith('https') ? https : http
    const req = client.request(url, { timeout: 5000 }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.user_info) resolve(true)
          else reject(new Error('INVALID_XTREAM_CREDENTIALS'))
        } catch {
          reject(new Error('INVALID_XTREAM_CREDENTIALS'))
        }
      })
    })
    req.on('error',   reject)
    req.on('timeout', () => reject(new Error('TIMEOUT')))
    req.end()
  })
}

/**
 * Sauvegarde une playlist M3U
 */
async function saveM3uPlaylist(userId, m3uUrl) {
  await validateM3uUrl(m3uUrl)

  await db('playlists')
    .insert({ user_id: userId, type: 'm3u', m3u_url: m3uUrl })
    .onConflict('user_id')
    .merge({ type: 'm3u', m3u_url: m3uUrl, xtream_host: null,
             xtream_user: null, xtream_pass_enc: null })

  return { type: 'm3u', m3u_url: m3uUrl }
}

/**
 * Sauvegarde des credentials Xtream (mot de passe chiffré AES-256)
 */
async function saveXtreamPlaylist(userId, host, username, password) {
  await validateXtreamCredentials(host, username, password)

  const passEnc = encrypt(password)

  await db('playlists')
    .insert({
      user_id:         userId,
      type:            'xtream',
      xtream_host:     host,
      xtream_user:     username,
      xtream_pass_enc: passEnc,
    })
    .onConflict('user_id')
    .merge({
      type:            'xtream',
      m3u_url:         null,
      xtream_host:     host,
      xtream_user:     username,
      xtream_pass_enc: passEnc,
    })

  return { type: 'xtream', host, username }
}

/**
 * Récupère la playlist d'un utilisateur (déchiffre le mot de passe)
 */
async function getPlaylist(userId) {
  const playlist = await db('playlists').where({ user_id: userId }).first()
  if (!playlist) return null

  if (playlist.type === 'xtream' && playlist.xtream_pass_enc) {
    playlist.xtream_pass = decrypt(playlist.xtream_pass_enc)
    delete playlist.xtream_pass_enc
  }

  return playlist
}

module.exports = {
  saveM3uPlaylist,
  saveXtreamPlaylist,
  getPlaylist
}
