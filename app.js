const STORAGE_KEY = "trade-journal-v2";

const state = {
  market: "usa",
  view: "journal",
  settings: { riskPct: 0.25 },
  sheets: { usa: [], india: [] },
  filteredReportTrades: [],
};

const el = {
  marketSwitch: document.getElementById("market-switch"),
  navBtns: Array.from(document.querySelectorAll(".nav-btn")),
  journalView: document.getElementById("journal-view"),
  reportView: document.getElementById("report-view"),
  sheetMeta: document.getElementById("sheet-meta"),
  updatedMeta: document.getElementById("updated-meta"),

  riskPct: document.getElementById("risk-pct"),
  addEmptyRow: document.getElementById("add-empty-row"),
  openDrawer: document.getElementById("open-drawer"),
  journalBody: document.getElementById("journal-body"),

  drawer: document.getElementById("trade-drawer"),
  drawerOverlay: document.getElementById("drawer-overlay"),
  closeDrawer: document.getElementById("close-drawer"),
  cancelDrawer: document.getElementById("cancel-drawer"),
  drawerForm: document.getElementById("drawer-form"),

  filterFrom: document.getElementById("filter-from"),
  filterTo: document.getElementById("filter-to"),
  clearFilter: document.getElementById("clear-filter"),

  kpiGrid: document.getElementById("kpi-grid"),
  kpiTemplate: document.getElementById("kpi-template"),
  strategyReport: document.getElementById("strategy-report"),
  screenshotReport: document.getElementById("screenshot-report"),
};

boot();

function boot() {
  hydrate();
  bind();
  renderAll();
}

function bind() {
  el.marketSwitch.addEventListener("click", (event) => {
    const btn = event.target.closest(".market-btn");
    if (!btn) return;
    state.market = btn.dataset.market;
    renderAll();
  });

  el.navBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.view = btn.dataset.view;
      renderViews();
    });
  });

  el.riskPct.addEventListener("change", () => {
    const val = clamp(toNum(el.riskPct.value), 0.01, 20);
    state.settings.riskPct = val;
    el.riskPct.value = val;
    recalcActiveSheet();
    persist();
    renderAll();
  });

  el.addEmptyRow.addEventListener("click", () => {
    state.sheets[state.market].push(calcTrade(newTrade()));
    persist();
    renderAll();
  });

  el.openDrawer.addEventListener("click", openDrawer);
  el.closeDrawer.addEventListener("click", closeDrawer);
  el.cancelDrawer.addEventListener("click", closeDrawer);
  el.drawerOverlay.addEventListener("click", closeDrawer);
  el.drawerForm.addEventListener("submit", submitDrawerTrade);

  el.journalBody.addEventListener("change", onJournalEdit);
  el.journalBody.addEventListener("click", onJournalClick);

  [el.filterFrom, el.filterTo].forEach((x) => x.addEventListener("change", renderReport));
  el.clearFilter.addEventListener("click", () => {
    el.filterFrom.value = "";
    el.filterTo.value = "";
    renderReport();
  });
}

function hydrate() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    state.settings = parsed.settings || state.settings;
    state.sheets = parsed.sheets || state.sheets;
  } catch {
    // ignore corrupt storage
  }
  el.riskPct.value = state.settings.riskPct;
}

function persist() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      settings: state.settings,
      sheets: state.sheets,
    })
  );
}

function getActiveTrades() {
  return state.sheets[state.market] || [];
}

function renderAll() {
  renderViews();
  renderSidebar();
  renderJournal();
  renderReport();
}

function renderViews() {
  el.navBtns.forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));
  el.journalView.classList.toggle("active", state.view === "journal");
  el.reportView.classList.toggle("active", state.view === "report");
}

function renderSidebar() {
  Array.from(el.marketSwitch.querySelectorAll(".market-btn")).forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.market === state.market);
  });

  const trades = getActiveTrades();
  el.sheetMeta.textContent = `${trades.length} trades in ${state.market.toUpperCase()} sheet`;
  if (!trades.length) {
    el.updatedMeta.textContent = "No updates yet";
    return;
  }
  const latest = trades[trades.length - 1];
  el.updatedMeta.textContent = `Last update: ${latest.tradeDate || "-"} ${latest.instrument || ""}`;
}

function renderJournal() {
  const rows = getActiveTrades()
    .map((trade) => {
      const statusClass = trade.netPnl >= 0 ? "win" : "loss";
      return `
        <tr data-id="${trade.id}">
          <td>${cellInput("date", trade.tradeDate, "tradeDate")}</td>
          <td>${cellInput("text", trade.instrument, "instrument")}</td>
          <td>
            <select class="cell-select" data-field="tradeType">
              <option value="Long" ${trade.tradeType === "Long" ? "selected" : ""}>Long</option>
              <option value="Short" ${trade.tradeType === "Short" ? "selected" : ""}>Short</option>
            </select>
          </td>
          <td>${cellInput("number", trade.entry, "entry", "0.0001")}</td>
          <td>${cellInput("number", trade.sl, "sl", "0.0001")}</td>
          <td>${cellInput("number", trade.manualPS, "manualPS", "0.0001")}</td>
          <td>${cellInput("number", trade.exit1, "exit1", "0.0001")}</td>
          <td>${cellInput("number", trade.exit2, "exit2", "0.0001")}</td>
          <td>${cellInput("number", trade.exit3, "exit3", "0.0001")}</td>
          <td>${cellInput("text", trade.strategyTag, "strategyTag")}</td>
          <td>${cellInput("number", trade.emaDistancePct, "emaDistancePct", "0.01")}</td>
          <td>${cellInput("number", trade.initialMovePct, "initialMovePct", "0.01")}</td>
          <td>${cellInput("number", trade.accountSize, "accountSize", "0.01")}</td>
          <td>${cellInput("number", trade.riskPct, "riskPct", "0.01")}</td>
          <td>${fmt(trade.calculatedQty)}</td>
          <td>${fmt(trade.rMultiple)}</td>
          <td>${money(trade.netPnl)}</td>
          <td><span class="result-chip ${statusClass}">${trade.resultLabel}</span></td>
          <td>${trade.screenshotData ? `<a href="${trade.screenshotData}" class="small-link" target="_blank">View</a>` : "-"}</td>
          <td><button class="ghost-btn" data-action="delete">Delete</button></td>
        </tr>
      `;
    })
    .join("");

  el.journalBody.innerHTML = rows || `<tr><td colspan="20">No trades yet. Use Add Row or Add Trade.</td></tr>`;
}

function cellInput(type, value, field, step = "") {
  return `<input class="cell-input" type="${type}" ${step ? `step="${step}"` : ""} data-field="${field}" value="${escapeHtml(
    value ?? ""
  )}" />`;
}

function onJournalEdit(event) {
  const input = event.target.closest("[data-field]");
  if (!input) return;
  const row = event.target.closest("tr[data-id]");
  if (!row) return;

  const id = row.dataset.id;
  const field = input.dataset.field;
  const trades = getActiveTrades();
  const trade = trades.find((t) => t.id === id);
  if (!trade) return;

  trade[field] = input.value;
  Object.assign(trade, calcTrade(trade));
  persist();
  renderAll();
}

function onJournalClick(event) {
  const btn = event.target.closest("[data-action]");
  if (!btn) return;

  const row = event.target.closest("tr[data-id]");
  if (!row) return;

  if (btn.dataset.action === "delete") {
    state.sheets[state.market] = getActiveTrades().filter((t) => t.id !== row.dataset.id);
    persist();
    renderAll();
  }
}

function openDrawer() {
  el.drawer.classList.add("open");
  el.drawerOverlay.classList.add("open");
}

function closeDrawer() {
  el.drawer.classList.remove("open");
  el.drawerOverlay.classList.remove("open");
}

async function submitDrawerTrade(event) {
  event.preventDefault();
  const fd = new FormData(el.drawerForm);
  const file = fd.get("screenshot");
  const screenshotData = file && file.size > 0 ? await toDataUrl(file) : "";
  const screenshotAnalysis = screenshotData ? await analyzeImage(screenshotData) : null;

  const trade = calcTrade({
    ...newTrade(),
    tradeDate: fd.get("tradeDate"),
    instrument: trim(fd.get("instrument")),
    tradeType: fd.get("tradeType") || "Long",
    entry: toNum(fd.get("entry")),
    sl: toNum(fd.get("sl")),
    manualPS: toNum(fd.get("manualPS")),
    exit1: toNum(fd.get("exit1")),
    exit2: toNum(fd.get("exit2")),
    exit3: toNum(fd.get("exit3")),
    strategyTag: trim(fd.get("strategyTag")),
    emaDistancePct: toNum(fd.get("emaDistancePct")),
    initialMovePct: toNum(fd.get("initialMovePct")),
    accountSize: toNum(fd.get("accountSize")),
    riskPct: toNum(fd.get("riskPct")) || state.settings.riskPct,
    notes: trim(fd.get("notes")),
    screenshotData,
    screenshotAnalysis,
  });

  state.sheets[state.market].push(trade);
  sortTrades(state.sheets[state.market]);
  persist();
  el.drawerForm.reset();
  closeDrawer();
  renderAll();
}

function newTrade() {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tradeDate: "",
    instrument: "",
    tradeType: "Long",
    entry: 0,
    sl: 0,
    manualPS: 0,
    exit1: 0,
    exit2: 0,
    exit3: 0,
    strategyTag: "",
    emaDistancePct: 0,
    initialMovePct: 0,
    accountSize: 0,
    riskPct: state.settings.riskPct,
    calculatedQty: 0,
    riskAmount: 0,
    avgExit: 0,
    netPnl: 0,
    rMultiple: 0,
    resultLabel: "Loss",
    notes: "",
    screenshotData: "",
    screenshotAnalysis: null,
  };
}

function calcTrade(tradeRaw) {
  const trade = {
    ...tradeRaw,
    entry: toNum(tradeRaw.entry),
    sl: toNum(tradeRaw.sl),
    manualPS: toNum(tradeRaw.manualPS),
    exit1: toNum(tradeRaw.exit1),
    exit2: toNum(tradeRaw.exit2),
    exit3: toNum(tradeRaw.exit3),
    emaDistancePct: toNum(tradeRaw.emaDistancePct),
    initialMovePct: toNum(tradeRaw.initialMovePct),
    accountSize: toNum(tradeRaw.accountSize),
    riskPct: toNum(tradeRaw.riskPct) || state.settings.riskPct,
  };

  const riskPerUnit = Math.abs(trade.entry - trade.sl);
  const riskAmount = (trade.accountSize * trade.riskPct) / 100;
  const qtyAuto = riskPerUnit > 0 ? riskAmount / riskPerUnit : 0;
  const qty = trade.manualPS > 0 ? trade.manualPS : qtyAuto;

  const exits = [trade.exit1, trade.exit2, trade.exit3].filter((x) => x > 0);
  let avgExit = exits.length ? avg(exits) : 0;

  const direction = trade.tradeType === "Short" ? -1 : 1;
  const pnlPerUnit = avgExit > 0 ? (avgExit - trade.entry) * direction : 0;

  let netPnl = pnlPerUnit * qty;
  let rMultiple = riskAmount > 0 ? netPnl / riskAmount : 0;

  if (!exits.length && trade.entry > 0 && trade.sl > 0) {
    netPnl = -riskAmount;
    rMultiple = -1;
    avgExit = trade.sl;
  }

  return {
    ...trade,
    calculatedQty: qtyAuto,
    riskAmount,
    avgExit,
    netPnl,
    rMultiple,
    resultLabel: netPnl >= 0 ? "Win" : "Loss",
  };
}

function recalcActiveSheet() {
  state.sheets[state.market] = getActiveTrades().map((t) => calcTrade(t));
}

function renderReport() {
  const trades = filterByDate(getActiveTrades(), el.filterFrom.value, el.filterTo.value);
  state.filteredReportTrades = trades;

  renderKpis(trades);
  renderCharts(trades);
  renderStrategyReport(trades);
  renderScreenshotReport(trades);
}

function renderKpis(trades) {
  const metrics = computeMetrics(trades);
  const cards = [
    ["Trades", metrics.totalTrades],
    ["Win Rate", `${fmt(metrics.winRate)}%`],
    ["Net P&L", money(metrics.netPnl)],
    ["Average R", fmt(metrics.avgR)],
    ["Expectancy", `${fmt(metrics.expectancy)} R`],
    ["Average Win", money(metrics.avgWin)],
    ["Average Loss", money(metrics.avgLoss)],
    ["Max Drawdown", money(metrics.maxDd)],
  ];

  el.kpiGrid.innerHTML = "";
  cards.forEach(([label, value]) => {
    const node = el.kpiTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".kpi-label").textContent = label;
    node.querySelector(".kpi-value").textContent = value;
    el.kpiGrid.appendChild(node);
  });
}

function computeMetrics(trades) {
  const totalTrades = trades.length;
  const wins = trades.filter((t) => t.netPnl >= 0);
  const losses = trades.filter((t) => t.netPnl < 0);

  const netPnl = sum(trades.map((t) => t.netPnl));
  const winRate = totalTrades ? (wins.length / totalTrades) * 100 : 0;
  const avgR = avg(trades.map((t) => t.rMultiple));
  const avgWin = avg(wins.map((t) => t.netPnl));
  const avgLoss = avg(losses.map((t) => t.netPnl));
  const expectancy = avgR;
  const maxDd = maxDrawdown(trades.map((t) => t.netPnl));

  return { totalTrades, winRate, netPnl, avgR, avgWin, avgLoss, expectancy, maxDd };
}

function renderCharts(trades) {
  const eq = cumulative(trades.map((t) => t.netPnl));
  lineChart("equity-chart", eq, "#2162ff", "Equity");
  histogram("r-chart", trades.map((t) => t.rMultiple), 9);

  const byStrategy = groupBy(trades, (t) => t.strategyTag || "Unlabeled");
  const labels = Object.keys(byStrategy);
  const pnl = labels.map((l) => sum(byStrategy[l].map((x) => x.netPnl)));
  const wins = labels.map((l) => {
    const group = byStrategy[l];
    return group.length ? (group.filter((g) => g.netPnl >= 0).length / group.length) * 100 : 0;
  });

  barChart("strategy-chart", labels, pnl, true);
  barChart("win-chart", labels, wins, false, "%");
}

function renderStrategyReport(trades) {
  const byStrategy = groupBy(trades, (t) => t.strategyTag || "Unlabeled");
  const labels = Object.keys(byStrategy).sort((a, b) => a.localeCompare(b));

  if (!labels.length) {
    el.strategyReport.innerHTML = "<h3>Strategy Performance</h3><p>No strategy data in selected period.</p>";
    return;
  }

  const rows = labels
    .map((label) => {
      const group = byStrategy[label];
      const metrics = computeMetrics(group);
      return `<tr>
        <td>${escapeHtml(label)}</td>
        <td>${metrics.totalTrades}</td>
        <td>${fmt(metrics.avgR)}</td>
        <td>${fmt(metrics.winRate)}%</td>
        <td>${money(metrics.netPnl)}</td>
      </tr>`;
    })
    .join("");

  el.strategyReport.innerHTML = `
    <h3>Strategy Performance</h3>
    <table class="strategy-table">
      <thead>
        <tr>
          <th>Strategy</th>
          <th>Total Trades</th>
          <th>Avg R</th>
          <th>Win Rate</th>
          <th>Net P&L</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderScreenshotReport(trades) {
  const withShots = trades.filter((t) => t.screenshotAnalysis);
  if (!withShots.length) {
    el.screenshotReport.innerHTML = `
      <h3>Screenshot Insights</h3>
      <p>No screenshots uploaded in selected period.</p>
    `;
    return;
  }

  const rows = withShots
    .slice(-20)
    .reverse()
    .map((t) => {
      const a = t.screenshotAnalysis;
      return `<tr>
        <td>${escapeHtml(t.tradeDate || "-")}</td>
        <td>${escapeHtml(t.instrument || "-")}</td>
        <td>${fmt(a.brightness)}</td>
        <td>${fmt(a.contrast)}</td>
        <td>${escapeHtml(a.tag)}</td>
      </tr>`;
    })
    .join("");

  el.screenshotReport.innerHTML = `
    <h3>Screenshot Insights (Auto-analyzed)</h3>
    <p>Quick image signal: brightness + contrast tag for chart clarity context.</p>
    <table class="strategy-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Instrument</th>
          <th>Brightness</th>
          <th>Contrast</th>
          <th>Tag</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function filterByDate(trades, from, to) {
  return trades.filter((t) => {
    const passFrom = !from || (t.tradeDate && t.tradeDate >= from);
    const passTo = !to || (t.tradeDate && t.tradeDate <= to);
    return passFrom && passTo;
  });
}

function sortTrades(trades) {
  trades.sort((a, b) => (a.tradeDate || "").localeCompare(b.tradeDate || ""));
}

function groupBy(list, fn) {
  return list.reduce((acc, item) => {
    const key = fn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

function cumulative(values) {
  let total = 0;
  return values.map((v) => {
    total += v;
    return total;
  });
}

function lineChart(id, values, color, label) {
  const svg = document.getElementById(id);
  const w = 640;
  const h = 240;
  const m = { t: 20, r: 20, b: 30, l: 42 };

  if (!values.length) {
    svg.innerHTML = `<text x="${w / 2}" y="${h / 2}" class="axis-label" text-anchor="middle">No data</text>`;
    return;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const safeMin = min === max ? min - 1 : min;
  const safeMax = min === max ? max + 1 : max;

  const x = (i) => m.l + (i / Math.max(values.length - 1, 1)) * (w - m.l - m.r);
  const y = (v) => m.t + ((safeMax - v) / (safeMax - safeMin)) * (h - m.t - m.b);

  const poly = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");

  svg.innerHTML = `
    <line x1="${m.l}" y1="${h - m.b}" x2="${w - m.r}" y2="${h - m.b}" stroke="#d9dee6" />
    <line x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${h - m.b}" stroke="#d9dee6" />
    <polyline points="${poly}" fill="none" stroke="${color}" stroke-width="2.4" />
    <text x="${w - 120}" y="${m.t + 10}" class="axis-label">${label}</text>
  `;
}

function barChart(id, labels, values, diverging, suffix = "") {
  const svg = document.getElementById(id);
  const w = 640;
  const h = 240;
  const m = { t: 20, r: 14, b: 56, l: 48 };

  if (!labels.length) {
    svg.innerHTML = `<text x="${w / 2}" y="${h / 2}" class="axis-label" text-anchor="middle">No data</text>`;
    return;
  }

  const min = diverging ? Math.min(0, ...values) : 0;
  const max = Math.max(...values, 1);
  const span = max - min || 1;
  const barW = (w - m.l - m.r) / labels.length;
  const zeroY = m.t + ((max - 0) / span) * (h - m.t - m.b);

  const bars = labels
    .map((label, i) => {
      const v = values[i] || 0;
      const x = m.l + i * barW + 6;
      const yv = m.t + ((max - v) / span) * (h - m.t - m.b);
      const y = v >= 0 ? yv : zeroY;
      const bh = Math.max(2, Math.abs(yv - zeroY));
      const fill = diverging ? (v >= 0 ? "#1e9b64" : "#cb3f4a") : "#2162ff";

      return `
        <rect x="${x}" y="${y}" width="${Math.max(barW - 12, 8)}" height="${bh}" fill="${fill}" rx="5" />
        <text x="${x + Math.max(barW - 12, 8) / 2}" y="${h - 22}" class="axis-label" text-anchor="middle">${truncate(label, 11)}</text>
        <text x="${x + Math.max(barW - 12, 8) / 2}" y="${y - 4}" class="axis-label" text-anchor="middle">${fmt(v)}${suffix}</text>
      `;
    })
    .join("");

  svg.innerHTML = `
    <line x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${h - m.b}" stroke="#d9dee6" />
    <line x1="${m.l}" y1="${h - m.b}" x2="${w - m.r}" y2="${h - m.b}" stroke="#d9dee6" />
    ${diverging ? `<line x1="${m.l}" y1="${zeroY}" x2="${w - m.r}" y2="${zeroY}" stroke="#d9dee6" stroke-dasharray="4 4" />` : ""}
    ${bars}
  `;
}

function histogram(id, values, bins) {
  if (!values.length) {
    barChart(id, [], [], false);
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
    const idx = Math.min(bins - 1, Math.floor((v - min) / step));
    buckets[idx].count += 1;
  });
  barChart(
    id,
    buckets.map((b) => `${fmt(b.start)}-${fmt(b.end)}`),
    buckets.map((b) => b.count),
    false
  );
}

async function toDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

async function analyzeImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      const maxW = 240;
      const scale = Math.min(1, maxW / img.width);
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;

      let sumLum = 0;
      const lums = [];
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        sumLum += lum;
        lums.push(lum);
      }

      const brightness = sumLum / lums.length;
      const variance = lums.reduce((acc, v) => acc + (v - brightness) ** 2, 0) / lums.length;
      const contrast = Math.sqrt(variance);

      let tag = "Balanced chart context";
      if (contrast < 28) tag = "Low visual contrast";
      if (brightness < 80) tag = "Dark screenshot";
      if (brightness > 185) tag = "Very bright screenshot";

      resolve({ brightness, contrast, tag });
    };
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = dataUrl;
  });
}

function maxDrawdown(pnlSeries) {
  let peak = 0;
  let equity = 0;
  let dd = 0;
  pnlSeries.forEach((p) => {
    equity += p;
    peak = Math.max(peak, equity);
    dd = Math.max(dd, peak - equity);
  });
  return dd;
}

function sum(values) {
  return values.reduce((a, v) => a + (Number.isFinite(v) ? v : 0), 0);
}

function avg(values) {
  return values.length ? sum(values) / values.length : 0;
}

function toNum(v) {
  if (v === "" || v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function trim(v) {
  return String(v || "").trim();
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function fmt(v) {
  return Number.isFinite(v) ? Number(v).toFixed(2) : "0.00";
}

function money(v) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: state.market === "india" ? "INR" : "USD",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(v) ? v : 0);
}

function truncate(text, length) {
  if (!text) return "";
  return text.length > length ? `${text.slice(0, length - 1)}...` : text;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
