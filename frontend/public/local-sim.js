(function () {
  const ENERGY_TO_KWH = { kwh: 1, mwh: 1000, gwh: 1000000 };
  const EF_TO_KG = { kgco2e_per_kwh: 1, gco2e_per_kwh: 0.001, tco2e_per_mwh: 1 };

  function haversineKm(lat1, lon1, lat2, lon2) {
    const r = 6371;
    const toRad = (v) => (v * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * r * Math.asin(Math.sqrt(a));
  }

  function isoWeekStart(ts) {
    const d = new Date(ts);
    const day = d.getUTCDay();
    const diff = (day + 6) % 7;
    const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
    return monday.toISOString();
  }

  function monthStart(ts) {
    const d = new Date(ts);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
  }

  function yearStart(ts) {
    const d = new Date(ts);
    return new Date(Date.UTC(d.getUTCFullYear(), 0, 1)).toISOString();
  }

  function dayStart(ts) {
    const d = new Date(ts);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
  }

  function mapSeries(points) {
    const m = new Map();
    (points || []).forEach((p) => m.set(p.timestamp, Number(p.value)));
    return m;
  }

  function rollupFromIntervals(interval, keyFn) {
    const rows = new Map();
    interval.forEach((r) => {
      const k = keyFn(r.timestamp);
      if (!rows.has(k)) {
        rows.set(k, { timestamp: k, load_kwh: 0, renewable_served_kwh: 0, grid_import_kwh: 0, total_emissions_kgco2e: 0 });
      }
      const a = rows.get(k);
      a.load_kwh += r.load_kwh;
      a.renewable_served_kwh += r.renewable_served_kwh;
      a.grid_import_kwh += r.grid_import_kwh;
      a.total_emissions_kgco2e += r.total_emissions_kgco2e;
    });
    return Array.from(rows.values()).sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp))).map((r) => ({
      ...r,
      renewable_percent: r.load_kwh > 0 ? (100 * r.renewable_served_kwh) / r.load_kwh : 0,
      emissions_intensity_g_per_kwh: r.load_kwh > 0 ? (1000 * r.total_emissions_kgco2e) / r.load_kwh : 0,
    }));
  }

  function goalAchievement(rows, renTarget, emTarget) {
    if (renTarget === null && emTarget === null) {
      const avgRen = rows.length ? rows.reduce((a, r) => a + r.renewable_percent, 0) / rows.length : null;
      const avgEm = rows.length ? rows.reduce((a, r) => a + r.emissions_intensity_g_per_kwh, 0) / rows.length : null;
      return {
        configured: false,
        renewable_target_percent: null,
        emissions_target_g_per_kwh: null,
        achieved_average_renewable_percent: avgRen,
        achieved_average_emissions_g_per_kwh: avgEm,
        achievement_percent: null,
        total_periods: rows.length,
        passed_periods: null,
      };
    }

    let passed = 0;
    rows.forEach((r) => {
      const renOk = renTarget === null ? true : r.renewable_percent >= renTarget;
      const emOk = emTarget === null ? true : r.emissions_intensity_g_per_kwh <= emTarget;
      if (renOk && emOk) passed += 1;
    });

    return {
      configured: true,
      renewable_target_percent: renTarget,
      emissions_target_g_per_kwh: emTarget,
      achieved_average_renewable_percent: rows.length ? rows.reduce((a, r) => a + r.renewable_percent, 0) / rows.length : null,
      achieved_average_emissions_g_per_kwh: rows.length ? rows.reduce((a, r) => a + r.emissions_intensity_g_per_kwh, 0) / rows.length : null,
      achievement_percent: rows.length ? (100 * passed) / rows.length : 0,
      total_periods: rows.length,
      passed_periods: passed,
    };
  }

  async function loadLocalDefaults() {
    const [techRes, gridRes, demoRes] = await Promise.all([
      fetch("defaults/technology_efs.json"),
      fetch("defaults/grid_intensity_country.json"),
      fetch("defaults/demo_profiles.json"),
    ]);
    if (!techRes.ok || !gridRes.ok || !demoRes.ok) {
      throw new Error("Local defaults files are not available. Ensure defaults/*.json are deployed with the site.");
    }
    return {
      technology_efs: await techRes.json(),
      grid_intensity: await gridRes.json(),
      demo: await demoRes.json(),
    };
  }

  function simulate(payload, defaults) {
    const logs = [];
    const load = (payload.load_series || []).map((r) => ({ timestamp: r.timestamp, load_kwh: Number(r.value) }));
    if (!load.length) throw new Error("Load timeseries is required");

    const gridDefaults = defaults.grid_intensity.country_kgco2e_per_kwh || {};
    const techDefaults = (defaults.technology_efs.technologies || {});

    const loadMap = new Map(load.map((r) => [r.timestamp, r.load_kwh]));
    const timestamps = load.map((r) => r.timestamp);

    function convertEnergy(v, unit) {
      return Number(v) * (ENERGY_TO_KWH[unit] || 1);
    }

    function convertEf(v, unit) {
      return Number(v) * (EF_TO_KG[unit] || 1);
    }

    function buildEfMap(mode, series, constant, country, emissionsUnit) {
      const m = new Map();
      if (mode === "timeseries") {
        const s = mapSeries(series);
        timestamps.forEach((ts) => m.set(ts, convertEf(s.get(ts) ?? 0, emissionsUnit)));
        return m;
      }
      if (mode === "constant") {
        timestamps.forEach((ts) => m.set(ts, convertEf(constant ?? 0, emissionsUnit)));
        return m;
      }
      const code = String(country || "GB").toUpperCase();
      const v = Number(gridDefaults[code] ?? 0);
      timestamps.forEach((ts) => m.set(ts, v));
      return m;
    }

    const residualEf = buildEfMap(
      payload.grid.ef_input_mode,
      payload.grid.ef_series,
      payload.grid.constant_ef,
      payload.grid.country_code,
      payload.grid.emissions_unit
    );

    const sssEf = buildEfMap(
      payload.grid.sss_ef_input_mode || "country_default",
      payload.grid.sss_ef_series || [],
      payload.grid.sss_constant_ef,
      payload.grid.sss_country_code || payload.grid.country_code,
      payload.grid.emissions_unit
    );

    const resources = (payload.resources || []).map((r) => {
      const energyIn = mapSeries(r.energy_series);
      const energy = new Map();
      timestamps.forEach((ts) => energy.set(ts, convertEnergy(energyIn.get(ts) ?? 0, r.energy_unit)));

      const ef = new Map();
      if (r.ef_input_mode === "timeseries") {
        const efIn = mapSeries(r.ef_series);
        timestamps.forEach((ts) => ef.set(ts, convertEf(efIn.get(ts) ?? 0, r.emissions_unit)));
      } else if (r.ef_input_mode === "constant") {
        timestamps.forEach((ts) => ef.set(ts, convertEf(r.constant_ef ?? 0, r.emissions_unit)));
      } else {
        const t = techDefaults[r.default_technology] || {};
        const key = `${payload.project.emissions_mode}_gco2e_per_kwh`;
        const v = Number(t[key] ?? 0) / 1000;
        timestamps.forEach((ts) => ef.set(ts, v));
      }

      let eligible = true;
      if (
        payload.project.site_latitude !== null &&
        payload.project.site_longitude !== null &&
        payload.project.site_latitude !== undefined &&
        payload.project.site_longitude !== undefined &&
        r.latitude !== null &&
        r.longitude !== null &&
        r.latitude !== undefined &&
        r.longitude !== undefined
      ) {
        const dist = haversineKm(payload.project.site_latitude, payload.project.site_longitude, r.latitude, r.longitude);
        if (dist > Number(payload.project.deliverability_km || 0)) {
          eligible = false;
          logs.push(`Resource '${r.name}' excluded from eligible view: ${dist.toFixed(2)} km > ${Number(payload.project.deliverability_km || 0).toFixed(2)} km`);
        }
      }

      return { ...r, energy, ef, eligible };
    });

    function buildView(useEligibleFilter) {
      const selected = resources.filter((r) => !useEligibleFilter || r.eligible);
      const sssShare = Math.max(0, Math.min(1, Number(payload.project.sss_share_percent || 0) / 100));
      const interval = [];

      let totalLoad = 0;
      let totalEmissions = 0;
      let renewableServed = 0;
      let gridServed = 0;
      let sssServed = 0;
      let sssEmissions = 0;
      let residualEmissions = 0;
      let hourlyMatched = 0;
      let renewableGenerated = 0;
      let servedSum = 0;

      timestamps.forEach((ts) => {
        const loadKwh = Number(loadMap.get(ts) || 0);
        const sssKwh = loadKwh * sssShare;
        const sssEfVal = Number(sssEf.get(ts) || 0);
        const sssEmKg = sssKwh * sssEfVal;

        let remaining = Math.max(0, loadKwh - sssKwh);
        let rowRenewableServed = 0;
        const row = {
          timestamp: ts,
          load_kwh: loadKwh,
          sss_served_kwh: sssKwh,
          sss_emissions_kg: sssEmKg,
          residual_ef_kg_per_kwh: Number(residualEf.get(ts) || 0),
        };

        selected.forEach((r) => {
          const gen = Number(r.energy.get(ts) || 0);
          const ef = Number(r.ef.get(ts) || 0);
          const served = Math.max(0, Math.min(gen, remaining));
          const spilled = Math.max(0, gen - served);
          const em = served * ef;
          remaining = Math.max(0, remaining - served);

          row[`${r.name}_generation_kwh`] = gen;
          row[`${r.name}_served_kwh`] = served;
          row[`${r.name}_spilled_kwh`] = spilled;
          row[`${r.name}_ef_kg_per_kwh`] = ef;
          row[`${r.name}_emissions_kg`] = em;

          if (r.is_renewable) {
            rowRenewableServed += served;
            renewableGenerated += gen;
          }
          servedSum += served;
        });

        const gridImport = remaining;
        const gridEm = gridImport * Number(residualEf.get(ts) || 0);
        const totalEm = sssEmKg + gridEm + Object.keys(row)
          .filter((k) => k.endsWith("_emissions_kg") && k !== "sss_emissions_kg")
          .reduce((acc, k) => acc + Number(row[k] || 0), 0);

        row.grid_import_kwh = gridImport;
        row.grid_emissions_kg = gridEm;
        row.renewable_served_kwh = rowRenewableServed;
        row.total_emissions_kgco2e = totalEm;
        row.renewable_percent = loadKwh > 0 ? (100 * rowRenewableServed) / loadKwh : 0;
        row.emissions_intensity_g_per_kwh = loadKwh > 0 ? (1000 * totalEm) / loadKwh : 0;

        interval.push(row);

        totalLoad += loadKwh;
        totalEmissions += totalEm;
        renewableServed += rowRenewableServed;
        gridServed += gridImport;
        sssServed += sssKwh;
        sssEmissions += sssEmKg;
        residualEmissions += gridEm;
        const voluntaryLoad = Math.max(0, loadKwh - sssKwh);
        hourlyMatched += Math.min(voluntaryLoad, rowRenewableServed);
      });

        const legacyMatched = Math.min(totalLoad, renewableGenerated);
      const annualResidualEf = interval.length
        ? interval.reduce((a, r) => a + Number(r.residual_ef_kg_per_kwh || 0), 0) / interval.length
        : 0;
        const annualReportedEm = (Math.max(0, totalLoad - legacyMatched) * annualResidualEf) + sssEmissions;

      const energyPrice = Number(payload.project.energy_price_usd_per_mwh || 65);
      const annualRec = Number(payload.project.annual_rec_usd_per_mwh || 5);
      const hourlyTeac = Number(payload.project.hourly_teac_usd_per_mwh || 15);
      const carbonTax = Number(payload.project.carbon_tax_usd_per_tco2e || 85);

      const oldEnergyCost = (totalLoad / 1000) * energyPrice;
      const oldRecCost = (renewableGenerated / 1000) * annualRec;
      const oldTax = (annualReportedEm / 1000) * carbonTax;
      const newEnergyCost = (totalLoad / 1000) * energyPrice;
      const newRecCost = (hourlyMatched / 1000) * hourlyTeac;
      const newTax = (totalEmissions / 1000) * carbonTax;

      const daily = rollupFromIntervals(interval, dayStart);
      const weekly = rollupFromIntervals(interval, isoWeekStart);
      const monthly = rollupFromIntervals(interval, monthStart);
      const annual = rollupFromIntervals(interval, yearStart);

      const byHourMap = new Map();
      interval.forEach((r) => {
        const hour = new Date(r.timestamp).getUTCHours();
        if (!byHourMap.has(hour)) byHourMap.set(hour, { hour, ren: 0, em: 0, n: 0 });
        const x = byHourMap.get(hour);
        x.ren += r.renewable_percent;
        x.em += r.emissions_intensity_g_per_kwh;
        x.n += 1;
      });
      const byHour = Array.from(byHourMap.values()).sort((a, b) => a.hour - b.hour).map((x) => ({
        hour: x.hour,
        avg_renewable_percent: x.n ? x.ren / x.n : 0,
        avg_emissions_intensity_g_per_kwh: x.n ? x.em / x.n : 0,
      }));

      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const byWeekMap = new Map();
      interval.forEach((r) => {
        const idx = new Date(r.timestamp).getUTCDay();
        const key = dayNames[idx];
        if (!byWeekMap.has(key)) byWeekMap.set(key, { day_of_week: key, ren: 0, em: 0, n: 0 });
        const x = byWeekMap.get(key);
        x.ren += r.renewable_percent;
        x.em += r.emissions_intensity_g_per_kwh;
        x.n += 1;
      });
      const byWeekday = dayNames
        .map((d) => byWeekMap.get(d))
        .filter(Boolean)
        .map((x) => ({
          day_of_week: x.day_of_week,
          avg_renewable_percent: x.n ? x.ren / x.n : 0,
          avg_emissions_intensity_g_per_kwh: x.n ? x.em / x.n : 0,
        }));

      const heatmap = interval.map((r) => ({
        date: r.timestamp.slice(0, 10),
        hour: new Date(r.timestamp).getUTCHours(),
        renewable_percent: r.renewable_percent,
      }));

      const weeklyCompMap = new Map();
      interval.forEach((r) => {
        const w = isoWeekStart(r.timestamp);
        selected.forEach((res) => {
          const key = `${w}|${res.name}`;
          const v = Number(r[`${res.name}_served_kwh`] || 0);
          weeklyCompMap.set(key, (weeklyCompMap.get(key) || 0) + v);
        });
        const gKey = `${w}|grid_import`;
        weeklyCompMap.set(gKey, (weeklyCompMap.get(gKey) || 0) + Number(r.grid_import_kwh || 0));
      });
      const weeklyComposition = Array.from(weeklyCompMap.entries()).map(([k, served_kwh]) => {
        const [week_start, source] = k.split("|");
        return { week_start, source, served_kwh };
      });

      const weekTotals = new Map();
      weeklyComposition.forEach((r) => weekTotals.set(r.week_start, (weekTotals.get(r.week_start) || 0) + r.served_kwh));
      weeklyComposition.forEach((r) => {
        const t = weekTotals.get(r.week_start) || 0;
        r.served_percent = t > 0 ? (100 * r.served_kwh) / t : 0;
      });

      const summary = {
        total_load_kwh: totalLoad,
        total_emissions_kgco2e: totalEmissions,
        true_emissions_kgco2e: totalEmissions,
        reported_annual_emissions_kgco2e: annualReportedEm,
        emissions_intensity_kgco2e_per_kwh: totalLoad > 0 ? totalEmissions / totalLoad : 0,
        emissions_intensity_g_per_kwh: totalLoad > 0 ? (1000 * totalEmissions) / totalLoad : 0,
        hourly_matched_energy_kwh: hourlyMatched,
        hourly_matching_percent: totalLoad > 0 ? hourlyMatched / totalLoad : 0,
        legacy_annual_matching_percent: totalLoad > 0 ? legacyMatched / totalLoad : 0,
        unmatched_energy_kwh: gridServed,
        grid_served_kwh: gridServed,
        sss_served_kwh: sssServed,
        sss_emissions_kgco2e: sssEmissions,
        residual_emissions_kgco2e: residualEmissions,
        renewable_served_kwh: renewableServed,
        eligible_deliverable_served_kwh: renewableServed,
        eligible_deliverable_served_percent: totalLoad > 0 ? (100 * renewableServed) / totalLoad : 0,
        energy_balance_error_kwh: Math.abs(totalLoad - (servedSum + gridServed + sssServed)),
        emissions_mode: payload.project.emissions_mode,
        financial_old_energy_cost_usd: oldEnergyCost,
        financial_old_rec_cost_usd: oldRecCost,
        financial_old_tax_usd: oldTax,
        financial_old_total_usd: oldEnergyCost + oldRecCost + oldTax,
        financial_new_energy_cost_usd: newEnergyCost,
        financial_new_rec_cost_usd: newRecCost,
        financial_new_tax_usd: newTax,
        financial_new_total_usd: newEnergyCost + newRecCost + newTax,
        financial_delta_usd: newEnergyCost + newRecCost + newTax - (oldEnergyCost + oldRecCost + oldTax),
      };

      return {
        summary,
        interval_results: interval,
        daily_rollup: daily,
        weekly_rollup: weekly,
        monthly_rollup: monthly,
        annual_rollup: annual,
        by_hour: byHour,
        by_weekday: byWeekday,
        heatmap,
        weekly_composition: weeklyComposition,
        goal_achievement: {
          interval: goalAchievement(interval, payload.project.interval_renewable_target_percent, payload.project.interval_emissions_target_g_per_kwh),
          daily: goalAchievement(daily, payload.project.daily_renewable_target_percent, payload.project.daily_emissions_target_g_per_kwh),
          weekly: goalAchievement(weekly, payload.project.weekly_renewable_target_percent, payload.project.weekly_emissions_target_g_per_kwh),
          monthly: goalAchievement(monthly, payload.project.monthly_renewable_target_percent, payload.project.monthly_emissions_target_g_per_kwh),
        },
      };
    }

    const physical = buildView(false);
    const eligible = buildView(true);

    return {
      summary: {
        physical: physical.summary,
        eligible: eligible.summary,
      },
      explainers: {
        matched_unmatched:
          "Hourly matched energy is the per-interval minimum of load and eligible deliverable renewable generation. Unmatched energy is load not covered in that same interval.",
        hourly_vs_legacy:
          "Legacy annual matching nets volumes across the year. Hourly matching evaluates each interval first, then aggregates.",
        deliverability_scope:
          "Deliverability is enforced via site-to-resource distance. Out-of-bound resources are excluded from eligible view claims.",
        interval_emissions:
          "Order: SSS allocation, then voluntary matching, then residual mix EF on remaining unmatched load.",
      },
      logs,
      views: {
        physical,
        eligible,
      },
      report_html: "<html><body><h1>24-7 Carbon Summary</h1><p>Report export from client-side simulator.</p></body></html>",
    };
  }

  window.LocalSim = {
    loadLocalDefaults,
    simulate,
  };
})();
