// Vercel Serverless Function — Contact Form Handler
// Menerima POST dari contact form dan menyimpan ke Google Sheets
// Credentials disimpan di Vercel Environment Variables, tidak di frontend

export default async function handler(req, res) {
    // Hanya izinkan metode POST
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    // Ambil data dari request body
    const { name, email, subject, message } = req.body;

    // Validasi sederhana
    if (!name || !email || !subject || !message) {
        return res.status(400).json({ error: "Semua field wajib diisi." });
    }

    // Ambil environment variables (diset di Vercel dashboard)
    const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
    const CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
    const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (!SPREADSHEET_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
        console.error("Google Sheets env vars not set");
        return res.status(500).json({ error: "Server configuration error." });
    }

    try {
        // Buat JWT token untuk Google Sheets API
        const token = await getGoogleAccessToken(CLIENT_EMAIL, PRIVATE_KEY);

        // Timestamp
        const timestamp = new Date().toISOString();

        // Append row ke Google Sheets
        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/Sheet1!A:E:append?valueInputOption=USER_ENTERED`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    values: [[name, email, subject, message, timestamp]],
                }),
            }
        );

        if (!response.ok) {
            const errText = await response.text();
            console.error("Google Sheets API error:", errText);
            return res.status(500).json({ error: "Gagal menyimpan pesan." });
        }

        return res.status(200).json({ success: true, message: "Pesan berhasil dikirim!" });
    } catch (err) {
        console.error("Handler error:", err);
        return res.status(500).json({ error: "Terjadi kesalahan server." });
    }
}

// ── JWT Helper (tanpa library eksternal) ────────────────────────────────────
// Menggunakan Web Crypto API yang tersedia di Vercel Edge/Node runtime

async function getGoogleAccessToken(clientEmail, privateKey) {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 3600;

    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = base64url(
        JSON.stringify({
            iss: clientEmail,
            scope: "https://www.googleapis.com/auth/spreadsheets",
            aud: "https://oauth2.googleapis.com/token",
            exp,
            iat: now,
        })
    );

    const signingInput = `${header}.${payload}`;

    // Import private key
    const cryptoKey = await importRSAPrivateKey(privateKey);

    // Sign
    const encoder = new TextEncoder();
    const signature = await crypto.subtle.sign(
        { name: "RSASSA-PKCS1-v1_5" },
        cryptoKey,
        encoder.encode(signingInput)
    );

    const jwt = `${signingInput}.${base64url(signature)}`;

    // Exchange JWT untuk access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: jwt,
        }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
        throw new Error("Failed to get Google access token: " + JSON.stringify(tokenData));
    }

    return tokenData.access_token;
}

function base64url(input) {
    let str;
    if (input instanceof ArrayBuffer) {
        str = String.fromCharCode(...new Uint8Array(input));
    } else {
        str = input;
    }
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importRSAPrivateKey(pem) {
    const pemBody = pem
        .replace(/-----BEGIN PRIVATE KEY-----/, "")
        .replace(/-----END PRIVATE KEY-----/, "")
        .replace(/\s/g, "");

    const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

    return crypto.subtle.importKey(
        "pkcs8",
        binaryDer.buffer,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"]
    );
}
