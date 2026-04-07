function formatTimestamp() {
  return new Date().toISOString();
}

function logAuth(status, email, role, reason) {
  console.log(
    `[AUTH] ${formatTimestamp()} | ${status} | User: ${email || "unknown"} | Role: ${role || "none"} | ${reason}`
  );
}

function logAuthz(status, sub, role, action, resource) {
  console.log(
    `[AUTHZ] ${formatTimestamp()} | ${status} | User: ${sub || "unknown"} (${role || "none"}) | ${action} ${resource} | ${status === "DENIED" ? "403 Forbidden" : "200 OK"}`
  );
}

function logRateLimit(ip, endpoint) {
  console.log(
    `[RATE_LIMIT] ${formatTimestamp()} | BLOCKED | IP: ${ip} | Endpoint: ${endpoint}`
  );
}

module.exports = { logAuth, logAuthz, logRateLimit };
