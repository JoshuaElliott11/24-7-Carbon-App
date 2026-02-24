const API_BASE = window.API_BASE || "http://localhost:8000";
let lastResult = null;
let resourceCounter = 0;
let gridDefaults = {};
let demoScenarios = [];

function activeBasis() {
  return document.getElementById("results-basis").value;
}

function activeViewPayload(data) {
  const basis = activeBasis();
  return data?.views?.[basis] || {};
}

function showPage(page) {
  const inputs = document.getElementById("page-inputs");
  const results = document.getElementById("page-results");
  const tabInputs = document.getElementById("tab-inputs");
  const tabResults = document.getElementById("tab-results");
  if (page === "results") {
    results.classList.add("active");
    inputs.classList.remove("active");
    tabResults.classList.add("active");
    tabInputs.classList.remove("active");
  } else {
    inputs.classList.add("active");
    results.classList.remove("active");
    tabInputs.classList.add("active");
    tabResults.classList.remove("active");
  }
}

function parseCsv(text, valueColumn) {
  const raw = (text || "").trim();
  if (!raw) return [];
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error(`CSV for ${valueColumn} requires a header + at least one data row.`);
  const headers = lines[0].split(",").map((s) => s.trim().toLowerCase());
  const tsIdx = headers.indexOf("timestamp");
  const valIdx = headers.indexOf(valueColumn.toLowerCase());
  if (tsIdx < 0 || valIdx < 0) throw new Error(`CSV must include timestamp and ${valueColumn} columns.`);
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    return { timestamp: (cols[tsIdx] || "").trim(), value: Number(cols[valIdx]) };
  });
}

function toCsv(rows) {
  if (!rows || rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const body = rows.map((r) => headers.map((h) => String(r[h] ?? "")).join(","));
  return [headers.join(","), ...body].join("\n");
}

function download(name, content, type = "text/plain") {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function loadFileToTextarea(fileInputId, textareaId) {
  const file = document.getElementById(fileInputId).files?.[0];
  if (!file) return;
  document.getElementById(textareaId).value = await file.text();
}

function parseOptionalNumber(id) {
  const raw = document.getElementById(id).value.trim();
  return raw === "" ? null : Number(raw);
}

function resourceCardHtml(id) {
  return `
  <div class="resource-card" data-id="${id}">
    <div class="row-actions" style="justify-content: space-between;">
      <h3>Resource ${id}</h3>
      <button type="button" class="btn-inline" data-remove="${id}">Remove</button>
    </div>
    <div class="grid">
      <div><label>Name</label><input id="r-${id}-name" value="resource_${id}" /></div>
      <div><label>Is Renewable?</label><select id="r-${id}-renewable"><option value="true">Yes</option><option value="false">No</option></select></div>
      <div><label>Energy Unit</label><select id="r-${id}-energy-unit"><option value="kwh">kWh</option><option value="mwh">MWh</option><option value="gwh">GWh</option></select></div>
      <div><label>EF Unit</label><select id="r-${id}-ef-unit"><option value="kgco2e_per_kwh">kgCO2e/kWh</option><option value="gco2e_per_kwh">gCO2e/kWh</option><option value="tco2e_per_mwh">tCO2e/MWh</option></select></div>
      <div><label>Latitude (optional)</label><input id="r-${id}-lat" type="number" step="any" /></div>
      <div><label>Longitude (optional)</label><input id="r-${id}-lon" type="number" step="any" /></div>
      <div><label>EF Input Mode</label><select id="r-${id}-ef-mode"><option value="default_technology">Default technology</option><option value="constant">Constant</option><option value="timeseries">CSV timeseries</option></select></div>
      <div id="r-${id}-ef-tech-wrap"><label>Default Technology</label><select id="r-${id}-ef-tech"><option value="solar_pv_utility">solar_pv_utility</option><option value="wind_onshore">wind_onshore</option><option value="wind_offshore">wind_offshore</option><option value="hydro">hydro</option><option value="nuclear">nuclear</option><option value="gas_ccgt">gas_ccgt</option><option value="coal">coal</option></select></div>
      <div id="r-${id}-ef-constant-wrap"><label>Constant EF Value</label><input id="r-${id}-ef-constant" type="number" step="any" /></div>
    </div>
    <label>Energy CSV (required): <code>timestamp,energy_kwh</code></label>
    <input id="r-${id}-energy-file" type="file" accept=".csv" />
    <textarea id="r-${id}-energy-csv"></textarea>
    <div id="r-${id}-ef-csv-wrap">
      <label>EF CSV: <code>timestamp,kgco2e_per_kwh</code></label>
      <input id="r-${id}-ef-file" type="file" accept=".csv" />
      <textarea id="r-${id}-ef-csv"></textarea>
    </div>
  </div>`;
}

function updateResourceEfVisibility(id) {
  const mode = document.getElementById(`r-${id}-ef-mode`).value;
  document.getElementById(`r-${id}-ef-tech-wrap`).classList.toggle("hidden", mode !== "default_technology");
  document.getElementById(`r-${id}-ef-constant-wrap`).classList.toggle("hidden", mode !== "constant");
  document.getElementById(`r-${id}-ef-csv-wrap`).classList.toggle("hidden", mode !== "timeseries");
}

function addResource(prefill = null) {
  resourceCounter += 1;
  const id = resourceCounter;
  const root = document.getElementById("resources");
  root.insertAdjacentHTML("beforeend", resourceCardHtml(id));

  document.getElementById(`r-${id}-energy-file`).addEventListener("change", () => loadFileToTextarea(`r-${id}-energy-file`, `r-${id}-energy-csv`));
  document.getElementById(`r-${id}-ef-file`).addEventListener("change", () => loadFileToTextarea(`r-${id}-ef-file`, `r-${id}-ef-csv`));
  document.getElementById(`r-${id}-ef-mode`).addEventListener("change", () => updateResourceEfVisibility(id));
  root.querySelector(`button[data-remove="${id}"]`).addEventListener("click", (e) => e.target.closest(".resource-card").remove());
  updateResourceEfVisibility(id);

  if (prefill) {
    document.getElementById(`r-${id}-name`).value = prefill.name || `resource_${id}`;
    document.getElementById(`r-${id}-renewable`).value = String(prefill.is_renewable ?? true);
    document.getElementById(`r-${id}-energy-unit`).value = prefill.energy_unit || "kwh";
    document.getElementById(`r-${id}-ef-unit`).value = prefill.emissions_unit || "kgco2e_per_kwh";
    document.getElementById(`r-${id}-ef-mode`).value = prefill.ef_input_mode || "default_technology";
    document.getElementById(`r-${id}-ef-tech`).value = prefill.default_technology || "solar_pv_utility";
    if (prefill.constant_ef !== undefined && prefill.constant_ef !== null) {
      document.getElementById(`r-${id}-ef-constant`).value = prefill.constant_ef;
    }
    if (prefill.latitude !== undefined && prefill.latitude !== null) document.getElementById(`r-${id}-lat`).value = prefill.latitude;
    if (prefill.longitude !== undefined && prefill.longitude !== null) document.getElementById(`r-${id}-lon`).value = prefill.longitude;
    if (prefill.energy_series) {
      document.getElementById(`r-${id}-energy-csv`).value = toCsv(prefill.energy_series.map((r) => ({ timestamp: r.timestamp, energy_kwh: r.value })));
    }
    if (prefill.ef_series) {
      document.getElementById(`r-${id}-ef-csv`).value = toCsv(prefill.ef_series.map((r) => ({ timestamp: r.timestamp, kgco2e_per_kwh: r.value })));
    }
    updateResourceEfVisibility(id);
  }
}

function updateGridEfVisibility() {
  const mode = document.getElementById("grid-ef-mode").value;
  document.getElementById("grid-constant-wrap").classList.toggle("hidden", mode !== "constant");
  document.getElementById("grid-csv-wrap").classList.toggle("hidden", mode !== "timeseries");
}

function projectPayload() {
  return {
    timezone: "UTC",
    site_latitude: Number(document.getElementById("site-lat").value),
    site_longitude: Number(document.getElementById("site-lon").value),
    deliverability_km: Number(document.getElementById("deliverability").value),
    fill_strategy: document.getElementById("fill-strategy").value,
    emissions_mode: document.getElementById("emissions-mode").value,
    interval_renewable_target_percent: parseOptionalNumber("goal-i-ren"),
    interval_emissions_target_g_per_kwh: parseOptionalNumber("goal-i-em"),
    daily_renewable_target_percent: parseOptionalNumber("goal-d-ren"),
    daily_emissions_target_g_per_kwh: parseOptionalNumber("goal-d-em"),
    weekly_renewable_target_percent: parseOptionalNumber("goal-w-ren"),
    weekly_emissions_target_g_per_kwh: parseOptionalNumber("goal-w-em"),
    monthly_renewable_target_percent: parseOptionalNumber("goal-m-ren"),
    monthly_emissions_target_g_per_kwh: parseOptionalNumber("goal-m-em"),
  };
}

function collectResources() {
  const cards = Array.from(document.querySelectorAll(".resource-card"));
  if (cards.length === 0) throw new Error("Add at least one supply resource.");
  return cards.map((card) => {
    const id = card.getAttribute("data-id");
    const efMode = document.getElementById(`r-${id}-ef-mode`).value;
    const energySeries = parseCsv(document.getElementById(`r-${id}-energy-csv`).value, "energy_kwh");
    if (energySeries.length === 0) throw new Error(`Resource ${id} requires energy CSV data.`);

    const payload = {
      name: document.getElementById(`r-${id}-name`).value.trim(),
      is_renewable: document.getElementById(`r-${id}-renewable`).value === "true",
      energy_unit: document.getElementById(`r-${id}-energy-unit`).value,
      emissions_unit: document.getElementById(`r-${id}-ef-unit`).value,
      ef_input_mode: efMode,
      default_technology: null,
      constant_ef: null,
      energy_series: energySeries,
      ef_series: [],
    };
    if (!payload.name) throw new Error(`Resource ${id} needs a name.`);

    const lat = document.getElementById(`r-${id}-lat`).value.trim();
    const lon = document.getElementById(`r-${id}-lon`).value.trim();
    if (lat !== "") payload.latitude = Number(lat);
    if (lon !== "") payload.longitude = Number(lon);

    if (efMode === "default_technology") {
      payload.default_technology = document.getElementById(`r-${id}-ef-tech`).value;
    } else if (efMode === "constant") {
      const val = document.getElementById(`r-${id}-ef-constant`).value.trim();
      if (val === "") throw new Error(`Resource ${payload.name} requires a constant EF value.`);
      payload.constant_ef = Number(val);
    } else if (efMode === "timeseries") {
      const efSeries = parseCsv(document.getElementById(`r-${id}-ef-csv`).value, "kgco2e_per_kwh");
      if (efSeries.length === 0) throw new Error(`Resource ${payload.name} requires EF CSV data.`);
      payload.ef_series = efSeries;
    }
    return payload;
  });
}

function gridPayload() {
  const mode = document.getElementById("grid-ef-mode").value;
  const grid = {
    ef_input_mode: mode,
    emissions_unit: document.getElementById("grid-ef-unit").value,
    country_code: document.getElementById("grid-country").value,
    constant_ef: null,
    ef_series: [],
  };
  if (mode === "constant") {
    const val = document.getElementById("grid-constant-ef").value.trim();
    if (val === "") throw new Error("Grid constant EF mode selected but value is empty.");
    grid.constant_ef = Number(val);
  } else if (mode === "timeseries") {
    const series = parseCsv(document.getElementById("grid-ef-csv").value, "kgco2e_per_kwh");
    if (series.length === 0) throw new Error("Grid EF timeseries mode selected but CSV data is empty.");
    grid.ef_series = series;
  }
  return grid;
}

function manualPayload() {
  const loadSeries = parseCsv(document.getElementById("load-csv").value, "load_kwh");
  if (loadSeries.length === 0) throw new Error("Load CSV is required.");
  return {
    use_demo: false,
    project: projectPayload(),
    load_series: loadSeries,
    resources: collectResources(),
    grid: gridPayload(),
  };
}

function formatNumber(v, digits = 2) {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function renderSummary(summary) {
  const root = document.getElementById("summary-grid");
  const metrics = [
    ["Total Load (kWh)", summary.total_load_kwh],
    ["Total Emissions (kgCO2e)", summary.total_emissions_kgco2e],
    ["Intensity (gCO2e/kWh)", summary.emissions_intensity_g_per_kwh],
    ["Renewable Served (kWh)", summary.renewable_served_kwh],
    ["Grid Served (kWh)", summary.grid_served_kwh],
    ["Eligible Deliverable Served (kWh)", summary.eligible_deliverable_served_kwh],
    ["Eligible Deliverable Served (%)", summary.eligible_deliverable_served_percent],
    ["Hourly Matching (%)", (summary.hourly_matching_percent || 0) * 100],
    ["Legacy Annual Matching (%)", (summary.legacy_annual_matching_percent || 0) * 100],
    ["Unmatched Energy (kWh)", summary.unmatched_energy_kwh],
    ["Energy Balance Error (kWh)", summary.energy_balance_error_kwh],
  ];
  root.innerHTML = metrics.map(([label, value]) => `<div class="metric"><div class="label">${label}</div><div class="value">${formatNumber(value)}</div></div>`).join("");
}

function renderExplainers(explainers) {
  const root = document.getElementById("explainers");
  root.innerHTML = Object.entries(explainers || {})
    .map(([k, v]) => `<p><strong>${k.replaceAll("_", " ")}</strong>: ${v}</p>`)
    .join("");
}

function renderGoalAchievement(goal) {
  const root = document.getElementById("goal-grid");
  const order = ["interval", "daily", "weekly", "monthly"];
  root.innerHTML = order
    .map((key) => {
      const g = goal?.[key] || {};
      if (!g.configured) {
        return `<div class="goal-card"><div class="label">${key.toUpperCase()} Goals</div><div class="value">Not configured</div></div>`;
      }
      return `<div class="goal-card">
        <div class="label">${key.toUpperCase()} Goals</div>
        <div class="small">Desired renewable: ${formatNumber(g.renewable_target_percent)}%</div>
        <div class="small">Achieved renewable (avg): ${formatNumber(g.achieved_average_renewable_percent)}%</div>
        <div class="small">Desired emissions: ${formatNumber(g.emissions_target_g_per_kwh)} g/kWh</div>
        <div class="small">Achieved emissions (avg): ${formatNumber(g.achieved_average_emissions_g_per_kwh)} g/kWh</div>
        <div class="small">Both criteria passed: ${formatNumber(g.achievement_percent)}% (${g.passed_periods}/${g.total_periods})</div>
      </div>`;
    })
    .join("");
}

function renderIntervalCharts(data, viewData) {
  const interval = viewData.interval_results || [];
  const x = interval.map((r) => r.timestamp);
  const renewable = interval.map((r) => r.renewable_percent);
  const eligibleRenewable = interval.map((r) => r.eligible_served_percent);
  const intensity = interval.map((r) => r.emissions_intensity_g_per_kwh);
  const emissions = interval.map((r) => r.total_emissions_kgco2e);
  const grid = interval.map((r) => r.grid_import_kwh);

  const iRenTarget = viewData?.goal_achievement?.interval?.configured ? (document.getElementById("goal-i-ren").value || null) : null;
  const iEmTarget = viewData?.goal_achievement?.interval?.configured ? (document.getElementById("goal-i-em").value || null) : null;

  Plotly.newPlot("chart-renewable-interval", [
    { x, y: renewable, mode: "lines", type: "scatter", name: "Physical Renewable %" },
    { x, y: eligibleRenewable, mode: "lines", type: "scatter", name: "Eligible Deliverable %" },
  ], {
    title: "Interval Renewable Share",
    yaxis: { title: "%" },
    xaxis: { title: "Timestamp" },
    shapes: iRenTarget ? [{ type: "line", xref: "paper", x0: 0, x1: 1, y0: Number(iRenTarget), y1: Number(iRenTarget), line: { color: "#b24c00", dash: "dot" } }] : [],
  });

  Plotly.newPlot("chart-intensity-interval", [{ x, y: intensity, mode: "lines", type: "scatter", name: "gCO2e/kWh" }], {
    title: "Interval Emissions Intensity",
    yaxis: { title: "gCO2e/kWh" },
    xaxis: { title: "Timestamp" },
    shapes: iEmTarget ? [{ type: "line", xref: "paper", x0: 0, x1: 1, y0: Number(iEmTarget), y1: Number(iEmTarget), line: { color: "#b24c00", dash: "dot" } }] : [],
  });

  Plotly.newPlot("chart-emissions-interval", [{ x, y: emissions, mode: "lines", type: "scatter", connectgaps: true }], {
    title: "Interval Total Emissions",
    yaxis: { title: "kgCO2e" },
    xaxis: { title: "Timestamp" },
  });

  Plotly.newPlot("chart-grid-interval", [{ x, y: grid, mode: "lines", type: "scatter", connectgaps: true }], {
    title: "Interval Grid Import",
    yaxis: { title: "kWh" },
    xaxis: { title: "Timestamp" },
  });
}

function renderMatchingChart(summary) {
  Plotly.newPlot("chart-matching", [{
    x: ["Legacy Annual", "Hourly"],
    y: [100 * (summary.legacy_annual_matching_percent || 0), 100 * (summary.hourly_matching_percent || 0)],
    type: "bar",
    marker: { color: ["#0f4c81", "#0b6e4f"] },
  }], { yaxis: { title: "%" } });
}

function renderHeatmap(viewData) {
  const hm = viewData.heatmap || [];
  const dates = [...new Set(hm.map((r) => String(r.date)))].sort();
  const dateIndex = Object.fromEntries(dates.map((d, i) => [d, i]));
  const hours = [...Array(24).keys()];
  const z = hours.map(() => Array(dates.length).fill(null));
  hm.forEach((r) => {
    const x = dateIndex[String(r.date)];
    const y = Number(r.hour);
    if (x !== undefined && y >= 0 && y < 24) z[y][x] = Number(r.renewable_percent);
  });
  Plotly.newPlot("chart-heatmap", [{
    x: dates,
    y: hours,
    z,
    type: "heatmap",
    colorscale: "Viridis",
    zmin: 0,
    zmax: 100,
  }], { xaxis: { title: "Date" }, yaxis: { title: "Hour of day" } });
}

function selectedRollupRows(viewData) {
  const mode = document.getElementById("rollup-period").value;
  if (mode === "daily") return viewData.daily_rollup || [];
  if (mode === "weekly") return viewData.weekly_rollup || [];
  if (mode === "monthly") return viewData.monthly_rollup || [];
  return viewData.annual_rollup || [];
}

function renderRollupTable(rows) {
  const root = document.getElementById("rollup-table");
  if (!rows.length) {
    root.innerHTML = "<p class='small'>No rows for selected rollup.</p>";
    return;
  }
  const tableRows = rows
    .map(
      (r) =>
        `<tr><td>${r.timestamp}</td><td>${formatNumber(r.renewable_percent)}</td><td>${formatNumber(r.emissions_intensity_g_per_kwh)}</td><td>${formatNumber(r.load_kwh)}</td></tr>`
    )
    .join("");
  root.innerHTML = `<table style="width:100%; border-collapse:collapse;"><thead><tr><th style="text-align:left;">Timestamp</th><th style="text-align:left;">Renewable %</th><th style="text-align:left;">gCO2e/kWh</th><th style="text-align:left;">Load kWh</th></tr></thead><tbody>${tableRows}</tbody></table>`;
}

function renderRollups(viewData) {
  const rows = selectedRollupRows(viewData);
  const x = rows.map((r) => r.timestamp);
  const y = rows.map((r) => r.renewable_percent);
  Plotly.newPlot(
    "chart-rollup-renewable",
    [{ x, y, mode: "lines+markers", type: "scatter", name: "Renewable %" }],
    {
      yaxis: { title: "Renewable %", autorange: true },
      xaxis: { title: "Timestamp", autorange: true },
      margin: { t: 30 },
    }
  );
  renderRollupTable(rows);
}

function renderGroupedCharts(viewData) {
  const byHour = viewData.by_hour || [];
  Plotly.newPlot("chart-by-hour", [{
    x: byHour.map((r) => r.hour),
    y: byHour.map((r) => r.avg_renewable_percent),
    type: "bar",
    name: "Renewable %",
  }], { yaxis: { title: "Avg renewable %" }, xaxis: { title: "Hour" } });

  const byWeekday = viewData.by_weekday || [];
  Plotly.newPlot("chart-by-weekday", [{
    x: byWeekday.map((r) => r.day_of_week),
    y: byWeekday.map((r) => r.avg_renewable_percent),
    type: "bar",
    name: "Renewable %",
  }], { yaxis: { title: "Avg renewable %" }, xaxis: { title: "Day of week" } });
}

function resourceServedColumns(intervalRows) {
  if (!intervalRows.length) return [];
  return Object.keys(intervalRows[0]).filter((k) => k.endsWith("_served_kwh") && k !== "eligible_served_kwh" && k !== "renewable_served_kwh");
}

function renderWeeklyViewer(viewData) {
  const interval = viewData.interval_results || [];
  if (!interval.length) return;
  const weekSelect = document.getElementById("week-select");
  const metric = document.getElementById("week-metric").value;
  const weekKeys = [...new Set(interval.map((r) => {
    const d = new Date(r.timestamp);
    const day = d.getUTCDay();
    const diff = (day + 6) % 7;
    const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
    return monday.toISOString().slice(0, 10);
  }))].sort();
  const existing = weekSelect.value;
  weekSelect.innerHTML = weekKeys.map((w, i) => `<option value="${w}">Week ${i + 1} (${w})</option>`).join("");
  if (existing && weekKeys.includes(existing)) weekSelect.value = existing;
  const selectedWeek = weekSelect.value;

  const weekRows = interval.filter((r) => {
    const d = new Date(r.timestamp);
    const day = d.getUTCDay();
    const diff = (day + 6) % 7;
    const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff)).toISOString().slice(0, 10);
    return monday === selectedWeek;
  });

  const servedCols = resourceServedColumns(interval);
  const traces = [];
  const x = weekRows.map((r) => r.timestamp);

  servedCols.forEach((col) => {
    const name = col.replace(/_served_kwh$/, "");
    let y;
    if (metric === "kwh") {
      y = weekRows.map((r) => r[col] || 0);
    } else if (metric === "percent") {
      y = weekRows.map((r) => ((r[col] || 0) / Math.max(r.load_kwh || 0, 1e-12)) * 100.0);
    } else {
      const emCol = `${name}_emissions_kg`;
      y = weekRows.map((r) => r[emCol] || 0);
    }
    traces.push({ x, y, mode: "lines", stackgroup: metric === "percent" ? undefined : "one", type: "scatter", name });
  });

  const gridY =
    metric === "kwh"
      ? weekRows.map((r) => r.grid_import_kwh || 0)
      : metric === "percent"
        ? weekRows.map((r) => ((r.grid_import_kwh || 0) / Math.max(r.load_kwh || 0, 1e-12)) * 100.0)
        : weekRows.map((r) => r.grid_emissions_kg || 0);
  traces.push({ x, y: gridY, mode: "lines", stackgroup: metric === "percent" ? undefined : "one", type: "scatter", name: "grid_import" });

  Plotly.newPlot("chart-weekly-composition", traces, {
    title: `Selected week: ${selectedWeek}`,
    yaxis: { title: metric === "kwh" ? "kWh" : metric === "percent" ? "% of load" : "kgCO2e", autorange: true },
    xaxis: { title: "Timestamp", autorange: true },
  });
}

function renderResults(data) {
  const viewData = activeViewPayload(data);
  const basis = activeBasis();
  renderSummary(data.summary?.[basis] || {});
  renderExplainers(data.explainers || {});
  renderGoalAchievement(viewData.goal_achievement || {});
  renderIntervalCharts(data, viewData);
  renderMatchingChart(data.summary?.[basis] || {});
  renderHeatmap(viewData);
  renderRollups(viewData);
  renderGroupedCharts(viewData);
  renderWeeklyViewer(viewData);
  document.getElementById("logs").textContent = (data.logs || []).join("\n");
}

async function runSimulation(payload) {
  const error = document.getElementById("error");
  error.textContent = "";
  const res = await fetch(`${API_BASE}/api/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    error.textContent = await res.text();
    return;
  }
  const data = await res.json();
  lastResult = data;
  renderResults(data);
  showPage("results");
}

async function loadDefaults() {
  const res = await fetch(`${API_BASE}/api/defaults`);
  const defaults = await res.json();
  gridDefaults = defaults.grid_intensity.country_kgco2e_per_kwh || {};
  const countrySelect = document.getElementById("grid-country");
  countrySelect.innerHTML = Object.keys(gridDefaults).sort().map((c) => `<option value="${c}">${c}</option>`).join("");
  if (countrySelect.value && gridDefaults[countrySelect.value] !== undefined) {
    document.getElementById("grid-constant-ef").value = gridDefaults[countrySelect.value];
  }

  const demo = defaults.demo || {};
  demoScenarios = demo.scenarios || [];
  const demoSelect = document.getElementById("demo-scenario");
  const fallback = demo.default_scenario || (demoScenarios[0] ? demoScenarios[0].id : "");
  demoSelect.innerHTML = demoScenarios.map((s) => `<option value="${s.id}">${s.label}</option>`).join("");
  if (fallback) demoSelect.value = fallback;
  updateDemoScenarioDescription();
}

function updateDemoScenarioDescription() {
  const selectedId = document.getElementById("demo-scenario").value;
  const box = document.getElementById("demo-scenario-description");
  const s = demoScenarios.find((x) => x.id === selectedId);
  box.textContent = s ? s.description : "";
}

function applyGoalDefaults(goalDefaults = {}) {
  const mapping = {
    "goal-i-ren": goalDefaults.interval_renewable_target_percent,
    "goal-i-em": goalDefaults.interval_emissions_target_g_per_kwh,
    "goal-d-ren": goalDefaults.daily_renewable_target_percent,
    "goal-d-em": goalDefaults.daily_emissions_target_g_per_kwh,
    "goal-w-ren": goalDefaults.weekly_renewable_target_percent,
    "goal-w-em": goalDefaults.weekly_emissions_target_g_per_kwh,
    "goal-m-ren": goalDefaults.monthly_renewable_target_percent,
    "goal-m-em": goalDefaults.monthly_emissions_target_g_per_kwh,
  };
  Object.entries(mapping).forEach(([id, value]) => {
    if (value !== undefined && value !== null) document.getElementById(id).value = value;
  });
}

async function loadDemoToInputs(selectedScenarioId = null) {
  const res = await fetch(`${API_BASE}/api/defaults`);
  const defaults = await res.json();
  const demo = defaults.demo;
  let scenario = null;
  if (demo.scenarios?.length) {
    const chosen = selectedScenarioId || document.getElementById("demo-scenario").value || demo.default_scenario;
    scenario = demo.scenarios.find((s) => s.id === chosen) || demo.scenarios[0];
  }
  const active = scenario || demo;
  document.getElementById("load-csv").value = toCsv(active.load_profile.map((r) => ({ timestamp: r.timestamp, load_kwh: r.load_kwh })));

  document.getElementById("resources").innerHTML = "";
  resourceCounter = 0;
  (active.resources || []).forEach((r) => addResource(r));

  document.getElementById("grid-ef-mode").value = active.grid.ef_input_mode || "country_default";
  document.getElementById("grid-country").value = active.grid.country_code || "GB";
  document.getElementById("grid-constant-ef").value = active.grid.constant_ef ?? (gridDefaults["GB"] || "");
  if (active.grid.ef_series?.length) {
    document.getElementById("grid-ef-csv").value = toCsv(active.grid.ef_series.map((r) => ({ timestamp: r.timestamp, kgco2e_per_kwh: r.value })));
  } else {
    document.getElementById("grid-ef-csv").value = "";
  }
  if (active.goal_defaults) applyGoalDefaults(active.goal_defaults);
  updateGridEfVisibility();
}

document.getElementById("tab-inputs").addEventListener("click", () => showPage("inputs"));
document.getElementById("tab-results").addEventListener("click", () => showPage("results"));

document.getElementById("add-resource").addEventListener("click", () => addResource());
document.getElementById("load-file").addEventListener("change", () => loadFileToTextarea("load-file", "load-csv"));
document.getElementById("grid-ef-file").addEventListener("change", () => loadFileToTextarea("grid-ef-file", "grid-ef-csv"));
document.getElementById("grid-ef-mode").addEventListener("change", updateGridEfVisibility);
document.getElementById("grid-country").addEventListener("change", () => {
  const code = document.getElementById("grid-country").value;
  if (gridDefaults[code] !== undefined) document.getElementById("grid-constant-ef").value = gridDefaults[code];
});
document.getElementById("demo-scenario").addEventListener("change", () => {
  updateDemoScenarioDescription();
});
document.getElementById("results-basis").addEventListener("change", () => {
  if (lastResult) renderResults(lastResult);
});
document.getElementById("rollup-period").addEventListener("change", () => {
  if (lastResult) renderRollups(activeViewPayload(lastResult));
});
document.getElementById("week-select").addEventListener("change", () => {
  if (lastResult) renderWeeklyViewer(activeViewPayload(lastResult));
});
document.getElementById("week-metric").addEventListener("change", () => {
  if (lastResult) renderWeeklyViewer(activeViewPayload(lastResult));
});

document.getElementById("run-demo").addEventListener("click", async () => {
  const scenarioId = document.getElementById("demo-scenario").value || null;
  const scenario = demoScenarios.find((s) => s.id === scenarioId);
  if (scenario?.goal_defaults) applyGoalDefaults(scenario.goal_defaults);
  await runSimulation({
    use_demo: true,
    demo_scenario: scenarioId,
    project: projectPayload(),
    load_series: [],
    resources: [],
    grid: { ef_input_mode: "country_default", country_code: "GB" },
  });
  await loadDemoToInputs(scenarioId);
});

document.getElementById("run-manual").addEventListener("click", async () => {
  try {
    await runSimulation(manualPayload());
  } catch (e) {
    document.getElementById("error").textContent = String(e.message || e);
    showPage("inputs");
  }
});

document.getElementById("download-summary").addEventListener("click", () => {
  if (!lastResult) return;
  download("results_summary.csv", toCsv([lastResult.summary?.physical || {}, lastResult.summary?.eligible || {}]), "text/csv");
});
document.getElementById("download-interval").addEventListener("click", () => {
  if (!lastResult) return;
  download("interval_results.csv", toCsv(activeViewPayload(lastResult).interval_results || []), "text/csv");
});
document.getElementById("download-report").addEventListener("click", () => {
  if (!lastResult) return;
  download("report.html", lastResult.report_html, "text/html");
});

loadDefaults().then(() => {
  addResource();
  updateGridEfVisibility();
});
