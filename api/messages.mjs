// Vercel Serverless Function — Messages Reader (Admin only)
// GET /api/messages → ambil semua pesan dari Sheet1 (butuh auth token)

import { verifyJWT } from "./auth.mjs";

const SECRET = process.env.JWT_SECRET || "changeme_set_in_vercel_env";
const SHEET_NAME = "Sheet1";

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") return res.status(200).end();

    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    // Verifikasi token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized." });
    }

    const token = authHeader.split(" ")[1];
    const decoded = await verifyJWT(token, SECRET);
    if (!decoded || decoded.role !== "admin") {
        return res.status(401).json({ error: "Token tidak valid atau sudah expired." });
    }

    const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
    const CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
    const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (!SPREADSHEET_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
        return res.status(500).json({ error: "Server configuration error." });
    }

    try {
        const accessToken = await getGoogleAccessToken(CLIENT_EMAIL, PRIVATE_KEY);
        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!A:E`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!response.ok) {
            const err = await response.text();
            console.error("Sheets messages GET error:", err);
            return res.status(500).json({ error: "Gagal mengambil pesan." });
        }

        const data = await response.json();
        const rows = data.values || [];

        // Baris 1 dianggap data langsung (tidak ada header di Sheet1)
        const messages = rows.map(row => ({
            name: row[0] || "",
            email: row[1] || "",
            subject: row[2] || "",
            message: row[3] || "",
            timestamp: row[4] || "",
        }));

        return res.status(200).json({ success: true, data: messages });
    } catch (err) {
        console.error("Messages GET error:", err);
        return res.status(500).json({ error: "Terjadi kesalahan server." });
    }
}

// ── Google JWT Auth ────────────────────────────────────────────────────────
async function getGoogleAccessToken(clientEmail, privateKey) {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 3600;

    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = base64url(JSON.stringify({
        iss: clientEmail,
        scope: "https://www.googleapis.com/auth/spreadsheets",
        aud: "https://oauth2.googleapis.com/token",
        exp,
        iat: now,
    }));

    const signingInput = `${header}.${payload}`;
    const cryptoKey = await importRSAPrivateKey(privateKey);
    const signature = await crypto.subtle.sign(
        { name: "RSASSA-PKCS1-v1_5" },
        cryptoKey,
        new TextEncoder().encode(signingInput)
    );

    const jwt = `${signingInput}.${base64url(signature)}`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: jwt,
        }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error("Failed to get Google access token");
    return tokenData.access_token;
}

function base64url(input) {
    let str;
    if (input instanceof ArrayBuffer) str = String.fromCharCode(...new Uint8Array(input));
    else str = typeof input === "string" ? input : JSON.stringify(input);
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importRSAPrivateKey(pem) {
    const pemBody = pem
        .replace(/-----BEGIN PRIVATE KEY-----/, "")
        .replace(/-----END PRIVATE KEY-----/, "")
        .replace(/\s/g, "");
    const binaryDer = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
    return crypto.subtle.importKey(
        "pkcs8",
        binaryDer.buffer,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"]
    );
}
