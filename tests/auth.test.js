const jwt = require("jsonwebtoken");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const JWT_SECRET = process.env.JWT_SECRET || "thermosense-secret-key-change-in-production";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "thermosense-api";

const results = [];

async function request(method, path, { headers = {}, body } = {}) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json", ...headers },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const data = await res.json().catch(() => null);
  return { status: res.status, body: data };
}

function report(name, expected, actual, analysis) {
  const pass = actual === expected;
  results.push({ name, pass });
  console.log(`\n${"=".repeat(60)}`);
  console.log(`## ${name}`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Resultat attendu : ${expected}`);
  console.log(`Resultat obtenu  : ${actual}`);
  console.log(`Status           : ${pass ? "PASS" : "FAIL"}`);
  console.log(`\n### Analyse`);
  console.log(analysis);
}

async function run() {
  console.log("Demarrage des tests d'authentification JWT...\n");

  // --- Login pour obtenir un token valide ---
  const loginRes = await request("POST", "/auth/login", {
    body: { email: "root", password: "root" },
  });

  if (loginRes.status !== 200 || !loginRes.body?.token) {
    console.error("Impossible de se connecter. L'API tourne-t-elle sur", BASE_URL, "?");
    console.error("Reponse:", loginRes.status, loginRes.body);
    process.exit(1);
  }

  const validToken = loginRes.body.token;
  console.log("Login OK — token obtenu");

  // Decoder le token pour afficher les claims
  const decoded = jwt.decode(validToken);
  console.log("\nClaims du token :");
  console.log(JSON.stringify(decoded, null, 2));

  // Recuperer un areaId existant pour les tests POST
  const areasRes = await request("GET", "/areas");
  const areaId = areasRes.body?.data?.[0]?.id;

  if (!areaId) {
    console.error("Aucune zone trouvee pour les tests");
    process.exit(1);
  }

  // ============================================================
  // TEST NOMINAL — Requete avec token valide
  // ============================================================
  {
    const res = await request("POST", "/areas", {
      headers: { Authorization: `Bearer ${validToken}` },
      body: { buildingId: "building-1", name: "Zone Test AuthN" },
    });

    report(
      "Test nominal — Requete avec token valide sur POST /areas",
      201,
      res.status,
      [
        "Le middleware a accepte le token valide et laisse passer la requete.",
        "L'endpoint a cree la ressource et retourne 201 Created.",
        `Reponse : ${JSON.stringify(res.body)}`,
      ].join("\n")
    );
  }

  // ============================================================
  // TEST ADVERSE 1 — Requete sans header Authorization
  // ============================================================
  {
    const res = await request("POST", "/areas", {
      body: { buildingId: "building-1", name: "Zone Sans Token" },
    });

    report(
      "Test adverse 1 — Requete sans header Authorization",
      401,
      res.status,
      [
        "Le middleware a correctement rejete la requete avant qu'elle n'atteigne le controleur.",
        "Le code de retour est bien 401 (identite non prouvee), pas 403 (droits insuffisants).",
        `Reponse : ${JSON.stringify(res.body)}`,
      ].join("\n")
    );
  }

  // ============================================================
  // TEST ADVERSE 2 — Requete avec token expire
  // ============================================================
  {
    // Generer un token qui a expire il y a 1 heure
    const expiredToken = jwt.sign(
      { sub: "user-1", email: "root", role: "admin", scope: "read write admin" },
      JWT_SECRET,
      { expiresIn: "-1h", audience: JWT_AUDIENCE }
    );

    const res = await request("POST", "/areas", {
      headers: { Authorization: `Bearer ${expiredToken}` },
      body: { buildingId: "building-1", name: "Zone Token Expire" },
    });

    report(
      "Test adverse 2 — Requete avec token expire",
      401,
      res.status,
      [
        "Le middleware a detecte que le claim exp est depasse et a rejete le token.",
        "Un token avec une signature valide mais expire ne doit jamais etre accepte.",
        `Reponse : ${JSON.stringify(res.body)}`,
      ].join("\n")
    );
  }

  // ============================================================
  // TEST ADVERSE 3 — Requete avec signature invalide
  // ============================================================
  {
    // Signer avec une mauvaise cle secrete
    const badToken = jwt.sign(
      { sub: "user-1", email: "root", role: "admin", scope: "read write admin" },
      "wrong-secret-key",
      { expiresIn: "30m", audience: JWT_AUDIENCE }
    );

    const res = await request("POST", "/areas", {
      headers: { Authorization: `Bearer ${badToken}` },
      body: { buildingId: "building-1", name: "Zone Mauvaise Signature" },
    });

    report(
      "Test adverse 3 — Requete avec token a signature invalide",
      401,
      res.status,
      [
        "Le middleware a detecte que la signature ne correspond pas a la cle secrete du serveur.",
        "Un attaquant ne peut pas forger un token valide sans connaitre le secret.",
        `Reponse : ${JSON.stringify(res.body)}`,
      ].join("\n")
    );
  }

  // ============================================================
  // TEST BONUS — Requete avec token dont aud ne correspond pas
  // ============================================================
  {
    const wrongAudToken = jwt.sign(
      { sub: "user-1", email: "root", role: "admin", scope: "read write admin" },
      JWT_SECRET,
      { expiresIn: "30m", audience: "other-api" }
    );

    const res = await request("POST", "/areas", {
      headers: { Authorization: `Bearer ${wrongAudToken}` },
      body: { buildingId: "building-1", name: "Zone Mauvais Audience" },
    });

    report(
      "Test bonus — Requete avec token dont aud ne correspond pas a l'API",
      401,
      res.status,
      [
        "Le middleware a detecte que le claim aud ('other-api') ne correspond pas a 'thermosense-api'.",
        "Un token valide destine a une autre API est correctement rejete.",
        `Reponse : ${JSON.stringify(res.body)}`,
      ].join("\n")
    );
  }

  // ============================================================
  // RESUME
  // ============================================================
  console.log(`\n${"=".repeat(60)}`);
  console.log("RESUME");
  console.log("=".repeat(60));
  const passed = results.filter((r) => r.pass).length;
  for (const r of results) {
    console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${r.name}`);
  }
  console.log(`\n${passed}/${results.length} tests reussis`);
  process.exit(passed === results.length ? 0 : 1);
}

run().catch((err) => {
  console.error("Erreur fatale :", err.message);
  process.exit(1);
});
