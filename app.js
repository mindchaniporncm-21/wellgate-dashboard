const { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area } = window.Recharts;
/* ============================ data load ============================ */
const B64 = DATA_B64;
let D = null;
async function inflate(b64) {
    const bin = atob(b64), len = bin.length, bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++)
        bytes[i] = bin.charCodeAt(i);
    if (typeof DecompressionStream !== "undefined") {
        const ds = new DecompressionStream("gzip");
        const stream = new Blob([bytes]).stream().pipeThrough(ds);
        const ab = await new Response(stream).arrayBuffer();
        return JSON.parse(new TextDecoder("utf-8").decode(ab));
    }
    if (typeof pako !== "undefined")
        return JSON.parse(pako.inflate(bytes, { to: "string" }));
    throw new Error("เบราว์เซอร์นี้เก่าเกินไป กรุณาใช้ Chrome/Edge/Safari รุ่นใหม่");
}
/* ============================ tokens ============================ */
const T = {
    ink: "#171b26", canvas: "#f3f4f6", surface: "#ffffff", subtle: "#fafbfc",
    border: "#e5e7eb", muted: "#6b7280", faint: "#9ca3af",
    primary: "#0f766e", primarySoft: "#d5efec", primaryInk: "#0b5850",
    up: "#15803d", down: "#dc2626",
    /* neutral KPI accents — deliberately NOT matching any Channel/group color */
    k1: "#475569", k2: "#64748b", k3: "#78716c", k4: "#6b7280",
};
/* Channel colour guideline — fixed, meaningful */
const CH = {
    "MarketPlace": { c: "#E24B76", s: "#FBE0E8" }, "Online": { c: "#E08A2B", s: "#FBEAD3" },
    "Online_คุณอ้อย": { c: "#8A5CB8", s: "#EADFF4" }, "Online ขนมน้องRisa": { c: "#4E9A51", s: "#DEEEDF" },
    "Telesale": { c: "#3B7DC4", s: "#DAE8F6" },
};
const chColor = n => CH[n] ? CH[n].c : "#94a3b8";
/* fixed group-identity palette (28) — same colour used in overview bar AND cards */
const GCOL = ["#0f766e", "#b8492f", "#3b6fb0", "#7a5aa8", "#4e9a51", "#c2537a", "#c98a1e", "#5a8fa8",
    "#8a6d3b", "#9061c2", "#2f8f83", "#d06c4a", "#4a7fc0", "#a4497e", "#6a9a3e", "#b0803a", "#557a9b",
    "#8f5aa0", "#3f9a86", "#c25b5b", "#5566b0", "#996a2e", "#7a9a45", "#b04a6a", "#4d8a9a", "#a07a3a",
    "#6b5aa0", "#3d8a5f"];
let GKEYS = [];
const groupColor = key => GCOL[Math.max(0, GKEYS.indexOf(key)) % GCOL.length];
/* single-hue ranked fill: teal, darker = larger (magnitude meaning) */
const rankFill = (v, max) => { const t = max ? v / max : 0; return `rgba(15,118,110,${(0.30 + 0.65 * t).toFixed(3)})`; };
const THMON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const monShort = m => { const [y, mo] = m.split("-"); return THMON[+mo - 1]; };
const monY2 = m => { const [y, mo] = m.split("-"); return THMON[+mo - 1] + " " + String(+y + 543).slice(-2); };
let MONFULL = [];
const nf = new Intl.NumberFormat("th-TH");
const fi = n => nf.format(Math.round(n || 0));
const fc = n => { n = n || 0; return n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "K" : fi(n); };
const fb = n => "฿" + fi(n);
const fbc = n => "฿" + fc(n);
function downloadCSV(filename, rows) {
    const csv = rows.map(r => r.map(c => { const s = (c == null ? "" : String(c)); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const CSV_BTN = { fontSize: 11.5, padding: "6px 12px", borderRadius: 7, border: "1px solid " + "#0f766e", background: "#fff", color: "#0f766e", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" };
/* ============================ cross-filter engine ============================ */
const DIMS = ["region", "prov", "channel", "page", "team", "sales", "set", "ship"];
const FILT_KEYS = ["master", "sku", "prefix", ...DIMS];
const emptyFilters = () => ({ master: [], sku: [], prefix: [], region: [], prov: [], channel: [], page: [], team: [], sales: [], set: [], ship: [] });
function computeAll(gkey, filters, range, cmpRange) {
    const G = D.g[gkey], F = G.fact, meta = G.meta, n = F.s.length, [a, b] = range;
    const S = {};
    for (const k of DIMS)
        S[k] = (filters[k] && filters[k].length) ? new Set(filters[k]) : null;
    const Ssku = (filters.sku && filters.sku.length) ? new Set(filters.sku) : null;
    const pfx = (filters.prefix && filters.prefix.length) ? new Set(filters.prefix) : null;
    const mst = (filters.master && filters.master.length) ? new Set(filters.master) : null;
    const monthly = Array.from({ length: MONFULL.length }, () => ({ q: 0, o: 0 }));
    const tot = { q: 0, r: 0, o: 0 }, cmp = { q: 0, r: 0, o: 0 };
    const bySku = {}, byDim = {};
    for (const d of DIMS)
        byDim[d] = {};
    const acc = (o, k, q, ord) => { const e = o[k] || (o[k] = { q: 0, o: 0 }); e.q += q; e.o += ord; };
    for (let i = 0; i < n; i++) {
        const sid = F.s[i];
        if (mst && !mst.has(meta[sid].base))
            continue;
        if (Ssku && !Ssku.has(sid))
            continue;
        if (pfx && !pfx.has(meta[sid].prefix))
            continue;
        let ok = true;
        for (const k of DIMS) {
            if (S[k] && !S[k].has(F[k][i])) {
                ok = false;
                break;
            }
        }
        if (!ok)
            continue;
        const m = F.mi[i], q = F.q[i], r = F.r[i], o = F.o[i];
        monthly[m].q += q;
        monthly[m].o += o;
        if (m >= a && m <= b) {
            tot.q += q;
            tot.r += r;
            tot.o += o;
            const bs = bySku[sid] || (bySku[sid] = { q: 0, r: 0, o: 0 });
            bs.q += q;
            bs.r += r;
            bs.o += o;
            for (const d of DIMS)
                acc(byDim[d], F[d][i], q, o);
        }
        if (cmpRange && m >= cmpRange[0] && m <= cmpRange[1]) {
            cmp.q += q;
            cmp.r += r;
            cmp.o += o;
        }
    }
    // exact distinct orders (from precomputed monthly) when NO customer filter is active
    const anyFilter = FILT_KEYS.some(k => filters[k] && filters[k].length);
    let ordExact = false;
    if (!anyFilter && G.mord) {
        ordExact = true;
        for (let m = 0; m < monthly.length; m++)
            monthly[m].o = G.mord[m] || 0;
        let to = 0;
        for (let m = a; m <= b; m++)
            to += G.mord[m] || 0;
        tot.o = to;
        if (cmpRange) {
            let co = 0;
            for (let m = cmpRange[0]; m <= cmpRange[1]; m++)
                co += G.mord[m] || 0;
            cmp.o = co;
        }
    }
    return { monthly, tot, cmp: cmpRange ? cmp : null, bySku, byDim, ordExact };
}
/* daily / weekly series for the selected group, respecting period + channel filter (group-level) */
function computeDaily(gkey, filters, range, mode) {
    const G = D.g[gkey], dl = G.daily;
    if (!dl)
        return [];
    const [a, b] = range;
    const chSet = (filters.channel && filters.channel.length) ? new Set(filters.channel) : null;
    // month range -> date string bounds
    const lo = D.months[a] + "-01";
    const [by, bm] = D.months[b].split("-");
    const hiN = String(+bm).padStart(2, "0");
    const hi = D.months[b] + "-31";
    const buckets = new Map();
    for (let i = 0; i < dl.d.length; i++) {
        if (chSet && !chSet.has(dl.c[i]))
            continue;
        const ds = D.dates[dl.d[i]];
        if (ds < lo || ds > hi)
            continue;
        let key;
        if (mode === "week") {
            const dt = new Date(ds + "T00:00:00Z");
            const day = dt.getUTCDay();
            const mon = new Date(dt);
            mon.setUTCDate(dt.getUTCDate() - ((day + 6) % 7));
            key = mon.toISOString().slice(0, 10);
        }
        else
            key = ds;
        const e = buckets.get(key) || { k: key, q: 0, o: 0, r: 0 };
        e.q += dl.q[i];
        e.o += dl.o[i];
        e.r += dl.r[i];
        buckets.set(key, e);
    }
    return [...buckets.values()].sort((x, y) => x.k < y.k ? -1 : 1);
}
function facetCounts(gkey, filters, range, target) {
    const G = D.g[gkey], F = G.fact, meta = G.meta, n = F.s.length, [a, b] = range;
    const S = {};
    for (const k of DIMS)
        S[k] = (k !== target && filters[k] && filters[k].length) ? new Set(filters[k]) : null;
    const Ssku = (target !== "sku" && filters.sku && filters.sku.length) ? new Set(filters.sku) : null;
    const pfx = (target !== "prefix" && filters.prefix && filters.prefix.length) ? new Set(filters.prefix) : null;
    const mst = (target !== "master" && filters.master && filters.master.length) ? new Set(filters.master) : null;
    const out = new Map();
    for (let i = 0; i < n; i++) {
        const m = F.mi[i];
        if (m < a || m > b)
            continue;
        const sid = F.s[i];
        if (mst && !mst.has(meta[sid].base))
            continue;
        if (Ssku && !Ssku.has(sid))
            continue;
        if (pfx && !pfx.has(meta[sid].prefix))
            continue;
        let ok = true;
        for (const k of DIMS) {
            if (S[k] && !S[k].has(F[k][i])) {
                ok = false;
                break;
            }
        }
        if (!ok)
            continue;
        let key;
        if (target === "master")
            key = meta[sid].base;
        else if (target === "sku")
            key = sid;
        else if (target === "prefix")
            key = meta[sid].prefix;
        else
            key = F[target][i];
        out.set(key, (out.get(key) || 0) + F.o[i]);
    }
    return out;
}
/* sorted rows from a byDim map using group dict labels */
function dimRows(map, dict, { top, dropRegionBlank } = {}) {
    let rows = Object.entries(map).map(([k, v]) => ({ k: +k, n: dict[+k], q: v.q, o: v.o }));
    if (dropRegionBlank)
        rows = rows.filter(r => r.n !== "ว่างเปล่า" && r.n !== "ไม่ระบุที่อยู่");
    rows.sort((x, y) => y.o - x.o);
    return top ? rows.slice(0, top) : rows;
}
/* ============================ tiny UI ============================ */
function Delta({ cur, prev, invert }) {
    if (prev == null)
        return null;
    if (prev === 0)
        return React.createElement("span", { style: { fontSize: 11, color: T.faint, marginLeft: 6 } }, "\u0E43\u0E2B\u0E21\u0E48");
    const d = ((cur - prev) / prev) * 100, good = invert ? d < 0 : d >= 0;
    return React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: good ? T.up : T.down, marginLeft: 6 } },
        d >= 0 ? "▲" : "▼",
        " ",
        Math.abs(d).toFixed(1),
        "%");
}
function Kpi({ label, value, sub, delta, accent }) {
    return (React.createElement("div", { style: { background: T.surface, border: "1px solid " + T.border, borderRadius: 11, padding: "14px 15px", borderLeft: "4px solid " + (accent || T.primary) } },
        React.createElement("div", { style: { fontSize: 11, color: T.muted, marginBottom: 5 } }, label),
        React.createElement("div", { style: { fontSize: 20, fontWeight: 800, color: T.ink, letterSpacing: "-.4px", lineHeight: 1 } },
            value,
            delta),
        sub != null && React.createElement("div", { style: { fontSize: 10.5, color: T.faint, marginTop: 4 } }, sub)));
}
function Card({ title, hint, children, pad = 16 }) {
    return (React.createElement("div", { style: { background: T.surface, border: "1px solid " + T.border, borderRadius: 12, padding: pad } },
        title && React.createElement("div", { style: { display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12, gap: 8 } },
            React.createElement("h3", { style: { margin: 0, fontSize: 14, fontWeight: 800, color: T.ink } }, title),
            hint && React.createElement("span", { style: { fontSize: 11, color: T.faint, textAlign: "right" } }, hint)),
        children));
}
function TypeBadge({ t }) {
    const map = { "ขาย": T.primary, "Set": "#3b6fb0", "ของแถม": "#b06a2e", "Tester": "#c2537a" };
    return React.createElement("span", { style: { background: map[t] || T.faint, color: "#fff", borderRadius: 5, padding: "2px 7px", fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap" } }, t);
}
function RankBars({ rows, unit, channelColour }) {
    const max = Math.max(1, ...rows.map(r => r.o));
    return (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 7 } },
        rows.map((r, i) => (React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 9 } },
            React.createElement("div", { style: { width: 132, fontSize: 11.5, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "right", flexShrink: 0 }, title: r.n }, r.n),
            React.createElement("div", { style: { flex: 1, background: "#f1f2f4", borderRadius: 5, height: 18, position: "relative", overflow: "hidden" } },
                React.createElement("div", { style: { position: "absolute", inset: 0, width: (r.o / max * 100) + "%", background: channelColour ? chColor(r.n) : rankFill(r.o, max), borderRadius: 5, transition: "width .3s" } })),
            React.createElement("div", { style: { width: 80, fontSize: 11.5, fontWeight: 700, color: T.ink, textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums" } },
                fi(r.o),
                " ",
                React.createElement("span", { style: { fontWeight: 400, color: T.faint, fontSize: 10 } }, unit))))),
        rows.length === 0 && React.createElement("div", { style: { fontSize: 12, color: T.faint, padding: "8px 0" } }, "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E43\u0E19\u0E40\u0E07\u0E37\u0E48\u0E2D\u0E19\u0E44\u0E02\u0E17\u0E35\u0E48\u0E40\u0E25\u0E37\u0E2D\u0E01")));
}
const selStyle = { fontSize: 12, padding: "6px 8px", borderRadius: 7, border: "1px solid " + T.border, background: T.surface, color: T.ink, cursor: "pointer" };
function DataGuide({ items, note }) {
    return (React.createElement("div", { style: { background: T.subtle, border: "1px dashed " + T.border, borderRadius: 12, padding: "14px 18px", marginTop: 20 } },
        React.createElement("div", { style: { fontSize: 12.5, fontWeight: 800, color: T.ink, marginBottom: 8 } }, "\uD83D\uDCD6 \u0E04\u0E33\u0E2D\u0E18\u0E34\u0E1A\u0E32\u0E22\u0E01\u0E32\u0E23\u0E14\u0E39\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E2B\u0E19\u0E49\u0E32\u0E19\u0E35\u0E49 (Data Dictionary)"),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: "6px 22px" } }, items.map(([term, desc], i) => (React.createElement("div", { key: i, style: { fontSize: 11.5, color: T.muted, lineHeight: 1.5 } },
            React.createElement("b", { style: { color: T.ink } }, term),
            " \u2014 ",
            desc)))),
        note && React.createElement("div", { style: { fontSize: 11, color: T.faint, marginTop: 9, paddingTop: 8, borderTop: "1px solid " + T.border } },
            "\uD83D\uDCA1 ",
            note)));
}
/* ============================ orientation helpers ============================ */
function SectionHead({ title, desc, right }) {
    return (React.createElement("div", { style: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, margin: "22px 0 12px" } },
        React.createElement("div", null,
            React.createElement("h3", { style: { margin: 0, fontSize: 16, fontWeight: 800, color: T.ink, letterSpacing: "-.2px" } }, title),
            desc && React.createElement("div", { style: { fontSize: 12, color: T.muted, marginTop: 3 } }, desc)),
        right));
}
function ChannelLegend({ compact }) {
    const items = Object.keys(CH);
    return (React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: compact ? 10 : 14, alignItems: "center" } },
        !compact && React.createElement("span", { style: { fontSize: 11.5, fontWeight: 700, color: T.muted } }, "\u0E0A\u0E48\u0E2D\u0E07\u0E17\u0E32\u0E07\u0E02\u0E32\u0E22:"),
        items.map(n => (React.createElement("span", { key: n, style: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: T.ink } },
            React.createElement("span", { style: { width: 11, height: 11, borderRadius: 3, background: chColor(n), flexShrink: 0 } }),
            n)))));
}
function GlobalSearch({ onJump }) {
    const [q, setQ] = useState("");
    const idx = useMemo(() => {
        const a = [];
        for (const grp of D.groups) {
            const g = D.g[grp.key];
            const seen = new Set();
            g.meta.forEach(m => {
                if (!seen.has(m.base)) {
                    seen.add(m.base);
                    a.push({ gk: grp.key, gname: grp.name, code: m.base, name: m.name, master: true });
                }
                a.push({ gk: grp.key, gname: grp.name, code: m.sku, name: m.name, master: false });
            });
        }
        return a;
    }, []);
    const res = useMemo(() => {
        if (q.trim().length < 2)
            return [];
        const s = q.toLowerCase();
        return idx.filter(x => x.code.toLowerCase().includes(s) || x.name.toLowerCase().includes(s)).slice(0, 40);
    }, [q, idx]);
    return (React.createElement("div", { style: { position: "relative", marginBottom: 14 } },
        React.createElement("input", { value: q, onChange: e => setQ(e.target.value), placeholder: "\uD83D\uDD0D \u0E04\u0E49\u0E19\u0E2B\u0E32\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32\u0E17\u0E38\u0E01\u0E01\u0E25\u0E38\u0E48\u0E21 \u2014 \u0E1E\u0E34\u0E21\u0E1E\u0E4C\u0E23\u0E2B\u0E31\u0E2A\u0E2B\u0E23\u0E37\u0E2D\u0E0A\u0E37\u0E48\u0E2D\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32 (\u0E40\u0E0A\u0E48\u0E19 X1R, \u0E07\u0E32\u0E14\u0E33, W1X1REN)", style: { width: "100%", boxSizing: "border-box", fontSize: 13.5, padding: "12px 15px", borderRadius: 11, border: "1px solid " + T.border, background: T.surface, color: T.ink } }),
        res.length > 0 && (React.createElement("div", { style: { position: "absolute", top: "100%", left: 0, right: 0, marginTop: 5, background: T.surface, border: "1px solid " + T.border, borderRadius: 11, boxShadow: "0 12px 32px rgba(0,0,0,.14)", zIndex: 30, maxHeight: 340, overflowY: "auto", padding: 6 } }, res.map((x, i) => (React.createElement("button", { key: i, onClick: () => { onJump(x.gk, x.master ? null : x.code, x.master ? x.code : null); setQ(""); }, style: { display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "8px 10px", border: "none", background: "transparent", cursor: "pointer", borderRadius: 8 }, onMouseOver: e => e.currentTarget.style.background = T.subtle, onMouseOut: e => e.currentTarget.style.background = "transparent" },
            React.createElement("span", { style: { width: 9, height: 9, borderRadius: 2, background: groupColor(x.gk), flexShrink: 0 } }),
            React.createElement("span", { style: { fontFamily: "ui-monospace,monospace", fontSize: 11, color: T.ink, minWidth: 110 } }, x.code),
            React.createElement("span", { style: { flex: 1, fontSize: 12.5, color: T.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, x.name),
            x.master && React.createElement("span", { style: { fontSize: 9.5, fontWeight: 700, color: T.primaryInk, background: T.primarySoft, borderRadius: 4, padding: "1px 6px" } }, "\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32\u0E2B\u0E25\u0E31\u0E01"),
            React.createElement("span", { style: { fontSize: 10.5, color: T.faint, whiteSpace: "nowrap" } },
                x.gname,
                " \u2192")))))),
        q.trim().length >= 2 && res.length === 0 && React.createElement("div", { style: { position: "absolute", top: "100%", left: 0, marginTop: 5, fontSize: 12, color: T.faint, padding: "8px 12px", background: T.surface, border: "1px solid " + T.border, borderRadius: 10 } },
            "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32\u0E17\u0E35\u0E48\u0E15\u0E23\u0E07\u0E01\u0E31\u0E1A \"",
            q,
            "\"")));
}
function HowToUse() {
    const steps = [["1", "เลือกช่วงเวลา", "ปุ่มลัด/ไตรมาส หรือเลือกเดือนเอง แล้วเปิด \"เทียบ\" เพื่อดูโต/ลด"],
        ["2", "เลือกกลุ่มสินค้า", "คลิกการ์ดสินค้าด้านล่างเพื่อเจาะเข้าไปดูรายละเอียด"],
        ["3", "กรอง & เจาะลึก", "ใช้ตัวกรองลูกค้า (เลือกได้หลายรายการ) ดูว่าใครซื้อ ที่ไหน ช่องทางไหน"]];
    return (React.createElement("div", { style: { background: "linear-gradient(180deg,#ffffff," + T.subtle + ")", border: "1px solid " + T.border, borderRadius: 14, padding: "16px 18px", marginBottom: 14 } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" } },
            React.createElement("span", { style: { fontSize: 14, fontWeight: 800, color: T.ink } }, "\u0E40\u0E27\u0E47\u0E1A\u0E19\u0E35\u0E49\u0E43\u0E0A\u0E49\u0E14\u0E39\u0E2D\u0E30\u0E44\u0E23"),
            React.createElement("span", { style: { fontSize: 12.5, color: T.muted } },
                "\u0E14\u0E39\u0E27\u0E48\u0E32\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32\u0E15\u0E31\u0E27\u0E44\u0E2B\u0E19 ",
                React.createElement("b", { style: { color: T.ink } }, "\u0E02\u0E32\u0E22\u0E14\u0E35"),
                " \u00B7 \u0E25\u0E39\u0E01\u0E04\u0E49\u0E32",
                React.createElement("b", { style: { color: T.ink } }, "\u0E2D\u0E22\u0E39\u0E48\u0E20\u0E32\u0E04/\u0E08\u0E31\u0E07\u0E2B\u0E27\u0E31\u0E14\u0E44\u0E2B\u0E19"),
                " \u00B7 \u0E21\u0E32\u0E08\u0E32\u0E01",
                React.createElement("b", { style: { color: T.ink } }, "\u0E0A\u0E48\u0E2D\u0E07\u0E17\u0E32\u0E07\u0E44\u0E2B\u0E19"),
                " \u00B7 \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E27\u0E32\u0E07\u0E41\u0E1C\u0E19\u0E01\u0E32\u0E23\u0E15\u0E25\u0E32\u0E14\u0E41\u0E25\u0E30\u0E22\u0E34\u0E07\u0E42\u0E06\u0E29\u0E13\u0E32")),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 10 } }, steps.map(([n, t, d]) => (React.createElement("div", { key: n, style: { display: "flex", gap: 11, alignItems: "flex-start", background: T.surface, border: "1px solid " + T.border, borderRadius: 10, padding: "11px 13px" } },
            React.createElement("span", { style: { width: 26, height: 26, borderRadius: "50%", background: T.primary, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flexShrink: 0 } }, n),
            React.createElement("div", null,
                React.createElement("div", { style: { fontSize: 13, fontWeight: 800, color: T.ink } }, t),
                React.createElement("div", { style: { fontSize: 11.5, color: T.muted, marginTop: 2, lineHeight: 1.4 } }, d))))))));
}
/* ============================ MultiSelect ============================ */
function MultiSelect({ label, options, selected, onChange, colourKey }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const sel = new Set(selected);
    const filtered = q ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : options;
    const toggle = v => { const s = new Set(selected); s.has(v) ? s.delete(v) : s.add(v); onChange([...s]); };
    const active = selected.length > 0;
    return (React.createElement("div", { style: { position: "relative", minWidth: 0 } },
        React.createElement("div", { style: { fontSize: 10, color: T.muted, fontWeight: 600, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, label),
        React.createElement("button", { onClick: () => setOpen(o => !o), style: { width: "100%", display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "7px 9px", borderRadius: 8,
                border: "1px solid " + (active ? T.primary : T.border), background: active ? T.primarySoft : T.surface, color: T.ink, cursor: "pointer", fontWeight: active ? 700 : 400, textAlign: "left" } },
            React.createElement("span", { style: { flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, active ? (selected.length === 1 ? (options.find(o => o.v === selected[0]) || {}).label || "1 รายการ" : selected.length + " รายการ") : "ทั้งหมด"),
            React.createElement("span", { style: { fontSize: 9, color: T.faint } }, "\u25BE")),
        open && (React.createElement(React.Fragment, null,
            React.createElement("div", { onClick: () => setOpen(false), style: { position: "fixed", inset: 0, zIndex: 40 } }),
            React.createElement("div", { style: { position: "absolute", top: "100%", left: 0, marginTop: 4, width: 270, maxWidth: "80vw", background: T.surface, border: "1px solid " + T.border,
                    borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,.14)", zIndex: 41, padding: 8 } },
                React.createElement("input", { autoFocus: true, value: q, onChange: e => setQ(e.target.value), placeholder: "\u0E04\u0E49\u0E19\u0E2B\u0E32\u2026", style: { width: "100%", boxSizing: "border-box", fontSize: 12, padding: "6px 8px", borderRadius: 6, border: "1px solid " + T.border, marginBottom: 6 } }),
                React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 6, padding: "0 2px" } },
                    React.createElement("span", { style: { fontSize: 10.5, color: T.faint } },
                        filtered.length,
                        " \u0E15\u0E31\u0E27\u0E40\u0E25\u0E37\u0E2D\u0E01"),
                    active && React.createElement("button", { onClick: () => onChange([]), style: { fontSize: 10.5, color: T.primary, background: "none", border: "none", cursor: "pointer", fontWeight: 700 } }, "\u0E25\u0E49\u0E32\u0E07")),
                React.createElement("div", { style: { maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 1 } },
                    filtered.map(o => {
                        const on = sel.has(o.v);
                        return (React.createElement("label", { key: o.v, style: { display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", borderRadius: 6, cursor: "pointer", background: on ? T.primarySoft : "transparent", fontSize: 12 }, onMouseOver: e => { if (!on)
                                e.currentTarget.style.background = T.subtle; }, onMouseOut: e => { if (!on)
                                e.currentTarget.style.background = "transparent"; } },
                            React.createElement("input", { type: "checkbox", checked: on, onChange: () => toggle(o.v), style: { accentColor: T.primary } }),
                            colourKey && React.createElement("span", { style: { width: 9, height: 9, borderRadius: 2, background: chColor(o.label), flexShrink: 0 } }),
                            React.createElement("span", { style: { flex: 1, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, title: o.label }, o.label),
                            React.createElement("span", { style: { fontSize: 10.5, color: T.faint, fontVariantNumeric: "tabular-nums" } }, fi(o.count))));
                    }),
                    filtered.length === 0 && React.createElement("div", { style: { fontSize: 11.5, color: T.faint, padding: 8, textAlign: "center" } }, "\u0E44\u0E21\u0E48\u0E1E\u0E1A")))))));
}
/* ============================ Period Bar ============================ */
const QUARTERS = [["Q1/25", 0, 2], ["Q2/25", 3, 5], ["Q3/25", 6, 8], ["Q4/25", 9, 11], ["Q1/26", 12, 14], ["Q2/26", 15, 17]];
const QUICK = [["ทั้งหมด", 0, 17], ["12 เดือนล่าสุด", 6, 17], ["6 เดือนล่าสุด", 12, 17], ["3 เดือนล่าสุด", 15, 17], ["ปี 2025", 0, 11], ["ปี 2026 (H1)", 12, 17]];
function PeriodBar({ range, setRange, compare, setCompare, monthly, cmpRange }) {
    const [from, to] = range;
    const [showHelp, setShowHelp] = useState(false);
    const vals = monthly.map(m => m.o);
    const maxV = Math.max(1, ...vals);
    const act = (a, b) => a === from && b === to;
    const btn = on => ({ padding: "6px 11px", fontSize: 12, borderRadius: 7, cursor: "pointer", border: "1px solid " + (on ? T.ink : T.border), background: on ? T.ink : T.surface, color: on ? "#fff" : T.muted, fontWeight: on ? 700 : 500, whiteSpace: "nowrap" });
    return (React.createElement("div", { style: { background: T.surface, border: "1px solid " + T.border, borderRadius: 12, padding: "14px 16px", marginBottom: 14 } },
        React.createElement("div", { style: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 7 } },
            React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: T.ink, marginRight: 2 } }, "\u0E0A\u0E48\u0E27\u0E07\u0E40\u0E27\u0E25\u0E32"),
            QUICK.map(([l, a, b]) => React.createElement("button", { key: l, style: btn(act(a, b)), onClick: () => setRange([a, b]) }, l)),
            React.createElement("span", { style: { width: 1, height: 20, background: T.border, margin: "0 3px" } }),
            React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: T.muted } }, "\u0E44\u0E15\u0E23\u0E21\u0E32\u0E2A"),
            QUARTERS.map(([l, a, b]) => React.createElement("button", { key: l, style: btn(act(a, b)), onClick: () => setRange([a, b]) }, l))),
        React.createElement("div", { style: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 11 } },
            React.createElement("span", { style: { fontSize: 12, color: T.muted } }, "\u0E08\u0E32\u0E01"),
            React.createElement("select", { value: from, onChange: e => { const v = +e.target.value; setRange([v, Math.max(v, to)]); }, style: { ...selStyle, maxWidth: 150 } }, MONFULL.map((m, i) => React.createElement("option", { key: i, value: i }, monY2(D.months[i])))),
            React.createElement("span", { style: { fontSize: 12, color: T.muted } }, "\u0E16\u0E36\u0E07"),
            React.createElement("select", { value: to, onChange: e => { const v = +e.target.value; setRange([Math.min(from, v), v]); }, style: { ...selStyle, maxWidth: 150 } }, MONFULL.map((m, i) => React.createElement("option", { key: i, value: i, disabled: i < from }, monY2(D.months[i])))),
            React.createElement("button", { style: { ...btn(false), color: T.muted }, onClick: () => setRange([0, 17]) }, "\u0E23\u0E35\u0E40\u0E0B\u0E47\u0E15"),
            React.createElement("span", { style: { width: 1, height: 20, background: T.border, margin: "0 3px" } }),
            React.createElement("span", { style: { fontSize: 12, color: T.muted } }, "\u0E40\u0E17\u0E35\u0E22\u0E1A\u0E01\u0E31\u0E1A"),
            [["ช่วงก่อนหน้า", "prev"], ["ปีก่อน", "yoy"], ["ไม่เทียบ", "none"]].map(([l, v]) => React.createElement("button", { key: v, style: btn(compare === v), onClick: () => setCompare(v) }, l)),
            React.createElement("div", { style: { marginLeft: "auto", textAlign: "right" } },
                React.createElement("div", { style: { fontSize: 13, fontWeight: 800, color: T.ink } },
                    MONFULL[from],
                    " ",
                    React.createElement("span", { style: { color: T.faint } }, "\u2192"),
                    " ",
                    MONFULL[to]),
                React.createElement("div", { style: { fontSize: 11, color: T.faint } },
                    to - from + 1,
                    " \u0E40\u0E14\u0E37\u0E2D\u0E19"))),
        React.createElement("div", { style: { marginTop: 10, fontSize: 11.5, lineHeight: 1.5, color: T.muted, background: T.subtle, border: "1px solid " + T.border, borderRadius: 8, padding: "8px 11px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
            React.createElement("span", null, compare === "none"
                ? React.createElement(React.Fragment, null,
                    "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E40\u0E1B\u0E34\u0E14\u0E01\u0E32\u0E23\u0E40\u0E17\u0E35\u0E22\u0E1A \u2014 \u0E01\u0E14 ",
                    React.createElement("b", { style: { color: T.ink } }, "\u0E0A\u0E48\u0E27\u0E07\u0E01\u0E48\u0E2D\u0E19\u0E2B\u0E19\u0E49\u0E32"),
                    " \u0E2B\u0E23\u0E37\u0E2D ",
                    React.createElement("b", { style: { color: T.ink } }, "\u0E1B\u0E35\u0E01\u0E48\u0E2D\u0E19"),
                    " \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E43\u0E2B\u0E49\u0E17\u0E38\u0E01\u0E01\u0E32\u0E23\u0E4C\u0E14\u0E02\u0E36\u0E49\u0E19 \u25B2\u25BC % \u0E42\u0E15/\u0E25\u0E14")
                : React.createElement(React.Fragment, null,
                    "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E40\u0E17\u0E35\u0E22\u0E1A ",
                    React.createElement("b", { style: { color: T.ink } },
                        MONFULL[from],
                        "\u2013",
                        MONFULL[to]),
                    " \u0E01\u0E31\u0E1A ",
                    cmpRange ? React.createElement("b", { style: { color: T.down } },
                        MONFULL[cmpRange[0]],
                        "\u2013",
                        MONFULL[cmpRange[1]]) : React.createElement("b", { style: { color: T.faint } }, "\u0E44\u0E21\u0E48\u0E21\u0E35 (\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E22\u0E49\u0E2D\u0E19\u0E44\u0E21\u0E48\u0E1E\u0E2D)"),
                    " \u00B7 ",
                    React.createElement("span", { style: { color: T.up, fontWeight: 700 } }, "\u25B2\u0E40\u0E02\u0E35\u0E22\u0E27=\u0E42\u0E15"),
                    " ",
                    React.createElement("span", { style: { color: T.down, fontWeight: 700 } }, "\u25BC\u0E41\u0E14\u0E07=\u0E25\u0E14"))),
            React.createElement("button", { onClick: () => setShowHelp(h => !h), style: { marginLeft: "auto", fontSize: 11, color: T.primary, background: "none", border: "none", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" } }, showHelp ? "ซ่อนวิธีเทียบ ▲" : "วิธีเทียบช่วง ▾")),
        showHelp && (React.createElement("div", { style: { marginTop: 6, fontSize: 11.5, lineHeight: 1.6, color: T.muted, background: "#fff", border: "1px solid " + T.border, borderRadius: 8, padding: "10px 13px" } },
            React.createElement("div", null,
                React.createElement("b", { style: { color: T.ink } }, "\u0E0A\u0E48\u0E27\u0E07\u0E01\u0E48\u0E2D\u0E19\u0E2B\u0E19\u0E49\u0E32"),
                " \u2014 \u0E40\u0E17\u0E35\u0E22\u0E1A\u0E01\u0E31\u0E1A\u0E0A\u0E48\u0E27\u0E07\u0E17\u0E35\u0E48\u0E22\u0E32\u0E27\u0E40\u0E17\u0E48\u0E32\u0E01\u0E31\u0E19\u0E0B\u0E36\u0E48\u0E07\u0E2D\u0E22\u0E39\u0E48\u0E15\u0E34\u0E14\u0E01\u0E31\u0E19\u0E01\u0E48\u0E2D\u0E19\u0E2B\u0E19\u0E49\u0E32 \u0E40\u0E0A\u0E48\u0E19 \u0E40\u0E25\u0E37\u0E2D\u0E01 3 \u0E40\u0E14\u0E37\u0E2D\u0E19\u0E25\u0E48\u0E32\u0E2A\u0E38\u0E14 (\u0E40\u0E21.\u0E22.\u2013\u0E21\u0E34.\u0E22.) \u0E08\u0E30\u0E40\u0E17\u0E35\u0E22\u0E1A\u0E01\u0E31\u0E1A 3 \u0E40\u0E14\u0E37\u0E2D\u0E19\u0E01\u0E48\u0E2D\u0E19\u0E2B\u0E19\u0E49\u0E32 (\u0E21.\u0E04.\u2013\u0E21\u0E35.\u0E04.) \u0E40\u0E2B\u0E21\u0E32\u0E30\u0E14\u0E39\u0E27\u0E48\u0E32\u0E0A\u0E48\u0E27\u0E07\u0E19\u0E35\u0E49\u0E14\u0E35\u0E02\u0E36\u0E49\u0E19\u0E2B\u0E23\u0E37\u0E2D\u0E41\u0E22\u0E48\u0E25\u0E07\u0E01\u0E27\u0E48\u0E32\u0E0A\u0E48\u0E27\u0E07\u0E17\u0E35\u0E48\u0E1C\u0E48\u0E32\u0E19\u0E21\u0E32"),
            React.createElement("div", { style: { marginTop: 4 } },
                React.createElement("b", { style: { color: T.ink } }, "\u0E1B\u0E35\u0E01\u0E48\u0E2D\u0E19 (YoY)"),
                " \u2014 \u0E40\u0E17\u0E35\u0E22\u0E1A\u0E01\u0E31\u0E1A\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E40\u0E14\u0E35\u0E22\u0E27\u0E01\u0E31\u0E19\u0E02\u0E2D\u0E07\u0E1B\u0E35\u0E17\u0E35\u0E48\u0E41\u0E25\u0E49\u0E27 (\u221212 \u0E40\u0E14\u0E37\u0E2D\u0E19) \u0E40\u0E2B\u0E21\u0E32\u0E30\u0E14\u0E39\u0E01\u0E32\u0E23\u0E40\u0E15\u0E34\u0E1A\u0E42\u0E15\u0E41\u0E1A\u0E1A\u0E15\u0E31\u0E14\u0E1C\u0E25\u0E24\u0E14\u0E39\u0E01\u0E32\u0E25\u0E2D\u0E2D\u0E01 \u00B7 \u0E16\u0E49\u0E32\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E22\u0E49\u0E2D\u0E19\u0E2B\u0E25\u0E31\u0E07\u0E44\u0E21\u0E48\u0E1E\u0E2D\u0E08\u0E30\u0E02\u0E36\u0E49\u0E19 \"\u0E44\u0E21\u0E48\u0E21\u0E35\""))),
        React.createElement("div", { style: { marginTop: 11 } },
            React.createElement("div", { style: { fontSize: 10.5, color: T.faint, marginBottom: 2 } },
                "\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C\u0E23\u0E32\u0E22\u0E40\u0E14\u0E37\u0E2D\u0E19 \u2014 \u0E04\u0E25\u0E34\u0E01\u0E41\u0E17\u0E48\u0E07\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E1B\u0E23\u0E31\u0E1A\u0E0A\u0E48\u0E27\u0E07 (\u0E41\u0E17\u0E48\u0E07",
                React.createElement("span", { style: { color: T.primary, fontWeight: 700 } }, "\u0E40\u0E02\u0E35\u0E22\u0E27"),
                "=\u0E0A\u0E48\u0E27\u0E07\u0E17\u0E35\u0E48\u0E40\u0E25\u0E37\u0E2D\u0E01)"),
            React.createElement("div", { style: { display: "flex", alignItems: "flex-end", gap: 3, height: 52, borderTop: "1px solid " + T.border, paddingTop: 8 } }, vals.map((v, i) => {
                const inR = i >= from && i <= to, inC = cmpRange && i >= cmpRange[0] && i <= cmpRange[1];
                return React.createElement("div", { key: i, title: MONFULL[i] + ": " + fi(v) + " ออเดอร์", onClick: () => { i < from ? setRange([i, to]) : setRange([from, i]); }, style: { flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", cursor: "pointer" } },
                    React.createElement("div", { style: { height: Math.max(3, (v / maxV) * 46), borderRadius: "3px 3px 0 0", background: inR ? T.primary : (inC ? "#f0b8b8" : "#e5e7eb"), outline: inC && !inR ? "1px dashed " + T.down : "none" } }));
            })),
            React.createElement("div", { style: { display: "flex", gap: 3, marginTop: 4 } }, vals.map((v, i) => React.createElement("div", { key: i, style: { flex: 1, textAlign: "center", fontSize: 9, color: (i >= from && i <= to) ? T.ink : T.faint, fontWeight: (i >= from && i <= to) ? 700 : 400 } }, monShort(D.months[i])))),
            React.createElement("div", { style: { display: "flex", marginTop: 2 } },
                React.createElement("div", { style: { flex: 12, textAlign: "center", fontSize: 10, color: T.faint, borderTop: "1px solid " + T.border, paddingTop: 2 } }, "2025"),
                React.createElement("div", { style: { flex: 6, textAlign: "center", fontSize: 10, color: T.faint, borderTop: "1px solid " + T.border, paddingTop: 2, marginLeft: 3 } }, "2026")))));
}
/* ============================ Filter Bar (group-level, all tabs) ============================ */
const PFX_OPTS = [{ v: "N_", label: "N_ · MarketPlace" }, { v: "X_", label: "X_ · Online" }];
const DIM_LABEL = { region: "ภาค", prov: "จังหวัด", channel: "Channel", page: "เพจ/ร้าน · ช่องทางติดต่อ", team: "ทีม Telesale", sales: "พนักงานขาย", set: "รหัส SET", ship: "ขนส่ง" };
function FilterBar({ gkey, filters, setFilters, range }) {
    const [open, setOpen] = useState(false);
    const G = D.g[gkey];
    const set = (k, v) => setFilters({ ...filters, [k]: v });
    const activeN = FILT_KEYS.reduce((s, k) => s + (filters[k].length ? 1 : 0), 0);
    // facets (linked): recompute options for each filter given the others + period
    // representative name + variant count per master (base) code
    const masterInfo = useMemo(() => {
        const info = {};
        G.meta.forEach(m => {
            const e = info[m.base] || (info[m.base] = { name: m.name, vars: 0 });
            e.vars++;
            if (m.sku === m.base || (!m.sku.startsWith("N_") && !m.sku.startsWith("X_")))
                e.name = m.name;
        });
        return info;
    }, [gkey]);
    const facets = useMemo(() => {
        const out = {};
        // master (รหัสสินค้าหลัก)
        const fmst = facetCounts(gkey, filters, range, "master");
        out.master = [...fmst.entries()].map(([k, c]) => {
            const mi = masterInfo[k] || { name: "", vars: 1 };
            return { v: k, label: k + " · " + mi.name + (mi.vars > 1 ? " (" + mi.vars + " รหัส)" : ""), count: c };
        }).sort((a, b) => b.count - a.count);
        // sku
        const fm = facetCounts(gkey, filters, range, "sku");
        out.sku = [...fm.entries()].map(([k, c]) => ({ v: k, label: G.meta[k].sku + " · " + G.meta[k].name, count: c, name: G.meta[k].name })).sort((a, b) => b.count - a.count);
        // prefix (only N_/X_)
        const pf = facetCounts(gkey, filters, range, "prefix");
        out.prefix = PFX_OPTS.map(o => ({ ...o, count: pf.get(o.v) || 0 })).filter(o => o.count > 0 || filters.prefix.includes(o.v));
        for (const d of DIMS) {
            const m = facetCounts(gkey, filters, range, d);
            out[d] = [...m.entries()].map(([k, c]) => ({ v: k, label: G.dict[d][k], count: c }))
                .filter(o => d !== "region" || (o.label !== "ว่างเปล่า" && o.label !== "ไม่ระบุที่อยู่"))
                .sort((a, b) => b.count - a.count);
        }
        return out;
    }, [gkey, filters, range]);
    const chips = [];
    FILT_KEYS.forEach(k => {
        if (filters[k].length) {
            const lab = k === "master" ? "สินค้าหลัก" : k === "sku" ? "SKU" : k === "prefix" ? "รหัส" : DIM_LABEL[k];
            chips.push(React.createElement("span", { key: k, style: { display: "inline-flex", alignItems: "center", gap: 5, background: T.primarySoft, color: T.primaryInk, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 } },
                lab,
                ": ",
                filters[k].length,
                React.createElement("span", { onClick: () => set(k, []), style: { cursor: "pointer", fontWeight: 800 } }, "\u00D7")));
        }
    });
    return (React.createElement("div", { style: { background: T.surface, border: "1px solid " + T.border, borderRadius: 12, padding: "12px 16px", marginBottom: 14 } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } },
            React.createElement("button", { onClick: () => setOpen(o => !o), style: { display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 800, color: T.ink, background: "none", border: "none", cursor: "pointer" } },
                "\uD83D\uDD0E \u0E15\u0E31\u0E27\u0E01\u0E23\u0E2D\u0E07\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32 ",
                activeN > 0 && React.createElement("span", { style: { background: T.primary, color: "#fff", borderRadius: 12, padding: "1px 9px", fontSize: 11 } }, activeN),
                React.createElement("span", { style: { fontSize: 10, color: T.faint } }, open ? "▲ ซ่อน" : "▼ เปิด")),
            React.createElement("span", { style: { fontSize: 11, color: T.faint } },
                "\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E44\u0E14\u0E49\u0E2B\u0E25\u0E32\u0E22\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E15\u0E48\u0E2D\u0E0A\u0E48\u0E2D\u0E07 \u00B7 \u0E17\u0E38\u0E01\u0E0A\u0E48\u0E2D\u0E07\u0E25\u0E34\u0E07\u0E01\u0E4C\u0E01\u0E31\u0E19\u0E41\u0E25\u0E30\u0E01\u0E23\u0E2D\u0E07\u0E17\u0E38\u0E01\u0E41\u0E17\u0E47\u0E1A \u00B7 ",
                React.createElement("b", { style: { color: T.primary } }, "\u0E23\u0E2B\u0E31\u0E2A\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32\u0E2B\u0E25\u0E31\u0E01"),
                " = \u0E23\u0E27\u0E21\u0E17\u0E38\u0E01\u0E0A\u0E48\u0E2D\u0E07\u0E17\u0E32\u0E07\u0E02\u0E2D\u0E07\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32\u0E15\u0E31\u0E27\u0E40\u0E14\u0E35\u0E22\u0E27\u0E01\u0E31\u0E19"),
            chips.length > 0 && React.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", marginLeft: 4 } }, chips),
            activeN > 0 && React.createElement("button", { onClick: () => setFilters(emptyFilters()), style: { marginLeft: "auto", fontSize: 11, padding: "5px 12px", borderRadius: 7, border: "1px solid " + T.border, background: T.surface, color: T.muted, cursor: "pointer", fontWeight: 600 } }, "\u0E25\u0E49\u0E32\u0E07\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14")),
        open && (React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(158px,1fr))", gap: 10, marginTop: 12 } },
            React.createElement(MultiSelect, { label: "\u2605 \u0E23\u0E2B\u0E31\u0E2A\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32\u0E2B\u0E25\u0E31\u0E01 (Master)", options: facets.master, selected: filters.master, onChange: v => set("master", v) }),
            React.createElement(MultiSelect, { label: "\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32 (SKU \u00B7 \u0E41\u0E22\u0E01\u0E0A\u0E48\u0E2D\u0E07\u0E17\u0E32\u0E07)", options: facets.sku, selected: filters.sku, onChange: v => set("sku", v) }),
            React.createElement(MultiSelect, { label: "\u0E23\u0E2B\u0E31\u0E2A\u0E25\u0E34\u0E2A\u0E15\u0E4C (N_/X_)", options: facets.prefix, selected: filters.prefix, onChange: v => set("prefix", v) }),
            React.createElement(MultiSelect, { label: "\u0E20\u0E32\u0E04", options: facets.region, selected: filters.region, onChange: v => set("region", v) }),
            React.createElement(MultiSelect, { label: "\u0E08\u0E31\u0E07\u0E2B\u0E27\u0E31\u0E14", options: facets.prov, selected: filters.prov, onChange: v => set("prov", v) }),
            React.createElement(MultiSelect, { label: "Channel", options: facets.channel, selected: filters.channel, onChange: v => set("channel", v), colourKey: true }),
            React.createElement(MultiSelect, { label: "\u0E40\u0E1E\u0E08/\u0E23\u0E49\u0E32\u0E19 \u00B7 \u0E0A\u0E48\u0E2D\u0E07\u0E17\u0E32\u0E07", options: facets.page, selected: filters.page, onChange: v => set("page", v) }),
            React.createElement(MultiSelect, { label: "\u0E17\u0E35\u0E21 Telesale", options: facets.team, selected: filters.team, onChange: v => set("team", v) }),
            React.createElement(MultiSelect, { label: "\u0E1E\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19\u0E02\u0E32\u0E22", options: facets.sales, selected: filters.sales, onChange: v => set("sales", v) }),
            React.createElement(MultiSelect, { label: "\u0E23\u0E2B\u0E31\u0E2A SET", options: facets.set, selected: filters.set, onChange: v => set("set", v) }),
            React.createElement(MultiSelect, { label: "\u0E02\u0E19\u0E2A\u0E48\u0E07", options: facets.ship, selected: filters.ship, onChange: v => set("ship", v) })))));
}
/* ============================ Overview (home) ============================ */
function Overview({ onPick, onJump, range, cmpRange }) {
    const [a, b] = range;
    const gc = useMemo(() => D.groups.map(g => {
        const G = D.g[g.key], F = G.fact;
        let rev = 0, qty = 0, ord = 0, crev = 0, cord = 0;
        for (let i = 0; i < F.s.length; i++) {
            const m = F.mi[i];
            if (m >= a && m <= b) {
                rev += F.r[i];
                qty += F.q[i];
                ord += F.o[i];
            }
            if (cmpRange && m >= cmpRange[0] && m <= cmpRange[1]) {
                crev += F.r[i];
                cord += F.o[i];
            }
        }
        return { ...g, rev, qty, ord, crev: cmpRange ? crev : null, cord: cmpRange ? cord : null };
    }), [range, cmpRange]);
    const sorted = [...gc].sort((x, y) => y.rev - x.rev);
    const totRev = gc.reduce((s, g) => s + g.rev, 0), totQty = gc.reduce((s, g) => s + g.qty, 0), totOrd = gc.reduce((s, g) => s + g.ord, 0);
    const cTotRev = cmpRange ? gc.reduce((s, g) => s + (g.crev || 0), 0) : null;
    const totSku = D.groups.reduce((s, g) => s + g.skus, 0);
    // channel share across all groups (period)
    const chAgg = {};
    for (const g of D.groups) {
        const G = D.g[g.key], F = G.fact;
        for (let i = 0; i < F.s.length; i++) {
            const m = F.mi[i];
            if (m < a || m > b)
                continue;
            const nm = G.dict.channel[F.channel[i]];
            chAgg[nm] = (chAgg[nm] || 0) + F.o[i];
        }
    }
    const chRows = Object.entries(chAgg).map(([n, v]) => ({ n, v })).sort((x, y) => y.v - x.v);
    const totCh = chRows.reduce((s, r) => s + r.v, 0);
    const chPie = chRows.map(r => ({ name: r.n, value: r.v, fill: chColor(r.n) }));
    const barData = sorted.map(g => ({ name: g.name, rev: g.rev, key: g.key }));
    return (React.createElement(React.Fragment, null,
        React.createElement(GlobalSearch, { onJump: onJump }),
        React.createElement(HowToUse, null),
        React.createElement(SectionHead, { title: "\u0E20\u0E32\u0E1E\u0E23\u0E27\u0E21\u0E17\u0E31\u0E49\u0E07\u0E1A\u0E23\u0E34\u0E29\u0E31\u0E17", desc: "สรุปยอดขายรวมทุกกลุ่มในช่วงที่เลือก · " + MONFULL[a] + "–" + MONFULL[b] }),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 16 } },
            React.createElement(Kpi, { label: "\u0E22\u0E2D\u0E14\u0E02\u0E32\u0E22\u0E23\u0E27\u0E21 (\u0E1A\u0E32\u0E17)", value: fbc(totRev), accent: T.k1, delta: React.createElement(Delta, { cur: totRev, prev: cTotRev }), sub: fb(totRev) }),
            React.createElement(Kpi, { label: "\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C\u0E23\u0E27\u0E21 (\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C)", value: fc(totOrd), accent: T.k2, sub: fi(totOrd) + " ออเดอร์" }),
            React.createElement(Kpi, { label: "\u0E08\u0E33\u0E19\u0E27\u0E19\u0E02\u0E32\u0E22 (\u0E0A\u0E34\u0E49\u0E19)", value: fc(totQty), accent: T.k3, sub: fi(totQty) + " ชิ้น" }),
            React.createElement(Kpi, { label: "\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14", value: fi(totSku) + " SKU", accent: T.k4, sub: D.groups.length + " กลุ่ม" })),
        D.cust_global && (() => {
            const C = D.cust_global;
            const rr = C.total_known ? C.repeat / C.total_known * 100 : 0;
            return (React.createElement(Card, { title: "\u0E20\u0E32\u0E1E\u0E23\u0E27\u0E21\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32 (\u0E17\u0E31\u0E49\u0E07\u0E1A\u0E23\u0E34\u0E29\u0E31\u0E17 \u00B7 18 \u0E40\u0E14\u0E37\u0E2D\u0E19)", hint: "\u0E19\u0E31\u0E1A\u0E08\u0E32\u0E01\u0E40\u0E1A\u0E2D\u0E23\u0E4C\u0E42\u0E17\u0E23\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32 \u00B7 \u0E01\u0E25\u0E38\u0E48\u0E21\u0E44\u0E21\u0E48\u0E17\u0E23\u0E32\u0E1A = \u0E40\u0E1A\u0E2D\u0E23\u0E4C PDPA/\u0E27\u0E48\u0E32\u0E07" },
                React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 14 } },
                    React.createElement(Kpi, { label: "\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32\u0E23\u0E30\u0E1A\u0E38\u0E15\u0E31\u0E27\u0E44\u0E14\u0E49", value: fi(C.total_known) + " คน", accent: T.k1, sub: "\u0E40\u0E1A\u0E2D\u0E23\u0E4C\u0E42\u0E17\u0E23\u0E44\u0E21\u0E48\u0E0B\u0E49\u0E33" }),
                    React.createElement(Kpi, { label: "\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32\u0E0B\u0E49\u0E33 (2+ \u0E04\u0E23\u0E31\u0E49\u0E07)", value: fi(C.repeat) + " คน", accent: T.k2, sub: rr.toFixed(1) + "% ของที่ระบุได้" }),
                    React.createElement(Kpi, { label: "\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32\u0E1B\u0E23\u0E30\u0E08\u0E33 (5+ \u0E04\u0E23\u0E31\u0E49\u0E07)", value: fi(C.loyal) + " คน", accent: T.k3 }),
                    React.createElement(Kpi, { label: "CLV \u0E40\u0E09\u0E25\u0E35\u0E48\u0E22", value: fb(C.clv_avg), accent: T.k4, sub: "มัธยฐาน " + fb(C.clv_med) }),
                    React.createElement(Kpi, { label: "\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C\u0E40\u0E09\u0E25\u0E35\u0E48\u0E22/\u0E04\u0E19", value: String(C.avg_orders), accent: T.k1 }),
                    React.createElement(Kpi, { label: "\u0E01\u0E25\u0E38\u0E48\u0E21\u0E44\u0E21\u0E48\u0E17\u0E23\u0E32\u0E1A (PDPA)", value: fi(C.unk_orders) + " ออเดอร์", accent: T.k4, sub: "ยอดขาย " + fbc(C.unk_rev) + " · " + fi(C.unk_rows) + " รายการ" })),
                React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: T.ink, marginBottom: 6 } }, "\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32\u0E43\u0E2B\u0E21\u0E48 vs \u0E0B\u0E37\u0E49\u0E2D\u0E0B\u0E49\u0E33 vs \u0E44\u0E21\u0E48\u0E17\u0E23\u0E32\u0E1A \u0E23\u0E32\u0E22\u0E40\u0E14\u0E37\u0E2D\u0E19"),
                React.createElement(ResponsiveContainer, { width: "100%", height: 180 },
                    React.createElement(BarChart, { data: C.monthly_nr.map((d, i) => ({ m: monShort(D.months[i]), n: d[0], r: d[1], u: d[2] })), margin: { left: -10, right: 8 } },
                        React.createElement(CartesianGrid, { strokeDasharray: "3 3", stroke: "#eef0f2", vertical: false }),
                        React.createElement(XAxis, { dataKey: "m", tick: { fontSize: 10, fill: T.muted } }),
                        React.createElement(YAxis, { tick: { fontSize: 10, fill: T.muted }, tickFormatter: fc }),
                        React.createElement(Tooltip, { contentStyle: { fontSize: 12, borderRadius: 8 } }),
                        React.createElement(Bar, { dataKey: "u", name: "\u0E44\u0E21\u0E48\u0E17\u0E23\u0E32\u0E1A (PDPA)", stackId: "a", fill: "#e5e7eb", radius: [0, 0, 0, 0] }),
                        React.createElement(Bar, { dataKey: "n", name: "\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32\u0E43\u0E2B\u0E21\u0E48", stackId: "a", fill: "#94a3b8", radius: [0, 0, 0, 0] }),
                        React.createElement(Bar, { dataKey: "r", name: "\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32\u0E0B\u0E37\u0E49\u0E2D\u0E0B\u0E49\u0E33", stackId: "a", fill: "#475569", radius: [4, 4, 0, 0] }))),
                React.createElement("div", { style: { display: "flex", gap: 16, justifyContent: "center", marginTop: 6 } },
                    React.createElement("span", { style: { fontSize: 11.5, color: T.muted } },
                        "\u2587 ",
                        React.createElement("span", { style: { color: "#e5e7eb", fontWeight: 700, textShadow: "0 0 1px #999" } }, "\u0E40\u0E17\u0E32\u0E08\u0E32\u0E07"),
                        " = \u0E44\u0E21\u0E48\u0E17\u0E23\u0E32\u0E1A (PDPA)"),
                    React.createElement("span", { style: { fontSize: 11.5, color: T.muted } },
                        "\u2587 ",
                        React.createElement("span", { style: { color: "#94a3b8", fontWeight: 700 } }, "\u0E40\u0E17\u0E32\u0E2D\u0E48\u0E2D\u0E19"),
                        " = \u0E25\u0E39\u0E01\u0E04\u0E49\u0E32\u0E43\u0E2B\u0E21\u0E48"),
                    React.createElement("span", { style: { fontSize: 11.5, color: T.muted } },
                        "\u2587 ",
                        React.createElement("span", { style: { color: "#475569", fontWeight: 700 } }, "\u0E40\u0E17\u0E32\u0E40\u0E02\u0E49\u0E21"),
                        " = \u0E25\u0E39\u0E01\u0E04\u0E49\u0E32\u0E0B\u0E37\u0E49\u0E2D\u0E0B\u0E49\u0E33"))));
        })(),
        React.createElement(SectionHead, { title: "\u0E22\u0E2D\u0E14\u0E02\u0E32\u0E22\u0E41\u0E22\u0E01\u0E15\u0E32\u0E21\u0E01\u0E25\u0E38\u0E48\u0E21\u0E41\u0E25\u0E30\u0E0A\u0E48\u0E2D\u0E07\u0E17\u0E32\u0E07", desc: "\u0E40\u0E17\u0E35\u0E22\u0E1A\u0E02\u0E19\u0E32\u0E14\u0E41\u0E15\u0E48\u0E25\u0E30\u0E01\u0E25\u0E38\u0E48\u0E21 \u0E41\u0E25\u0E30\u0E14\u0E39\u0E2A\u0E31\u0E14\u0E2A\u0E48\u0E27\u0E19\u0E0A\u0E48\u0E2D\u0E07\u0E17\u0E32\u0E07\u0E02\u0E32\u0E22", right: React.createElement(ChannelLegend, null) }),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 16, marginBottom: 16 } },
            React.createElement(Card, { title: "\u0E22\u0E2D\u0E14\u0E02\u0E32\u0E22\u0E15\u0E32\u0E21\u0E01\u0E25\u0E38\u0E48\u0E21\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32 (\u0E1A\u0E32\u0E17)", hint: "ครบทั้ง " + D.groups.length + " กลุ่ม · สีเดียวกับการ์ดด้านล่าง" },
                React.createElement(ResponsiveContainer, { width: "100%", height: Math.max(300, sorted.length * 20) },
                    React.createElement(BarChart, { data: barData, layout: "vertical", margin: { left: 100, right: 18 } },
                        React.createElement(CartesianGrid, { strokeDasharray: "3 3", stroke: "#eef0f2", horizontal: false }),
                        React.createElement(XAxis, { type: "number", tickFormatter: fc, tick: { fontSize: 10, fill: T.muted } }),
                        React.createElement(YAxis, { type: "category", dataKey: "name", tick: { fontSize: 10, fill: T.ink }, width: 96 }),
                        React.createElement(Tooltip, { formatter: v => fb(v), contentStyle: { fontSize: 12, borderRadius: 8 }, labelStyle: { fontWeight: 700 } }),
                        React.createElement(Bar, { dataKey: "rev", radius: [0, 5, 5, 0], cursor: "pointer", onClick: d => d && d.key && onPick(d.key) }, barData.map((e, i) => React.createElement(Cell, { key: i, fill: groupColor(e.key) })))))),
            React.createElement(Card, { title: "\u0E2A\u0E31\u0E14\u0E2A\u0E48\u0E27\u0E19\u0E22\u0E2D\u0E14\u0E02\u0E32\u0E22\u0E15\u0E32\u0E21 Channel", hint: "\u0E41\u0E22\u0E01\u0E2A\u0E35\u0E15\u0E32\u0E21 guideline" },
                React.createElement(ResponsiveContainer, { width: "100%", height: 210 },
                    React.createElement(PieChart, null,
                        React.createElement(Pie, { data: chPie, dataKey: "value", nameKey: "name", cx: "50%", cy: "50%", outerRadius: 80, innerRadius: 44, paddingAngle: 2, label: ({ percent }) => percent > 0.06 ? (percent * 100).toFixed(0) + "%" : "", labelLine: false, style: { fontSize: 11, fontWeight: 700 } }, chPie.map((e, i) => React.createElement(Cell, { key: i, fill: e.fill }))),
                        React.createElement(Tooltip, { formatter: v => fi(v) + " ออเดอร์", contentStyle: { fontSize: 12, borderRadius: 8 } }))),
                React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 5, marginTop: 6 } }, chRows.map((r, i) => (React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 8, fontSize: 11.5 } },
                    React.createElement("span", { style: { width: 11, height: 11, borderRadius: 3, background: chColor(r.n), flexShrink: 0 } }),
                    React.createElement("span", { style: { color: T.ink, flex: 1 } }, r.n),
                    React.createElement("span", { style: { fontWeight: 700 } }, fi(r.v)),
                    React.createElement("span", { style: { color: T.faint, width: 44, textAlign: "right" } },
                        totCh ? (r.v / totCh * 100).toFixed(1) : 0,
                        "%"))))))),
        React.createElement("div", { style: { background: T.primary, color: "#fff", borderRadius: "14px 14px 0 0", padding: "14px 18px", marginTop: 22, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" } },
            React.createElement("span", { style: { fontSize: 22 } }, "\uD83D\uDC49"),
            React.createElement("div", { style: { flex: 1, minWidth: 200 } },
                React.createElement("div", { style: { fontSize: 16, fontWeight: 800 } }, "\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E01\u0E25\u0E38\u0E48\u0E21\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E40\u0E08\u0E32\u0E30\u0E25\u0E36\u0E01"),
                React.createElement("div", { style: { fontSize: 12, opacity: .9, marginTop: 2 } }, "\u0E04\u0E25\u0E34\u0E01\u0E01\u0E32\u0E23\u0E4C\u0E14\u0E43\u0E14\u0E01\u0E47\u0E44\u0E14\u0E49 \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E14\u0E39\u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14 SKU \u0E41\u0E25\u0E30\u0E40\u0E08\u0E32\u0E30\u0E25\u0E36\u0E01\u0E27\u0E48\u0E32\u0E43\u0E04\u0E23\u0E0B\u0E37\u0E49\u0E2D \u0E17\u0E35\u0E48\u0E44\u0E2B\u0E19 \u0E0A\u0E48\u0E2D\u0E07\u0E17\u0E32\u0E07\u0E44\u0E2B\u0E19 \u00B7 \u0E40\u0E23\u0E35\u0E22\u0E07\u0E15\u0E32\u0E21\u0E22\u0E2D\u0E14\u0E02\u0E32\u0E22\u0E43\u0E19\u0E0A\u0E48\u0E27\u0E07\u0E17\u0E35\u0E48\u0E40\u0E25\u0E37\u0E2D\u0E01"))),
        React.createElement("div", { style: { background: T.subtle, border: "1px solid " + T.border, borderTop: "none", borderRadius: "0 0 14px 14px", padding: "12px 14px 4px" } },
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(232px,1fr))", gap: 12, paddingBottom: 12 } }, sorted.map((g, i) => (React.createElement("button", { key: g.key, onClick: () => onPick(g.key), style: { position: "relative", background: T.surface, border: "1px solid " + T.border, borderRadius: 12, padding: "0", cursor: "pointer", textAlign: "left", overflow: "hidden", transition: "transform .12s, box-shadow .12s" }, onMouseOver: e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 10px 22px rgba(0,0,0,.10)"; e.currentTarget.querySelector(".cta").style.color = groupColor(g.key); e.currentTarget.style.borderColor = groupColor(g.key); }, onMouseOut: e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; e.currentTarget.querySelector(".cta").style.color = T.faint; e.currentTarget.style.borderColor = T.border; } },
                React.createElement("div", { style: { height: 6, background: groupColor(g.key) } }),
                React.createElement("div", { style: { padding: "13px 15px 14px" } },
                    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 } },
                        React.createElement("span", { style: { width: 26, height: 26, borderRadius: 7, background: groupColor(g.key), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 } }, i + 1),
                        React.createElement("div", { style: { fontSize: 14.5, fontWeight: 800, color: T.ink, lineHeight: 1.15 } }, g.name)),
                    React.createElement("div", { style: { fontSize: 22, fontWeight: 800, color: T.ink, letterSpacing: "-.5px", lineHeight: 1 } },
                        fbc(g.rev),
                        React.createElement(Delta, { cur: g.rev, prev: g.crev })),
                    React.createElement("div", { style: { fontSize: 11, color: T.muted, marginTop: 5 } },
                        g.skus,
                        " SKU \u00B7 ",
                        fi(g.ord),
                        " \u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C \u00B7 ",
                        fi(g.qty),
                        " \u0E0A\u0E34\u0E49\u0E19"),
                    React.createElement("div", { className: "cta", style: { fontSize: 12, fontWeight: 800, color: T.faint, marginTop: 9, transition: "color .12s" } }, "\uD83D\uDD0D \u0E04\u0E25\u0E34\u0E01\u0E14\u0E39\u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14 \u2192"))))))),
        React.createElement(DataGuide, { note: "\u0E15\u0E31\u0E27\u0E40\u0E25\u0E02\u0E04\u0E33\u0E19\u0E27\u0E13\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E02\u0E32\u0E22\u0E08\u0E23\u0E34\u0E07 (\u0E44\u0E21\u0E48\u0E23\u0E27\u0E21\u0E02\u0E2D\u0E07\u0E41\u0E16\u0E21/Tester) \u0E41\u0E25\u0E30\u0E1B\u0E23\u0E31\u0E1A\u0E15\u0E32\u0E21\u0E0A\u0E48\u0E27\u0E07\u0E40\u0E27\u0E25\u0E32\u0E14\u0E49\u0E32\u0E19\u0E1A\u0E19 \u00B7 \u0E41\u0E15\u0E48\u0E25\u0E30\u0E01\u0E25\u0E38\u0E48\u0E21\u0E21\u0E35\u0E2A\u0E35\u0E1B\u0E23\u0E30\u0E08\u0E33\u0E15\u0E31\u0E27 \u0E43\u0E0A\u0E49\u0E2A\u0E35\u0E40\u0E14\u0E35\u0E22\u0E27\u0E01\u0E31\u0E19\u0E17\u0E31\u0E49\u0E07\u0E01\u0E23\u0E32\u0E1F\u0E41\u0E17\u0E48\u0E07\u0E41\u0E25\u0E30\u0E01\u0E32\u0E23\u0E4C\u0E14", items: [["ยอดขายรวม (บาท)", "ราคา×จำนวนของรายการขายจริงในช่วงที่เลือก"], ["ออเดอร์ (ออเดอร์)", "จำนวนบิลไม่ซ้ำ = จำนวนลูกค้าโดยประมาณ"], ["จำนวนขาย (ชิ้น)", "จำนวนสินค้าที่ขายออก"], ["สีประจำกลุ่ม", "แต่ละกลุ่มสินค้ามีสีเฉพาะ คงที่ทั้งเว็บ เพื่อจดจำง่าย"], ["Channel (แยกสี)", "ชมพู=MarketPlace ส้ม=Online ม่วง=Online_คุณอ้อย เขียว=ขนมน้องRisa น้ำเงิน=Telesale"], ["▲▼ %", "เปิดการเทียบช่วงในแถบช่วงเวลาเพื่อดูอัตราโต/ลด"]] })));
}
/* daily/weekly trend (group-level, respects period + Channel filter) */
function DailyTrend({ gkey, filters, range }) {
    const [mode, setMode] = useState("week");
    const [metric, setMetric] = useState("q");
    const data = useMemo(() => computeDaily(gkey, filters, range, mode), [gkey, filters, range, mode]);
    const chFiltered = filters.channel && filters.channel.length;
    const fmtDate = k => { const [y, m, d] = k.split("-"); return mode === "week" ? (+d + " " + THMON[+m - 1]) : (+d + "/" + (+m)); };
    return (React.createElement(Card, { title: "\u0E41\u0E19\u0E27\u0E42\u0E19\u0E49\u0E21\u0E23\u0E32\u0E22\u0E27\u0E31\u0E19 / \u0E23\u0E32\u0E22\u0E2A\u0E31\u0E1B\u0E14\u0E32\u0E2B\u0E4C", hint: React.createElement("span", null,
            "\u0E23\u0E30\u0E14\u0E31\u0E1A\u0E01\u0E25\u0E38\u0E48\u0E21 \u00B7 \u0E1B\u0E23\u0E31\u0E1A\u0E15\u0E32\u0E21\u0E0A\u0E48\u0E27\u0E07\u0E40\u0E27\u0E25\u0E32",
            chFiltered ? " + Channel ที่เลือก" : "",
            " \u00B7 ",
            React.createElement("b", { style: { color: T.muted } }, "\u0E15\u0E31\u0E27\u0E01\u0E23\u0E2D\u0E07\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32\u0E2D\u0E37\u0E48\u0E19\u0E43\u0E0A\u0E49\u0E01\u0E31\u0E1A\u0E01\u0E23\u0E32\u0E1F\u0E23\u0E32\u0E22\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E14\u0E49\u0E32\u0E19\u0E1A\u0E19")) },
        React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" } },
            React.createElement("div", { style: { display: "flex", gap: 3, background: T.subtle, border: "1px solid " + T.border, borderRadius: 8, padding: 3 } }, [["day", "รายวัน"], ["week", "รายสัปดาห์"]].map(([v, l]) => React.createElement("button", { key: v, onClick: () => setMode(v), style: { fontSize: 11.5, padding: "5px 11px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 700, background: mode === v ? T.ink : "transparent", color: mode === v ? "#fff" : T.muted } }, l))),
            React.createElement("div", { style: { display: "flex", gap: 3, background: T.subtle, border: "1px solid " + T.border, borderRadius: 8, padding: 3 } }, [["q", "จำนวนชิ้น"], ["o", "ออเดอร์"], ["r", "ยอดขาย"]].map(([v, l]) => React.createElement("button", { key: v, onClick: () => setMetric(v), style: { fontSize: 11.5, padding: "5px 11px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 700, background: metric === v ? T.primary : "transparent", color: metric === v ? "#fff" : T.muted } }, l))),
            React.createElement("span", { style: { marginLeft: "auto", fontSize: 11, color: T.faint, alignSelf: "center" } },
                data.length,
                " ",
                mode === "week" ? "สัปดาห์" : "วัน")),
        React.createElement(ResponsiveContainer, { width: "100%", height: 230 },
            React.createElement(AreaChart, { data: data, margin: { left: -8, right: 10 } },
                React.createElement("defs", null,
                    React.createElement("linearGradient", { id: "dg", x1: "0", y1: "0", x2: "0", y2: "1" },
                        React.createElement("stop", { offset: "0%", stopColor: T.primary, stopOpacity: 0.35 }),
                        React.createElement("stop", { offset: "100%", stopColor: T.primary, stopOpacity: 0.02 }))),
                React.createElement(CartesianGrid, { strokeDasharray: "3 3", stroke: "#eef0f2" }),
                React.createElement(XAxis, { dataKey: "k", tickFormatter: fmtDate, tick: { fontSize: 9, fill: T.muted }, minTickGap: 22 }),
                React.createElement(YAxis, { tick: { fontSize: 10, fill: T.muted }, tickFormatter: metric === "r" ? fbc : fc }),
                React.createElement(Tooltip, { labelFormatter: k => mode === "week" ? ("สัปดาห์ " + k) : k, formatter: v => [metric === "r" ? fb(v) : fi(v), metric === "q" ? "ชิ้น" : metric === "o" ? "ออเดอร์" : "บาท"], contentStyle: { fontSize: 12, borderRadius: 8 } }),
                React.createElement(Area, { type: "monotone", dataKey: metric, stroke: T.primary, strokeWidth: 2, fill: "url(#dg)" })))));
}
/* weekday pattern (from existing daily series; respects period + Channel) */
function computeWeekday(gkey, filters, range) {
    const G = D.g[gkey], dl = G.daily;
    if (!dl)
        return [];
    const [a, b] = range;
    const chSet = (filters.channel && filters.channel.length) ? new Set(filters.channel) : null;
    const lo = D.months[a] + "-01", hi = D.months[b] + "-31";
    const wd = Array.from({ length: 7 }, () => ({ q: 0, o: 0, r: 0 }));
    for (let i = 0; i < dl.d.length; i++) {
        if (chSet && !chSet.has(dl.c[i]))
            continue;
        const ds = D.dates[dl.d[i]];
        if (ds < lo || ds > hi)
            continue;
        const dow = new Date(ds + "T00:00:00Z").getUTCDay();
        const idx = (dow + 6) % 7;
        wd[idx].q += dl.q[i];
        wd[idx].o += dl.o[i];
        wd[idx].r += dl.r[i];
    }
    const names = ["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์", "อาทิตย์"];
    return wd.map((w, i) => ({ d: names[i], ...w }));
}
/* ============================ Group: Overview tab ============================ */
function WeekdayCard({ gkey, filters, range }) {
    const [metric, setMetric] = useState("q");
    const data = useMemo(() => computeWeekday(gkey, filters, range), [gkey, filters, range]);
    const max = Math.max(1, ...data.map(d => d[metric]));
    const best = data.reduce((a, b) => b[metric] > a[metric] ? b : a, { d: "-", [metric]: 0 });
    const chFiltered = filters.channel && filters.channel.length;
    return (React.createElement(Card, { title: "\u0E02\u0E32\u0E22\u0E14\u0E35\u0E27\u0E31\u0E19\u0E44\u0E2B\u0E19\u0E43\u0E19\u0E2A\u0E31\u0E1B\u0E14\u0E32\u0E2B\u0E4C", hint: React.createElement("span", null,
            "\u0E23\u0E30\u0E14\u0E31\u0E1A\u0E01\u0E25\u0E38\u0E48\u0E21 \u00B7 \u0E0A\u0E48\u0E27\u0E07\u0E17\u0E35\u0E48\u0E40\u0E25\u0E37\u0E2D\u0E01",
            chFiltered ? " + Channel" : "",
            " \u00B7 \u0E43\u0E0A\u0E49\u0E08\u0E31\u0E1A\u0E40\u0E27\u0E25\u0E32\u0E22\u0E34\u0E07\u0E41\u0E2D\u0E14/\u0E08\u0E31\u0E14\u0E42\u0E1B\u0E23") },
        React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" } },
            React.createElement("div", { style: { display: "flex", gap: 3, background: T.subtle, border: "1px solid " + T.border, borderRadius: 8, padding: 3 } }, [["q", "จำนวนชิ้น"], ["o", "ออเดอร์"], ["r", "ยอดขาย"]].map(([v, l]) => React.createElement("button", { key: v, onClick: () => setMetric(v), style: { fontSize: 11.5, padding: "5px 11px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 700, background: metric === v ? T.primary : "transparent", color: metric === v ? "#fff" : T.muted } }, l))),
            React.createElement("span", { style: { fontSize: 12, color: T.muted, marginLeft: "auto" } },
                "\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E02\u0E32\u0E22\u0E14\u0E35\u0E2A\u0E38\u0E14: ",
                React.createElement("b", { style: { color: T.primary } }, best.d))),
        React.createElement(ResponsiveContainer, { width: "100%", height: 190 },
            React.createElement(BarChart, { data: data, margin: { left: -6, right: 10 } },
                React.createElement(CartesianGrid, { strokeDasharray: "3 3", stroke: "#eef0f2", vertical: false }),
                React.createElement(XAxis, { dataKey: "d", tick: { fontSize: 11, fill: T.ink } }),
                React.createElement(YAxis, { tick: { fontSize: 10, fill: T.muted }, tickFormatter: metric === "r" ? fbc : fc }),
                React.createElement(Tooltip, { formatter: v => [metric === "r" ? fb(v) : fi(v), metric === "q" ? "ชิ้น" : metric === "o" ? "ออเดอร์" : "บาท"], contentStyle: { fontSize: 12, borderRadius: 8 } }),
                React.createElement(Bar, { dataKey: metric, radius: [5, 5, 0, 0] }, data.map((e, i) => React.createElement(Cell, { key: i, fill: e[metric] === max ? T.primary : "#bcd9d5" })))))));
}
function GroupOverviewTab({ gkey, A, cmpOn, filters, range }) {
    const G = D.g[gkey];
    const { tot, cmp, byDim, monthly, ordExact } = A;
    const aov = tot.o ? tot.r / tot.o : 0;
    const trend = D.months.map((m, i) => ({ m: monShort(m), qty: monthly[i].q, ord: monthly[i].o }));
    const chRows = dimRows(byDim.channel, G.dict.channel);
    const totCh = chRows.reduce((s, r) => s + r.o, 0);
    const regRows = dimRows(byDim.region, G.dict.region, { dropRegionBlank: true, top: 8 });
    return (React.createElement(React.Fragment, null,
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 16 } },
            React.createElement(Kpi, { label: "\u0E22\u0E2D\u0E14\u0E02\u0E32\u0E22 (\u0E1A\u0E32\u0E17)", value: fbc(tot.r), accent: T.k1, delta: cmpOn && React.createElement(Delta, { cur: tot.r, prev: cmp.r }), sub: fb(tot.r) }),
            React.createElement(Kpi, { label: "ออเดอร์ (บิล)" + (ordExact ? "" : " ≈"), value: (ordExact ? "" : "≈") + fc(tot.o), accent: T.k2, delta: cmpOn && React.createElement(Delta, { cur: tot.o, prev: cmp.o }), sub: ordExact ? fi(tot.o) + " บิลไม่ซ้ำ" : "ประมาณ (เปิดตัวกรองอยู่)" }),
            React.createElement(Kpi, { label: "\u0E08\u0E33\u0E19\u0E27\u0E19\u0E02\u0E32\u0E22 (\u0E0A\u0E34\u0E49\u0E19)", value: fc(tot.q), accent: T.k3, delta: cmpOn && React.createElement(Delta, { cur: tot.q, prev: cmp.q }), sub: fi(tot.q) + " ชิ้น" }),
            React.createElement(Kpi, { label: "\u0E21\u0E39\u0E25\u0E04\u0E48\u0E32/\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C (\u0E1A\u0E32\u0E17)", value: fb(aov), accent: T.k4, sub: "AOV \u0E40\u0E09\u0E25\u0E35\u0E48\u0E22\u0E15\u0E48\u0E2D\u0E1A\u0E34\u0E25" })),
        React.createElement(Card, { title: "\u0E41\u0E19\u0E27\u0E42\u0E19\u0E49\u0E21\u0E23\u0E32\u0E22\u0E40\u0E14\u0E37\u0E2D\u0E19", hint: "\u0E40\u0E2A\u0E49\u0E19\u0E17\u0E36\u0E1A=\u0E08\u0E33\u0E19\u0E27\u0E19\u0E0A\u0E34\u0E49\u0E19 \u00B7 \u0E40\u0E2A\u0E49\u0E19\u0E1B\u0E23\u0E30=\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C (\u0E1B\u0E23\u0E31\u0E1A\u0E15\u0E32\u0E21\u0E15\u0E31\u0E27\u0E01\u0E23\u0E2D\u0E07)" },
            React.createElement(ResponsiveContainer, { width: "100%", height: 250 },
                React.createElement(LineChart, { data: trend, margin: { left: -12, right: 10 } },
                    React.createElement(CartesianGrid, { strokeDasharray: "3 3", stroke: "#eef0f2" }),
                    React.createElement(XAxis, { dataKey: "m", tick: { fontSize: 10, fill: T.muted } }),
                    React.createElement(YAxis, { yAxisId: "l", tick: { fontSize: 10, fill: T.muted }, tickFormatter: fc }),
                    React.createElement(YAxis, { yAxisId: "r", orientation: "right", tick: { fontSize: 10, fill: T.muted }, tickFormatter: fc }),
                    React.createElement(Tooltip, { contentStyle: { fontSize: 12, borderRadius: 8 } }),
                    React.createElement(Line, { yAxisId: "l", type: "monotone", dataKey: "qty", name: "\u0E08\u0E33\u0E19\u0E27\u0E19\u0E02\u0E32\u0E22 (\u0E0A\u0E34\u0E49\u0E19)", stroke: T.primary, strokeWidth: 2.5, dot: false }),
                    React.createElement(Line, { yAxisId: "r", type: "monotone", dataKey: "ord", name: "\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C", stroke: "#b06a2e", strokeWidth: 2, dot: false, strokeDasharray: "4 3" })))),
        React.createElement("div", { style: { marginTop: 14 } },
            React.createElement(DailyTrend, { gkey: gkey, filters: filters, range: range })),
        React.createElement("div", { style: { marginTop: 14 } },
            React.createElement(WeekdayCard, { gkey: gkey, filters: filters, range: range })),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 } },
            React.createElement(Card, { title: "\u0E2A\u0E31\u0E14\u0E2A\u0E48\u0E27\u0E19 Channel", hint: "\u0E41\u0E22\u0E01\u0E2A\u0E35\u0E15\u0E32\u0E21 guideline" },
                React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
                    chRows.map((r, i) => (React.createElement("div", { key: i },
                        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 2 } },
                            React.createElement("span", { style: { color: T.ink, fontWeight: 600 } }, r.n),
                            React.createElement("span", { style: { color: T.muted } },
                                fi(r.o),
                                " \u00B7 ",
                                totCh ? (r.o / totCh * 100).toFixed(1) : 0,
                                "%")),
                        React.createElement("div", { style: { background: "#f1f2f4", borderRadius: 5, height: 14, overflow: "hidden" } },
                            React.createElement("div", { style: { height: "100%", width: (totCh ? r.o / totCh * 100 : 0) + "%", background: chColor(r.n), borderRadius: 5 } }))))),
                    chRows.length === 0 && React.createElement("div", { style: { fontSize: 12, color: T.faint } }, "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25"))),
            React.createElement(Card, { title: "\u0E22\u0E2D\u0E14\u0E02\u0E32\u0E22\u0E15\u0E32\u0E21\u0E20\u0E32\u0E04", hint: "\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C" },
                React.createElement(RankBars, { rows: regRows, unit: "\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C" }))),
        React.createElement(DataGuide, { note: "\u0E2B\u0E19\u0E49\u0E32\u0E19\u0E35\u0E49\u0E2A\u0E23\u0E38\u0E1B\u0E20\u0E32\u0E1E\u0E23\u0E27\u0E21\u0E02\u0E2D\u0E07\u0E01\u0E25\u0E38\u0E48\u0E21 \u0E1B\u0E23\u0E31\u0E1A\u0E15\u0E32\u0E21\u0E0A\u0E48\u0E27\u0E07\u0E40\u0E27\u0E25\u0E32 + \u0E15\u0E31\u0E27\u0E01\u0E23\u0E2D\u0E07\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32\u0E17\u0E38\u0E01\u0E0A\u0E48\u0E2D\u0E07 \u0E44\u0E1B\u0E41\u0E17\u0E47\u0E1A '\u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14 SKU' \u0E2B\u0E23\u0E37\u0E2D '\u0E40\u0E08\u0E32\u0E30\u0E25\u0E36\u0E01\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32' \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E14\u0E39\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14\u0E02\u0E36\u0E49\u0E19", items: [["ยอดขาย/ออเดอร์/จำนวนขาย", "ตัวชี้วัดหลัก ปรับตามช่วงเวลาและตัวกรอง พร้อม ▲▼ เมื่อเปิดการเทียบ"], ["มูลค่า/ออเดอร์ (AOV)", "ยอดขาย÷ออเดอร์ = ลูกค้าจ่ายเฉลี่ยต่อบิล"], ["แนวโน้มรายเดือน", "ดู seasonality และผลแคมเปญ ปรับตามตัวกรอง"], ["Channel", "สัดส่วนช่องทางขาย สีตามมาตรฐาน"], ["ภาค", "ภูมิภาคลูกค้า ใช้เลือกพื้นที่ยิงโฆษณา"]] })));
}
/* ============================ Group: SKU tab ============================ */
function SkuTab({ gkey, A, cmpOn, Acmp, range }) {
    const G = D.g[gkey];
    const gInfo = D.groups.find(x => x.key === gkey) || { name: gkey };
    const [sortKey, setSortKey] = useState("q");
    const [typeF, setTypeF] = useState("ทั้งหมด");
    const [view, setView] = useState("master");
    const rows = useMemo(() => {
        let r;
        if (view === "master") {
            const mm = {};
            for (const [sid, v] of Object.entries(A.bySku)) {
                const m = G.meta[+sid];
                const b = m.base;
                const e = mm[b] || (mm[b] = { sku: b, base: b, name: m.name, type: m.type, price_sell: m.price_sell, pa: 0, pan: 0, q: 0, r: 0, o: 0, vars: 0, cq: 0 });
                e.q += v.q;
                e.r += v.r;
                e.o += v.o;
                e.vars++;
                if (m.price_avg) {
                    e.pa += m.price_avg;
                    e.pan++;
                }
                if (m.price_sell != null)
                    e.price_sell = m.price_sell;
                if (m.sku === b || (!m.sku.startsWith("N_") && !m.sku.startsWith("X_")))
                    e.name = m.name;
                if (cmpOn && Acmp && Acmp.bySku[sid])
                    e.cq += Acmp.bySku[sid].q;
            }
            r = Object.values(mm).map(e => ({ ...e, price_avg: e.pan ? Math.round(e.pa / e.pan) : 0, cq: cmpOn ? e.cq : null }));
        }
        else {
            r = Object.entries(A.bySku).map(([sid, v]) => {
                const m = G.meta[+sid];
                return { ...m, q: v.q, r: v.r, o: v.o, vars: 1, cq: cmpOn && Acmp ? (Acmp.bySku[sid] ? Acmp.bySku[sid].q : 0) : null };
            });
        }
        if (typeF !== "ทั้งหมด")
            r = r.filter(x => x.type === typeF);
        r.sort((x, y) => (y[sortKey] || 0) - (x[sortKey] || 0));
        return r;
    }, [A, typeF, sortKey, cmpOn, Acmp, view]);
    const types = ["ทั้งหมด", ...Array.from(new Set(G.meta.map(m => m.type)))];
    const isM = view === "master";
    const Th = ({ label, unit, k, right }) => (React.createElement("th", { onClick: k ? () => setSortKey(k) : undefined, style: { padding: "9px 8px", textAlign: right ? "right" : "left", fontWeight: 700, fontSize: 11, whiteSpace: "nowrap", cursor: k ? "pointer" : "default", background: sortKey === k ? T.primaryInk : T.ink, color: "#fff", position: "sticky", top: 0 } },
        label,
        unit && React.createElement("span", { style: { fontWeight: 400, opacity: .8 } },
            " (",
            unit,
            ")"),
        k && React.createElement("span", { style: { opacity: .6 } }, sortKey === k ? " ▾" : " ⇅")));
    return (React.createElement(React.Fragment, null,
        React.createElement(Card, { pad: 0 },
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", flexWrap: "wrap" } },
                React.createElement("h3", { style: { margin: 0, fontSize: 14, fontWeight: 800, color: T.ink } },
                    "\u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14",
                    isM ? "สินค้าหลัก" : " SKU"),
                React.createElement("span", { style: { fontSize: 11, color: T.faint } },
                    "\u0E40\u0E23\u0E35\u0E22\u0E07\u0E08\u0E32\u0E01\u0E02\u0E32\u0E22\u0E14\u0E35 \u00B7 ",
                    rows.length,
                    " ",
                    isM ? "สินค้าหลัก" : "SKU",
                    "\u0E17\u0E35\u0E48\u0E21\u0E35\u0E22\u0E2D\u0E14\u0E43\u0E19\u0E40\u0E07\u0E37\u0E48\u0E2D\u0E19\u0E44\u0E02\u0E17\u0E35\u0E48\u0E40\u0E25\u0E37\u0E2D\u0E01"),
                React.createElement("div", { style: { marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" } },
                    React.createElement("div", { style: { display: "flex", gap: 4, background: T.subtle, border: "1px solid " + T.border, borderRadius: 8, padding: 3 } }, [["master", "รวมสินค้าหลัก"], ["sku", "แยกช่องทาง (SKU)"]].map(([v, l]) => (React.createElement("button", { key: v, onClick: () => setView(v), style: { fontSize: 11.5, padding: "5px 11px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 700, background: view === v ? T.primary : "transparent", color: view === v ? "#fff" : T.muted } }, l)))),
                    React.createElement("span", { style: { fontSize: 11, color: T.muted } }, "\u0E1B\u0E23\u0E30\u0E40\u0E20\u0E17:"),
                    React.createElement("select", { value: typeF, onChange: e => setTypeF(e.target.value), style: selStyle }, types.map(t => React.createElement("option", { key: t }, t))),
                    React.createElement("button", { style: CSV_BTN, onClick: () => {
                            const head = [isM ? "รหัสสินค้าหลัก" : "รหัสสินค้า", "ชื่อสินค้า", "ประเภท", "ราคาขาย(บาท)", "ราคาเฉลี่ยจริง(บาท)", "จำนวนขาย(ชิ้น)", "ยอดขาย(บาท)", "ออเดอร์"];
                            const body = rows.map(s => [s.sku, s.name, s.type, s.price_sell == null ? "" : s.price_sell, s.price_avg || "", s.q, s.r, s.o]);
                            downloadCSV(gInfo.name + "_SKU_" + MONFULL[range[0]] + "-" + MONFULL[range[1]] + ".csv", [head, ...body]);
                        } }, "\u2B07 Export CSV"))),
            React.createElement("div", { style: { overflowX: "auto" } },
                React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 11.5, minWidth: 900 } },
                    React.createElement("thead", null,
                        React.createElement("tr", null,
                            React.createElement(Th, { label: "#" }),
                            React.createElement(Th, { label: isM ? "รหัสสินค้าหลัก (Master)" : "รหัสสินค้า (SKU · แยกช่องทาง)" }),
                            React.createElement(Th, { label: "\u0E0A\u0E37\u0E48\u0E2D\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32" }),
                            React.createElement(Th, { label: "\u0E1B\u0E23\u0E30\u0E40\u0E20\u0E17" }),
                            React.createElement(Th, { label: "\u0E23\u0E32\u0E04\u0E32\u0E02\u0E32\u0E22", unit: "\u0E1A\u0E32\u0E17", right: true }),
                            React.createElement(Th, { label: "\u0E23\u0E32\u0E04\u0E32\u0E40\u0E09\u0E25\u0E35\u0E48\u0E22", unit: "\u0E1A\u0E32\u0E17", right: true }),
                            React.createElement(Th, { label: "\u0E08\u0E33\u0E19\u0E27\u0E19\u0E02\u0E32\u0E22", unit: "\u0E0A\u0E34\u0E49\u0E19", k: "q", right: true }),
                            React.createElement(Th, { label: "\u0E22\u0E2D\u0E14\u0E02\u0E32\u0E22", unit: "\u0E1A\u0E32\u0E17", k: "r", right: true }),
                            React.createElement(Th, { label: "\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C", unit: "\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C", k: "o", right: true }),
                            cmpOn && React.createElement(Th, { label: "\u0E42\u0E15/\u0E25\u0E14", unit: "%\u0E0A\u0E34\u0E49\u0E19", right: true }))),
                    React.createElement("tbody", null,
                        rows.map((s, i) => {
                            const bg = s.type === "ขาย" || s.type === "Set" ? "#fff" : s.type === "ของแถม" ? "#fffdf5" : "#fdf6f8";
                            return (React.createElement("tr", { key: s.sku, style: { background: bg, borderBottom: "1px solid #f0f1f3" } },
                                React.createElement("td", { style: { padding: "7px 8px", color: T.faint } }, i + 1),
                                React.createElement("td", { style: { padding: "7px 8px", fontFamily: "ui-monospace,monospace", fontSize: 10.5, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }, title: s.sku },
                                    s.sku,
                                    isM && s.vars > 1 && React.createElement("span", { style: { marginLeft: 5, fontFamily: "'Sarabun'", background: T.primarySoft, color: T.primaryInk, borderRadius: 4, padding: "1px 5px", fontSize: 9.5, fontWeight: 700 } },
                                        s.vars,
                                        " \u0E0A\u0E48\u0E2D\u0E07\u0E17\u0E32\u0E07")),
                                React.createElement("td", { style: { padding: "7px 8px", color: T.muted, maxWidth: 230, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: s.name }, s.name),
                                React.createElement("td", { style: { padding: "7px 8px" } },
                                    React.createElement(TypeBadge, { t: s.type })),
                                React.createElement("td", { style: { padding: "7px 8px", textAlign: "right", color: s.price_sell == null ? (s.price_avg ? T.muted : T.faint) : T.ink, fontWeight: s.price_sell == null ? 400 : 700 }, title: s.price_sell == null && s.price_avg ? "ไม่พบราคาอนุมัติ แสดงราคาเฉลี่ยจริงจากข้อมูลแทน" : "" }, s.price_sell != null ? fi(s.price_sell) : (s.price_avg ? "~" + fi(s.price_avg) : "(ไม่ทราบ)")),
                                React.createElement("td", { style: { padding: "7px 8px", textAlign: "right", color: T.muted, fontVariantNumeric: "tabular-nums" } }, s.price_avg ? fi(s.price_avg) : "—"),
                                React.createElement("td", { style: { padding: "7px 8px", textAlign: "right", fontWeight: 700, color: T.ink, fontVariantNumeric: "tabular-nums" } }, fi(s.q)),
                                React.createElement("td", { style: { padding: "7px 8px", textAlign: "right", color: T.ink, fontVariantNumeric: "tabular-nums" } }, fi(s.r)),
                                React.createElement("td", { style: { padding: "7px 8px", textAlign: "right", color: T.muted, fontVariantNumeric: "tabular-nums" } }, fi(s.o)),
                                cmpOn && React.createElement("td", { style: { padding: "7px 8px", textAlign: "right" } },
                                    React.createElement(Delta, { cur: s.q, prev: s.cq }))));
                        }),
                        rows.length === 0 && React.createElement("tr", null,
                            React.createElement("td", { colSpan: cmpOn ? 10 : 9, style: { padding: 24, textAlign: "center", color: T.faint } }, "\u0E44\u0E21\u0E48\u0E21\u0E35 SKU \u0E17\u0E35\u0E48\u0E15\u0E23\u0E07\u0E40\u0E07\u0E37\u0E48\u0E2D\u0E19\u0E44\u0E02")))))),
        React.createElement(DataGuide, { note: "\u0E2A\u0E25\u0E31\u0E1A\u0E21\u0E38\u0E21\u0E21\u0E2D\u0E07\u0E44\u0E14\u0E49: '\u0E23\u0E27\u0E21\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32\u0E2B\u0E25\u0E31\u0E01' \u0E23\u0E27\u0E21\u0E17\u0E38\u0E01\u0E0A\u0E48\u0E2D\u0E07\u0E17\u0E32\u0E07\u0E02\u0E2D\u0E07\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32\u0E40\u0E14\u0E35\u0E22\u0E27\u0E01\u0E31\u0E19\u0E40\u0E1B\u0E47\u0E19\u0E1A\u0E23\u0E23\u0E17\u0E31\u0E14\u0E40\u0E14\u0E35\u0E22\u0E27 (W1X1REN + N_W1X1REN + X_W1X1REN = \u0E15\u0E31\u0E27\u0E40\u0E14\u0E35\u0E22\u0E27) \u00B7 '\u0E41\u0E22\u0E01\u0E0A\u0E48\u0E2D\u0E07\u0E17\u0E32\u0E07' \u0E41\u0E2A\u0E14\u0E07\u0E17\u0E38\u0E01\u0E23\u0E2B\u0E31\u0E2A\u0E41\u0E22\u0E01\u0E01\u0E31\u0E19 \u00B7 \u0E15\u0E32\u0E23\u0E32\u0E07\u0E1B\u0E23\u0E31\u0E1A\u0E15\u0E32\u0E21\u0E0A\u0E48\u0E27\u0E07\u0E40\u0E27\u0E25\u0E32 + \u0E15\u0E31\u0E27\u0E01\u0E23\u0E2D\u0E07\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32 \u00B7 \u0E23\u0E32\u0E04\u0E32\u0E02\u0E32\u0E22\u0E2D\u0E49\u0E32\u0E07\u0E2D\u0E34\u0E07\u0E44\u0E1F\u0E25\u0E4C\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34\u0E23\u0E32\u0E04\u0E32\u0E02\u0E32\u0E22 2026 \u2014 \u0E17\u0E35\u0E48\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E41\u0E2A\u0E14\u0E07 (\u0E44\u0E21\u0E48\u0E17\u0E23\u0E32\u0E1A)", items: [["รหัสสินค้าหลัก (Master)", "รหัสสินค้าจริงที่ไม่ซ้ำ ตัดคำนำหน้าช่องทางออก · ป้าย 'n ช่องทาง' = มีกี่รหัสย่อย"], ["รหัสสินค้า (SKU · แยกช่องทาง)", "รหัสรายช่องทาง — N_=ลิสต์ MarketPlace, X_=ลิสต์ Online, ไม่มีคำนำหน้า=Telesale/ทั่วไป, C_=จัดเซ็ต"], ["ประเภท", "ขาย/Set/ของแถม/Tester (สินค้าราคา 0 บาทจัดเป็นของแถม)"], ["ราคาขาย (บาท)", "ราคาอนุมัติขายจากไฟล์ราคา 2026 · (ไม่ทราบ)=ยังไม่พบ/ยังไม่ยืนยัน (เช่น เซ็ต)"], ["ราคาเฉลี่ย (บาท)", "ราคาขายจริงเฉลี่ยจากข้อมูล (สะท้อนโปรฯ/ส่วนลด)"], ["จำนวนขาย (ชิ้น)", "ตัวชี้วัดความขายดีหลัก · ในมุมมองสินค้าหลักคือยอดรวมทุกช่องทาง"]] })));
}
/* ============================ Group: Customer tab ============================ */
function CustomerTab({ gkey, A }) {
    const G = D.g[gkey];
    const { byDim, tot } = A;
    const chRows = dimRows(byDim.channel, G.dict.channel);
    const totCh = chRows.reduce((s, r) => s + r.o, 0);
    const chPie = chRows.map(r => ({ name: r.n, value: r.o, fill: chColor(r.n) }));
    const reg = dimRows(byDim.region, G.dict.region, { dropRegionBlank: true, top: 8 });
    const prov = dimRows(byDim.prov, G.dict.prov, { top: 15 });
    const page = dimRows(byDim.page, G.dict.page, { top: 8 });
    const setr = dimRows(byDim.set, G.dict.set, { top: 8 });
    const team = dimRows(byDim.team, G.dict.team, { top: 8 });
    const sales = dimRows(byDim.sales, G.dict.sales, { top: 10 });
    const ship = dimRows(byDim.ship, G.dict.ship, { top: 10 });
    const gInfo = D.groups.find(x => x.key === gkey) || { name: gkey };
    const exportAll = () => {
        const dims = [["ภาค", reg], ["จังหวัด", prov], ["เพจ/ร้าน", page], ["Channel", chRows], ["รหัส SET", setr], ["ทีม Telesale", team], ["พนักงานขาย", sales], ["ขนส่ง", ship]];
        const out = [["มิติ", "ค่า", "ออเดอร์", "จำนวนขาย(ชิ้น)"]];
        dims.forEach(([lab, rows]) => rows.forEach(r => out.push([lab, r.n, r.o, r.q])));
        downloadCSV(gInfo.name + "_เจาะลึกลูกค้า.csv", out);
    };
    return (React.createElement(React.Fragment, null,
        React.createElement("div", { style: { display: "flex", justifyContent: "flex-end", marginBottom: 10 } },
            React.createElement("button", { style: CSV_BTN, onClick: exportAll }, "\u2B07 Export \u0E1C\u0E25\u0E40\u0E08\u0E32\u0E30\u0E25\u0E36\u0E01\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32 (CSV)")),
        G.cust && G.cust.total_known > 0 && (() => {
            const C = G.cust;
            const rr = C.total_known ? C.repeat / C.total_known * 100 : 0;
            return (React.createElement(Card, { title: "\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32\u0E0B\u0E37\u0E49\u0E2D\u0E0B\u0E49\u0E33 (\u0E01\u0E25\u0E38\u0E48\u0E21\u0E19\u0E35\u0E49 \u00B7 18 \u0E40\u0E14\u0E37\u0E2D\u0E19\u0E40\u0E15\u0E47\u0E21)", hint: "\u0E08\u0E32\u0E01\u0E40\u0E1A\u0E2D\u0E23\u0E4C\u0E42\u0E17\u0E23\u0E17\u0E35\u0E48\u0E44\u0E21\u0E48\u0E0B\u0E49\u0E33 \u00B7 \u0E44\u0E21\u0E48\u0E1B\u0E23\u0E31\u0E1A\u0E15\u0E32\u0E21\u0E15\u0E31\u0E27\u0E01\u0E23\u0E2D\u0E07", pad: 14 },
                React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(135px,1fr))", gap: 10, marginBottom: 12 } },
                    React.createElement(Kpi, { label: "\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32\u0E23\u0E30\u0E1A\u0E38\u0E15\u0E31\u0E27\u0E44\u0E14\u0E49", value: fi(C.total_known) + " คน", accent: T.k1 }),
                    React.createElement(Kpi, { label: "\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32\u0E0B\u0E49\u0E33 (2+ \u0E04\u0E23\u0E31\u0E49\u0E07)", value: fi(C.repeat) + " คน", accent: T.k2, sub: rr.toFixed(1) + "% ของที่ระบุได้" }),
                    React.createElement(Kpi, { label: "\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32\u0E1B\u0E23\u0E30\u0E08\u0E33 (5+ \u0E04\u0E23\u0E31\u0E49\u0E07)", value: fi(C.loyal) + " คน", accent: T.k3 }),
                    React.createElement(Kpi, { label: "CLV \u0E40\u0E09\u0E25\u0E35\u0E48\u0E22", value: fb(C.clv_avg), accent: T.k4, sub: "เฉลี่ย " + C.avg_orders + " ออเดอร์/คน" }),
                    C.unk_orders > 0 && React.createElement(Kpi, { label: "\u0E44\u0E21\u0E48\u0E17\u0E23\u0E32\u0E1A (PDPA)", value: fi(C.unk_orders) + " ออเดอร์", accent: T.k4, sub: "\u0E40\u0E1A\u0E2D\u0E23\u0E4C PDPA/\u0E27\u0E48\u0E32\u0E07" })),
                React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: T.ink, marginBottom: 4 } }, "\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32\u0E43\u0E2B\u0E21\u0E48 vs \u0E0B\u0E37\u0E49\u0E2D\u0E0B\u0E49\u0E33 vs \u0E44\u0E21\u0E48\u0E17\u0E23\u0E32\u0E1A \u0E23\u0E32\u0E22\u0E40\u0E14\u0E37\u0E2D\u0E19 (\u0E01\u0E25\u0E38\u0E48\u0E21\u0E19\u0E35\u0E49)"),
                React.createElement(ResponsiveContainer, { width: "100%", height: 150 },
                    React.createElement(BarChart, { data: C.monthly_nr.map((d, i) => ({ m: monShort(D.months[i]), n: d[0], r: d[1], u: d[2] })), margin: { left: -10, right: 8 } },
                        React.createElement(CartesianGrid, { strokeDasharray: "3 3", stroke: "#eef0f2", vertical: false }),
                        React.createElement(XAxis, { dataKey: "m", tick: { fontSize: 9, fill: T.muted } }),
                        React.createElement(YAxis, { tick: { fontSize: 9, fill: T.muted }, tickFormatter: fc }),
                        React.createElement(Tooltip, { contentStyle: { fontSize: 12, borderRadius: 8 } }),
                        React.createElement(Bar, { dataKey: "u", name: "\u0E44\u0E21\u0E48\u0E17\u0E23\u0E32\u0E1A (PDPA)", stackId: "a", fill: "#e5e7eb" }),
                        React.createElement(Bar, { dataKey: "n", name: "\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32\u0E43\u0E2B\u0E21\u0E48", stackId: "a", fill: "#94a3b8" }),
                        React.createElement(Bar, { dataKey: "r", name: "\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32\u0E0B\u0E37\u0E49\u0E2D\u0E0B\u0E49\u0E33", stackId: "a", fill: "#475569", radius: [3, 3, 0, 0] }))),
                React.createElement("div", { style: { display: "flex", gap: 14, justifyContent: "center", marginTop: 4, fontSize: 11, color: T.muted } },
                    React.createElement("span", null,
                        "\u2587 ",
                        React.createElement("span", { style: { color: "#e5e7eb", fontWeight: 700, textShadow: "0 0 1px #999" } }, "\u0E08\u0E32\u0E07"),
                        " = \u0E44\u0E21\u0E48\u0E17\u0E23\u0E32\u0E1A"),
                    React.createElement("span", null,
                        "\u2587 ",
                        React.createElement("span", { style: { color: "#94a3b8", fontWeight: 700 } }, "\u0E40\u0E17\u0E32\u0E2D\u0E48\u0E2D\u0E19"),
                        " = \u0E43\u0E2B\u0E21\u0E48"),
                    React.createElement("span", null,
                        "\u2587 ",
                        React.createElement("span", { style: { color: "#475569", fontWeight: 700 } }, "\u0E40\u0E17\u0E32\u0E40\u0E02\u0E49\u0E21"),
                        " = \u0E0B\u0E37\u0E49\u0E2D\u0E0B\u0E49\u0E33"))));
        })(),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 14, marginTop: 14 } },
            React.createElement(Kpi, { label: "ออเดอร์ (บิล)" + (A.ordExact ? "" : " ≈"), value: (A.ordExact ? "" : "≈") + fc(tot.o), accent: T.k1, sub: A.ordExact ? fi(tot.o) + " บิลไม่ซ้ำ" : "ประมาณ (เปิดตัวกรอง)" }),
            React.createElement(Kpi, { label: "\u0E08\u0E33\u0E19\u0E27\u0E19\u0E02\u0E32\u0E22 (\u0E0A\u0E34\u0E49\u0E19)", value: fc(tot.q), accent: T.k3, sub: fi(tot.q) + " ชิ้น" }),
            React.createElement(Kpi, { label: "\u0E22\u0E2D\u0E14\u0E02\u0E32\u0E22 (\u0E1A\u0E32\u0E17)", value: fbc(tot.r), accent: T.k2, sub: fb(tot.r) })),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 } },
            React.createElement(Card, { title: "\u0E15\u0E32\u0E21 Channel", hint: "\u0E41\u0E22\u0E01\u0E2A\u0E35\u0E15\u0E32\u0E21 guideline (\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C)" },
                React.createElement("div", { style: { display: "flex", gap: 14, alignItems: "center" } },
                    React.createElement(ResponsiveContainer, { width: "45%", height: 168 },
                        React.createElement(PieChart, null,
                            React.createElement(Pie, { data: chPie, dataKey: "value", nameKey: "name", cx: "50%", cy: "50%", outerRadius: 68, innerRadius: 38, paddingAngle: 2, label: ({ percent }) => percent > 0.08 ? (percent * 100).toFixed(0) + "%" : "", labelLine: false, style: { fontSize: 10, fontWeight: 700 } }, chPie.map((e, i) => React.createElement(Cell, { key: i, fill: e.fill }))),
                            React.createElement(Tooltip, { formatter: v => fi(v) + " ออเดอร์", contentStyle: { fontSize: 12, borderRadius: 8 } }))),
                    React.createElement("div", { style: { flex: 1, display: "flex", flexDirection: "column", gap: 6 } },
                        chRows.map((r, i) => (React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 8, fontSize: 11.5 } },
                            React.createElement("span", { style: { width: 11, height: 11, borderRadius: 3, background: chColor(r.n), flexShrink: 0 } }),
                            React.createElement("span", { style: { color: T.ink, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, r.n),
                            React.createElement("span", { style: { fontWeight: 700 } }, fi(r.o)),
                            React.createElement("span", { style: { color: T.faint, width: 42, textAlign: "right" } },
                                totCh ? (r.o / totCh * 100).toFixed(1) : 0,
                                "%")))),
                        chRows.length === 0 && React.createElement("div", { style: { fontSize: 12, color: T.faint } }, "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25")))),
            React.createElement(Card, { title: "\u0E15\u0E32\u0E21\u0E20\u0E32\u0E04", hint: "\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C" },
                React.createElement(RankBars, { rows: reg, unit: "\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C" }))),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 } },
            React.createElement(Card, { title: "\u0E08\u0E31\u0E07\u0E2B\u0E27\u0E31\u0E14\u0E22\u0E2D\u0E14\u0E19\u0E34\u0E22\u0E21", hint: "Top 15 (\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C)" },
                React.createElement(RankBars, { rows: prov, unit: "\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C" })),
            React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
                React.createElement(Card, { title: "\u0E40\u0E1E\u0E08 / \u0E23\u0E49\u0E32\u0E19 \u00B7 \u0E0A\u0E48\u0E2D\u0E07\u0E17\u0E32\u0E07\u0E15\u0E34\u0E14\u0E15\u0E48\u0E2D", hint: "Top 8 (\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C)" },
                    React.createElement(RankBars, { rows: page, unit: "\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C" })),
                React.createElement(Card, { title: "\u0E23\u0E2B\u0E31\u0E2A SET", hint: "\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C" },
                    React.createElement(RankBars, { rows: setr, unit: "\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C" })))),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 } },
            React.createElement(Card, { title: "\u0E17\u0E35\u0E21 Telesale", hint: "\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C" },
                React.createElement(RankBars, { rows: team, unit: "\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C" })),
            React.createElement(Card, { title: "\u0E1E\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19\u0E02\u0E32\u0E22", hint: "Top 10 (\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C)" },
                React.createElement(RankBars, { rows: sales, unit: "\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C" })),
            React.createElement(Card, { title: "\u0E02\u0E19\u0E2A\u0E48\u0E07", hint: "Top 10 (\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C)" },
                React.createElement(RankBars, { rows: ship, unit: "\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C" }))),
        React.createElement("div", { style: { fontSize: 11.5, color: T.muted, background: "#FFF8E6", border: "1px solid #F0DFA8", borderRadius: 9, padding: "9px 13px", marginTop: 14 } },
            "\u2139\uFE0F ",
            React.createElement("b", null, "\u0E40\u0E23\u0E37\u0E48\u0E2D\u0E07 \"\u0E44\u0E21\u0E48\u0E23\u0E30\u0E1A\u0E38 / \u0E27\u0E48\u0E32\u0E07\u0E40\u0E1B\u0E25\u0E48\u0E32\":"),
            " \u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C\u0E08\u0E32\u0E01 Marketplace (Shopee/Lazada/TikTok) \u0E21\u0E31\u0E01\u0E44\u0E21\u0E48\u0E2A\u0E48\u0E07\u0E17\u0E35\u0E48\u0E2D\u0E22\u0E39\u0E48/\u0E1C\u0E39\u0E49\u0E02\u0E32\u0E22\u0E21\u0E32\u0E43\u0E19\u0E23\u0E30\u0E1A\u0E1A \u0E08\u0E36\u0E07\u0E02\u0E36\u0E49\u0E19\u0E40\u0E1B\u0E47\u0E19 \"\u0E44\u0E21\u0E48\u0E23\u0E30\u0E1A\u0E38\" \u2014 \u0E44\u0E21\u0E48\u0E43\u0E0A\u0E48\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E2B\u0E32\u0E22 \u0E41\u0E15\u0E48\u0E40\u0E1B\u0E47\u0E19\u0E02\u0E49\u0E2D\u0E08\u0E33\u0E01\u0E31\u0E14\u0E08\u0E32\u0E01\u0E0A\u0E48\u0E2D\u0E07\u0E17\u0E32\u0E07\u0E19\u0E31\u0E49\u0E19"),
        React.createElement(DataGuide, { note: "\u0E17\u0E38\u0E01\u0E01\u0E32\u0E23\u0E4C\u0E14\u0E1B\u0E23\u0E31\u0E1A\u0E15\u0E32\u0E21\u0E0A\u0E48\u0E27\u0E07\u0E40\u0E27\u0E25\u0E32 + \u0E15\u0E31\u0E27\u0E01\u0E23\u0E2D\u0E07\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32\u0E17\u0E38\u0E01\u0E0A\u0E48\u0E2D\u0E07\u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E01\u0E31\u0E19 (cross-filter) \u0E40\u0E0A\u0E48\u0E19 \u0E40\u0E25\u0E37\u0E2D\u0E01\u0E2B\u0E25\u0E32\u0E22 SKU + \u0E20\u0E32\u0E04\u0E01\u0E25\u0E32\u0E07 + Channel Telesale \u0E08\u0E30\u0E40\u0E2B\u0E47\u0E19\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32\u0E17\u0E35\u0E48\u0E15\u0E23\u0E07\u0E17\u0E38\u0E01\u0E40\u0E07\u0E37\u0E48\u0E2D\u0E19\u0E44\u0E02 \u00B7 \u0E08\u0E31\u0E07\u0E2B\u0E27\u0E31\u0E14\u0E08\u0E30\u0E25\u0E34\u0E07\u0E01\u0E4C\u0E01\u0E31\u0E1A\u0E20\u0E32\u0E04\u0E17\u0E35\u0E48\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34 \u00B7 \u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C\u0E43\u0E19\u0E01\u0E32\u0E23\u0E4C\u0E14\u0E22\u0E48\u0E2D\u0E22\u0E19\u0E31\u0E1A\u0E15\u0E32\u0E21\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23 (\u0E42\u0E14\u0E22\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13) \u0E2A\u0E48\u0E27\u0E19 KPI \u0E14\u0E49\u0E32\u0E19\u0E1A\u0E19\u0E40\u0E1B\u0E47\u0E19\u0E1A\u0E34\u0E25\u0E44\u0E21\u0E48\u0E0B\u0E49\u0E33\u0E08\u0E23\u0E34\u0E07\u0E40\u0E21\u0E37\u0E48\u0E2D\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E40\u0E1B\u0E34\u0E14\u0E15\u0E31\u0E27\u0E01\u0E23\u0E2D\u0E07", items: [["ภาค / จังหวัด", "ที่อยู่ลูกค้า ใช้ดูพื้นที่ขายดีเพื่อวางแผนโฆษณา geo-target · เลือกภาคแล้วจังหวัดจะแสดงเฉพาะในภาคนั้น"], ["Channel (แยกสี)", "5 ช่องทางหลักตามสีมาตรฐาน"], ["เพจ/ร้าน · ช่องทางติดต่อ", "เพจ FB / ร้าน Shopee-Lazada-TikTok / Line ที่ลูกค้าติดต่อ"], ["ทีม Telesale", "ทีมผู้ดูแลออเดอร์"], ["พนักงานขาย", "ชื่อเล่น·ทีม (จากไฟล์รายชื่อ Telesales) หรือชื่อบัญชีผู้สร้างออเดอร์"], ["รหัส SET", "ชุดโปรโมชั่นที่ลูกค้าซื้อ (SET0–SET6)"], ["ขนส่ง", "บริษัทขนส่ง ดูสัดส่วน COD"], ["ออเดอร์", "จำนวนบิล = ลูกค้าโดยประมาณ (นับตามรายการเมื่อกรองหลายมิติ)"]] })));
}
/* ============================ Group: Returns tab (CN) ============================ */
function ReturnsTab({ gkey }) {
    const G = D.g[gkey];
    const cn = G.cn;
    if (!cn || cn.n === 0)
        return React.createElement(Card, null,
            React.createElement("div", { style: { padding: 24, textAlign: "center", color: T.faint } }, "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E04\u0E37\u0E19\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E01\u0E25\u0E38\u0E48\u0E21\u0E19\u0E35\u0E49"));
    const g = D.groups.find(x => x.key === gkey) || { name: gkey, revenue: 0 };
    const retRate = g.revenue ? cn.rev_net / g.revenue * 100 : 0;
    const trend = cn.monthly.map((d, i) => ({ m: monShort(D.months[i]), n: d[0], rev: d[1] }));
    const chRows = Object.entries(cn.by_ch).map(([k, v]) => ({ ch: k, cnt: v.n, rev: v.rev })).sort((a, b) => b.cnt - a.cnt);
    const totCh = chRows.reduce((s, r) => s + r.cnt, 0);
    return (React.createElement(React.Fragment, null,
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))", gap: 12, marginBottom: 16 } },
            React.createElement(Kpi, { label: "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E04\u0E37\u0E19\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14", value: fi(cn.n) + " รายการ", accent: T.k1 }),
            React.createElement(Kpi, { label: "\u0E22\u0E2D\u0E14\u0E04\u0E37\u0E19 (\u0E1A\u0E32\u0E17)", value: fbc(cn.rev_net), accent: T.k2, sub: "ก่อนหักค่าส่ง " + fb(cn.rev) }),
            React.createElement(Kpi, { label: "\u0E2D\u0E31\u0E15\u0E23\u0E32\u0E04\u0E37\u0E19", value: retRate.toFixed(1) + "%", accent: T.k3, sub: "ยอดคืน/ยอดขาย ·" + (retRate > 10 ? " สูง" : "ปกติ") }),
            React.createElement(Kpi, { label: "\u0E40\u0E09\u0E25\u0E35\u0E48\u0E22/\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23", value: fb(cn.n ? Math.round(cn.rev_net / cn.n) : 0), accent: T.k4 })),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14, marginBottom: 14 } },
            React.createElement(Card, { title: "\u0E41\u0E19\u0E27\u0E42\u0E19\u0E49\u0E21\u0E01\u0E32\u0E23\u0E04\u0E37\u0E19\u0E23\u0E32\u0E22\u0E40\u0E14\u0E37\u0E2D\u0E19", hint: "\u0E08\u0E33\u0E19\u0E27\u0E19\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23 + \u0E22\u0E2D\u0E14\u0E04\u0E37\u0E19" },
                React.createElement(ResponsiveContainer, { width: "100%", height: 220 },
                    React.createElement(BarChart, { data: trend, margin: { left: -8, right: 10 } },
                        React.createElement(CartesianGrid, { strokeDasharray: "3 3", stroke: "#eef0f2", vertical: false }),
                        React.createElement(XAxis, { dataKey: "m", tick: { fontSize: 10, fill: T.muted } }),
                        React.createElement(YAxis, { yAxisId: "l", tick: { fontSize: 10, fill: T.muted } }),
                        React.createElement(YAxis, { yAxisId: "r", orientation: "right", tick: { fontSize: 10, fill: T.muted }, tickFormatter: fbc }),
                        React.createElement(Tooltip, { contentStyle: { fontSize: 12, borderRadius: 8 }, formatter: (v, name) => name === "ยอดคืน (บาท)" ? fb(v) : fi(v) + " รายการ" }),
                        React.createElement(Bar, { yAxisId: "l", dataKey: "n", name: "\u0E08\u0E33\u0E19\u0E27\u0E19\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23", fill: "#94a3b8", radius: [4, 4, 0, 0] }),
                        React.createElement(Line, { yAxisId: "r", type: "monotone", dataKey: "rev", name: "\u0E22\u0E2D\u0E14\u0E04\u0E37\u0E19 (\u0E1A\u0E32\u0E17)", stroke: T.down, strokeWidth: 2, dot: false })))),
            React.createElement(Card, { title: "\u0E01\u0E32\u0E23\u0E04\u0E37\u0E19\u0E41\u0E22\u0E01\u0E15\u0E32\u0E21 Channel", hint: "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23 + \u0E22\u0E2D\u0E14\u0E04\u0E37\u0E19" },
                React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
                    chRows.map((r, i) => (React.createElement("div", { key: i },
                        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 2 } },
                            React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 7 } },
                                React.createElement("span", { style: { width: 10, height: 10, borderRadius: 3, background: chColor(r.ch), flexShrink: 0 } }),
                                React.createElement("span", { style: { color: T.ink, fontWeight: 600 } }, r.ch)),
                            React.createElement("span", { style: { color: T.muted } },
                                fi(r.cnt),
                                " \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23 \u00B7 ",
                                fb(r.rev))),
                        React.createElement("div", { style: { background: "#f1f2f4", borderRadius: 5, height: 12, overflow: "hidden" } },
                            React.createElement("div", { style: { height: "100%", width: (totCh ? r.cnt / totCh * 100 : 0) + "%", background: chColor(r.ch), borderRadius: 5, opacity: .7 } }))))),
                    chRows.length === 0 && React.createElement("div", { style: { fontSize: 12, color: T.faint } }, "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25")))),
        React.createElement(DataGuide, { note: "\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E04\u0E37\u0E19\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32 (Credit Note) \u0E41\u0E22\u0E01\u0E08\u0E32\u0E01\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E02\u0E32\u0E22\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14 \u2014 \u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E16\u0E39\u0E01\u0E2B\u0E31\u0E01\u0E2D\u0E2D\u0E01\u0E08\u0E32\u0E01\u0E22\u0E2D\u0E14\u0E02\u0E32\u0E22\u0E43\u0E19\u0E41\u0E17\u0E47\u0E1A\u0E2D\u0E37\u0E48\u0E19 \u00B7 \u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C\u0E17\u0E35\u0E48\u0E16\u0E39\u0E01\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01 (DE) \u0E16\u0E39\u0E01\u0E25\u0E1A\u0E2D\u0E2D\u0E01\u0E08\u0E32\u0E01\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E02\u0E32\u0E22\u0E41\u0E25\u0E49\u0E27 \u0E44\u0E21\u0E48\u0E43\u0E0A\u0E48\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E40\u0E14\u0E35\u0E22\u0E27\u0E01\u0E31\u0E19", items: [["รายการคืน (CN)", "Credit Note = ลูกค้าได้รับสินค้าแล้วแต่คืน/เคลม ระบบออก CN ให้ แยกจากการยกเลิก"], ["ยอดคืน (บาท)", "มูลค่าที่คืนหักค่าส่ง"], ["อัตราคืน (%)", "ยอดคืน ÷ ยอดขายกลุ่มนี้ (18 เดือน) ถ้า >10% ควรตรวจสอบ"], ["ออเดอร์ยกเลิก (DE)", "ถูกลบออกจากข้อมูลขายทุกหน้าแล้ว (515 ออเดอร์ / ฿566K) ไม่ซ้ำกับ CN"]] })));
}
/* ============================ Group container ============================ */
function GroupView({ gkey, range, setRange, compare, setCompare, cmpRange, filters, setFilters, onBack }) {
    const [tab, setTab] = useState("overview");
    const A = useMemo(() => computeAll(gkey, filters, range, cmpRange), [gkey, filters, range, cmpRange]);
    const Acmp = A; // cmp totals embedded in A.cmp; bySku cmp needs separate calc for table deltas
    const AcmpFull = useMemo(() => cmpRange ? computeAll(gkey, filters, cmpRange, null) : null, [gkey, filters, cmpRange]);
    const g = D.groups.find(x => x.key === gkey);
    const cmpOn = !!cmpRange;
    return (React.createElement(React.Fragment, null,
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" } },
            React.createElement("button", { onClick: onBack, style: { fontSize: 12.5, padding: "6px 14px", borderRadius: 8, border: "1px solid " + T.border, background: T.surface, color: T.muted, cursor: "pointer", fontWeight: 600 } }, "\u2190 \u0E17\u0E38\u0E01\u0E01\u0E25\u0E38\u0E48\u0E21\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32"),
            React.createElement("span", { style: { width: 14, height: 14, borderRadius: 4, background: groupColor(gkey) } }),
            React.createElement("h2", { style: { margin: 0, fontSize: 19, fontWeight: 800, color: T.ink } }, g.name),
            React.createElement("span", { style: { fontSize: 12, color: T.faint } },
                g.skus,
                " SKU"),
            React.createElement("div", { style: { marginLeft: "auto", display: "flex", gap: 6, background: T.surface, border: "1px solid " + T.border, borderRadius: 9, padding: 4 } }, [["overview", "ภาพรวมกลุ่ม"], ["sku", "รายละเอียด SKU"], ["customer", "เจาะลึกลูกค้า"], ["returns", "รายการคืนสินค้า"]].map(([v, l]) => (React.createElement("button", { key: v, onClick: () => setTab(v), style: { fontSize: 12.5, padding: "6px 14px", borderRadius: 7, border: "none", cursor: "pointer", fontWeight: 700, background: tab === v ? T.ink : "transparent", color: tab === v ? "#fff" : T.muted } }, l))))),
        React.createElement(PeriodBar, { range: range, setRange: setRange, compare: compare, setCompare: setCompare, monthly: A.monthly, cmpRange: cmpRange }),
        tab !== "returns" && React.createElement(FilterBar, { gkey: gkey, filters: filters, setFilters: setFilters, range: range }),
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, margin: "0 0 12px", fontSize: 12.5, color: T.muted, background: T.subtle, border: "1px solid " + T.border, borderRadius: 9, padding: "9px 13px" } },
            React.createElement("span", { style: { fontSize: 15 } }, tab === "overview" ? "📊" : tab === "sku" ? "📦" : tab === "customer" ? "🎯" : "↩️"),
            tab === "overview" && React.createElement("span", null,
                React.createElement("b", { style: { color: T.ink } }, "\u0E20\u0E32\u0E1E\u0E23\u0E27\u0E21\u0E01\u0E25\u0E38\u0E48\u0E21"),
                " \u2014 \u0E2A\u0E23\u0E38\u0E1B\u0E22\u0E2D\u0E14\u0E02\u0E32\u0E22 \u0E41\u0E19\u0E27\u0E42\u0E19\u0E49\u0E21\u0E23\u0E32\u0E22\u0E40\u0E14\u0E37\u0E2D\u0E19 \u0E41\u0E25\u0E30\u0E0A\u0E48\u0E2D\u0E07\u0E17\u0E32\u0E07/\u0E20\u0E32\u0E04\u0E02\u0E2D\u0E07\u0E01\u0E25\u0E38\u0E48\u0E21\u0E19\u0E35\u0E49 \u0E14\u0E39\u0E20\u0E32\u0E1E\u0E01\u0E27\u0E49\u0E32\u0E07\u0E01\u0E48\u0E2D\u0E19\u0E40\u0E08\u0E32\u0E30"),
            tab === "sku" && React.createElement("span", null,
                React.createElement("b", { style: { color: T.ink } }, "\u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14 SKU"),
                " \u2014 \u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32\u0E41\u0E15\u0E48\u0E25\u0E30\u0E15\u0E31\u0E27\u0E02\u0E32\u0E22\u0E44\u0E14\u0E49\u0E40\u0E17\u0E48\u0E32\u0E44\u0E23 \u0E23\u0E32\u0E04\u0E32\u0E40\u0E17\u0E48\u0E32\u0E44\u0E23 \u0E2A\u0E25\u0E31\u0E1A\u0E14\u0E39\u0E41\u0E1A\u0E1A \"\u0E23\u0E27\u0E21\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32\u0E2B\u0E25\u0E31\u0E01\" \u0E2B\u0E23\u0E37\u0E2D \"\u0E41\u0E22\u0E01\u0E0A\u0E48\u0E2D\u0E07\u0E17\u0E32\u0E07\" \u0E44\u0E14\u0E49"),
            tab === "customer" && React.createElement("span", null,
                React.createElement("b", { style: { color: T.ink } }, "\u0E40\u0E08\u0E32\u0E30\u0E25\u0E36\u0E01\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32"),
                " \u2014 \u0E25\u0E39\u0E01\u0E04\u0E49\u0E32\u0E02\u0E2D\u0E07\u0E01\u0E25\u0E38\u0E48\u0E21\u0E19\u0E35\u0E49\u0E2D\u0E22\u0E39\u0E48\u0E20\u0E32\u0E04/\u0E08\u0E31\u0E07\u0E2B\u0E27\u0E31\u0E14\u0E44\u0E2B\u0E19 \u0E21\u0E32\u0E08\u0E32\u0E01\u0E0A\u0E48\u0E2D\u0E07\u0E17\u0E32\u0E07/\u0E40\u0E1E\u0E08\u0E44\u0E2B\u0E19 \u0E43\u0E04\u0E23\u0E02\u0E32\u0E22 \u0E2A\u0E48\u0E07\u0E14\u0E49\u0E27\u0E22\u0E2D\u0E30\u0E44\u0E23"),
            tab === "returns" && React.createElement("span", null,
                React.createElement("b", { style: { color: T.ink } }, "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E04\u0E37\u0E19\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32"),
                " \u2014 Credit Note \u0E17\u0E35\u0E48\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E01\u0E31\u0E1A\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C\u0E43\u0E19\u0E01\u0E25\u0E38\u0E48\u0E21\u0E19\u0E35\u0E49 \u0E22\u0E2D\u0E14\u0E04\u0E37\u0E19 \u0E41\u0E19\u0E27\u0E42\u0E19\u0E49\u0E21\u0E23\u0E32\u0E22\u0E40\u0E14\u0E37\u0E2D\u0E19 \u0E41\u0E22\u0E01\u0E15\u0E32\u0E21\u0E0A\u0E48\u0E2D\u0E07\u0E17\u0E32\u0E07 \u00B7 ",
                React.createElement("b", { style: { color: T.down } }, "\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E23\u0E27\u0E21\u0E43\u0E19\u0E2B\u0E19\u0E49\u0E32\u0E20\u0E32\u0E1E\u0E23\u0E27\u0E21/SKU/\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32"))),
        tab === "overview" && React.createElement(GroupOverviewTab, { gkey: gkey, A: A, cmpOn: cmpOn, filters: filters, range: range }),
        tab === "sku" && React.createElement(SkuTab, { gkey: gkey, A: A, cmpOn: cmpOn, Acmp: AcmpFull, range: range }),
        tab === "customer" && React.createElement(CustomerTab, { gkey: gkey, A: A }),
        tab === "returns" && React.createElement(ReturnsTab, { gkey: gkey })));
}
/* ============================ App root ============================ */
function Main() {
    const [gkey, setGkey] = useState(null);
    const [range, setRange] = useState([0, 17]);
    const [compare, setCompare] = useState("none");
    const [filters, setFilters] = useState(emptyFilters());
    const [a, b] = range, len = b - a + 1;
    const cmpRange = useMemo(() => {
        if (compare === "none")
            return null;
        if (compare === "prev") {
            const pa = a - len, pb = a - 1;
            return pa >= 0 ? [pa, pb] : null;
        }
        if (compare === "yoy") {
            const pa = a - 12, pb = b - 12;
            return pa >= 0 ? [pa, pb] : null;
        }
        return null;
    }, [compare, a, b]);
    const pick = k => { setGkey(k); setFilters(emptyFilters()); };
    const jump = (gk, skuCode, masterCode) => {
        setGkey(gk);
        const f = emptyFilters();
        if (masterCode)
            f.master = [masterCode];
        else if (skuCode) {
            const sid = D.g[gk].meta.findIndex(m => m.sku === skuCode);
            if (sid >= 0)
                f.sku = [sid];
        }
        setFilters(f);
    };
    // overview monthly for period bar (all groups, no customer filter)
    const ovMonthly = useMemo(() => {
        const mo = Array.from({ length: D.months.length }, () => ({ q: 0, o: 0 }));
        for (const g of D.groups) {
            const F = D.g[g.key].fact;
            for (let i = 0; i < F.s.length; i++) {
                mo[F.mi[i]].q += F.q[i];
                mo[F.mi[i]].o += F.o[i];
            }
        }
        return mo;
    }, []);
    return (React.createElement("div", { style: { fontFamily: "'Sarabun','IBM Plex Sans Thai',system-ui,sans-serif", background: T.canvas, minHeight: "100vh" } },
        React.createElement("div", { style: { background: T.ink, color: "#fff", padding: "16px 22px" } },
            React.createElement("div", { style: { maxWidth: 1240, margin: "0 auto", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" } },
                React.createElement("div", { style: { width: 34, height: 34, borderRadius: 9, background: T.primary, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16 } }, "W"),
                React.createElement("div", { style: { flex: 1, minWidth: 200 } },
                    React.createElement("div", { style: { fontSize: 17, fontWeight: 800, letterSpacing: "-.3px" } }, "Wellgate \u00B7 \u0E41\u0E14\u0E0A\u0E1A\u0E2D\u0E23\u0E4C\u0E14\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32"),
                    React.createElement("div", { style: { fontSize: 11.5, opacity: .6 } }, "\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E17\u0E35\u0E21 Marketing \u2014 \u0E14\u0E39\u0E04\u0E27\u0E32\u0E21\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32\u0E23\u0E32\u0E22\u0E01\u0E25\u0E38\u0E48\u0E21/SKU \u0E41\u0E22\u0E01\u0E15\u0E32\u0E21\u0E0A\u0E48\u0E27\u0E07\u0E40\u0E27\u0E25\u0E32 \u0E0A\u0E48\u0E2D\u0E07\u0E17\u0E32\u0E07 \u0E41\u0E25\u0E30\u0E1E\u0E37\u0E49\u0E19\u0E17\u0E35\u0E48\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32 \u00B7 \u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25 18 \u0E40\u0E14\u0E37\u0E2D\u0E19 (\u0E21.\u0E04. 2025 \u2013 \u0E21\u0E34.\u0E22. 2026)")),
                gkey && React.createElement("button", { onClick: () => setGkey(null), style: { fontSize: 12, padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,.25)", background: "rgba(255,255,255,.08)", color: "#fff", cursor: "pointer", fontWeight: 600 } }, "\uD83C\uDFE0 \u0E2B\u0E19\u0E49\u0E32\u0E41\u0E23\u0E01"))),
        React.createElement("div", { style: { maxWidth: 1240, margin: "0 auto", padding: "18px 22px 40px" } },
            !gkey && React.createElement(React.Fragment, null,
                React.createElement(PeriodBar, { range: range, setRange: setRange, compare: compare, setCompare: setCompare, monthly: ovMonthly, cmpRange: cmpRange }),
                React.createElement(Overview, { onPick: pick, onJump: jump, range: range, cmpRange: cmpRange })),
            gkey && React.createElement(GroupView, { gkey: gkey, range: range, setRange: setRange, compare: compare, setCompare: setCompare, cmpRange: cmpRange, filters: filters, setFilters: setFilters, onBack: () => setGkey(null) }),
            React.createElement("div", { style: { textAlign: "center", fontSize: 10.5, color: T.faint, marginTop: 22 } },
                "Wellgate Distribution \u00B7 \u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25 385,508 \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23 \u00B7 ",
                D.groups.length,
                " \u0E01\u0E25\u0E38\u0E48\u0E21 \u00B7 ",
                D.groups.reduce((s, g) => s + g.skus, 0),
                " SKU",
                D.dates && D.dates.length ? " · ครอบคลุมข้อมูล " + D.dates[0] + " ถึง " + D.dates[D.dates.length - 1] : ""))));
}
function App() {
    const [ready, setReady] = useState(false);
    const [err, setErr] = useState(null);
    useEffect(() => { inflate(B64).then(d => { D = d; GKEYS = d.groups.map(g => g.key); MONFULL = d.months.map(m => { const [y, mo] = m.split("-"); return THMON[+mo - 1] + " " + (+y + 543); }); setReady(true); }).catch(e => setErr(String(e))); }, []);
    if (err)
        return React.createElement("div", { style: { padding: 40, fontFamily: "system-ui", color: "#dc2626" } },
            "\u0E42\u0E2B\u0E25\u0E14\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E44\u0E21\u0E48\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08: ",
            err);
    if (!ready)
        return React.createElement("div", { style: { padding: 60, textAlign: "center", fontFamily: "'Sarabun',system-ui", color: "#6b7280" } },
            React.createElement("div", { style: { width: 34, height: 34, border: "3px solid #e5e7eb", borderTopColor: "#0f766e", borderRadius: "50%", margin: "0 auto 14px", animation: "spin 1s linear infinite" } }),
            React.createElement("style", null, "@keyframes spin{to{transform:rotate(360deg)}}"),
            "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E40\u0E15\u0E23\u0E35\u0E22\u0E21\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25 385,508 \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u2026");
    return React.createElement(Main, null);
}

// Boot
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App, null));
