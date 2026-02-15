const STORAGE_KEY = "journal-os-v3";

const state = {
  view: "journal",
  market: "usa",
  settings: {
    riskPct: 0.25,
    accountSize: { usa: 10000, india: 1000000 },
  },
  sheets: { usa: [], india: [] },
};

const els = {
  marketSwitch: document.getElementById("market-switch"),
  navBtns: [...document.querySelectorAll(".nav-btn")],
  journalView: document.getElementById("journal-view"),
  reportView: document.getElementById("report-view"),

  metaCount: document.getElementById("meta-count"),
  metaUpdated: document.getElementById("meta-updated"),

  globalAccountSize: document.getElementById("global-account-size"),
  globalRiskPct: document.getElementById("global-risk-pct"),
  addRow: document.getElementById("add-row"),
  openDrawer: document.getElementById("open-drawer"),

  tableBody: document.getElementById("table-body"),

  drawer: document.getElementById("drawer"),
  overlay: document.getElementById("overlay"),
  closeDrawer: document.getElementById("close-drawer"),
  cancelDrawer: document.getElementById("cancel-drawer"),
  drawerForm: document.getElementById("drawer-form"),

  filterFrom: document.getElementById("filter-from"),
  filterTo: document.getElementById("filter-to"),
  resetFilter: document.getElementById("reset-filter"),

  kpiGrid: document.getElementById("kpi-grid"),
  kpiTemplate: document.getElementById("kpi-template"),

  strategyTableCard: document.getElementById("strategy-table-card"),
  screenshotCard: document.getElementById("screenshot-card"),
};

init();

function init() {
  hydrate();
  bind();
  render();
}

function bind() {
  els.marketSwitch.addEventListener("click", (event) => {
    const btn = event.target.closest(".market-btn");
    if (!btn) return;
    state.market = btn.dataset.market;
    render();
  });

  els.navBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.view = btn.dataset.view;
      renderViews();
    });
  });

  els.globalRiskPct.addEventListener("change", () => {
    state.settings.riskPct = clamp(toNum(els.globalRiskPct.value), 0.01, 20);
    recalcSheet(state.market);
    persist();
    render();
  });

  els.globalAccountSize.addEventListener("change", () => {
    state.settings.accountSize[state.market] = clamp(toNum(els.globalAccountSize.value), 0, Number.MAX_SAFE_INTEGER);
    recalcSheet(state.market);
    persist();
    render();
  });

  els.addRow.addEventListener("click", () => {
    getSheet().push(calcTrade(emptyTrade(), state.market));
    persist();
    render();
  });

  els.openDrawer.addEventListener("click", openDrawer);
  els.closeDrawer.addEventListener("click", closeDrawer);
  els.cancelDrawer.addEventListener("click", closeDrawer);
  els.overlay.addEventListener("click", closeDrawer);
  els.drawerForm.addEventListener("submit", onDrawerSubmit);

  els.tableBody.addEventListener("change", onTableEdit);
  els.tableBody.addEventListener("click", onTableClick);

  [els.filterFrom, els.filterTo].forEach((input) => input.addEventListener("change", renderReport));
  els.resetFilter.addEventListener("click", () => {
    els.filterFrom.value = "";
    els.filterTo.value = "";
    renderReport();
  });
}

function hydrate() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);

    if (parsed.settings?.riskPct) state.settings.riskPct = parsed.settings.riskPct;
    if (parsed.settings?.accountSize) {
      state.settings.accountSize.usa = parsed.settings.accountSize.usa || state.settings.accountSize.usa;
      state.settings.accountSize.india = parsed.settings.accountSize.india || state.settings.accountSize.india;
    }
    if (parsed.sheets) {
      state.sheets.usa = Array.isArray(parsed.sheets.usa) ? parsed.sheets.usa.map((t) => calcTrade(t, "usa")) : [];
      state.sheets.india = Array.isArray(parsed.sheets.india)
        ? parsed.sheets.india.map((t) => calcTrade(t, "india"))
        : [];
    }
  } catch {
    // ignore bad local data
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings: state.settings, sheets: state.sheets }));
}

function getSheet() {
  return state.sheets[state.market];
}

function render() {
  renderViews();
  renderSidebar();
  renderToolbarValues();
  renderTable();
  renderReport();
}

function renderViews() {
  els.journalView.classList.toggle("active", state.view === "journal");
  els.reportView.classList.toggle("active", state.view === "report");

  els.navBtns.forEach((btn) => btn.classList.toggle("active", btn.dataset.view === state.view));
}

function renderSidebar() {
  [...els.marketSwitch.querySelectorAll(".market-btn")].forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.market === state.market);
  });

  const sheet = getSheet();
  els.metaCount.textContent = `${sheet.length} trades (${state.market.toUpperCase()})`;

  if (!sheet.length) {
    els.metaUpdated.textContent = "No updates";
    return;
  }
  const latest = sheet[sheet.length - 1];
  els.metaUpdated.textContent = `Last: ${latest.tradeDate || "-"} ${latest.instrument || ""}`;
}

function renderToolbarValues() {
  els.globalRiskPct.value = state.settings.riskPct;
  els.globalAccountSize.value = state.settings.accountSize[state.market];
}

function renderTable() {
  const rows = getSheet().map((trade) => makeRow(trade)).join("");
  els.tableBody.innerHTML = rows || `<tr><td colspan="20">No trades yet. Click Add Row or Add Trade.</td></tr>`;
}

function makeRow(t) {
  const statusClass = t.status.toLowerCase().includes("open")
    ? "open"
    : t.netPnl >= 0
      ? "win"
      : "loss";

  return `
    <tr data-id="${t.id}">
      <td>${cell("date", t.tradeDate, "tradeDate")}</td>
      <td>${cell("text", t.instrument, "instrument")}</td>
      <td>
        <select class="cell-select" data-field="tradeType">
          <option value="Long" ${t.tradeType === "Long" ? "selected" : ""}>Long</option>
          <option value="Short" ${t.tradeType === "Short" ? "selected" : ""}>Short</option>
        </select>
      </td>
      <td>${cell("number", t.entry, "entry", "0.0001")}</td>
      <td>${cell("number", t.sl, "sl", "0.0001")}</td>
      <td>${cell("number", t.manualQty, "manualQty", "0.0001")}</td>
      <td>${cell("number", t.exit1, "exit1", "0.0001")}</td>
      <td>${cell("number", t.exit2, "exit2", "0.0001")}</td>
      <td>${cell("number", t.exit3, "exit3", "0.0001")}</td>
      <td>${cell("text", t.strategyTag, "strategyTag")}</td>
      <td>${cell("number", t.emaPct, "emaPct", "0.01")}</td>
      <td>${cell("number", t.initialMovePct, "initialMovePct", "0.01")}</td>
      <td>${
        t.screenshotData ? `<a class="link" href="${t.screenshotData}" target="_blank" rel="noopener">View</a>` : "-"
      }</td>
      <td>${cell("number", t.accountSizeOverride, "accountSizeOverride", "0.01")}</td>
      <td>${cell("number", t.riskPctOverride, "riskPctOverride", "0.01")}</td>
      <td>${fmt(t.positionSize)}</td>
      <td>${fmt(t.rMultiple)}</td>
      <td>${money(t.netPnl)}</td>
      <td><span class="status ${statusClass}">${escapeHtml(t.status)}</span></td>
      <td><button class="btn ghost" data-action="delete">Delete</button></td>
    </tr>
  `;
}

function cell(type, value, field, step = "") {
  return `<input class="cell-input" type="${type}" data-field="${field}" ${step ? `step="${step}"` : ""} value="${escapeHtml(value ?? "")}" />`;
}

function onTableEdit(event) {
  const fieldNode = event.target.closest("[data-field]");
  if (!fieldNode) return;

  const row = event.target.closest("tr[data-id]");
  if (!row) return;

  const id = row.dataset.id;
  const trade = getSheet().find((x) => x.id === id);
  if (!trade) return;

  trade[fieldNode.dataset.field] = fieldNode.value;
  Object.assign(trade, calcTrade(trade, state.market));

  persist();
  render();
}

function onTableClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const row = event.target.closest("tr[data-id]");
  if (!row) return;

  if (button.dataset.action === "delete") {
    state.sheets[state.market] = getSheet().filter((t) => t.id !== row.dataset.id);
    persist();
    render();
  }
}

function openDrawer() {
  els.drawer.classList.add("open");
  els.overlay.classList.add("open");
}

function closeDrawer() {
  els.drawer.classList.remove("open");
  els.overlay.classList.remove("open");
}

async function onDrawerSubmit(event) {
  event.preventDefault();
  const fd = new FormData(els.drawerForm);

  const screenshot = fd.get("screenshot");
  const screenshotData = screenshot && screenshot.size > 0 ? await toDataUrl(screenshot) : "";
  const screenshotStats = screenshotData ? await analyzeScreenshot(screenshotData) : null;

  const trade = calcTrade(
    {
    ...emptyTrade(),
    tradeDate: fd.get("tradeDate"),
    instrument: trim(fd.get("instrument")),
    tradeType: fd.get("tradeType") || "Long",
    entry: toNum(fd.get("entry")),
    sl: toNum(fd.get("sl")),
    manualQty: toNum(fd.get("manualQty")),
    exit1: toNum(fd.get("exit1")),
    exit2: toNum(fd.get("exit2")),
    exit3: toNum(fd.get("exit3")),
    strategyTag: trim(fd.get("strategyTag")),
    emaPct: toNum(fd.get("emaPct")),
    initialMovePct: toNum(fd.get("initialMovePct")),
    accountSizeOverride: toNum(fd.get("accountSize")),
    riskPctOverride: toNum(fd.get("riskPct")),
    screenshotData,
    screenshotStats,
    },
    state.market
  );

  getSheet().push(trade);
  getSheet().sort((a, b) => (a.tradeDate || "").localeCompare(b.tradeDate || ""));

  persist();
  els.drawerForm.reset();
  closeDrawer();
  render();
}

function emptyTrade() {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    tradeDate: "",
    instrument: "",
    tradeType: "Long",
    entry: 0,
    sl: 0,
    manualQty: 0,
    exit1: 0,
    exit2: 0,
    exit3: 0,
    strategyTag: "",
    emaPct: 0,
    initialMovePct: 0,
    screenshotData: "",
    screenshotStats: null,
    accountSizeOverride: 0,
    riskPctOverride: 0,

    accountSizeUsed: 0,
    riskPctUsed: 0,
    riskAmount: 0,
    positionSize: 0,
    avgExit: 0,
    netPnl: 0,
    rMultiple: 0,
    slHit: false,
    status: "Open",
  };
}

function calcTrade(raw, market = state.market) {
  const t = {
    ...raw,
    entry: toNum(raw.entry),
    sl: toNum(raw.sl),
    manualQty: toNum(raw.manualQty),
    exit1: toNum(raw.exit1),
    exit2: toNum(raw.exit2),
    exit3: toNum(raw.exit3),
    emaPct: toNum(raw.emaPct),
    initialMovePct: toNum(raw.initialMovePct),
    accountSizeOverride: toNum(raw.accountSizeOverride),
    riskPctOverride: toNum(raw.riskPctOverride),
  };

  const accountSizeUsed = t.accountSizeOverride > 0 ? t.accountSizeOverride : state.settings.accountSize[market];
  const riskPctUsed = t.riskPctOverride > 0 ? t.riskPctOverride : state.settings.riskPct;
  const riskPerUnit = Math.abs(t.entry - t.sl);
  const riskAmount = accountSizeUsed * (riskPctUsed / 100);

  const autoQty = riskPerUnit > 0 ? riskAmount / riskPerUnit : 0;
  const positionSize = t.manualQty > 0 ? t.manualQty : autoQty;

  const exits = [t.exit1, t.exit2, t.exit3].filter((x) => x > 0);
  const avgExit = exits.length ? avg(exits) : 0;

  const dir = t.tradeType === "Short" ? -1 : 1;
  let netPnl = 0;
  let rMultiple = 0;
  let slHit = false;
  let status = "Open";

  if (exits.length && positionSize > 0) {
    const pnlPerUnit = (avgExit - t.entry) * dir;
    netPnl = pnlPerUnit * positionSize;
    rMultiple = riskAmount > 0 ? netPnl / riskAmount : 0;

    if (t.tradeType === "Long") slHit = exits.some((x) => x <= t.sl);
    if (t.tradeType === "Short") slHit = exits.some((x) => x >= t.sl);

    if (slHit && netPnl <= 0) status = "SL Hit";
    else status = netPnl >= 0 ? "Win" : "Loss";
  }

  return {
    ...t,
    accountSizeUsed,
    riskPctUsed,
    riskAmount,
    positionSize,
    avgExit,
    netPnl,
    rMultiple,
    slHit,
    status,
  };
}

function recalcSheet(market) {
  state.sheets[market] = state.sheets[market].map((trade) => calcTrade(trade, market));
}

function recalcSheet(market) {
  state.sheets[market] = state.sheets[market].map((trade) => calcTrade(trade));
}

function renderReport() {
  const trades = filteredTrades();
  renderKpis(trades);
  renderCharts(trades);
  renderStrategyTable(trades);
  renderScreenshotInsights(trades);
}

function filteredTrades() {
  const from = els.filterFrom.value;
  const to = els.filterTo.value;

  return getSheet().filter((t) => {
    const okFrom = !from || (t.tradeDate && t.tradeDate >= from);
    const okTo = !to || (t.tradeDate && t.tradeDate <= to);
    return okFrom && okTo;
  });
}

function renderKpis(trades) {
  const m = metrics(trades);
  const data = [
    ["Trades", m.totalTrades],
    ["Win Rate", `${fmt(m.winRate)}%`],
    ["Net P&L", money(m.netPnl)],
    ["Average R", fmt(m.avgR)],
    ["Expectancy", `${fmt(m.expectancy)} R`],
    ["Average Win", money(m.avgWin)],
    ["Average Loss", money(m.avgLoss)],
    ["Max Drawdown", money(m.maxDrawdown)],
  ];

  els.kpiGrid.innerHTML = "";
  data.forEach(([label, value]) => {
    const node = els.kpiTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".kpi-label").textContent = label;
    node.querySelector(".kpi-value").textContent = value;
    els.kpiGrid.appendChild(node);
  });
}

function metrics(trades) {
  const closed = trades.filter((t) => t.status !== "Open");
  const wins = closed.filter((t) => t.netPnl > 0);
  const losses = closed.filter((t) => t.netPnl <= 0);

  const totalTrades = closed.length;
  const netPnl = sum(closed.map((t) => t.netPnl));
  const winRate = totalTrades ? (wins.length / totalTrades) * 100 : 0;
  const avgR = avg(closed.map((t) => t.rMultiple));
  const expectancy = avgR;
  const avgWin = avg(wins.map((t) => t.netPnl));
  const avgLoss = avg(losses.map((t) => t.netPnl));
  const maxDrawdown = drawdown(closed.map((t) => t.netPnl));

  return { totalTrades, netPnl, winRate, avgR, expectancy, avgWin, avgLoss, maxDrawdown };
}

function renderCharts(trades) {
  const closed = trades.filter((t) => t.status !== "Open");

  lineChart("equity-chart", cumulative(closed.map((t) => t.netPnl)), "#2d64f1");
  histogram("r-dist-chart", closed.map((t) => t.rMultiple), 8);

  const grouped = groupBy(closed, (t) => t.strategyTag || "Unlabeled");
  const labels = Object.keys(grouped);

  const pnlValues = labels.map((k) => sum(grouped[k].map((t) => t.netPnl)));
  barChart("pnl-strategy-chart", labels, pnlValues, true, "");

  const winValues = labels.map((k) => {
    const g = grouped[k];
    if (!g.length) return 0;
    return (g.filter((t) => t.netPnl > 0).length / g.length) * 100;
  });
  barChart("win-strategy-chart", labels, winValues, false, "%");
}

function renderStrategyTable(trades) {
  const closed = trades.filter((t) => t.status !== "Open");
  const grouped = groupBy(closed, (t) => t.strategyTag || "Unlabeled");
  const names = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

  if (!names.length) {
    els.strategyTableCard.innerHTML = "<h3>Strategy Performance</h3><p>No closed trades in this period.</p>";
    return;
  }

  const rows = names
    .map((name) => {
      const g = grouped[name];
      const m = metrics(g);
      return `<tr>
        <td>${escapeHtml(name)}</td>
        <td>${m.totalTrades}</td>
        <td>${fmt(m.avgR)}</td>
        <td>${fmt(m.winRate)}%</td>
        <td>${money(m.netPnl)}</td>
      </tr>`;
    })
    .join("");

  els.strategyTableCard.innerHTML = `
    <h3>Strategy Performance</h3>
    <table class="report-table">
      <thead>
        <tr><th>Strategy</th><th>Trades</th><th>Avg R</th><th>Win Rate</th><th>Net P&L</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderScreenshotInsights(trades) {
  const withShots = trades.filter((t) => t.screenshotStats);

  if (!withShots.length) {
    els.screenshotCard.innerHTML = "<h3>Screenshot Insights</h3><p>No screenshots in this filtered period.</p>";
    return;
  }

  const rows = withShots
    .slice(-20)
    .reverse()
    .map((t) => {
      const s = t.screenshotStats;
      return `<tr>
        <td>${escapeHtml(t.tradeDate || "-")}</td>
        <td>${escapeHtml(t.instrument || "-")}</td>
        <td>${fmt(s.brightness)}</td>
        <td>${fmt(s.contrast)}</td>
        <td>${escapeHtml(s.tag)}</td>
      </tr>`;
    })
    .join("");

  els.screenshotCard.innerHTML = `
    <h3>Screenshot Insights</h3>
    <p>Auto image scoring for quick chart-quality context.</p>
    <table class="report-table">
      <thead>
        <tr><th>Date</th><th>Instrument</th><th>Brightness</th><th>Contrast</th><th>Tag</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function lineChart(id, values, color) {
  const svg = document.getElementById(id);
  const w = 640;
  const h = 230;
  const m = { t: 20, r: 15, b: 28, l: 42 };

  if (!values.length) {
    svg.innerHTML = `<text x="${w / 2}" y="${h / 2}" class="axis-text" text-anchor="middle">No data</text>`;
    return;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const yMin = min === max ? min - 1 : min;
  const yMax = min === max ? max + 1 : max;

  const x = (i) => m.l + (i / Math.max(values.length - 1, 1)) * (w - m.l - m.r);
  const y = (v) => m.t + ((yMax - v) / (yMax - yMin)) * (h - m.t - m.b);
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");

  svg.innerHTML = `
    <line x1="${m.l}" y1="${h - m.b}" x2="${w - m.r}" y2="${h - m.b}" stroke="#d8dfea" />
    <line x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${h - m.b}" stroke="#d8dfea" />
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.2" />
  `;
}

function histogram(id, values, bins) {
  if (!values.length) {
    barChart(id, [], [], false, "");
    return;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = max - min || 1;
  const step = width / bins;

  const buckets = Array.from({ length: bins }, (_, i) => ({
    start: min + i * step,
    end: min + (i + 1) * step,
    count: 0,
  }));

  values.forEach((v) => {
    const idx = Math.min(Math.floor((v - min) / step), bins - 1);
    buckets[idx].count += 1;
  });

  barChart(
    id,
    buckets.map((b) => `${fmt(b.start)}-${fmt(b.end)}`),
    buckets.map((b) => b.count),
    false,
    ""
  );
}

function barChart(id, labels, values, diverging, suffix) {
  const svg = document.getElementById(id);
  const w = 640;
  const h = 230;
  const m = { t: 18, r: 12, b: 52, l: 42 };

  if (!labels.length) {
    svg.innerHTML = `<text x="${w / 2}" y="${h / 2}" class="axis-text" text-anchor="middle">No data</text>`;
    return;
  }

  const min = diverging ? Math.min(0, ...values) : 0;
  const max = Math.max(...values, 1);
  const range = max - min || 1;
  const barWidth = (w - m.l - m.r) / labels.length;
  const zeroY = m.t + ((max - 0) / range) * (h - m.t - m.b);

  const bars = labels
    .map((label, i) => {
      const value = values[i] || 0;
      const x = m.l + i * barWidth + 5;
      const yValue = m.t + ((max - value) / range) * (h - m.t - m.b);
      const y = value >= 0 ? yValue : zeroY;
      const bh = Math.max(2, Math.abs(yValue - zeroY));
      const fill = diverging ? (value >= 0 ? "#1f9763" : "#c83f4b") : "#2d64f1";

      return `
        <rect x="${x}" y="${y}" width="${Math.max(barWidth - 10, 8)}" height="${bh}" fill="${fill}" rx="4" />
        <text x="${x + Math.max(barWidth - 10, 8) / 2}" y="${h - 20}" class="axis-text" text-anchor="middle">${truncate(label, 10)}</text>
        <text x="${x + Math.max(barWidth - 10, 8) / 2}" y="${y - 4}" class="axis-text" text-anchor="middle">${fmt(value)}${suffix}</text>
      `;
    })
    .join("");

  svg.innerHTML = `
    <line x1="${m.l}" y1="${h - m.b}" x2="${w - m.r}" y2="${h - m.b}" stroke="#d8dfea" />
    <line x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${h - m.b}" stroke="#d8dfea" />
    ${diverging ? `<line x1="${m.l}" y1="${zeroY}" x2="${w - m.r}" y2="${zeroY}" stroke="#d8dfea" stroke-dasharray="4 4" />` : ""}
    ${bars}
  `;
}

function drawdown(pnlSeries) {
  let peak = 0;
  let eq = 0;
  let worst = 0;

  pnlSeries.forEach((v) => {
    eq += v;
    peak = Math.max(peak, eq);
    worst = Math.max(worst, peak - eq);
  });

  return worst;
}

function cumulative(values) {
  let run = 0;
  return values.map((v) => {
    run += v;
    return run;
  });
}

function groupBy(list, keyFn) {
  return list.reduce((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

function toNum(value) {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function avg(values) {
  return values.length ? sum(values) / values.length : 0;
}

function sum(values) {
  return values.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function trim(v) {
  return String(v || "").trim();
}

function fmt(v) {
  return Number.isFinite(v) ? Number(v).toFixed(2) : "0.00";
}

function money(v) {
  const currency = state.market === "india" ? "INR" : "USD";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(v) ? v : 0);
}

function truncate(text, n) {
  if (!text) return "";
  return text.length > n ? `${text.slice(0, n - 1)}...` : text;
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function analyzeScreenshot(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 240 / img.width);
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

      const lums = [];
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        lums.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
      }

      const brightness = avg(lums);
      const variance = avg(lums.map((v) => (v - brightness) ** 2));
      const contrast = Math.sqrt(variance);

      let tag = "Balanced";
      if (brightness < 80) tag = "Dark";
      if (brightness > 185) tag = "Very Bright";
      if (contrast < 28) tag = "Low Contrast";

      resolve({ brightness, contrast, tag });
    };

    img.onerror = () => reject(new Error("Image decode failed"));
    img.src = dataUrl;
  });
}
