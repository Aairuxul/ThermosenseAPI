const db = require('./store');
const { logAuthz } = require('./security-logger');

function getCurrentUser(req) {
    const userId = req.user && (req.user.userId || req.user.sub);
    if (!userId) {
        return null;
    }

    return db.users.find((user) => user.id === userId) || null;
}

function isAdmin(user) {
    return user && user.role === 'admin';
}

function hasScope(reqUser, requiredScope) {
    if (!reqUser || !reqUser.scope) {
        return false;
    }

    return reqUser.scope.split(/\s+/).includes(requiredScope);
}

function denyUnauthorized(res) {
    return res.status(401).json({
        code: 'unauthorized',
        message: 'Utilisateur non authentifié',
    });
}

function denyForbidden(res) {
    return res.status(403).json({
        code: 'forbidden',
        message: 'Action interdite',
    });
}

function denyNotFound(res, entityName, entityId) {
    return res.status(404).json({
        code: 'notFound',
        message: `${entityName} '${entityId}' introuvable`,
    });
}

function requireScope(requiredScope) {
    return (req, res, next) => {
        if (!req.user) {
            return denyUnauthorized(res);
        }

        if (!hasScope(req.user, requiredScope)) {
            logAuthz('DENIED', req.user.sub, req.user.role, req.method, `${req.baseUrl}${req.path} (requires ${requiredScope})`);
            return denyForbidden(res);
        }

        return next();
    };
}

function filterAreasForUser(user) {
    if (isAdmin(user)) {
        return db.areas;
    }

    if (!user || !user.zone) {
        return [];
    }

    return db.areas.filter((area) => area.id === user.zone);
}

function requireAreaAccess(req, res, next) {
    const user = getCurrentUser(req);
    if (!user) {
        return denyUnauthorized(res);
    }

    const area = db.areas.find((item) => item.id === req.params.areaId);
    if (!area) {
        return denyNotFound(res, 'Zone', req.params.areaId);
    }

    if (!isAdmin(user) && user.zone !== area.id) {
        logAuthz('DENIED', user.id, user.role, 'ACCESS', `Zone ${req.params.areaId} (BOLA)`);
        return denyNotFound(res, 'Zone', req.params.areaId);
    }

    req.area = area;
    return next();
}

function requireSensorAccess(req, res, next) {
    const user = getCurrentUser(req);
    if (!user) {
        return denyUnauthorized(res);
    }

    const sensor = db.sensors.find((item) => item.id === req.params.sensorId);
    if (!sensor) {
        return denyNotFound(res, 'Capteur', req.params.sensorId);
    }

    if (!isAdmin(user) && user.zone !== sensor.areaId) {
        logAuthz('DENIED', user.id, user.role, 'ACCESS', `Capteur ${req.params.sensorId} (BOLA)`);
        return denyNotFound(res, 'Capteur', req.params.sensorId);
    }

    req.sensor = sensor;
    return next();
}

function requireActuatorAccess(req, res, next) {
    const user = getCurrentUser(req);
    if (!user) {
        return denyUnauthorized(res);
    }

    const actuator = db.actuators.find((item) => item.id === req.params.actuatorId);
    if (!actuator) {
        return denyNotFound(res, 'Actionneur', req.params.actuatorId);
    }

    if (!isAdmin(user) && user.zone !== actuator.areaId) {
        logAuthz('DENIED', user.id, user.role, 'ACCESS', `Actionneur ${req.params.actuatorId} (BOLA)`);
        return denyNotFound(res, 'Actionneur', req.params.actuatorId);
    }

    req.actuator = actuator;
    return next();
}

function requireUserAccess(req, res, next) {
    const user = getCurrentUser(req);
    if (!user) {
        return denyUnauthorized(res);
    }

    const targetUser = db.users.find((item) => item.id === req.params.userId);
    if (!targetUser) {
        return denyNotFound(res, 'Utilisateur', req.params.userId);
    }

    if (!isAdmin(user) && targetUser.id !== user.id) {
        logAuthz('DENIED', user.id, user.role, 'ACCESS', `Utilisateur ${req.params.userId} (BOLA)`);
        return denyNotFound(res, 'Utilisateur', req.params.userId);
    }

    req.targetUser = targetUser;
    return next();
}

module.exports = {
    getCurrentUser,
    isAdmin,
    hasScope,
    filterAreasForUser,
    requireScope,
    requireAreaAccess,
    requireSensorAccess,
    requireActuatorAccess,
    requireUserAccess,
};
