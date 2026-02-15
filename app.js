const STORAGE_KEY = "atlas-trade-journal-v1";

const state = {
  trades: [],
  filtered: [],
  view: "dashboard",
};

const els = {
  tradeForm: document.getElementById("trade-form"),
  strategyPreset: document.getElementById("strategy-preset"),
  customStrategyWrap: document.getElementById("custom-strategy-wrap"),
  filterDateFrom: document.getElementById("filter-date-from"),
  filterDateTo: document.getElementById("filter-date-to"),
  filterStrategy: document.getElementById("filter-strategy"),
  filterInstrument: document.getElementById("filter-instrument"),
  filterDirection: document.getElementById("filter-direction"),
  clearFilters: document.getElementById("clear-filters"),
  kpiGrid: document.getElementById("kpi-grid"),
  kpiTemplate: document.getElementById("kpi-card-template"),
  heatmap: document.getElementById("performance-heatmap"),
  strategyCards: document.getElementById("strategy-cards"),
  tradeTableWrap: document.getElementById("trade-table-wrap"),
  tradeCount: document.getElementById("trade-count"),
  lastUpdated: document.getElementById("last-updated"),
  navBtns: Array.from(document.querySelectorAll(".nav-btn")),
  views: {
    dashboard: document.getElementById("view-dashboard"),
    strategy: document.getElementById("view-strategy"),
    log: document.getElementById("view-log"),
  },
};

init();

function init() {
  loadTrades();
  bindEvents();
  populateFilters();
  applyFilters();
  renderAll();
}

function bindEvents() {
  els.tradeForm.addEventListener("submit", onTradeSubmit);
  els.strategyPreset.addEventListener("change", toggleCustomStrategy);
  [
    els.filterDateFrom,
    els.filterDateTo,
    els.filterStrategy,
    els.filterInstrument,
    els.filterDirection,
  ].forEach((el) => el.addEventListener("change", applyAndRender));

  els.clearFilters.addEventListener("click", () => {
    els.filterDateFrom.value = "";
    els.filterDateTo.value = "";
    els.filterStrategy.value = "all";
    els.filterInstrument.value = "all";
    els.filterDirection.value = "all";
    applyAndRender();
  });

  els.navBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.view = btn.dataset.view;
      els.navBtns.forEach((b) => b.classList.toggle("active", b === btn));
      Object.entries(els.views).forEach(([key, view]) => {
        view.classList.toggle("active", key === state.view);
      });
    });
  });

  els.tradeTableWrap.addEventListener("click", (event) => {
    if (event.target.matches("[data-delete-id]")) {
      const id = event.target.getAttribute("data-delete-id");
      state.trades = state.trades.filter((trade) => trade.id !== id);
      persistTrades();
      populateFilters();
      applyAndRender();
    }
  });
}

function loadTrades() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.trades = raw ? JSON.parse(raw) : [];
  } catch {
    state.trades = [];
  }
}

function persistTrades() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.trades));
}

function toggleCustomStrategy() {
  const custom = els.strategyPreset.value === "Custom";
  els.customStrategyWrap.classList.toggle("hidden", !custom);
}

async function onTradeSubmit(event) {
  event.preventDefault();
  const formData = new FormData(els.tradeForm);
  const screenshotFile = formData.get("screenshot");
  const screenshotData = screenshotFile && screenshotFile.size > 0 ? await fileToDataUrl(screenshotFile) : "";

  const strategyPreset = (formData.get("strategyPreset") || "").trim();
  const strategyCustom = (formData.get("strategyCustom") || "").trim();
  const strategyTag = strategyPreset === "Custom" ? strategyCustom || "Custom" : strategyPreset;

  const trade = calculateTrade({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    tradeDate: formData.get("tradeDate"),
    tradeTime: formData.get("tradeTime"),
    exitDate: formData.get("exitDate"),
    exitTime: formData.get("exitTime"),
    instrument: (formData.get("instrument") || "").trim(),
    tradeType: formData.get("tradeType"),
    entryPrice: toNum(formData.get("entryPrice")),
    stopLoss: toNum(formData.get("stopLoss")),
    positionSize: toNum(formData.get("positionSize")),
    finalExitPrice: toNum(formData.get("finalExitPrice")),
    target1RR: toNum(formData.get("target1RR")),
    target2RR: toNum(formData.get("target2RR")),
    target3RR: toNum(formData.get("target3RR")),
    strategyTag,
    initialMoveType: formData.get("initialMoveType"),
    ema10Abs: toNum(formData.get("ema10Abs")),
    ema10Pct: toNum(formData.get("ema10Pct")),
    ema20Abs: toNum(formData.get("ema20Abs")),
    ema20Pct: toNum(formData.get("ema20Pct")),
    ema50Abs: toNum(formData.get("ema50Abs")),
    ema50Pct: toNum(formData.get("ema50Pct")),
    fees: toNum(formData.get("fees")),
    screenshotData,
    screenshotName: screenshotFile && screenshotFile.size > 0 ? screenshotFile.name : "",
    notes: (formData.get("notes") || "").trim(),
    psychologyNotes: (formData.get("psychologyNotes") || "").trim(),
    createdAt: new Date().toISOString(),
  });

  state.trades.push(trade);
  state.trades.sort((a, b) => toDateTime(a.tradeDate, a.tradeTime) - toDateTime(b.tradeDate, b.tradeTime));
  persistTrades();

  els.tradeForm.reset();
  els.strategyPreset.value = "Breakout Continuation";
  toggleCustomStrategy();

  populateFilters();
  applyAndRender();
}

function calculateTrade(input) {
  const entry = input.entryPrice;
  const stop = input.stopLoss;
  const exit = input.finalExitPrice;
  const size = input.positionSize;
  const fees = input.fees || 0;

  const riskPerUnit = Math.abs(entry - stop);
  const riskAmount = riskPerUnit * size;
  const direction = input.tradeType === "Long" ? 1 : -1;
  const rewardPerUnit = (exit - entry) * direction;

  const grossPnL = rewardPerUnit * size;
  const netPnL = grossPnL - fees;
  const rMultiple = riskAmount > 0 ? netPnL / riskAmount : 0;
  const rrRatio = riskPerUnit > 0 ? rewardPerUnit / riskPerUnit : 0;
  const returnPct = entry > 0 ? (netPnL / (entry * size)) * 100 : 0;
  const winLoss = netPnL >= 0 ? "Win" : "Loss";

  const holdMinutes = getHoldMinutes(input.tradeDate, input.tradeTime, input.exitDate, input.exitTime);

  return {
    ...input,
    riskPerTrade: riskPerUnit,
    riskAmount,
    rewardPerUnit,
    grossPnL,
    netPnL,
    rMultiple,
    rrRatio,
    returnPct,
    winLoss,
    holdMinutes,
  };
}

function getHoldMinutes(startDate, startTime, endDate, endTime) {
  if (!endDate || !endTime) return null;
  const start = toDateTime(startDate, startTime);
  const end = toDateTime(endDate, endTime);
  if (!start || !end) return null;
  const diff = Math.round((end - start) / 60000);
  return diff > 0 ? diff : null;
}

function toDateTime(date, time) {
  if (!date || !time) return null;
  return new Date(`${date}T${time}`);
}

function toNum(value) {
  if (value === null || value === undefined || value === "") return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

function applyFilters() {
  const from = els.filterDateFrom.value;
  const to = els.filterDateTo.value;
  const strategy = els.filterStrategy.value;
  const instrument = els.filterInstrument.value;
  const direction = els.filterDirection.value;

  state.filtered = state.trades.filter((trade) => {
    const passDateFrom = !from || trade.tradeDate >= from;
    const passDateTo = !to || trade.tradeDate <= to;
    const passStrategy = strategy === "all" || trade.strategyTag === strategy;
    const passInstrument = instrument === "all" || trade.instrument === instrument;
    const passDirection = direction === "all" || trade.tradeType === direction;
    return passDateFrom && passDateTo && passStrategy && passInstrument && passDirection;
  });
}

function applyAndRender() {
  applyFilters();
  renderAll();
}

function populateFilters() {
  fillSelect(els.filterStrategy, uniqueValues(state.trades.map((t) => t.strategyTag)));
  fillSelect(els.filterInstrument, uniqueValues(state.trades.map((t) => t.instrument)));
}

function fillSelect(select, values) {
  const current = select.value;
  const opts = ["<option value=\"all\">All</option>"]
    .concat(values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`))
    .join("");
  select.innerHTML = opts;
  if (["all", ...values].includes(current)) {
    select.value = current;
  }
}

function uniqueValues(list) {
  return [...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function renderAll() {
  renderMeta();
  renderKpis();
  renderDashboardCharts();
  renderHeatmap();
  renderStrategyCards();
  renderTradeLog();
}

function renderMeta() {
  els.tradeCount.textContent = `${state.trades.length} trades logged`;
  if (!state.trades.length) {
    els.lastUpdated.textContent = "No trades yet";
    return;
  }
  const latest = state.trades[state.trades.length - 1];
  els.lastUpdated.textContent = `Last trade: ${latest.tradeDate} ${latest.tradeTime}`;
}

function renderKpis() {
  const m = computeMetrics(state.filtered);
  const cards = [
    ["Trades", m.totalTrades],
    ["Win Rate", `${fmt(m.winRate)}%`],
    ["Gross P&L", money(m.totalGross)],
    ["Net P&L", money(m.totalNet)],
    ["Average R", fmt(m.avgR)],
    ["Average Win", money(m.avgWin)],
    ["Average Loss", money(m.avgLoss)],
    ["Expectancy (R)", fmt(m.expectancyR)],
    ["Max Drawdown", money(m.maxDrawdown)],
    ["Risk/Reward", fmt(m.avgRR)],
    ["Avg Hold Time", fmtMinutes(m.avgHoldMinutes)],
    ["Profit Factor", fmt(m.profitFactor)],
  ];

  els.kpiGrid.innerHTML = "";
  cards.forEach(([label, value]) => {
    const node = els.kpiTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".kpi-label").textContent = label;
    node.querySelector(".kpi-value").textContent = value;
    els.kpiGrid.appendChild(node);
  });
}

function computeMetrics(trades) {
  const totalTrades = trades.length;
  const wins = trades.filter((t) => t.netPnL >= 0);
  const losses = trades.filter((t) => t.netPnL < 0);

  const totalGross = sum(trades.map((t) => t.grossPnL));
  const totalNet = sum(trades.map((t) => t.netPnL));
  const winRate = totalTrades ? (wins.length / totalTrades) * 100 : 0;
  const avgR = average(trades.map((t) => t.rMultiple));
  const avgWin = average(wins.map((t) => t.netPnL));
  const avgLoss = average(losses.map((t) => t.netPnL));
  const avgWinR = average(wins.map((t) => t.rMultiple));
  const avgLossR = average(losses.map((t) => t.rMultiple));
  const lossRate = 1 - winRate / 100;
  const expectancyR = (winRate / 100) * avgWinR + lossRate * avgLossR;
  const maxDrawdown = computeMaxDrawdown(trades.map((t) => t.netPnL));
  const avgRR = average(trades.map((t) => t.rrRatio));
  const avgHoldMinutes = average(trades.map((t) => t.holdMinutes).filter(Boolean));

  const grossProfit = sum(wins.map((t) => t.netPnL));
  const grossLoss = Math.abs(sum(losses.map((t) => t.netPnL)));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;

  return {
    totalTrades,
    totalGross,
    totalNet,
    winRate,
    avgR,
    avgWin,
    avgLoss,
    expectancyR,
    maxDrawdown,
    avgRR,
    avgHoldMinutes,
    profitFactor,
  };
}

function renderDashboardCharts() {
  const trades = state.filtered;

  renderLineChart(
    "equity-chart",
    cumulative(trades.map((t) => t.netPnL)),
    { lineColor: "#2663ff", label: "Equity" }
  );

  renderHistogram("r-dist-chart", trades.map((t) => t.rMultiple), 8);

  const strategyGroups = groupBy(trades, (t) => t.strategyTag || "Unlabeled");
  const strategyLabels = Object.keys(strategyGroups);

  const strategyWinValues = strategyLabels.map((label) => {
    const group = strategyGroups[label];
    const wins = group.filter((t) => t.netPnL >= 0).length;
    return group.length ? (wins / group.length) * 100 : 0;
  });
  renderBarChart("strategy-win-chart", strategyLabels, strategyWinValues, "#0bbf8a", "%");

  const strategyPnlValues = strategyLabels.map((label) => sum(strategyGroups[label].map((t) => t.netPnL)));
  renderBarChart("strategy-pnl-chart", strategyLabels, strategyPnlValues, "#2663ff", "$", true);

  const dowLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dowPnl = dowLabels.map((dow) =>
    sum(trades.filter((t) => dayLabel(t.tradeDate) === dow).map((t) => t.netPnL))
  );
  renderBarChart("dow-chart", dowLabels, dowPnl, "#1f4dbf", "$", true);

  const timeBuckets = [
    { label: "Pre", start: 0, end: 9 },
    { label: "Open", start: 9, end: 12 },
    { label: "Mid", start: 12, end: 15 },
    { label: "Close", start: 15, end: 24 },
  ];
  const todValues = timeBuckets.map((bucket) =>
    sum(
      trades
        .filter((t) => {
          const hour = getHour(t.tradeTime);
          return hour >= bucket.start && hour < bucket.end;
        })
        .map((t) => t.netPnL)
    )
  );
  renderBarChart(
    "tod-chart",
    timeBuckets.map((b) => b.label),
    todValues,
    "#0f9ec7",
    "$",
    true
  );

  const emaBins = [
    { label: "0-0.5%", min: 0, max: 0.5 },
    { label: "0.5-1%", min: 0.5, max: 1 },
    { label: "1-2%", min: 1, max: 2 },
    { label: "2%+", min: 2, max: Infinity },
  ];
  const emaValues = emaBins.map((bin) => {
    const group = trades.filter((t) => {
      const v = Math.abs(t.ema10Pct || 0);
      return v >= bin.min && v < bin.max;
    });
    return average(group.map((t) => t.rMultiple));
  });
  renderBarChart(
    "ema-range-chart",
    emaBins.map((b) => b.label),
    emaValues,
    "#7a4df2",
    "R",
    true
  );

  renderLineChart(
    "risk-chart",
    trades.map((t) => t.riskAmount),
    { lineColor: "#d6454e", label: "Risk" }
  );
}

function renderHeatmap() {
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const blocks = [
    { label: "Pre", start: 0, end: 9 },
    { label: "Open", start: 9, end: 12 },
    { label: "Mid", start: 12, end: 15 },
    { label: "Close", start: 15, end: 24 },
  ];

  const map = {};
  weekdays.forEach((d) => {
    map[d] = {};
    blocks.forEach((b) => {
      map[d][b.label] = [];
    });
  });

  state.filtered.forEach((trade) => {
    const day = dayLabel(trade.tradeDate);
    const hour = getHour(trade.tradeTime);
    const block = blocks.find((b) => hour >= b.start && hour < b.end);
    if (day && block) map[day][block.label].push(trade.netPnL);
  });

  let html = `<div class="hm-head"></div>${blocks.map((b) => `<div class="hm-head">${b.label}</div>`).join("")}`;

  weekdays.forEach((day) => {
    html += `<div class="hm-head">${day}</div>`;
    blocks.forEach((block) => {
      const vals = map[day][block.label];
      const pnl = sum(vals);
      const intensity = Math.min(Math.abs(pnl) / 1000, 1);
      const bg = pnl >= 0
        ? `rgba(11, 191, 138, ${0.08 + intensity * 0.35})`
        : `rgba(214, 69, 78, ${0.08 + intensity * 0.35})`;
      html += `<div class="hm-cell" style="background:${bg}"><strong>${money(pnl)}</strong><span>${vals.length} trades</span></div>`;
    });
  });

  els.heatmap.innerHTML = html;
}

function renderStrategyCards() {
  const groups = groupBy(state.filtered, (t) => t.strategyTag || "Unlabeled");
  const names = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  if (!names.length) {
    els.strategyCards.innerHTML = `<div class="panel">No strategies found for current filters.</div>`;
    return;
  }

  els.strategyCards.innerHTML = names
    .map((name) => {
      const trades = groups[name];
      const metrics = computeMetrics(trades);
      const best = trades.reduce((acc, t) => (t.netPnL > acc.netPnL ? t : acc), trades[0]);
      const worst = trades.reduce((acc, t) => (t.netPnL < acc.netPnL ? t : acc), trades[0]);
      const curve = cumulative(trades.map((t) => t.netPnL));
      const spark = sparklineSvg(curve);

      return `
        <article class="strategy-card">
          <h3>${escapeHtml(name)}</h3>
          <div class="strategy-stats">
            <span>Total Trades: <strong>${metrics.totalTrades}</strong></span>
            <span>Avg R: <strong>${fmt(metrics.avgR)}</strong></span>
            <span>Win Rate: <strong>${fmt(metrics.winRate)}%</strong></span>
            <span>Profit Factor: <strong>${fmt(metrics.profitFactor)}</strong></span>
            <span>Expectancy: <strong>${fmt(metrics.expectancyR)}R</strong></span>
            <span>Net P&L: <strong>${money(metrics.totalNet)}</strong></span>
            <span>Best Trade: <strong>${money(best.netPnL)}</strong></span>
            <span>Worst Trade: <strong>${money(worst.netPnL)}</strong></span>
          </div>
          ${spark}
        </article>
      `;
    })
    .join("");
}

function renderTradeLog() {
  if (!state.filtered.length) {
    els.tradeTableWrap.innerHTML = `<p>No trades match current filters.</p>`;
    return;
  }

  const rows = state.filtered
    .slice()
    .reverse()
    .map((t) => {
      const badge = t.netPnL >= 0 ? "win" : "loss";
      const screenshot = t.screenshotData
        ? `<a href="${t.screenshotData}" target="_blank" rel="noopener">View</a>`
        : "-";
      return `
        <tr>
          <td>${escapeHtml(t.tradeDate)} ${escapeHtml(t.tradeTime)}</td>
          <td>${escapeHtml(t.instrument)}</td>
          <td>${escapeHtml(t.tradeType)}</td>
          <td>${escapeHtml(t.strategyTag)}</td>
          <td>${fmt(t.entryPrice)}</td>
          <td>${fmt(t.stopLoss)}</td>
          <td>${fmt(t.finalExitPrice)}</td>
          <td>${fmt(t.positionSize)}</td>
          <td>${money(t.riskAmount)}</td>
          <td>${fmt(t.rMultiple)}R</td>
          <td>${money(t.netPnL)}</td>
          <td>${fmt(t.returnPct)}%</td>
          <td><span class="badge ${badge}">${t.winLoss}</span></td>
          <td>${fmtMinutes(t.holdMinutes)}</td>
          <td>${screenshot}</td>
          <td>${escapeHtml(t.notes || "-")}</td>
          <td><button class="ghost-btn" data-delete-id="${t.id}">Delete</button></td>
        </tr>
      `;
    })
    .join("");

  els.tradeTableWrap.innerHTML = `
    <table class="trade-table">
      <thead>
        <tr>
          <th>Date/Time</th>
          <th>Instrument</th>
          <th>Type</th>
          <th>Strategy</th>
          <th>Entry</th>
          <th>SL</th>
          <th>Exit</th>
          <th>Size</th>
          <th>Risk</th>
          <th>R</th>
          <th>Net P&L</th>
          <th>Return</th>
          <th>Result</th>
          <th>Hold</th>
          <th>Shot</th>
          <th>Notes</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderLineChart(svgId, values, opts = {}) {
  const svg = document.getElementById(svgId);
  const width = 600;
  const height = 250;
  const m = { top: 20, right: 20, bottom: 28, left: 40 };

  if (!values.length) {
    svg.innerHTML = emptySvgLabel(width, height, "No data");
    return;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const safeMin = min === max ? min - 1 : min;
  const safeMax = min === max ? max + 1 : max;

  const x = (i) => m.left + (i / Math.max(values.length - 1, 1)) * (width - m.left - m.right);
  const y = (v) => m.top + ((safeMax - v) / (safeMax - safeMin)) * (height - m.top - m.bottom);

  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const last = values[values.length - 1];

  svg.innerHTML = `
    <line x1="${m.left}" y1="${height - m.bottom}" x2="${width - m.right}" y2="${height - m.bottom}" stroke="#c8d5ef" />
    <line x1="${m.left}" y1="${m.top}" x2="${m.left}" y2="${height - m.bottom}" stroke="#c8d5ef" />
    <polyline fill="none" stroke="${opts.lineColor || "#2663ff"}" stroke-width="2.5" points="${points}" />
    <circle cx="${x(values.length - 1)}" cy="${y(last)}" r="4" fill="${opts.lineColor || "#2663ff"}" />
    <text x="${width - 120}" y="${m.top + 10}" class="axis-label">${opts.label || "Value"}: ${fmt(last)}</text>
    <text x="${m.left}" y="${height - 8}" class="axis-label">1</text>
    <text x="${width - m.right - 18}" y="${height - 8}" class="axis-label">${values.length}</text>
  `;
}

function renderBarChart(svgId, labels, values, color, suffix = "", diverging = false) {
  const svg = document.getElementById(svgId);
  const width = 600;
  const height = 250;
  const m = { top: 20, right: 14, bottom: 55, left: 48 };

  if (!labels.length || !values.length) {
    svg.innerHTML = emptySvgLabel(width, height, "No data");
    return;
  }

  const min = diverging ? Math.min(0, ...values) : 0;
  const max = Math.max(...values, 0.1);
  const span = max - min || 1;
  const barW = (width - m.left - m.right) / labels.length;
  const zeroY = m.top + ((max - 0) / span) * (height - m.top - m.bottom);

  const bars = labels
    .map((label, i) => {
      const v = values[i] || 0;
      const x = m.left + i * barW + 6;
      const yVal = m.top + ((max - v) / span) * (height - m.top - m.bottom);
      const y = v >= 0 ? yVal : zeroY;
      const h = Math.max(Math.abs(yVal - zeroY), 2);
      const fill = diverging ? (v >= 0 ? "#0bbf8a" : "#d6454e") : color;

      return `
        <rect x="${x}" y="${y}" width="${Math.max(barW - 12, 8)}" height="${h}" rx="5" fill="${fill}" opacity="0.9" />
        <text x="${x + (Math.max(barW - 12, 8) / 2)}" y="${height - 20}" text-anchor="middle" class="axis-label">${truncate(
          label,
          10
        )}</text>
        <text x="${x + (Math.max(barW - 12, 8) / 2)}" y="${y - 4}" text-anchor="middle" class="axis-label">${fmt(v)}${suffix}</text>
      `;
    })
    .join("");

  svg.innerHTML = `
    <line x1="${m.left}" y1="${m.top}" x2="${m.left}" y2="${height - m.bottom}" stroke="#c8d5ef" />
    <line x1="${m.left}" y1="${height - m.bottom}" x2="${width - m.right}" y2="${height - m.bottom}" stroke="#c8d5ef" />
    ${diverging ? `<line x1="${m.left}" y1="${zeroY}" x2="${width - m.right}" y2="${zeroY}" stroke="#d5deef" stroke-dasharray="4 4" />` : ""}
    ${bars}
  `;
}

function renderHistogram(svgId, values, bins = 8) {
  const svg = document.getElementById(svgId);
  const width = 600;
  const height = 250;

  if (!values.length) {
    svg.innerHTML = emptySvgLabel(width, height, "No data");
    return;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = span / bins;
  const buckets = Array.from({ length: bins }, (_, i) => ({
    start: min + i * step,
    end: min + (i + 1) * step,
    count: 0,
  }));

  values.forEach((v) => {
    const idx = Math.min(Math.floor((v - min) / step), bins - 1);
    buckets[idx].count += 1;
  });

  renderBarChart(
    svgId,
    buckets.map((b) => `${fmt(b.start)} to ${fmt(b.end)}`),
    buckets.map((b) => b.count),
    "#1f4dbf"
  );
}

function sparklineSvg(values) {
  if (!values.length) {
    return `<svg class="sparkline" viewBox="0 0 300 90"></svg>`;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const safeMin = min === max ? min - 1 : min;
  const safeMax = min === max ? max + 1 : max;

  const x = (i) => 8 + (i / Math.max(values.length - 1, 1)) * 284;
  const y = (v) => 8 + ((safeMax - v) / (safeMax - safeMin)) * 74;
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");

  return `
    <svg class="sparkline" viewBox="0 0 300 90">
      <polyline points="${points}" fill="none" stroke="#2663ff" stroke-width="2.2" />
      <circle cx="${x(values.length - 1)}" cy="${y(values[values.length - 1])}" r="3" fill="#0bbf8a" />
    </svg>
  `;
}

function computeMaxDrawdown(pnlSeries) {
  let peak = 0;
  let equity = 0;
  let maxDd = 0;

  pnlSeries.forEach((pnl) => {
    equity += pnl;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
  });

  return maxDd;
}

function cumulative(values) {
  let sumVal = 0;
  return values.map((v) => {
    sumVal += v;
    return sumVal;
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

function dayLabel(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
}

function getHour(timeStr) {
  if (!timeStr || !timeStr.includes(":")) return 0;
  return Number(timeStr.split(":")[0]) || 0;
}

function sum(values) {
  return values.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
}

function average(values) {
  if (!values.length) return 0;
  return sum(values) / values.length;
}

function money(v) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(
    Number.isFinite(v) ? v : 0
  );
}

function fmt(v) {
  return Number.isFinite(v) ? Number(v).toFixed(2) : "0.00";
}

function fmtMinutes(mins) {
  if (!mins) return "-";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function truncate(text, maxLen) {
  if (!text) return "";
  return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
}

function emptySvgLabel(width, height, msg) {
  return `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" class="axis-label">${msg}</text>`;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
