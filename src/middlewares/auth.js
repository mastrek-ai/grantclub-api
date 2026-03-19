'use strict'

/**
 * Middleware de vérification JWT
 * Utilisé sur toutes les routes protégées
 */
async function verifyJWT(request, reply) {
  try {
    await request.jwtVerify()
  } catch (err) {
    return reply.status(401).send({
      error: 'UNAUTHORIZED',
      message: 'Token invalide ou expiré'
    })
  }
}

module.exports = { verifyJWT }
