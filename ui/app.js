"use strict";
// Gjallar web UI. No framework, no build step. Auth: OIDC Authorization
// Code + PKCE against Keycloak; the access token lives in sessionStorage only.

const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pill = (v) => `<span class="pill ${esc(v)}">${esc(v)}</span>`;
let CFG = {}, OIDC = null, TOKEN = null, ME = null;

// ---------- OIDC (PKCE) ----------
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const rand = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const redirectURI = () => location.origin + location.pathname;

async function login() {
  const verifier = rand(48), state = rand(16);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  sessionStorage.setItem("pkce", JSON.stringify({ verifier, state, hash: location.hash }));
  const u = new URL(OIDC.authorization_endpoint);
  Object.entries({ response_type: "code", client_id: CFG.clientId, redirect_uri: redirectURI(), scope: "openid profile email",
    state, code_challenge: challenge, code_challenge_method: "S256" }).forEach(([k, v]) => u.searchParams.set(k, v));
  location.assign(u);
}

async function completeLogin() {
  const q = new URLSearchParams(location.search);
  if (!q.get("code")) return false;
  const saved = JSON.parse(sessionStorage.getItem("pkce") || "{}");
  if (q.get("state") !== saved.state) throw new Error("login state mismatch");
  const res = await fetch(OIDC.token_endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: q.get("code"), redirect_uri: redirectURI(), client_id: CFG.clientId, code_verifier: saved.verifier }) });
  if (!res.ok) throw new Error("token exchange failed: " + res.status);
  const tok = await res.json();
  sessionStorage.setItem("tok", JSON.stringify({ access: tok.access_token, exp: Date.now() + (tok.expires_in - 30) * 1000, id: tok.id_token }));
  sessionStorage.removeItem("pkce");
  history.replaceState(null, "", redirectURI() + (saved.hash || "#risks"));
  return true;
}

function loadToken() {
  const t = JSON.parse(sessionStorage.getItem("tok") || "null");
  return t && t.exp > Date.now() ? t.access : null;
}

function logout() {
  const t = JSON.parse(sessionStorage.getItem("tok") || "{}");
  sessionStorage.clear();
  if (OIDC?.end_session_endpoint) {
    const u = new URL(OIDC.end_session_endpoint);
    u.searchParams.set("post_logout_redirect_uri", redirectURI());
    u.searchParams.set("client_id", CFG.clientId);
    if (t.id) u.searchParams.set("id_token_hint", t.id);
    location.assign(u);
  } else location.reload();
}

// ---------- API ----------
async function api(path, opts = {}) {
  const headers = { ...(opts.body ? { "Content-Type": "application/json" } : {}), ...(TOKEN ? { Authorization: "Bearer " + TOKEN } : {}) };
  const res = await fetch(path, { ...opts, headers });
  if (res.status === 401 && OIDC) { sessionStorage.removeItem("tok"); return login(); }
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new Error((data && data.error) || res.statusText);
  return data;
}

// Authenticated download: a plain <a href> carries no bearer token.
async function download(path, filename) {
  const res = await fetch(path, { headers: TOKEN ? { Authorization: "Bearer " + TOKEN } : {} });
  if (!res.ok) { alert(`Download failed: ${res.status} ${res.statusText}`); return; }
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

// ---------- Views ----------
function table(cols, rows, empty = "Nothing here yet.") {
  if (!rows.length) return `<div class="empty">${empty}</div>`;
  return `<table><thead><tr>${cols.map((c) => `<th>${c[0]}</th>`).join("")}</tr></thead><tbody>${rows.map((r) =>
    `<tr>${cols.map((c) => `<td class="${c[2] || ""}">${c[1](r)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

async function cards() {
  const s = await api("/api/v1/summary");
  const b = s.by_band || {};
  const items = [["Urgent", b.urgent || 0, "urgent"], ["High", b.high || 0], ["Open findings", s.open_findings], ["Known exploited", s.kev],
    ["Fixable", s.fixable], ["Images", s.images], ["Workloads", s.workloads], ["Posture issues", s.posture_violations],
    ["Licenses denied", s.licenses_denied], ["Median time to fix", s.median_time_to_fix_hours ? Math.round(s.median_time_to_fix_hours) + " h" : "–"]];
  $("#cards").innerHTML = items.map(([k, v, c]) => `<div class="card ${c || ""}"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`).join("");
}

const isAdmin = () => !OIDC || (ME?.roles || []).includes("gjallar-admin");

const views = {
  async risks(el) {
    const p = new URLSearchParams(location.hash.split("?")[1] || "");
    el.innerHTML = `<div class="panel"><div class="bar"><h2>Risks, ranked</h2>
      <select id="band"><option value="">All bands</option>${["urgent", "high", "medium", "low"].map((b) => `<option ${p.get("band") === b ? "selected" : ""}>${b}</option>`).join("")}</select>
      <input id="ns" placeholder="Namespace" value="${esc(p.get("namespace") || "")}"><input id="pkg" placeholder="Package" value="${esc(p.get("package") || "")}">
      <button id="go">Filter</button></div><div id="tbl">Loading…</div></div>`;
    const go = () => { const q = new URLSearchParams(); ["band", "ns", "pkg"].forEach((id, i) => { const v = $("#" + id).value; if (v) q.set(["band", "namespace", "package"][i], v); }); location.hash = "risks?" + q; };
    $("#go").onclick = go;
    const q = new URLSearchParams({ limit: 300 }); p.forEach((v, k) => q.set(k, v));
    const rows = await api("/api/v1/findings?" + q);
    $("#tbl").innerHTML = table([
      ["Risk", (r) => `${pill(r.risk.band)} <b>${r.risk.value}</b>`],
      ["Vulnerability", (r) => `<b>${esc(r.vuln_id)}</b> ${r.kev ? '<span class="pill urgent">KEV</span>' : ""}${r.source ? ` <span class="tag" title="Reported by this source only">${esc(r.source)}</span>` : ""}<div class="reasons">${esc((r.risk.reasons || []).join(" · "))}</div>`],
      ["Package", (r) => `${esc(r.package)} <span class="tag">${esc(r.version)}</span>${r.fixed_in ? `<div class="tag">fix: ${esc(r.fixed_in)}</div>` : ""}`],
      ["Severity", (r) => pill(r.severity)], ["CVSS", (r) => r.cvss ? r.cvss.toFixed(1) : "–", "num"], ["EPSS", (r) => (r.epss * 100).toFixed(1) + "%", "num"],
      ["Where", (r) => `<div class="mono">${esc(r.repository)}</div><div class="tag">${esc((r.workloads || []).join(", "))}</div>`],
      ["", (r) => isAdmin() ? `<button data-accept="${esc(r.id)}">Accept…</button>` : ""],
    ], rows, "No open findings match. Either you are in good shape, or the agent has not reported yet.");
    el.querySelectorAll("[data-accept]").forEach((b) => b.onclick = async () => {
      const reason = prompt("Why is this risk acceptable? (stored as a VEX exception)");
      if (!reason) return;
      await api(`/api/v1/findings/${b.dataset.accept}/accept`, { method: "POST", body: JSON.stringify({ reason }) });
      render();
    });
  },
  async images(el) {
    const rows = await api("/api/v1/images");
    el.innerHTML = `<div class="panel"><div class="bar"><h2>Images</h2>${isAdmin() ? `<input id="img" placeholder="registry/repo:tag" size="40"><button class="primary" id="scan">Scan</button><button id="rematch">Rematch all</button>` : ""}</div>${table([
      ["Repository", (r) => `<span class="mono">${esc(r.repository)}${r.tag ? ":" + esc(r.tag) : ""}</span><div class="tag mono">${esc(r.digest.slice(0, 19))}…</div>`],
      ["Distro", (r) => esc(r.distro || "–")], ["Packages", (r) => r.packages, "num"], ["SBOM", (r) => r.sbom_ready ? "ready" : "pending"],
      ["DB", (r) => `<span class="tag">${esc(r.db_version || "–")}</span>`],
      ["", (r) => `<button data-d="${esc(r.digest)}">Details</button>${isAdmin() ? ` <button data-p="${esc(r.digest)}">Patch</button>` : ""}`],
    ], rows)}</div>`;
    $("#scan") && ($("#scan").onclick = async () => { await api("/api/v1/scan", { method: "POST", body: JSON.stringify({ image: $("#img").value }) }); alert("Queued."); });
    $("#rematch") && ($("#rematch").onclick = async () => { const r = await api("/api/v1/rematch", { method: "POST" }); alert(`Re-matching ${r.images} images.`); });
    el.querySelectorAll("[data-p]").forEach((b) => b.onclick = async () => {
      try { const r = await api(`/api/v1/images/${b.dataset.p}/patch`, { method: "POST", body: "{}" }); alert("Patch queued (#" + r.patch_id + ")."); } catch (e) { alert(e.message); }
    });
    el.querySelectorAll("[data-d]").forEach((b) => b.onclick = async () => {
      const d = await api(`/api/v1/images/${b.dataset.d}`);
      $("#dlg-body").innerHTML = `<h3 class="mono">${esc(d.image.repository)}</h3><p class="tag mono">${esc(d.image.digest)}</p>` +
        table([["Risk", (r) => pill(r.risk.band) + " " + r.risk.value], ["Vuln", (r) => esc(r.vuln_id)], ["Package", (r) => esc(r.package + " " + r.version)], ["State", (r) => esc(r.state)]], d.findings) +
        `<div class="bar gap-top"><span class="tag">Your data, open formats:</span>
          <button data-dl="sbom?format=cyclonedx-json" data-f="cdx.json">SBOM · CycloneDX</button>
          <button data-dl="sbom?format=spdx-json" data-f="spdx.json">SBOM · SPDX</button>
          <button data-dl="sbom" data-f="syft.json">SBOM · Syft</button>
          <button data-dl="vex" data-f="openvex.json">OpenVEX</button></div>`;
      const base = d.image.digest.replace(":", "_");
      $("#dlg-body").querySelectorAll("[data-dl]").forEach((x) => x.onclick = () =>
        download(`/api/v1/images/${d.image.digest}/${x.dataset.dl}`, `${base}.${x.dataset.f}`));
      $("#dlg").showModal();
    });
  },
  async posture(el) {
    const rows = await api("/api/v1/posture");
    el.innerHTML = `<div class="panel"><div class="bar"><h2>Posture on running workloads</h2></div>${table([
      ["Severity", (r) => pill(r.severity)], ["Check", (r) => `<b>${esc(r.check_id)}</b>`], ["Workload", (r) => `<span class="mono">${esc(r.workload_id)}</span>`],
      ["Container", (r) => esc(r.container || "–")], ["Detail", (r) => esc(r.message)]], rows, "No posture violations.")}</div>`;
  },
  async licenses(el) {
    const rows = await api("/api/v1/licenses?verdict=denied");
    el.innerHTML = `<div class="panel"><div class="bar"><h2>Denied licenses</h2></div>${table([
      ["Verdict", (r) => pill(r.verdict)], ["License", (r) => esc(r.license)], ["Package", (r) => esc(r.package + " " + r.version)],
      ["Image", (r) => `<span class="mono tag">${esc(r.digest.slice(0, 19))}…</span>`]], rows, "No denied licenses.")}</div>`;
  },
  async patches(el) {
    const rows = await api("/api/v1/patches");
    el.innerHTML = `<div class="panel"><div class="bar"><h2>Copa patches</h2></div>${table([
      ["#", (r) => r.id, "num"], ["Status", (r) => esc(r.status)], ["Image", (r) => `<span class="mono tag">${esc(r.digest.slice(0, 19))}…</span>`],
      ["Patched image", (r) => `<span class="mono">${esc(r.patched_ref || "–")}</span>`], ["Message", (r) => `<span class="tag">${esc(r.message)}</span>`],
      ["When", (r) => esc(new Date(r.created_at).toLocaleString())]], rows, "No patches requested yet.")}</div>`;
  },
  async analytics(el) {
    let meta = { reports: [], tables: [] };
    try { meta = await api("/api/v1/analytics/reports"); } catch (e) { el.innerHTML = `<div class="panel err">Analytics unavailable: ${esc(e.message)}</div>`; return; }
    el.innerHTML = `<div class="panel"><div class="bar"><h2>Analytics · DuckDB over Parquet</h2>
      <select id="rep"><option value="">Curated report…</option>${meta.reports.sort().map((r) => `<option>${esc(r)}</option>`).join("")}</select></div>
      <textarea id="sql" spellcheck="false">SELECT band, count(*) AS findings FROM finding_daily WHERE state = 'open' GROUP BY ALL ORDER BY findings DESC</textarea>
      <div class="bar gap-top"><button class="primary" id="run">Run query</button><span class="tag">Tables: ${esc(meta.tables.join(", "))}. Read-only, one statement.</span></div>
      <div id="out"></div></div>`;
    const show = (rows) => { const cols = rows.length ? Object.keys(rows[0]) : []; $("#out").innerHTML = table(cols.map((c) => [esc(c), (r) => esc(typeof r[c] === "object" ? JSON.stringify(r[c]) : r[c])]), rows, "No rows."); };
    const guard = async (fn) => { try { show(await fn()); } catch (e) { $("#out").innerHTML = `<div class="err">${esc(e.message)}</div>`; } };
    $("#rep").onchange = () => $("#rep").value && guard(() => api("/api/v1/analytics/reports/" + $("#rep").value));
    $("#run").onclick = () => guard(() => api("/api/v1/analytics/query", { method: "POST", body: JSON.stringify({ sql: $("#sql").value }) }));
  },
};

async function render() {
  const name = (location.hash.slice(1).split("?")[0]) || "risks";
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("on", a.dataset.view === name));
  const el = $("#view");
  try { await cards(); await (views[name] || views.risks)(el); }
  catch (e) { el.innerHTML = `<div class="panel err">${esc(e.message)}</div>`; }
}

(async function boot() {
  CFG = await (await fetch("config.json")).json();
  $("#ver").textContent = CFG.version || "";
  if (CFG.issuer) {
    OIDC = await (await fetch(CFG.issuer.replace(/\/$/, "") + "/.well-known/openid-configuration")).json();
    try { await completeLogin(); } catch (e) { document.body.innerHTML = `<div class="login err">${esc(e.message)}</div>`; return; }
    TOKEN = loadToken();
    if (!TOKEN) {
      $("#view").innerHTML = `<div class="panel login"><p>Sign in with your organisation account.</p><button class="primary" id="login">Sign in</button></div>`;
      $("#login").onclick = login;
      return;
    }
  }
  ME = await api("/api/v1/me");
  $("#who").innerHTML = `${esc(ME.username || ME.sub)}${ME.all_namespaces === false ? ` <span class="tag" title="Multi-tenancy: what your groups may see">namespaces: ${esc((ME.namespaces || []).join(", ") || "none")}</span>` : ""}${OIDC ? ' <button id="logout">Sign out</button>' : ' <span class="tag">(auth disabled)</span>'}`;
  $("#logout") && ($("#logout").onclick = logout);
  window.addEventListener("hashchange", render);
  render();
})();
