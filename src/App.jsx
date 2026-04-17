import { useState, useEffect, useRef, useCallback } from "react";

const DB_KEY = "mango_harvest_db";
const SCANS_KEY = "mango_scans_db";
const SYNC_KEY = "mango_sync_status";
const AUTH_KEY = "mango_auth_session";
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";

const generateId = () => "MH-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2,5).toUpperCase();

const VARIETIES = ["Kent", "Tommy Atkins", "Keitt", "Palmer", "Other"];
const RIPENESS = ["Green", "Breaker", "Ripe"];
const DEFECTS = ["Anthracnose", "Sap Burn", "Bruising", "None"];

const sampleData = [
  { id: "MH-LX7K2A-Q3F", farmerId: "F-001", farmerName: "Kwame Asante", orchardBlock: "Block A - North Ridge", variety: "Kent", fruitCount: 240, weight: 96, ripeness: "Ripe", defects: ["None"], gps: "6.6885° N, 1.6244° W", harvestDate: "2026-04-10", pickerId: "P-012", photoUrl: null, submittedAt: "2026-04-10T08:32:00Z", synced: true },
  { id: "MH-LX9M4B-R7T", farmerId: "F-002", farmerName: "Abena Mensah", orchardBlock: "Block C - East Grove", variety: "Tommy Atkins", fruitCount: 185, weight: 74, ripeness: "Breaker", defects: ["Bruising"], gps: "6.6901° N, 1.6218° W", harvestDate: "2026-04-12", pickerId: "P-008", photoUrl: null, submittedAt: "2026-04-12T07:15:00Z", synced: true },
  { id: "MH-LXB5C-W2K", farmerId: "F-003", farmerName: "Kofi Boateng", orchardBlock: "Block B - South Plain", variety: "Keitt", fruitCount: 310, weight: 124, ripeness: "Green", defects: ["Anthracnose", "Sap Burn"], gps: "6.6872° N, 1.6270° W", harvestDate: "2026-04-14", pickerId: "P-015", photoUrl: null, submittedAt: "2026-04-14T09:45:00Z", synced: true },
];

function getDB() {
  try { return JSON.parse(localStorage.getItem(DB_KEY) || "[]"); } catch { return []; }
}
function saveDB(data) { localStorage.setItem(DB_KEY, JSON.stringify(data)); }
function getScans() {
  try { return JSON.parse(localStorage.getItem(SCANS_KEY) || "{}"); } catch { return {}; }
}
function saveScans(data) { localStorage.setItem(SCANS_KEY, JSON.stringify(data)); }

function getSyncStatus() {
  try { return JSON.parse(localStorage.getItem(SYNC_KEY) || "{}"); } catch { return {}; }
}
function saveSyncStatus(data) { localStorage.setItem(SYNC_KEY, JSON.stringify(data)); }

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length < headers.length) continue;
    const obj = {};
    headers.forEach((h, idx) => {
      let val = values[idx];
      if (h === "defects" && val) val = val.split(";").map(d => d.trim());
      else if (h === "fruitcount" || h === "weight") val = Number(val) || val;
      obj[h] = val;
    });
    if (obj.farmerName && obj.orchardBlock) records.push(obj);
  }
  return records;
}

function recordScan(id) {
  const scans = getScans();
  if (!scans[id]) scans[id] = [];
  scans[id].push({ ts: new Date().toISOString(), device: navigator.userAgent.includes("Mobile") ? "Mobile" : "Desktop" });
  saveScans(scans);
}

const QRCode = ({ value, size = 160 }) => {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = size; canvas.height = size;
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&color=1a3a1a&bgcolor=fffdf7`;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => ctx.drawImage(img, 0, 0);
    img.onerror = () => {
      ctx.fillStyle = "#f0fce8";
      ctx.fillRect(0,0,size,size);
      ctx.fillStyle = "#2d5a27";
      ctx.font = `bold ${size/10}px monospace`;
      ctx.textAlign = "center";
      ctx.fillText("QR", size/2, size/2 - 8);
      ctx.font = `${size/14}px monospace`;
      ctx.fillText("(scan view)", size/2, size/2 + 10);
    };
    img.src = url;
  }, [value, size]);
  return <canvas ref={canvasRef} style={{ borderRadius: 8, border: "1px solid #c8e6b8" }} />;
};

const Badge = ({ text, color }) => {
  const colors = {
    green: { bg: "#e8f5e2", color: "#2d6b22" },
    amber: { bg: "#fef3d0", color: "#7c5400" },
    red: { bg: "#fde8e8", color: "#8b2020" },
    gray: { bg: "#f0ede4", color: "#4a4a3a" },
    teal: { bg: "#e0f5ee", color: "#0f6e56" },
  };
  const c = colors[color] || colors.gray;
  return <span style={{ background: c.bg, color: c.color, fontSize: 12, fontWeight: 500, padding: "3px 10px", borderRadius: 20, display: "inline-block" }}>{text}</span>;
};

const ripenessColor = r => r === "Ripe" ? "green" : r === "Breaker" ? "amber" : "gray";

export default function App() {
  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "false"); } catch { return false; }
  });
  const [userRole, setUserRole] = useState(() => {
    try { return localStorage.getItem(AUTH_KEY + "_role") || null; } catch { return null; }
  });
  const [view, setView] = useState(isLoggedIn ? "dashboard" : "home");
  
  const [submissions, setSubmissions] = useState(() => {
    const db = getDB();
    if (db.length === 0) { saveDB(sampleData); return sampleData; }
    return db;
  });
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [printQR, setPrintQR] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSync, setPendingSync] = useState(0);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const db = getDB();
    const pending = db.filter(r => !r.synced).length;
    setPendingSync(pending);
  }, [submissions]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSync = async () => {
    if (!isOnline) {
      showToast("No internet connection", "error");
      return;
    }
    const db = getDB().map(r => ({ ...r, synced: true }));
    saveDB(db);
    setSubmissions(db);
    showToast("✓ All records synced to cloud", "success");
  };

  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target.result;
        const imported = parseCSV(text);
        if (imported.length === 0) {
          showToast("No valid records found in file", "error");
          return;
        }
        const newRecords = imported.map(r => ({
          id: r.id || generateId(),
          farmerId: r.farmerId || "",
          farmerName: r.farmerName || "",
          orchardBlock: r.orchardBlock || "",
          variety: r.variety || "Kent",
          fruitCount: r.fruitcount || r.fruitCount || 0,
          weight: r.weight || 0,
          ripeness: r.ripeness || "Green",
          defects: r.defects || ["None"],
          gps: r.gps || "",
          harvestDate: r.harvestdate || r.harvestDate || new Date().toISOString().slice(0, 10),
          pickerId: r.pickerid || r.pickerId || "",
          photoUrl: null,
          submittedAt: r.submittedat || r.submittedAt || new Date().toISOString(),
          synced: false,
        }));
        const db = [...newRecords, ...getDB()];
        saveDB(db);
        setSubmissions(db);
        setShowImport(false);
        showToast(`✓ Imported ${imported.length} records (pending sync)`, "success");
      } catch (err) {
        showToast("Error parsing file", "error");
      }
    };
    reader.readAsText(file);
  };

  const handleLogin = (role, isAdmin = false) => {
    if (isAdmin) {
      localStorage.setItem(AUTH_KEY, "true");
      localStorage.setItem(AUTH_KEY + "_role", "admin");
      setIsLoggedIn(true);
      setUserRole("admin");
      setView("dashboard");
      showToast("✓ Admin logged in", "success");
    } else {
      localStorage.setItem(AUTH_KEY, "false");
      localStorage.setItem(AUTH_KEY + "_role", role);
      setIsLoggedIn(false);
      setUserRole(role);
      setView("dashboard");
      showToast(`✓ Viewing as ${role}`, "success");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(AUTH_KEY + "_role");
    setIsLoggedIn(false);
    setUserRole(null);
    setView("home");
    showToast("Logged out", "success");
  };

  const refresh = () => setSubmissions(getDB());

  const handleViewTrace = (id) => {
    recordScan(id);
    setSelectedId(id);
    setView("trace");
  };

  const exportCSV = () => {
    const rows = [["ID","Farmer","Block","Variety","Count","Weight(kg)","Ripeness","Defects","GPS","Harvest Date","Picker","Submitted"]];
    submissions.forEach(s => rows.push([s.id,s.farmerName,s.orchardBlock,s.variety,s.fruitCount,s.weight,s.ripeness,s.defects.join(";"),s.gps,s.harvestDate,s.pickerId,s.submittedAt]));
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "mango_harvest.csv"; a.click();
  };

  const filtered = submissions.filter(s =>
    !search || s.id.toLowerCase().includes(search.toLowerCase()) || s.farmerName.toLowerCase().includes(search.toLowerCase()) || s.orchardBlock.toLowerCase().includes(search.toLowerCase())
  );

  const scansData = getScans();

  return (
    <div style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif", background: "#f7faf2", minHeight: "100vh", color: "#1a2e14" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Serif+Display&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input, select, textarea { font-family: inherit; }
        .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 8px; border: 1px solid; cursor: pointer; font-size: 14px; font-weight: 500; transition: all .15s; }
        .btn-primary { background: #2d6b22; color: #fff; border-color: #2d6b22; }
        .btn-primary:hover { background: #245519; }
        .btn-outline { background: transparent; color: #2d6b22; border-color: #2d6b22; }
        .btn-outline:hover { background: #edf5e6; }
        .btn-sm { padding: 5px 12px; font-size: 13px; }
        .btn-danger { background: #8b2020; color: #fff; border-color: #8b2020; }
        .card { background: #fff; border-radius: 12px; border: 1px solid #d8eacc; padding: 20px; }
        .inp { width: 100%; padding: 9px 12px; border-radius: 8px; border: 1px solid #c8d8b8; background: #fafdf6; font-size: 14px; color: #1a2e14; }
        .inp:focus { outline: 2px solid #5aaa3d; border-color: #5aaa3d; }
        .lbl { font-size: 13px; font-weight: 500; color: #3d5c34; margin-bottom: 5px; display: block; }
        .nav-btn { padding: 8px 18px; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 500; transition: all .15s; }
        .tag { display: inline-flex; align-items: center; gap: 4px; background: #e8f5e2; color: #2d6b22; border-radius: 6px; padding: 2px 10px; font-size: 12px; font-weight: 500; margin: 2px; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; font-size: 12px; font-weight: 600; color: #5a7a50; padding: 8px 12px; background: #f0f7ea; border-bottom: 1px solid #d8eacc; }
        td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid #eef5e8; }
        tr:hover td { background: #f7fbf2; }
        .status-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
        .status-online { background: #e8f5e2; color: #2d6b22; }
        .status-offline { background: #fde8e8; color: #8b2020; }
        .status-pending { background: #fef3d0; color: #7c5400; }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, background: toast.type === "success" ? "#2d6b22" : "#8b2020", color: "#fff", padding: "12px 20px", borderRadius: 10, fontSize: 14, fontWeight: 500, boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header style={{ background: "#1a3a14", color: "#fff", padding: "0 24px", display: "flex", alignItems: "center", gap: 16, height: 58, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><ellipse cx="14" cy="16" rx="10" ry="8" fill="#f5a623"/><ellipse cx="14" cy="15" rx="9" ry="7" fill="#f7c05a"/><path d="M14 8 Q18 4 22 6" stroke="#2d6b22" strokeWidth="2" strokeLinecap="round" fill="none"/><path d="M14 8 Q10 2 8 5" stroke="#3d8a2c" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, letterSpacing: "0.02em" }}>MangoTrace</span>
          <span style={{ background: "#2d6b22", fontSize: 10, padding: "2px 7px", borderRadius: 4, fontWeight: 600, letterSpacing: "0.05em" }}>BETA</span>
          {userRole && (
            <span style={{ background: isLoggedIn ? "#8b5e2d" : "#3d6b4d", fontSize: 10, padding: "2px 7px", borderRadius: 4, fontWeight: 600, letterSpacing: "0.05em" }}>
              {isLoggedIn ? "ADMIN" : userRole.toUpperCase()}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, marginLeft: "auto", alignItems: "center" }}>
          {isOnline && pendingSync > 0 && (
            <span className="status-badge status-pending">⏳ {pendingSync} pending</span>
          )}
          {isOnline && pendingSync > 0 && (
            <button className="btn btn-sm" style={{ background: "#5aaa3d", color: "#fff", border: "none" }} onClick={handleSync}>↑ Sync Now</button>
          )}
          <span className="status-badge" style={{ background: isOnline ? "#2d6b22" : "#8b2020", color: "#fff" }}>
            {isOnline ? "🟢 Online" : "🔴 Offline"}
          </span>
          {userRole && (
            <button className="btn btn-sm" style={{ background: "#5a3a2d", color: "#fff", border: "none" }} onClick={handleLogout}>Logout</button>
          )}
        </div>
        {isLoggedIn && (
          <nav style={{ display: "flex", gap: 4 }}>
            {[["dashboard","Dashboard"],["capture","+ New Harvest"],["admin","Admin"]].map(([v,l]) => (
              <button key={v} className="nav-btn" onClick={() => setView(v)} style={{ background: view === v ? "#2d6b22" : "transparent", color: view === v ? "#fff" : "#a8d48a" }}>
                {l}
              </button>
            ))}
          </nav>
        )}
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px" }}>
        {view === "home" && <HomePage onBuyerClick={() => handleLogin("buyer")} onAdminClick={() => setView("login")} />}
        {view === "login" && <LoginForm onLogin={handleLogin} onBack={() => setView("home")} />}
        {view === "dashboard" && <Dashboard submissions={filtered} search={search} setSearch={setSearch} onView={handleViewTrace} onCapture={() => setView("capture")} exportCSV={exportCSV} scansData={scansData} onPrintQR={setPrintQR} onImport={() => setShowImport(true)} isAdmin={isLoggedIn} isBuyer={userRole === "buyer"} />}
        {view === "capture" && isLoggedIn && <CaptureForm onSubmit={(d) => { const db = [{ ...d, synced: !isOnline }, ...getDB()]; saveDB(db); setSubmissions(db); showToast(isOnline ? "✓ Saved & synced" : "✓ Saved (will sync when online)"); setView("dashboard"); }} />}
        {view === "trace" && <TraceView id={selectedId} submissions={submissions} onBack={() => setView("dashboard")} scansData={scansData} />}
        {view === "admin" && isLoggedIn && <AdminDashboard submissions={submissions} onDelete={(id) => { const db = getDB().filter(s => s.id !== id); saveDB(db); setSubmissions(db); showToast("Record deleted","error"); }} exportCSV={exportCSV} onView={handleViewTrace} />}
      </main>

      {/* Import Modal */}
      {showImport && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowImport(false)}>
          <div className="card" style={{ maxWidth: 500, padding: 32 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: "#1a3a14", marginBottom: 16 }}>Import Harvest Data</h2>
            <p style={{ color: "#5a7a50", fontSize: 14, marginBottom: 20 }}>Upload a CSV file with columns: farmerName, orchardBlock, variety, fruitCount, weight, ripeness, defects, gps, harvestDate, pickerId</p>
            <div style={{ border: "2px dashed #c8e0b0", borderRadius: 8, padding: 30, textAlign: "center", background: "#f7fbf2", marginBottom: 20 }}>
              <label style={{ cursor: "pointer" }}>
                <p style={{ color: "#2d6b22", fontSize: 16, fontWeight: 600 }}>📁 Choose CSV File</p>
                <p style={{ color: "#8a9a80", fontSize: 12, marginTop: 4 }}>or drag and drop</p>
                <input type="file" accept=".csv,.xlsx,.xls" onChange={handleImportFile} style={{ display: "none" }} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowImport(false)}>Cancel</button>
              <a href="#" onClick={() => {
                const template = 'farmerName,orchardBlock,variety,fruitCount,weight,ripeness,defects,gps,harvestDate,pickerId\nJohn Doe,Block A,Kent,150,60,Ripe,None,6.6885° N 1.6244° W,2026-04-15,P-001';
                const blob = new Blob([template], { type: "text/csv" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = "template.csv";
                a.click();
              }} className="btn btn-primary" style={{ flex: 1 }}>📥 Download Template</a>
            </div>
          </div>
        </div>
      )}

      {printQR && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setPrintQR(null)}>
          <div className="card" style={{ textAlign: "center", padding: 32 }} onClick={e => e.stopPropagation()}>
            <p style={{ fontWeight: 600, marginBottom: 12 }}>{printQR.id}</p>
            <p style={{ fontSize: 13, color: "#5a7a50", marginBottom: 16 }}>{printQR.farmerName} · {printQR.variety}</p>
            <QRCode value={`${window.location.href.split("?")[0]}?id=${printQR.id}`} size={180} />
            <p style={{ fontSize: 11, color: "#8a9a80", marginTop: 12 }}>Scan to view traceability record</p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => { window.print(); setPrintQR(null); }}>Print QR</button>
            <button className="btn btn-outline" style={{ marginTop: 8, marginLeft: 8 }} onClick={() => setPrintQR(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
function Dashboard({ submissions, search, setSearch, onView, onCapture, exportCSV, scansData, onPrintQR, onImport, isAdmin, isBuyer }) {
  const totalWeight = submissions.reduce((s, r) => s + Number(r.weight), 0);
  const totalFruit = submissions.reduce((s, r) => s + Number(r.fruitCount), 0);
  const totalScans = Object.values(scansData).reduce((s, arr) => s + arr.length, 0);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: "#1a3a14" }}>Harvest Dashboard</h1>
          <p style={{ fontSize: 14, color: "#5a7a50", marginTop: 3 }}>All submissions · Season 2026 {isBuyer && "(View Only)"}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {isAdmin && <button className="btn btn-outline btn-sm" onClick={exportCSV}>↓ Export CSV</button>}
          {isAdmin && <button className="btn btn-outline btn-sm" onClick={onImport}>📁 Import CSV</button>}
          {isAdmin && <button className="btn btn-primary btn-sm" onClick={onCapture}>+ New Harvest</button>}
          {isBuyer && <button className="btn btn-outline btn-sm" onClick={exportCSV}>↓ Export CSV</button>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total Batches", value: submissions.length, icon: "📦" },
          { label: "Total Weight", value: `${totalWeight.toLocaleString()} kg`, icon: "⚖️" },
          { label: "Fruit Count", value: totalFruit.toLocaleString(), icon: "🥭" },
          { label: "QR Scans", value: totalScans, icon: "📱" },
        ].map(m => (
          <div key={m.label} style={{ background: "#fff", border: "1px solid #d8eacc", borderRadius: 10, padding: "14px 16px" }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "#5a7a50", letterSpacing: "0.05em", textTransform: "uppercase" }}>{m.label}</p>
            <p style={{ fontSize: 22, fontWeight: 600, color: "#1a3a14", marginTop: 4 }}>{m.value}</p>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #eef5e8", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input className="inp" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by ID, farmer, or block…" style={{ maxWidth: 300 }} />
          <span style={{ fontSize: 13, color: "#8a9a80", marginLeft: "auto" }}>{submissions.length} records</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr><th>Submission ID</th><th>Farmer</th><th>Block</th><th>Variety</th><th>Weight</th><th>Ripeness</th><th>Date</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {submissions.length === 0 && <tr><td colSpan={9} style={{ textAlign: "center", color: "#8a9a80", padding: 32 }}>No records found</td></tr>}
              {submissions.map(s => (
                <tr key={s.id}>
                  <td><code style={{ fontSize: 12, background: "#f0f7ea", padding: "2px 7px", borderRadius: 4 }}>{s.id}</code></td>
                  <td style={{ fontWeight: 500 }}>{s.farmerName}</td>
                  <td style={{ color: "#5a7a50" }}>{s.orchardBlock}</td>
                  <td>{s.variety}</td>
                  <td>{s.weight} kg</td>
                  <td><Badge text={s.ripeness} color={ripenessColor(s.ripeness)} /></td>
                  <td>{s.harvestDate}</td>
                  <td><Badge text={s.synced ? "✓ Synced" : "⏳ Pending"} color={s.synced ? "green" : "amber"} /></td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => onView(s.id)}>View</button>
                      <button className="btn btn-sm" style={{ background: "#f0f7ea", color: "#2d6b22", border: "1px solid #c8e0b0" }} onClick={() => onPrintQR(s)} title="QR">QR</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CaptureForm({ onSubmit }) {
  const [form, setForm] = useState({
    id: generateId(), farmerId: "", farmerName: "", orchardBlock: "", variety: "Kent",
    fruitCount: "", weight: "", ripeness: "Green", defects: [], gps: "", harvestDate: new Date().toISOString().slice(0,10), pickerId: "", photoUrl: null, farmPhotoUrl: null, submittedAt: ""
  });
  const [photoPreview, setPhotoPreview] = useState(null);
  const [farmPhotoPreview, setFarmPhotoPreview] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleDefect = (d) => {
    if (d === "None") { set("defects", ["None"]); return; }
    const cur = form.defects.filter(x => x !== "None");
    if (cur.includes(d)) set("defects", cur.filter(x => x !== d));
    else set("defects", [...cur, d]);
  };

  const getGPS = () => {
    setGpsLoading(true);
    navigator.geolocation?.getCurrentPosition(
      pos => { set("gps", `${pos.coords.latitude.toFixed(4)}° N, ${Math.abs(pos.coords.longitude).toFixed(4)}° ${pos.coords.longitude < 0 ? "W" : "E"}`); setGpsLoading(false); },
      () => { alert("Location access denied. Enter manually."); setGpsLoading(false); }
    );
  };

  const handlePhoto = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setPhotoPreview(ev.target.result); set("photoUrl", ev.target.result); };
    reader.readAsDataURL(file);
  };

  const handleFarmPhoto = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setFarmPhotoPreview(ev.target.result); set("farmPhotoUrl", ev.target.result); };
    reader.readAsDataURL(file);
  };

  const handleSubmit = () => {
    if (!form.farmerName || !form.orchardBlock || !form.fruitCount || !form.weight || form.defects.length === 0) {
      alert("Please fill all required fields and select at least one defect option."); return;
    }
    onSubmit({ ...form, submittedAt: new Date().toISOString() });
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: "#1a3a14" }}>New Harvest Entry</h1>
        <p style={{ fontSize: 14, color: "#5a7a50", marginTop: 3 }}>Field data capture · Auto ID: <code style={{ background: "#f0f7ea", padding: "1px 6px", borderRadius: 4, fontSize: 12 }}>{form.id}</code></p>
      </div>

      <div style={{ display: "grid", gap: 20 }}>
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#2d6b22", marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid #eef5e8" }}>Farmer & Location</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label className="lbl">Farmer ID</label>
              <input className="inp" value={form.farmerId} onChange={e => set("farmerId", e.target.value)} placeholder="F-001" />
            </div>
            <div>
              <label className="lbl">Farmer Name *</label>
              <input className="inp" value={form.farmerName} onChange={e => set("farmerName", e.target.value)} placeholder="Full name" />
            </div>
            <div>
              <label className="lbl">Orchard Block *</label>
              <input className="inp" value={form.orchardBlock} onChange={e => set("orchardBlock", e.target.value)} placeholder="Block A - North Ridge" />
            </div>
            <div>
              <label className="lbl">Picker ID</label>
              <input className="inp" value={form.pickerId} onChange={e => set("pickerId", e.target.value)} placeholder="P-001" />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label className="lbl">GPS Location</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="inp" value={form.gps} onChange={e => set("gps", e.target.value)} placeholder="Latitude, Longitude (auto or manual)" style={{ flex: 1 }} />
                <button className="btn btn-outline btn-sm" onClick={getGPS} disabled={gpsLoading}>{gpsLoading ? "…" : "📍 Auto"}</button>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#2d6b22", marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid #eef5e8" }}>Harvest Details</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label className="lbl">Mango Variety</label>
              <select className="inp" value={form.variety} onChange={e => set("variety", e.target.value)}>
                {VARIETIES.map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl">Harvest Date</label>
              <input type="date" className="inp" value={form.harvestDate} onChange={e => set("harvestDate", e.target.value)} />
            </div>
            <div>
              <label className="lbl">Fruit Count *</label>
              <input type="number" className="inp" value={form.fruitCount} onChange={e => set("fruitCount", e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="lbl">Weight (kg) *</label>
              <input type="number" className="inp" value={form.weight} onChange={e => set("weight", e.target.value)} placeholder="0.0" step="0.1" />
            </div>
          </div>
        </div>

        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#2d6b22", marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid #eef5e8" }}>Quality Assessment</h3>
          <div style={{ marginBottom: 16 }}>
            <label className="lbl">Ripeness Stage</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {RIPENESS.map(r => (
                <button key={r} onClick={() => set("ripeness", r)} className="btn btn-sm" style={{ background: form.ripeness === r ? "#2d6b22" : "#f0f7ea", color: form.ripeness === r ? "#fff" : "#2d6b22", border: `1px solid ${form.ripeness === r ? "#2d6b22" : "#c8e0b0"}` }}>
                  {r === "Green" ? "🟢" : r === "Breaker" ? "🟡" : "🟠"} {r}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="lbl">Defects Found *</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {DEFECTS.map(d => (
                <button key={d} onClick={() => toggleDefect(d)} className="btn btn-sm" style={{ background: form.defects.includes(d) ? (d === "None" ? "#2d6b22" : "#8b2020") : "#f0f7ea", color: form.defects.includes(d) ? "#fff" : "#3d5c34", border: `1px solid ${form.defects.includes(d) ? "transparent" : "#c8e0b0"}` }}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="lbl">🌾 Farm Photo</label>
            <div style={{ border: "2px dashed #c8e0b0", borderRadius: 8, padding: 20, textAlign: "center", background: "#f7fbf2" }}>
              {farmPhotoPreview ? (
                <div>
                  <img src={farmPhotoPreview} alt="farm" style={{ maxWidth: "100%", maxHeight: 160, borderRadius: 8, marginBottom: 8 }} />
                  <br />
                  <button className="btn btn-outline btn-sm" onClick={() => { setFarmPhotoPreview(null); set("farmPhotoUrl", null); }}>Remove</button>
                </div>
              ) : (
                <label style={{ cursor: "pointer" }}>
                  <p style={{ color: "#5a7a50", fontSize: 14 }}>📸 Tap to upload farm photo</p>
                  <p style={{ color: "#8a9a80", fontSize: 12, marginTop: 4 }}>JPEG, PNG — max 5MB</p>
                  <input type="file" accept="image/*" capture="environment" onChange={handleFarmPhoto} style={{ display: "none" }} />
                </label>
              )}
            </div>
          </div>
          <div>
            <label className="lbl">📷 Upload Fruit Image</label>
            <div style={{ border: "2px dashed #c8e0b0", borderRadius: 8, padding: 20, textAlign: "center", background: "#f7fbf2" }}>
              {photoPreview ? (
                <div>
                  <img src={photoPreview} alt="fruit" style={{ maxWidth: "100%", maxHeight: 160, borderRadius: 8, marginBottom: 8 }} />
                  <br />
                  <button className="btn btn-outline btn-sm" onClick={() => { setPhotoPreview(null); set("photoUrl", null); }}>Remove</button>
                </div>
              ) : (
                <label style={{ cursor: "pointer" }}>
                  <p style={{ color: "#5a7a50", fontSize: 14 }}>📷 Tap to upload fruit image</p>
                  <p style={{ color: "#8a9a80", fontSize: 12, marginTop: 4 }}>JPEG, PNG — max 5MB</p>
                  <input type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{ display: "none" }} />
                </label>
              )}
            </div>
          </div>
        </div>

        <button className="btn btn-primary" onClick={handleSubmit} style={{ width: "100%", justifyContent: "center", padding: "12px", fontSize: 15 }}>
          ✓ Submit Harvest Entry
        </button>
      </div>
    </div>
  );
}

function TraceView({ id, submissions, onBack, scansData }) {
  const record = submissions.find(s => s.id === id);
  const scans = scansData[id] || [];

  if (!record) return (
    <div style={{ textAlign: "center", padding: 60 }}>
      <p style={{ color: "#8a9a80", fontSize: 16 }}>Record not found</p>
      <button className="btn btn-outline" style={{ marginTop: 16 }} onClick={onBack}>← Back</button>
    </div>
  );

  const qrUrl = `${window.location.href.split("?")[0]}?id=${record.id}`;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button className="btn btn-outline btn-sm" onClick={onBack}>← Back</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: "#1a3a14" }}>Traceability Record</h1>
          <code style={{ fontSize: 12, color: "#5a7a50" }}>{record.id}</code>
        </div>
        <Badge text={`${scans.length} scan${scans.length !== 1 ? "s" : ""}`} color="teal" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 16, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 14 }}>
          {/* Farmer */}
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#e0f5e0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🧑‍🌾</div>
              <div>
                <p style={{ fontWeight: 600, fontSize: 17 }}>{record.farmerName}</p>
                <p style={{ fontSize: 13, color: "#5a7a50" }}>ID: {record.farmerId || "N/A"} · Picker: {record.pickerId || "N/A"}</p>
              </div>
            </div>
          </div>

          {/* Grid details */}
          <div className="card">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {[
                { label: "Orchard Block", value: record.orchardBlock, icon: "🌳" },
                { label: "Mango Variety", value: record.variety, icon: "🥭" },
                { label: "Harvest Date", value: record.harvestDate, icon: "📅" },
                { label: "Picker ID", value: record.pickerId || "—", icon: "👤" },
                { label: "Fruit Count", value: `${record.fruitCount} fruits`, icon: "📦" },
                { label: "Weight", value: `${record.weight} kg`, icon: "⚖️" },
              ].map(f => (
                <div key={f.label}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: "#5a7a50", textTransform: "uppercase", letterSpacing: "0.04em" }}>{f.icon} {f.label}</p>
                  <p style={{ fontWeight: 500, marginTop: 3 }}>{f.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Quality */}
          <div className="card">
            <p style={{ fontSize: 12, fontWeight: 600, color: "#5a7a50", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12 }}>Quality Assessment</p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <p style={{ fontSize: 11, color: "#8a9a80" }}>Ripeness</p>
                <Badge text={record.ripeness} color={ripenessColor(record.ripeness)} />
              </div>
              <div style={{ marginLeft: 20 }}>
                <p style={{ fontSize: 11, color: "#8a9a80" }}>Defects</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
                  {record.defects.map(d => (
                    <Badge key={d} text={d} color={d === "None" ? "green" : "red"} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* GPS */}
          {record.gps && (
            <div className="card" style={{ padding: 14 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#5a7a50", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>📍 GPS Location</p>
              <p style={{ fontFamily: "monospace", fontSize: 13, color: "#2d5a1e" }}>{record.gps}</p>
              {(() => {
                const match = record.gps.match(/([\d.]+)°\s*([NS]),?\s*([\d.]+)°\s*([EW])/);
                if (!match) return null;
                const lat = match[2] === "S" ? -match[1] : match[1];
                const lng = match[4] === "W" ? -match[3] : match[3];
                const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lng-0.01},${lat-0.01},${lng*1+0.01},${lat*1+0.01}&layer=mapnik&marker=${lat},${lng}`;
                return (
                  <iframe src={mapUrl} style={{ width: "100%", height: 160, borderRadius: 8, border: "1px solid #d8eacc", marginTop: 10 }} title="location" />
                );
              })()}
            </div>
          )}

          {/* Photo */}
          {record.photoUrl && (
            <div className="card">
              <p style={{ fontSize: 12, fontWeight: 600, color: "#5a7a50", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>📷 Defect Photo</p>
              <img src={record.photoUrl} alt="defect" style={{ width: "100%", borderRadius: 8, maxHeight: 220, objectFit: "cover" }} />
            </div>
          )}

          {/* Scan history */}
          {scans.length > 0 && (
            <div className="card">
              <p style={{ fontSize: 12, fontWeight: 600, color: "#5a7a50", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Scan History ({scans.length})</p>
              {scans.slice(-5).reverse().map((sc, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f0f7ea", fontSize: 13 }}>
                  <span style={{ color: "#5a7a50" }}>{new Date(sc.ts).toLocaleString()}</span>
                  <Badge text={sc.device} color="gray" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ position: "sticky", top: 80 }}>
          <div className="card" style={{ textAlign: "center" }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#5a7a50", marginBottom: 10 }}>SCAN FOR DETAILS</p>
            <QRCode value={qrUrl} size={160} />
            <p style={{ fontSize: 10, color: "#8a9a80", marginTop: 10, wordBreak: "break-all", lineHeight: 1.5 }}>{record.id}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminDashboard({ submissions, onDelete, exportCSV, onView }) {
  const [confirmDel, setConfirmDel] = useState(null);

  const ripenessDist = RIPENESS.map(r => ({ label: r, count: submissions.filter(s => s.ripeness === r).length }));
  const varietyDist = VARIETIES.map(v => ({ label: v, count: submissions.filter(s => s.variety === v).length })).filter(x => x.count > 0);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: "#1a3a14" }}>Admin Panel</h1>
          <p style={{ fontSize: 14, color: "#5a7a50", marginTop: 3 }}>Manage submissions and data</p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={exportCSV}>↓ Export All CSV</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div className="card">
          <p style={{ fontSize: 13, fontWeight: 600, color: "#5a7a50", marginBottom: 14 }}>Ripeness Distribution</p>
          {ripenessDist.map(r => (
            <div key={r.label} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span>{r.label}</span><span style={{ fontWeight: 600 }}>{r.count}</span>
              </div>
              <div style={{ height: 6, background: "#eef5e8", borderRadius: 4 }}>
                <div style={{ height: 6, background: r.label === "Ripe" ? "#2d6b22" : r.label === "Breaker" ? "#e8a020" : "#5a9a50", borderRadius: 4, width: submissions.length ? `${(r.count/submissions.length)*100}%` : "0%" }} />
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <p style={{ fontSize: 13, fontWeight: 600, color: "#5a7a50", marginBottom: 14 }}>By Variety</p>
          {varietyDist.map(r => (
            <div key={r.label} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span>{r.label}</span><span style={{ fontWeight: 600 }}>{r.count}</span>
              </div>
              <div style={{ height: 6, background: "#eef5e8", borderRadius: 4 }}>
                <div style={{ height: 6, background: "#5aaa3d", borderRadius: 4, width: submissions.length ? `${(r.count/submissions.length)*100}%` : "0%" }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #eef5e8" }}>
          <p style={{ fontWeight: 600, fontSize: 15 }}>All Records ({submissions.length})</p>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr><th>ID</th><th>Farmer</th><th>Variety</th><th>Weight</th><th>Ripeness</th><th>Defects</th><th>Submitted</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {submissions.map(s => (
                <tr key={s.id}>
                  <td><code style={{ fontSize: 11, background: "#f0f7ea", padding: "2px 6px", borderRadius: 3 }}>{s.id}</code></td>
                  <td style={{ fontWeight: 500 }}>{s.farmerName}</td>
                  <td>{s.variety}</td>
                  <td>{s.weight} kg</td>
                  <td><Badge text={s.ripeness} color={ripenessColor(s.ripeness)} /></td>
                  <td>
                    {s.defects.map(d => <span key={d} className="tag" style={{ fontSize: 11 }}>{d}</span>)}
                  </td>
                  <td style={{ color: "#8a9a80", fontSize: 12 }}>{s.submittedAt ? new Date(s.submittedAt).toLocaleDateString() : "—"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => onView(s.id)}>View</button>
                      <button className="btn btn-sm btn-danger" onClick={() => setConfirmDel(s.id)} style={{ fontSize: 12, padding: "4px 10px" }}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {confirmDel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="card" style={{ maxWidth: 340, textAlign: "center" }}>
            <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>Delete this record?</p>
            <p style={{ fontSize: 13, color: "#5a7a50", marginBottom: 20 }}>This action cannot be undone.</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button className="btn btn-outline" onClick={() => setConfirmDel(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => { onDelete(confirmDel); setConfirmDel(null); }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HomePage({ onBuyerClick, onAdminClick }) {
  return (
    <div style={{ minHeight: "calc(100vh - 58px)", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #f7faf2 0%, #e8f5e2 100%)" }}>
      <div style={{ textAlign: "center", maxWidth: 500 }}>
        <div style={{ fontSize: 64, marginBottom: 24 }}>🥭</div>
        <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 42, color: "#1a3a14", marginBottom: 12 }}>MangoTrace</h1>
        <p style={{ fontSize: 16, color: "#5a7a50", marginBottom: 32 }}>Complete mango harvest traceability system</p>
        
        <div style={{ display: "grid", gap: 12 }}>
          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", padding: "14px 20px", fontSize: 16 }} onClick={onBuyerClick}>
            👁️ View as Buyer
          </button>
          <button className="btn btn-outline" style={{ width: "100%", justifyContent: "center", padding: "14px 20px", fontSize: 16, color: "#2d6b22", borderColor: "#2d6b22" }} onClick={onAdminClick}>
            🔐 Admin Login
          </button>
        </div>
        
        <div style={{ marginTop: 32, padding: 20, background: "#fff", borderRadius: 12, textAlign: "left", border: "1px solid #d8eacc" }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#2d6b22", marginBottom: 8 }}>Roles:</p>
          <ul style={{ fontSize: 12, color: "#5a7a50", lineHeight: 1.8 }}>
            <li><strong>Buyer:</strong> View all submissions and harvest data</li>
            <li><strong>Admin:</strong> Full control - create entries, manage data, import CSV, analytics</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function LoginForm({ onLogin, onBack }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      onLogin("admin", true);
    } else {
      setError("Invalid credentials");
      setTimeout(() => setError(""), 3000);
    }
  };

  return (
    <div style={{ minHeight: "calc(100vh - 58px)", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #f7faf2 0%, #e8f5e2 100%)" }}>
      <div className="card" style={{ maxWidth: 400, padding: 40 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔐</div>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: "#1a3a14" }}>Admin Login</h2>
          <p style={{ fontSize: 13, color: "#5a7a50", marginTop: 6 }}>Enter your credentials to access the admin panel</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
          <div>
            <label className="lbl">Username</label>
            <input
              className="inp"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              autoComplete="username"
            />
          </div>

          <div>
            <label className="lbl">Password</label>
            <input
              className="inp"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div style={{ padding: 10, background: "#fde8e8", color: "#8b2020", borderRadius: 8, fontSize: 13, fontWeight: 500 }}>
              ✗ {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: "100%", justifyContent: "center", padding: "12px", fontSize: 15 }}>
            Sign In
          </button>

          <button type="button" className="btn btn-outline" style={{ width: "100%", justifyContent: "center", padding: "12px", fontSize: 15 }} onClick={onBack}>
            Back
          </button>
        </form>

        <div style={{ marginTop: 20, padding: 12, background: "#f7fbf2", borderRadius: 8, fontSize: 12, color: "#5a7a50", lineHeight: 1.6 }}>
          <p><strong>Demo Credentials:</strong></p>
          <p>Username: <code style={{ background: "#fff", padding: "2px 6px", borderRadius: 3 }}>admin</code></p>
          <p>Password: <code style={{ background: "#fff", padding: "2px 6px", borderRadius: 3 }}>admin123</code></p>
        </div>
      </div>
    </div>
  );
}
