// Vercel Serverless Function — Admin Auth Handler
// POST /api/auth        → login, return JWT token
// DELETE /api/auth      → logout (client-side only, stateless)

const SECRET = process.env.JWT_SECRET || "changeme_set_in_vercel_env";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { username, password } = req.body;

    const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

    if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
        console.error("Admin credentials env vars not set");
        return res.status(500).json({ error: "Server configuration error." });
    }

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: "Username atau password salah." });
    }

    // Buat JWT sederhana (header.payload.signature) menggunakan Web Crypto
    const token = await createJWT({ username, role: "admin" }, SECRET);

    return res.status(200).json({ success: true, token });
}

// ── JWT helpers ──────────────────────────────────────────────────────────────

export async function createJWT(payload, secret) {
    const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 8; // 8 jam
    const body = base64url(JSON.stringify({ ...payload, exp, iat: Math.floor(Date.now() / 1000) }));
    const signing = `${header}.${body}`;

    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signing));
    return `${signing}.${base64url(sig)}`;
}

export async function verifyJWT(token, secret) {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [header, payload, signature] = parts;
    const signing = `${header}.${payload}`;

    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
    );

    const rawSig = Uint8Array.from(atob(signature.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", key, rawSig, new TextEncoder().encode(signing));
    if (!valid) return null;

    const data = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    if (data.exp < Math.floor(Date.now() / 1000)) return null; // expired

    return data;
}

function base64url(input) {
    let str;
    if (input instanceof ArrayBuffer) {
        str = String.fromCharCode(...new Uint8Array(input));
    } else {
        str = typeof input === "string" ? input : JSON.stringify(input);
    }
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
