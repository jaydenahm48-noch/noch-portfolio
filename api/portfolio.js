// Vercel Serverless Function — Portfolio CRUD Handler
// GET    /api/portfolio  → ambil semua portfolio dari Google Sheets (public)
// POST   /api/portfolio  → tambah portfolio (butuh auth token)
// DELETE /api/portfolio  → hapus portfolio by row index (butuh auth token)

import { verifyJWT } from "./auth.js";

const SECRET = process.env.JWT_SECRET || "changeme_set_in_vercel_env";
const SHEET_NAME = "Portfolio";

export default async function handler(req, res) {
    // CORS header agar bisa diakses dari frontend
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") return res.status(200).end();

    const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
    const CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
    const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (!SPREADSHEET_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
        return res.status(500).json({ error: "Server configuration error." });
    }

    // ── GET: publik, tidak butuh auth ─────────────────────────────────────────
    if (req.method === "GET") {
        try {
            const token = await getGoogleAccessToken(CLIENT_EMAIL, PRIVATE_KEY);
            const response = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!A:G`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (!response.ok) {
                const err = await response.text();
                console.error("Sheets GET error:", err);
                return res.status(500).json({ error: "Gagal mengambil data portfolio." });
            }

            const data = await response.json();
            const rows = data.values || [];

            // Baris pertama = header, lewati
            const portfolios = rows.slice(1).map((row, index) => ({
                rowIndex: index + 2, // 1-based, +1 karena header, +1 karena slice
                judul: row[0] || "",
                deskripsi: row[1] || "",
                gambar: row[2] || "",
                link: row[3] || "",
                teknologi: row[4] || "",
                kategori: row[5] || "",
                tanggal: row[6] || "",
            }));

            return res.status(200).json({ success: true, data: portfolios });
        } catch (err) {
            console.error("GET error:", err);
            return res.status(500).json({ error: "Terjadi kesalahan server." });
        }
    }

    // ── POST & DELETE: butuh auth ─────────────────────────────────────────────
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized." });
    }

    const jwtToken = authHeader.split(" ")[1];
    const decoded = await verifyJWT(jwtToken, SECRET);
    if (!decoded || decoded.role !== "admin") {
        return res.status(401).json({ error: "Token tidak valid atau sudah expired." });
    }

    // ── POST: tambah portfolio ────────────────────────────────────────────────
    if (req.method === "POST") {
        const { judul, deskripsi, gambar, link, teknologi, kategori } = req.body;

        if (!judul || !deskripsi || !gambar) {
            return res.status(400).json({ error: "Judul, deskripsi, dan gambar wajib diisi." });
        }

        const tanggal = new Date().toLocaleDateString("id-ID", {
            day: "2-digit", month: "long", year: "numeric"
        });

        try {
            const token = await getGoogleAccessToken(CLIENT_EMAIL, PRIVATE_KEY);

            // Cek apakah sheet Portfolio dan header sudah ada
            await ensurePortfolioHeader(token, SPREADSHEET_ID, SHEET_NAME);

            const response = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!A:G:append?valueInputOption=USER_ENTERED`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        values: [[judul, deskripsi, gambar, link || "", teknologi || "", kategori || "", tanggal]],
                    }),
                }
            );

            if (!response.ok) {
                const err = await response.text();
                console.error("Sheets POST error:", err);
                return res.status(500).json({ error: "Gagal menyimpan portfolio." });
            }

            return res.status(200).json({ success: true, message: "Portfolio berhasil ditambahkan!" });
        } catch (err) {
            console.error("POST error:", err);
            return res.status(500).json({ error: "Terjadi kesalahan server." });
        }
    }

    // ── DELETE: hapus portfolio by rowIndex ───────────────────────────────────
    if (req.method === "DELETE") {
        const { rowIndex } = req.body;

        if (!rowIndex || typeof rowIndex !== "number") {
            return res.status(400).json({ error: "rowIndex tidak valid." });
        }

        try {
            const token = await getGoogleAccessToken(CLIENT_EMAIL, PRIVATE_KEY);

            // Dapatkan sheet ID dari spreadsheet metadata
            const metaRes = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const meta = await metaRes.json();
            const sheet = meta.sheets?.find(s => s.properties.title === SHEET_NAME);
            const sheetId = sheet?.properties?.sheetId;

            if (sheetId === undefined) {
                return res.status(404).json({ error: "Sheet Portfolio tidak ditemukan." });
            }

            // Hapus baris menggunakan batchUpdate
            const deleteRes = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        requests: [{
                            deleteDimension: {
                                range: {
                                    sheetId: sheetId,
                                    dimension: "ROWS",
                                    startIndex: rowIndex - 1, // 0-based
                                    endIndex: rowIndex,
                                },
                            },
                        }],
                    }),
                }
            );

            if (!deleteRes.ok) {
                const err = await deleteRes.text();
                console.error("Sheets DELETE error:", err);
                return res.status(500).json({ error: "Gagal menghapus portfolio." });
            }

            return res.status(200).json({ success: true, message: "Portfolio berhasil dihapus." });
        } catch (err) {
            console.error("DELETE error:", err);
            return res.status(500).json({ error: "Terjadi kesalahan server." });
        }
    }

    return res.status(405).json({ error: "Method not allowed" });
}

// ── Helper: pastikan header row ada di sheet Portfolio ────────────────────────
async function ensurePortfolioHeader(token, spreadsheetId, sheetName) {
    const checkRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A1:G1`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    const checkData = await checkRes.json();
    const firstRow = checkData.values?.[0];

    if (!firstRow || firstRow[0] !== "Judul") {
        await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A1:G1?valueInputOption=USER_ENTERED`,
            {
                method: "PUT",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    values: [["Judul", "Deskripsi", "Gambar URL", "Link Project", "Teknologi", "Kategori", "Tanggal"]],
                }),
            }
        );
    }
}

// ── Google JWT Auth (sama seperti contact.js) ─────────────────────────────────
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
