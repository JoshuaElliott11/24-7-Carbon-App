const API_BASE = window.API_BASE || window.location.origin;
let lastResult = null;
let resourceCounter = 0;
let gridDefaults = {};
let demoScenarios = [];
let defaultsCache = null;

const REGION_PRESETS = {
  caiso: {
    label: "California (CAISO)",
    gridCountry: "US",
    energyPrice: 65,
    carbonTax: 85,
    annualRec: 5,
    hourlyTeac: 15,
  },
  ercot: {
    label: "Texas (ERCOT)",
    gridCountry: "US",
    energyPrice: 40,
    carbonTax: 85,
    annualRec: 4,
    hourlyTeac: 14,
  },
  uk: {
    label: "United Kingdom",
    gridCountry: "GB",
    energyPrice: 85,
    carbonTax: 85,
    annualRec: 6,
    hourlyTeac: 16,
  },
  germany: {
    label: "Germany",
    gridCountry: "DE",
    energyPrice: 75,
    carbonTax: 90,
    annualRec: 6,
    hourlyTeac: 17,
  },
};

const LOCATIONALITY_PRESETS = {
  same_zone: { label: "Same bidding zone", deliverabilityKm: 20 },
  adjacent_zone: { label: "Adjacent zone (congested)", deliverabilityKm: 200 },
  unconnected: { label: "Unconnected grid", deliverabilityKm: 0 },
};

let activeResultsSection = "overview";

const INFO_TEXT = {
  "run controls": "Controls for executing a demo or custom scenario and seeing whether results come from API or local fallback engine.",
  "demo scenario": "Predefined scenario bundle including load, resources, grid factors, and default goals.",
  "scenario description": "Human-readable summary of the selected demo case and expected behavior.",
  "project configuration": "Site, market-boundary, and financial assumptions that define accounting behavior and cost outputs.",
  "performance goals (optional)": "Optional KPI thresholds used to compute interval/daily/weekly/monthly pass rates.",
  "load profile": "Facility demand input time series used as the denominator for matching and intensity metrics.",
  "supply resources": "Generation and attribute sources that can be matched to load, subject to temporal and deliverability rules.",
  "grid ef (what's left)": "Residual and SSS emission-factor assumptions applied after voluntary clean matching is allocated.",
  "standard supply service (sss) ef": "Emission factor source for mandated utility service share that is allocated before voluntary matching.",
  "name": "Resource identifier shown in outputs and logs.",
  "is renewable?": "Flags whether the resource contributes to renewable-serving and matching metrics.",
  "energy unit": "Input unit for generation data; normalized internally for calculations.",
  "latitude (optional)": "Resource latitude used to estimate distance-based deliverability eligibility.",
  "longitude (optional)": "Resource longitude used to estimate distance-based deliverability eligibility.",
  "default technology": "Technology-specific default EF source when explicit EF data is not provided.",
  "energy csv (required): timestamp,energy_kwh": "Resource generation profile by interval; required to compute served load and matching.",
  "ef csv: timestamp,kgco2e_per_kwh": "Optional interval EF series for resource-specific emissions when timeseries EF mode is selected.",
  "site latitude": "Latitude of the consuming facility. Used for deliverability distance calculations.",
  "site longitude": "Longitude of the consuming facility. Used for deliverability distance calculations.",
  "locationality preset": "Deliverability policy preset used to set eligibility boundary for market-based hourly matching.",
  "region preset": "Convenience preset for default country EF and financial assumptions.",
  "sss pro-rata share (%)": "Portion of load assigned to Standard Supply Service before voluntary hourly matching is applied.",
  "emissions mode": "Select operational vs lifecycle technology defaults when using technology-based EF assumptions.",
  "missing interval strategy": "How missing timestamps are handled: reject, forward fill, interpolate, or zero fill.",
  "energy price (usd/mwh)": "Retail/wholesale energy spend assumption used in both legacy and hourly strategy totals.",
  "carbon tax (usd/tco2e)": "Carbon cost assumption applied to reported (legacy) vs true hourly emissions.",
  "annual rec price (usd/mwh)": "Certificate price for legacy annual matching approach.",
  "hourly t-eac price (usd/mwh)": "Granular certificate premium for hourly matched energy volumes.",
  "interval renewable target %": "Optional pass/fail target for each interval's renewable share.",
  "interval emissions target (gco2e/kwh)": "Optional pass/fail target for each interval's emissions intensity.",
  "daily renewable target %": "Optional pass/fail renewable target at daily rollup level.",
  "daily emissions target (gco2e/kwh)": "Optional pass/fail emissions target at daily rollup level.",
  "weekly renewable target %": "Optional pass/fail renewable target at weekly rollup level.",
  "weekly emissions target (gco2e/kwh)": "Optional pass/fail emissions target at weekly rollup level.",
  "monthly renewable target %": "Optional pass/fail renewable target at monthly rollup level.",
  "monthly emissions target (gco2e/kwh)": "Optional pass/fail emissions target at monthly rollup level.",
  "load csv": "Time-series facility demand in kWh by interval. Required for simulation.",
  "upload csv": "Attach CSV input data; file content is loaded into the paired textarea for review and edit.",
  "upload ef csv": "Attach emission-factor CSV for interval EF mode.",
  "upload sss ef csv": "Attach SSS emission-factor CSV for interval SSS EF mode.",
  "grid ef csv (timestamp,kgco2e_per_kwh)": "Residual-grid EF time series used when grid EF input mode is timeseries.",
  "sss ef csv (timestamp,kgco2e_per_kwh)": "SSS EF time series used when SSS EF input mode is timeseries.",
  "ef input mode": "Choose country default, constant EF, or timestamped EF timeseries.",
  "country default": "Uses default annual-average country residual factor from reference dataset.",
  "constant ef value": "Fixed emissions factor used for every interval.",
  "ef unit": "Unit used for EF inputs; values are normalized internally to kgCO2e/kWh.",
  "sss ef input mode": "Defines SSS emission factor source for pre-allocated SSS load share.",
  "sss country default": "Country default EF used specifically for SSS allocation path.",
  "sss constant ef value": "Fixed SSS EF used in each interval when constant mode is selected.",
  "accounting basis": "Eligible = deliverability-constrained market claim view. Physical = all modeled resources.",
  "total load (kwh)": "Total modeled energy consumption over the selected reporting period.",
  "total emissions (kgco2e)": "Total emissions under interval-by-interval calculation order.",
  "intensity (gco2e/kwh)": "Average emissions intensity of served load.",
  "renewable served (kwh)": "Load served by resources flagged renewable within the active accounting basis.",
  "grid served (kwh)": "Residual unmatched load served by grid after SSS and voluntary matching.",
  "eligible deliverable served (kwh)": "Renewable served from resources inside deliverability boundary.",
  "eligible deliverable served (%)": "Share of load served by eligible-deliverable renewable resources.",
  "hourly matching (%)": "Share of load hourly-matched by eligible clean generation.",
  "legacy annual matching (%)": "Annual-netted matching score (legacy volumetric method).",
  "compliance gap (pp)": "Difference between legacy annual % and true hourly % in percentage points.",
  "reported annual emissions (kgco2e)": "Legacy-style annual reported emissions estimate.",
  "true hourly emissions (kgco2e)": "Physically aligned emissions from interval calculation order.",
  "unmatched energy (kwh)": "Voluntary load not matched by eligible clean supply in same interval.",
  "sss served (kwh)": "Load allocated to Standard Supply Service before voluntary matching.",
  "residual emissions (kgco2e)": "Emissions from residual grid import after SSS and voluntary matching.",
  "legacy total cost (usd)": "Legacy strategy total = energy + annual certificates + reported carbon cost.",
  "hourly strategy cost (usd)": "Hourly strategy total = energy + hourly certificates + true carbon cost.",
  "cost delta (usd)": "Hourly strategy total minus legacy strategy total.",
  "energy balance error (kwh)": "Diagnostic check: should be near zero if interval accounting is consistent.",
  "summary": "Primary accounting outputs for the selected basis, including energy, emissions, matching, and costs.",
  "explainers": "Interpretation notes that describe methodology, ordering, and key accounting caveats.",
  "goal achievement": "Pass-rate assessment against configured renewable and emissions targets at multiple rollups.",
  "hourly matching vs legacy annual matching": "Direct comparison of temporal hourly matching against legacy annual netting percentage.",
  "matching duration curve": "Sorted hourly matching profile to reveal tail-risk hours with poor clean coverage.",
  "exports": "Downloadable outputs for reporting, audit support, and downstream analysis.",
  "interval renewable %": "Interval-level renewable share of load in percent.",
  "interval emissions intensity (gco2e/kwh)": "Interval-level emissions intensity after SSS allocation and residual calculation.",
  "interval emissions (kgco2e)": "Interval total emissions in kgCO2e.",
  "interval grid import (kwh)": "Residual grid energy required after clean and SSS allocations.",
  "renewable % heatmap (date x hour)": "Calendar-hour map of renewable share to identify consistent deficit periods.",
  "renewable % rollup": "Aggregated renewable percentage by selected period for trend and compliance tracking.",
  "rollup period": "Select daily, weekly, monthly, or annual aggregation interval.",
  "rollup values": "Tabular rollup values used to support charted aggregates.",
  "grouped analysis": "Average performance by clock hour and weekday for operational pattern insight.",
  "average by hour of day": "Mean metric profile by hour across the reporting window.",
  "average by day of week": "Mean metric profile by weekday across the reporting window.",
  "weekly interval viewer": "Detailed one-week decomposition of served energy or emissions by source.",
  "select week": "Choose the ISO-like week bucket to inspect in detail.",
  "metric": "Select whether weekly composition shows kWh, percent of load, or emissions.",
  "carbon emissions reporting gap": "Comparison between legacy reported emissions and physically aligned hourly emissions.",
  "cost stack: legacy vs hourly strategy": "Stacked cost decomposition of energy, certificates, and carbon costs under both strategies.",
};

function normalizeInfoKey(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

function elementInfoKey(el) {
  if (!el) return "";
  const clone = el.cloneNode(true);
  clone.querySelectorAll(".info-icon").forEach((n) => n.remove());
  return normalizeInfoKey(clone.textContent);
}

function addInfoIcon(target, tip) {
  if (!target || !tip) return;
  if (target.querySelector(":scope > .info-icon")) return;
  const icon = document.createElement("span");
  icon.className = "info-icon";
  icon.textContent = "i";
  icon.setAttribute("data-tip", tip);
  target.appendChild(icon);
}

function applyInfoExplainers() {
  document.querySelectorAll("label, .metric .label, h2, h3").forEach((el) => {
    const key = elementInfoKey(el);
    const dynamicResourceHeading = /^resource\s+\d+$/.test(key)
      ? "A modeled energy resource block containing generation profile, EF assumptions, and location metadata."
      : null;
    const tip = INFO_TEXT[key] || dynamicResourceHeading || "Reporting definition for this field in annual-vs-hourly matching analysis.";
    addInfoIcon(el, tip);
  });
}

function setRunMode(mode, detail = "") {
  const el = document.getElementById("run-mode");
  if (!el) return;
  if (mode === "api") {
    el.textContent = `Compute mode: backend API${detail ? ` (${detail})` : ""}`;
    el.style.color = "#0b6e4f";
  } else if (mode === "local") {
    el.textContent = `Compute mode: local fallback${detail ? ` (${detail})` : ""}`;
    el.style.color = "#0f4c81";
  } else {
    el.textContent = "";
  }
}

async function fetchDefaultsData() {
  if (defaultsCache) return defaultsCache;
  try {
    const res = await fetch(`${API_BASE}/api/defaults`);
    if (!res.ok) throw new Error("API defaults unavailable");
    defaultsCache = await res.json();
    return defaultsCache;
  } catch (_) {
    defaultsCache = await window.LocalSim.loadLocalDefaults();
    return defaultsCache;
  }
}

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

function showResultsSection(section) {
  activeResultsSection = section;
  const sections = ["overview", "energy", "financial"];
  sections.forEach((s) => {
    const btn = document.getElementById(`results-view-${s}`);
    const panel = document.getElementById(`results-panel-${s}`);
    if (btn) btn.classList.toggle("active", s === section);
    if (panel) panel.classList.toggle("active", s === section);
  });
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
  applyInfoExplainers();
}

function updateGridEfVisibility() {
  const mode = document.getElementById("grid-ef-mode").value;
  document.getElementById("grid-constant-wrap").classList.toggle("hidden", mode !== "constant");
  document.getElementById("grid-csv-wrap").classList.toggle("hidden", mode !== "timeseries");

  const sssMode = document.getElementById("sss-ef-mode").value;
  document.getElementById("sss-constant-wrap").classList.toggle("hidden", sssMode !== "constant");
  document.getElementById("sss-csv-wrap").classList.toggle("hidden", sssMode !== "timeseries");
}

function projectPayload() {
  const locKey = document.getElementById("locationality-preset")?.value || "same_zone";
  const loc = LOCATIONALITY_PRESETS[locKey] || LOCATIONALITY_PRESETS.same_zone;
  return {
    timezone: "UTC",
    site_latitude: Number(document.getElementById("site-lat").value),
    site_longitude: Number(document.getElementById("site-lon").value),
    deliverability_km: Number(loc.deliverabilityKm),
    sss_share_percent: Number(document.getElementById("sss-share").value || 0),
    fill_strategy: document.getElementById("fill-strategy").value,
    emissions_mode: document.getElementById("emissions-mode").value,
    carbon_tax_usd_per_tco2e: Number(document.getElementById("carbon-tax").value || 85),
    annual_rec_usd_per_mwh: Number(document.getElementById("annual-rec-price").value || 5),
    hourly_teac_usd_per_mwh: Number(document.getElementById("hourly-teac-price").value || 15),
    energy_price_usd_per_mwh: Number(document.getElementById("energy-price").value || 65),
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
  const sssMode = document.getElementById("sss-ef-mode").value;
  const grid = {
    ef_input_mode: mode,
    emissions_unit: document.getElementById("grid-ef-unit").value,
    country_code: document.getElementById("grid-country").value,
    constant_ef: null,
    ef_series: [],
    sss_ef_input_mode: sssMode,
    sss_country_code: document.getElementById("sss-country").value,
    sss_constant_ef: null,
    sss_ef_series: [],
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

  if (sssMode === "constant") {
    const val = document.getElementById("sss-constant-ef").value.trim();
    if (val === "") throw new Error("SSS constant EF mode selected but value is empty.");
    grid.sss_constant_ef = Number(val);
  } else if (sssMode === "timeseries") {
    const series = parseCsv(document.getElementById("sss-ef-csv").value, "kgco2e_per_kwh");
    if (series.length === 0) throw new Error("SSS EF timeseries mode selected but CSV data is empty.");
    grid.sss_ef_series = series;
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
  const legacyPct = (summary.legacy_annual_matching_percent || 0) * 100;
  const hourlyPct = (summary.hourly_matching_percent || 0) * 100;
  const complianceGap = legacyPct - hourlyPct;
  const metrics = [
    ["Total Load (kWh)", summary.total_load_kwh],
    ["Total Emissions (kgCO2e)", summary.total_emissions_kgco2e],
    ["Intensity (gCO2e/kWh)", summary.emissions_intensity_g_per_kwh],
    ["Renewable Served (kWh)", summary.renewable_served_kwh],
    ["Grid Served (kWh)", summary.grid_served_kwh],
    ["Eligible Deliverable Served (kWh)", summary.eligible_deliverable_served_kwh],
    ["Eligible Deliverable Served (%)", summary.eligible_deliverable_served_percent],
    ["Hourly Matching (%)", hourlyPct],
    ["Legacy Annual Matching (%)", legacyPct],
    ["Compliance Gap (pp)", complianceGap],
    ["Reported Annual Emissions (kgCO2e)", summary.reported_annual_emissions_kgco2e],
    ["True Hourly Emissions (kgCO2e)", summary.true_emissions_kgco2e],
    ["Unmatched Energy (kWh)", summary.unmatched_energy_kwh],
    ["SSS Served (kWh)", summary.sss_served_kwh],
    ["Residual Emissions (kgCO2e)", summary.residual_emissions_kgco2e],
    ["Legacy Total Cost (USD)", summary.financial_old_total_usd],
    ["Hourly Strategy Cost (USD)", summary.financial_new_total_usd],
    ["Cost Delta (USD)", summary.financial_delta_usd],
    ["Energy Balance Error (kWh)", summary.energy_balance_error_kwh],
  ];
  root.innerHTML = metrics.map(([label, value]) => `<div class="metric"><div class="label">${label}</div><div class="value">${formatNumber(value)}</div></div>`).join("");
  applyInfoExplainers();
}

function renderFinancialCharts(summary) {
  const oldEnergy = summary.financial_old_energy_cost_usd || 0;
  const oldRec = summary.financial_old_rec_cost_usd || 0;
  const oldTax = summary.financial_old_tax_usd || 0;
  const newEnergy = summary.financial_new_energy_cost_usd || 0;
  const newRec = summary.financial_new_rec_cost_usd || 0;
  const newTax = summary.financial_new_tax_usd || 0;

  Plotly.newPlot("chart-cost-stack", [
    { x: ["Legacy annual", "Hourly strategy"], y: [oldEnergy, newEnergy], type: "bar", name: "Energy", marker: { color: "#94a3b8" } },
    { x: ["Legacy annual", "Hourly strategy"], y: [oldRec, newRec], type: "bar", name: "Certificates", marker: { color: "#3b82f6" } },
    { x: ["Legacy annual", "Hourly strategy"], y: [oldTax, newTax], type: "bar", name: "Carbon tax", marker: { color: "#ef4444" } },
  ], {
    barmode: "stack",
    yaxis: { title: "USD" },
    margin: { t: 30 },
  });

  Plotly.newPlot("chart-emissions-compare", [
    {
      x: ["Reported annual", "True hourly"],
      y: [summary.reported_annual_emissions_kgco2e || 0, summary.true_emissions_kgco2e || 0],
      type: "bar",
      marker: { color: ["#64748b", "#dc2626"] },
      text: ["Legacy reporting", "Hourly reality"],
      textposition: "auto",
    },
  ], {
    yaxis: { title: "kgCO2e" },
    margin: { t: 30 },
  });

  const delta = (summary.financial_delta_usd || 0);
  const takeAway = document.getElementById("financial-takeaway");
  if (takeAway) {
    takeAway.textContent =
      delta > 0
        ? `Hourly compliance increases total cost by ${formatNumber(delta, 0)} USD, typically from tighter temporal matching and higher carbon-cost realism.`
        : `Hourly compliance reduces total cost by ${formatNumber(Math.abs(delta), 0)} USD in this case due to lower modeled tax and/or cleaner matching.`;
  }
}

function renderDurationCurve(viewData) {
  const interval = viewData.interval_results || [];
  const ordered = interval
    .map((r) => Number(r.renewable_percent || 0))
    .sort((a, b) => b - a)
    .map((matchPercent, i) => ({ hourIndex: i + 1, matchPercent }));

  Plotly.newPlot("chart-duration-curve", [
    { x: ordered.map((r) => r.hourIndex), y: ordered.map((r) => r.matchPercent), mode: "lines", type: "scatter", fill: "tozeroy", line: { color: "#4f46e5" } },
  ], {
    yaxis: { title: "Matched %", range: [0, 100] },
    xaxis: { title: "Hour rank (best to worst)" },
    margin: { t: 30 },
  });
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
  const intensity = interval.map((r) => r.emissions_intensity_g_per_kwh);
  const emissions = interval.map((r) => r.total_emissions_kgco2e);
  const grid = interval.map((r) => r.grid_import_kwh);

  const iRenTarget = viewData?.goal_achievement?.interval?.configured ? (document.getElementById("goal-i-ren").value || null) : null;
  const iEmTarget = viewData?.goal_achievement?.interval?.configured ? (document.getElementById("goal-i-em").value || null) : null;

  Plotly.newPlot("chart-renewable-interval", [
    { x, y: renewable, mode: "lines", type: "scatter", name: "Physical Renewable %" },
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
  const summary = data.summary?.[basis] || {};
  renderSummary(summary);
  renderExplainers(data.explainers || {});
  renderGoalAchievement(viewData.goal_achievement || {});
  renderIntervalCharts(data, viewData);
  renderMatchingChart(summary);
  renderDurationCurve(viewData);
  renderFinancialCharts(summary);
  renderHeatmap(viewData);
  renderRollups(viewData);
  renderGroupedCharts(viewData);
  renderWeeklyViewer(viewData);
  document.getElementById("logs").textContent = (data.logs || []).join("\n");
  showResultsSection(activeResultsSection);
  applyInfoExplainers();
}

function buildReportPack() {
  if (!lastResult) return null;
  return {
    exported_at_utc: new Date().toISOString(),
    methodology: {
      matching_hourly_formula: "sum_h min(a_h, c_h) / sum_h c_h",
      matching_annual_formula: "min(sum_h a_h, sum_h c_h) / sum_h c_h",
      interval_order: ["SSS allocation", "voluntary hourly matching", "residual emissions"],
      notes: [
        "Eligible basis applies deliverability eligibility filters.",
        "Physical basis includes all modeled resources.",
        "Use true hourly emissions for physically aligned impact analysis.",
      ],
    },
    scenario_inputs: {
      project: projectPayload(),
      grid: gridPayload(),
    },
    outputs: lastResult,
  };
}

async function runSimulation(payload) {
  const error = document.getElementById("error");
  error.textContent = "";
  setRunMode("", "");
  try {
    const res = await fetch(`${API_BASE}/api/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text();
      // Validation errors from API should be shown directly, not masked by local fallback.
      if (res.status >= 400 && res.status < 500) {
        throw new Error(body);
      }
      throw new Error(`Server unavailable (${res.status})`);
    }
    const data = await res.json();
    lastResult = data;
    renderResults(data);
    setRunMode("api");
    showPage("results");
  } catch (err) {
    try {
      if ((err?.message || "").startsWith("{") || (err?.message || "").includes("detail") || (err?.message || "").includes("Validation")) {
        throw err;
      }
      const defaults = await fetchDefaultsData();
      const payloadForLocal = { ...payload };
      if (payloadForLocal.use_demo) {
        const demo = defaults.demo;
        const scenarioId = payloadForLocal.demo_scenario || demo.default_scenario;
        const scenario = (demo.scenarios || []).find((s) => s.id === scenarioId) || (demo.scenarios || [])[0];
        payloadForLocal.load_series = (scenario?.load_profile || []).map((r) => ({ timestamp: r.timestamp, value: r.load_kwh }));
        payloadForLocal.resources = scenario?.resources || [];
        payloadForLocal.grid = {
          ...(scenario?.grid || {}),
          sss_ef_input_mode: (scenario?.grid || {}).sss_ef_input_mode || "country_default",
          sss_country_code: (scenario?.grid || {}).sss_country_code || (scenario?.grid || {}).country_code || "GB",
          sss_ef_series: (scenario?.grid || {}).sss_ef_series || [],
        };
      }
      const data = window.LocalSim.simulate(payloadForLocal, defaults);
      lastResult = data;
      renderResults(data);
      setRunMode("local", "API unreachable");
      showPage("results");
    } catch (innerErr) {
      error.textContent = String(innerErr.message || innerErr);
      showPage("inputs");
    }
  }
}

async function loadDefaults() {
  const defaults = await fetchDefaultsData();
  gridDefaults = defaults.grid_intensity.country_kgco2e_per_kwh || {};
  const countrySelect = document.getElementById("grid-country");
  const sssCountrySelect = document.getElementById("sss-country");
  countrySelect.innerHTML = Object.keys(gridDefaults).sort().map((c) => `<option value="${c}">${c}</option>`).join("");
  sssCountrySelect.innerHTML = Object.keys(gridDefaults).sort().map((c) => `<option value="${c}">${c}</option>`).join("");
  if (countrySelect.value && gridDefaults[countrySelect.value] !== undefined) {
    document.getElementById("grid-constant-ef").value = gridDefaults[countrySelect.value];
  }
  if (sssCountrySelect.value && gridDefaults[sssCountrySelect.value] !== undefined) {
    document.getElementById("sss-constant-ef").value = gridDefaults[sssCountrySelect.value];
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
  const defaults = await fetchDefaultsData();
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
  document.getElementById("sss-ef-mode").value = active.grid.sss_ef_input_mode || "country_default";
  document.getElementById("sss-country").value = active.grid.sss_country_code || active.grid.country_code || "GB";
  document.getElementById("sss-constant-ef").value = active.grid.sss_constant_ef ?? active.grid.constant_ef ?? (gridDefaults["GB"] || "");
  if (active.grid.ef_series?.length) {
    document.getElementById("grid-ef-csv").value = toCsv(active.grid.ef_series.map((r) => ({ timestamp: r.timestamp, kgco2e_per_kwh: r.value })));
  } else {
    document.getElementById("grid-ef-csv").value = "";
  }
  if (active.grid.sss_ef_series?.length) {
    document.getElementById("sss-ef-csv").value = toCsv(active.grid.sss_ef_series.map((r) => ({ timestamp: r.timestamp, kgco2e_per_kwh: r.value })));
  } else {
    document.getElementById("sss-ef-csv").value = "";
  }
  if (active.goal_defaults) applyGoalDefaults(active.goal_defaults);
  updateGridEfVisibility();
}

document.getElementById("tab-inputs").addEventListener("click", () => showPage("inputs"));
document.getElementById("tab-results").addEventListener("click", () => showPage("results"));

document.getElementById("add-resource").addEventListener("click", () => addResource());
document.getElementById("load-file").addEventListener("change", () => loadFileToTextarea("load-file", "load-csv"));
document.getElementById("grid-ef-file").addEventListener("change", () => loadFileToTextarea("grid-ef-file", "grid-ef-csv"));
document.getElementById("sss-ef-file").addEventListener("change", () => loadFileToTextarea("sss-ef-file", "sss-ef-csv"));
document.getElementById("grid-ef-mode").addEventListener("change", updateGridEfVisibility);
document.getElementById("sss-ef-mode").addEventListener("change", updateGridEfVisibility);
document.getElementById("grid-country").addEventListener("change", () => {
  const code = document.getElementById("grid-country").value;
  if (gridDefaults[code] !== undefined) document.getElementById("grid-constant-ef").value = gridDefaults[code];
});
document.getElementById("sss-country").addEventListener("change", () => {
  const code = document.getElementById("sss-country").value;
  if (gridDefaults[code] !== undefined) document.getElementById("sss-constant-ef").value = gridDefaults[code];
});
document.getElementById("demo-scenario").addEventListener("change", () => {
  updateDemoScenarioDescription();
});
document.getElementById("results-basis").addEventListener("change", () => {
  if (lastResult) renderResults(lastResult);
});
document.getElementById("results-view-overview").addEventListener("click", () => showResultsSection("overview"));
document.getElementById("results-view-energy").addEventListener("click", () => showResultsSection("energy"));
document.getElementById("results-view-financial").addEventListener("click", () => showResultsSection("financial"));
document.getElementById("rollup-period").addEventListener("change", () => {
  if (lastResult) renderRollups(activeViewPayload(lastResult));
});
document.getElementById("week-select").addEventListener("change", () => {
  if (lastResult) renderWeeklyViewer(activeViewPayload(lastResult));
});
document.getElementById("week-metric").addEventListener("change", () => {
  if (lastResult) renderWeeklyViewer(activeViewPayload(lastResult));
});

document.getElementById("region-preset").addEventListener("change", () => {
  const key = document.getElementById("region-preset").value;
  const p = REGION_PRESETS[key];
  if (!p) return;
  document.getElementById("energy-price").value = p.energyPrice;
  document.getElementById("carbon-tax").value = p.carbonTax;
  document.getElementById("annual-rec-price").value = p.annualRec;
  document.getElementById("hourly-teac-price").value = p.hourlyTeac;
  if (gridDefaults[p.gridCountry] !== undefined) {
    document.getElementById("grid-country").value = p.gridCountry;
    document.getElementById("sss-country").value = p.gridCountry;
    document.getElementById("grid-constant-ef").value = gridDefaults[p.gridCountry];
    document.getElementById("sss-constant-ef").value = gridDefaults[p.gridCountry];
  }
});

document.getElementById("locationality-preset").addEventListener("change", () => {
  const key = document.getElementById("locationality-preset").value;
  const p = LOCATIONALITY_PRESETS[key];
  if (!p) return;
  const text = document.getElementById("locationality-note");
  if (text) {
    text.textContent = `${p.label}: this setting drives deliverability eligibility in the model (${p.deliverabilityKm} km equivalent).`;
  }
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
    grid: {
      ef_input_mode: "country_default",
      country_code: "GB",
      sss_ef_input_mode: "country_default",
      sss_country_code: "GB",
      sss_ef_series: [],
    },
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
const reportPackBtn = document.getElementById("download-report-pack");
if (reportPackBtn) {
  reportPackBtn.addEventListener("click", () => {
    const pack = buildReportPack();
    if (!pack) return;
    download("report_pack.json", JSON.stringify(pack, null, 2), "application/json");
  });
}

loadDefaults().then(() => {
  const regionSelect = document.getElementById("region-preset");
  regionSelect.innerHTML = Object.entries(REGION_PRESETS)
    .map(([k, v]) => `<option value="${k}">${v.label}</option>`)
    .join("");
  document.getElementById("locationality-preset").value = "same_zone";
  document.getElementById("locationality-note").textContent =
    `${LOCATIONALITY_PRESETS.same_zone.label}: this setting drives deliverability eligibility in the model (${LOCATIONALITY_PRESETS.same_zone.deliverabilityKm} km equivalent).`;

  addResource();
  updateGridEfVisibility();
  showResultsSection("overview");
  applyInfoExplainers();
});
