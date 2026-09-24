// ── Admin Panel JavaScript ────────────────────────────────────────────────
const API_BASE = "/api";
const TOKEN_KEY = "admin_token";

// ── State ──────────────────────────────────────────────────────────────────
let currentSection = "portfolio";
let portfolioData = [];
let deleteTarget = null; // { rowIndex, judul }

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    const token = getToken();
    if (token) {
        showDashboard();
        loadSection("portfolio");
    } else {
        showLogin();
    }

    bindEvents();
});

// ── Auth ───────────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

function showLogin() { document.getElementById("loginScreen").style.display = "flex"; document.getElementById("dashboard").style.display = "none"; }
function showDashboard() { document.getElementById("loginScreen").style.display = "none"; document.getElementById("dashboard").style.display = "flex"; }

// ── Event bindings ─────────────────────────────────────────────────────────
function bindEvents() {
    document.getElementById("loginForm").addEventListener("submit", handleLogin);

    document.getElementById("logoutBtn").addEventListener("click", () => {
        clearToken();
        showLogin();
    });

    document.querySelectorAll(".nav-item").forEach(item => {
        item.addEventListener("click", e => {
            e.preventDefault();
            const section = item.dataset.section;
            setActiveNav(section);
            loadSection(section);
        });
    });

    document.getElementById("btnOpenModal").addEventListener("click", openModal);
    document.getElementById("btnCloseModal").addEventListener("click", closeModal);
    document.getElementById("btnCancelModal").addEventListener("click", closeModal);
    document.getElementById("modalOverlay").addEventListener("click", e => { if (e.target === document.getElementById("modalOverlay")) closeModal(); });

    document.getElementById("btnAddDetailImg").addEventListener("click", addDetailImgRow);
    document.getElementById("detailImagesContainer").addEventListener("click", e => {
        if (e.target.closest(".btn-remove-img")) {
            const row = e.target.closest(".detail-img-row");
            const container = document.getElementById("detailImagesContainer");
            if (container.querySelectorAll(".detail-img-row").length > 1) {
                row.remove();
            } else {
                row.querySelector(".detail-img-input").value = "";
            }
        }
    });

    document.getElementById("portfolioForm").addEventListener("submit", handleAddPortfolio);

    document.getElementById("btnCloseDelete").addEventListener("click", closeDeleteModal);
    document.getElementById("btnCancelDelete").addEventListener("click", closeDeleteModal);
    document.getElementById("deleteOverlay").addEventListener("click", e => { if (e.target === document.getElementById("deleteOverlay")) closeDeleteModal(); });
    document.getElementById("btnConfirmDelete").addEventListener("click", handleDeletePortfolio);
}

// ── Login handler ──────────────────────────────────────────────────────────
async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById("loginUsername").value.trim();
    const password = document.getElementById("loginPassword").value;
    const errorEl = document.getElementById("loginError");
    const btn = document.getElementById("loginBtn");
    const spinner = document.getElementById("loginSpinner");
    const btnText = document.getElementById("loginBtnText");

    errorEl.textContent = "";
    btn.disabled = true;
    spinner.style.display = "inline-block";
    btnText.textContent = "Masuk...";

    try {
        const res = await fetch(`${API_BASE}/auth`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        });
        const data = await res.json();

        if (res.ok && data.token) {
            setToken(data.token);
            showDashboard();
            loadSection("portfolio");
        } else {
            errorEl.textContent = data.error || "Login gagal.";
        }
    } catch (err) {
        errorEl.textContent = "Tidak dapat terhubung ke server.";
    } finally {
        btn.disabled = false;
        spinner.style.display = "none";
        btnText.textContent = "Login";
    }
}

// ── Section loader ─────────────────────────────────────────────────────────
function setActiveNav(section) {
    currentSection = section;
    document.querySelectorAll(".nav-item").forEach(i => {
        i.classList.toggle("active", i.dataset.section === section);
    });
    document.querySelectorAll(".section-content").forEach(s => s.classList.remove("active"));
    document.getElementById(`section${capitalize(section)}`).classList.add("active");
    document.getElementById("pageTitle").textContent = capitalize(section === "messages" ? "Pesan Masuk" : "Portfolio");
    document.getElementById("btnOpenModal").style.display = section === "portfolio" ? "inline-flex" : "none";
}

function loadSection(section) {
    setActiveNav(section);
    if (section === "portfolio") loadPortfolio();
    if (section === "messages") loadMessages();
}

// ── Portfolio: load ────────────────────────────────────────────────────────
async function loadPortfolio() {
    const grid = document.getElementById("portfolioGrid");
    grid.innerHTML = `<div class="loading-state"><i class="fa fa-spinner fa-spin"></i><br>Memuat data...</div>`;

    try {
        const res = await fetch(`${API_BASE}/portfolio.mjs`);
        const data = await res.json();

        if (!res.ok) throw new Error(data.error);

        portfolioData = data.data || [];
        renderPortfolioGrid(portfolioData);
    } catch (err) {
        grid.innerHTML = `<div class="empty-state"><i class="fa fa-exclamation-circle"></i><p>Gagal memuat portfolio: ${err.message}</p></div>`;
    }
}

function renderPortfolioGrid(items) {
    const grid = document.getElementById("portfolioGrid");

    if (items.length === 0) {
        grid.innerHTML = `<div class="empty-state"><i class="fa fa-briefcase"></i><p>Belum ada portfolio. Klik <strong>Tambah Portfolio</strong> untuk mulai.</p></div>`;
        return;
    }

    grid.innerHTML = items.map(item => {
        const techs = item.teknologi ? item.teknologi.split(",").map(t => `<span class="card-tech-tag">${t.trim()}</span>`).join("") : "";
        const kategoriTag = item.kategori ? `<span class="card-tag">${item.kategori}</span>` : "";
        const imgEl = item.gambar
            ? `<img class="card-img" src="${escapeHtml(item.gambar)}" alt="${escapeHtml(item.judul)}" onerror="this.parentElement.innerHTML='<div class=\\'card-img-placeholder\\'><i class=\\'fa fa-image\\'></i></div>'">`
            : `<div class="card-img-placeholder"><i class="fa fa-image"></i></div>`;
        const linkEl = item.link
            ? `<a href="${escapeHtml(item.link)}" target="_blank" rel="noopener"><i class="fa fa-external-link-alt"></i> Lihat</a>`
            : `<span style="flex:1;opacity:0.3;text-align:center;font-size:13px;">Tidak ada link</span>`;

        return `
      <div class="portfolio-card" data-row="${item.rowIndex}">
        ${imgEl}
        <div class="card-body">
          <div class="card-title">${escapeHtml(item.judul)}</div>
          <div class="card-desc">${escapeHtml(item.deskripsi)}</div>
          <div class="card-meta">
            ${kategoriTag}
            ${techs}
          </div>
          <div class="card-actions">
            ${linkEl}
            <button class="btn-delete" onclick="openDeleteModal(${item.rowIndex}, '${escapeHtml(item.judul).replace(/'/g, "\\'")}')">
              <i class="fa fa-trash"></i> Hapus
            </button>
          </div>
        </div>
      </div>
    `;
    }).join("");
}

// ── Portfolio: tambah ──────────────────────────────────────────────────────
async function handleAddPortfolio(e) {
    e.preventDefault();

    const judul = document.getElementById("pf-judul").value.trim();
    const deskripsi = document.getElementById("pf-deskripsi").value.trim();
    const gambar = document.getElementById("pf-gambar").value.trim();
    const link = document.getElementById("pf-link").value.trim();
    const teknologi = document.getElementById("pf-teknologi").value.trim();
    const kategori = document.getElementById("pf-kategori").value.trim();
    const errorEl = document.getElementById("formError");
    const submitBtn = document.getElementById("btnSubmitPortfolio");
    const submitTxt = document.getElementById("submitText");
    const submitSpin = document.getElementById("submitSpinner");

    const gambar_detail = Array.from(
        document.querySelectorAll(".detail-img-input")
    ).map(i => i.value.trim()).filter(Boolean).slice(0, 10);

    errorEl.textContent = "";
    submitBtn.disabled = true;
    submitTxt.textContent = "Menyimpan...";
    submitSpin.style.display = "inline-block";

    try {
        const res = await fetch(`${API_BASE}/portfolio.mjs`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${getToken()}`,
            },
            body: JSON.stringify({ judul, deskripsi, gambar, link, teknologi, kategori, gambar_detail }),
        });
        const data = await res.json();

        if (res.ok && data.success) {
            closeModal();
            showAlert("Portfolio berhasil ditambahkan!", "success");
            loadPortfolio();
        } else {
            if (res.status === 401) { clearToken(); showLogin(); return; }
            errorEl.textContent = data.error || "Gagal menyimpan portfolio.";
        }
    } catch (err) {
        errorEl.textContent = "Tidak dapat terhubung ke server.";
    } finally {
        submitBtn.disabled = false;
        submitTxt.textContent = "Simpan";
        submitSpin.style.display = "none";
    }
}

// ── Portfolio: hapus ───────────────────────────────────────────────────────
function openDeleteModal(rowIndex, judul) {
    deleteTarget = { rowIndex, judul };
    document.getElementById("deleteTargetName").textContent = judul;
    document.getElementById("deleteOverlay").style.display = "flex";
}

function closeDeleteModal() {
    deleteTarget = null;
    document.getElementById("deleteOverlay").style.display = "none";
}

async function handleDeletePortfolio() {
    if (!deleteTarget) return;

    const btn = document.getElementById("btnConfirmDelete");
    const txt = document.getElementById("deleteText");
    const spinner = document.getElementById("deleteSpinner");

    btn.disabled = true;
    txt.textContent = "Menghapus...";
    spinner.style.display = "inline-block";

    try {
        const res = await fetch(`${API_BASE}/portfolio.mjs`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${getToken()}`,
            },
            body: JSON.stringify({ rowIndex: deleteTarget.rowIndex }),
        });
        const data = await res.json();

        if (res.ok && data.success) {
            closeDeleteModal();
            showAlert("Portfolio berhasil dihapus.", "success");
            loadPortfolio();
        } else {
            if (res.status === 401) { clearToken(); showLogin(); return; }
            showAlert(data.error || "Gagal menghapus.", "error");
            closeDeleteModal();
        }
    } catch (err) {
        showAlert("Tidak dapat terhubung ke server.", "error");
        closeDeleteModal();
    } finally {
        btn.disabled = false;
        txt.textContent = "Hapus";
        spinner.style.display = "none";
    }
}

// ── Messages: load ─────────────────────────────────────────────────────────
async function loadMessages() {
    const wrapper = document.getElementById("messagesTable");
    wrapper.innerHTML = `<div class="loading-state"><i class="fa fa-spinner fa-spin"></i><br>Memuat pesan...</div>`;

    try {
        const token = getToken();

        const res = await fetch(`${API_BASE}/messages.mjs`, {
            headers: { "Authorization": `Bearer ${token}` },
        });

        if (res.status === 401) { clearToken(); showLogin(); return; }

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        renderMessagesTable(data.data || []);
    } catch (err) {
        wrapper.innerHTML = `<div class="empty-state" style="padding:40px;"><i class="fa fa-exclamation-circle"></i><p>${err.message}</p></div>`;
    }
}

function renderMessagesTable(messages) {
    const wrapper = document.getElementById("messagesTable");

    if (messages.length === 0) {
        wrapper.innerHTML = `<div class="empty-state" style="padding:60px;"><i class="fa fa-envelope-open"></i><p>Belum ada pesan masuk.</p></div>`;
        return;
    }

    wrapper.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Nama</th>
          <th>Email</th>
          <th>Subject</th>
          <th>Pesan</th>
          <th>Tanggal</th>
        </tr>
      </thead>
      <tbody>
        ${messages.map((m, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(m.name || "")}</td>
            <td>${escapeHtml(m.email || "")}</td>
            <td>${escapeHtml(m.subject || "")}</td>
            <td class="td-message">${escapeHtml(m.message || "")}</td>
            <td style="white-space:nowrap;">${escapeHtml(m.timestamp || "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

// ── Modal helpers ──────────────────────────────────────────────────────────
function addDetailImgRow() {
    const container = document.getElementById("detailImagesContainer");
    const rows = container.querySelectorAll(".detail-img-row");
    if (rows.length >= 10) {
        showAlert("Maksimal 10 gambar detail.", "error");
        return;
    }
    const div = document.createElement("div");
    div.className = "detail-img-row";
    div.innerHTML = `
        <input type="url" class="detail-img-input" placeholder="URL gambar ${rows.length + 1}">
        <button type="button" class="btn-icon btn-remove-img" title="Hapus"><i class="fa fa-minus-circle"></i></button>`;
    container.appendChild(div);
}

function openModal() {
    document.getElementById("portfolioForm").reset();
    document.getElementById("formError").textContent = "";
    document.getElementById("detailImagesContainer").innerHTML = `
        <div class="detail-img-row">
            <input type="url" class="detail-img-input" placeholder="URL gambar 1">
            <button type="button" class="btn-icon btn-remove-img" title="Hapus"><i class="fa fa-minus-circle"></i></button>
        </div>`;
    document.getElementById("modalOverlay").style.display = "flex";
}

function closeModal() {
    document.getElementById("modalOverlay").style.display = "none";
}

// ── Alert helper ───────────────────────────────────────────────────────────
function showAlert(message, type = "success") {
    const box = document.getElementById("alertBox");
    box.textContent = message;
    box.className = `alert ${type}`;
    box.style.display = "block";
    setTimeout(() => { box.style.display = "none"; }, 4000);
}

// ── Utils ──────────────────────────────────────────────────────────────────
function capitalize(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}