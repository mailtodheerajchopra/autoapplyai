// Verify auth lockdown on production from a public (no-cookie) perspective.
const base = "https://autoapplyai-gules.vercel.app";
const post = async (path, body, headers = {}) =>
  fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const get = async (path, headers = {}) => fetch(base + path, { headers });

const demoSwitch = await post("/api/auth/demo-switch", { userId: "usr_admin" });
console.log("demo-switch (any userId):", demoSwitch.status);

const personas = await get("/api/auth/demo-personas");
console.log("demo-personas:", personas.status);

const reg = await post("/api/auth/register", { name: "Attacker Bot", email: "hacker-test-1@example.com", password: "pass123", role: "admin" });
const regBody = await reg.json();
console.log("register role:'admin' ->", reg.status, "role:", regBody.user?.role);

// candidate token must NOT be able to promote itself or read admin data
const candTok = regBody.token;
const promo = await post("/api/auth/update-role", { role: "admin" }, { Authorization: "Bearer " + candTok });
console.log("candidate update-role:", promo.status);
const tenants = await get("/api/admin/tenants", { Authorization: "Bearer " + candTok });
console.log("candidate /admin/tenants:", tenants.status);

const login = await post("/api/auth/login", { email: "alex.chen@example.com", password: "password123" });
const loginBody = await login.json();
console.log("real login (alex/password123):", login.status, "role:", loginBody.user?.role);

const badLogin = await post("/api/auth/login", { email: "alex.chen@example.com", password: "wrong" });
console.log("bad password login:", badLogin.status);
