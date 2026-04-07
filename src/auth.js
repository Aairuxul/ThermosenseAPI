const jwt = require('jsonwebtoken');
const { logAuth } = require('./security-logger');

// Clé secrète JWT (dans un vrai projet, utilisez une variable d'environnement)
const JWT_SECRET = process.env.JWT_SECRET || 'thermosense-secret-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || `${JWT_SECRET}-refresh`;
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'thermosense-api';
const JWT_ISSUER = process.env.JWT_ISSUER || 'thermosense-auth';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

function roleToScope(role) {
    switch (role) {
        case 'admin':
            return 'areas:read areas:write sensors:read sensors:write measures:read measures:write actuators:read actuators:write alert-thresholds:read alert-thresholds:write users:read users:write';
        case 'operator':
            return 'areas:read sensors:read measures:read actuators:read alert-thresholds:read users:read';
        case 'device':
            return 'sensors:read measures:write';
        default:
            return 'areas:read sensors:read measures:read';
    }
}

/**
 * Middleware d'authentification JWT
 * Vérifie le token Bearer et ajoute req.user
 */
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logAuth('FAILURE', null, null, 'Missing or malformed Authorization header');
        return res.status(401).json({
            code: 'unauthorized',
            message: "Token d'authentification manquant ou invalide",
        });
    }

    const token = authHeader.substring(7); // Enlever "Bearer "

    try {
        const decoded = jwt.verify(token, JWT_SECRET, {
            audience: JWT_AUDIENCE,
            issuer: JWT_ISSUER,
        });

        if (decoded.tokenType !== 'access') {
            return res.status(401).json({
                code: 'unauthorized',
                message: 'Type de token invalide',
            });
        }

        req.user = decoded; // { sub, userId, email, role, scope, aud, exp, ... }
        next();
    } catch (err) {
        logAuth('FAILURE', null, null, `Token rejected: ${err.message}`);
        return res.status(401).json({
            code: 'unauthorized',
            message: 'Token invalide ou expiré',
        });
    }
}

/**
 * Génère un access token JWT pour un utilisateur
 */
function generateAccessToken(user) {
    const scope = roleToScope(user.role);

    const payload = {
        sub: String(user.id),
        userId: user.id,
        email: user.email,
        role: user.role,
        scope,
        tokenType: 'access',
    };

    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
        audience: JWT_AUDIENCE,
        issuer: JWT_ISSUER,
    });
}

/**
 * Génère un refresh token JWT pour un utilisateur
 */
function generateRefreshToken(user) {
    const payload = {
        sub: String(user.id),
        userId: user.id,
        tokenType: 'refresh',
    };

    return jwt.sign(payload, JWT_REFRESH_SECRET, {
        expiresIn: JWT_REFRESH_EXPIRES_IN,
        audience: JWT_AUDIENCE,
        issuer: JWT_ISSUER,
    });
}

function verifyRefreshToken(token) {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
        audience: JWT_AUDIENCE,
        issuer: JWT_ISSUER,
    });

    if (decoded.tokenType !== 'refresh') {
        throw new jwt.JsonWebTokenError('Invalid token type');
    }

    return decoded;
}

// Compatibilité ascendante
const generateToken = generateAccessToken;

module.exports = {
    authenticate,
    generateToken,
    generateAccessToken,
    generateRefreshToken,
    verifyRefreshToken,
    JWT_SECRET,
    JWT_REFRESH_SECRET,
    JWT_AUDIENCE,
    JWT_ISSUER,
    JWT_EXPIRES_IN,
    JWT_REFRESH_EXPIRES_IN,
};
