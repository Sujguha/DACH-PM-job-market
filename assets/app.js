const DATA_FILES = ["summary", "by_role", "by_city", "city_role", "by_company", "postings"];
const OPTIONAL_DATA_FILES = ["history", "sync_status"];

// Fixed per-role colors so they stay consistent across the role chart,
// the postings table dots, and re-renders as the data changes day to day.
const ROLE_COLORS = {
  "Program Manager": "#4E79A7",
  "Release Manager": "#F28E2B",
  "PMO": "#E15759",
  "Project Manager": "#76B7B2",
  "Delivery Manager": "#59A14F",
  "Change Manager": "#EDC948",
  "Agile Coach": "#B07AA1",
  "Scrum Master": "#FF9DA7",
  "Release Train Engineer": "#9C755F",
  "Portfolio Manager": "#BAB0AC",
  "Transformation Manager": "#86BCB6",
  "Product Owner": "#499894",
  "Product Manager": "#D37295",
  "Quality Manager": "#A0CBE8",
  "Quality Engineer": "#FFBE7D",
};
const FALLBACK_PALETTE = ["#4E79A7","#F28E2B","#E15759","#76B7B2","#59A14F","#EDC948","#B07AA1","#FF9DA7","#9C755F","#BAB0AC","#86BCB6","#499894","#D37295","#A0CBE8","#FFBE7D"];

function colorForRole(role) {
  return ROLE_COLORS[role] || "#0969DA";
}

function colorForIndex(i) {
  return FALLBACK_PALETTE[i % FALLBACK_PALETTE.length];
}

// ---------- Theme ----------

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") || "light";
}

function themeColors() {
  const dark = currentTheme() === "dark";
  return {
    live: dark ? "#3FB950" : "#1A7F37",
    stale: dark ? "#D29922" : "#9A6700",
    signal: dark ? "#58A6FF" : "#0969DA",
    grid: dark ? "#232B33" : "#D7DEE3",
    text: dark ? "#8B98A5" : "#57606A",
  };
}

function initTheme() {
  const saved = localStorage.getItem("theme");
  const theme = saved || "light";
  document.documentElement.setAttribute("data-theme", theme);
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.textContent = theme === "dark" ? "☀️" : "🌙";
}

function setupThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    localStorage.setItem("theme", next);
    // Reload so Chart.js/map colors that are baked in at creation time
    // (grid lines, axis text) pick up the new theme cleanly.
    location.reload();
  });
}

let DATA = {};
let map, markerLayer;
let postingsPage = 1;
const POSTINGS_PAGE_SIZE = 10;

async function loadData() {
  const required = await Promise.all(
    DATA_FILES.map(async (name) => {
      const res = await fetch(`data/${name}.json?_=${Date.now()}`);
      if (!res.ok) throw new Error(`Failed to load ${name}.json`);
      return [name, await res.json()];
    })
  );
  const optional = await Promise.all(
    OPTIONAL_DATA_FILES.map(async (name) => {
      try {
        const res = await fetch(`data/${name}.json?_=${Date.now()}`);
        if (!res.ok) return [name, null];
        return [name, await res.json()];
      } catch {
        return [name, null];
      }
    })
  );
  return Object.fromEntries([...required, ...optional]);
}

function setBuildStatus(summary, syncStatus) {
  const dot = document.getElementById("build-dot");
  const log = document.querySelector(".topbar-status .log");
  const sample = summary.is_sample_data ? " (sample data — first live sync pending)" : "";
  let text = `// last sync ${summary.last_updated} · ${summary.total_postings} postings tracked${sample}`;

  if (summary.failed_queries) {
    text += ` · ⚠ ${summary.failed_queries}/${summary.total_queries} queries failed`;
  }
  if (syncStatus && syncStatus.last_attempt_status === "failed") {
    text += ` · ⚠ most recent sync attempt (${syncStatus.last_attempt}) failed, showing last successful data`;
  }

  log.textContent = text;
  dot.style.background = syncStatus && syncStatus.last_attempt_status === "failed"
    ? themeColors().stale
    : themeColors().live;
}

function removeSkeleton(el) {
  el.classList.remove("skeleton");
}

function renderCards(summary) {
  const map = {
    "stat-total": summary.total_postings ?? "—",
    "stat-de": summary.by_country?.Germany ?? 0,
    "stat-at": summary.by_country?.Austria ?? 0,
    "stat-ch": summary.by_country?.Switzerland ?? 0,
    "stat-nl": summary.by_country?.Netherlands ?? 0,
  };
  Object.entries(map).forEach(([id, val]) => {
    const el = document.getElementById(id);
    el.textContent = val;
    removeSkeleton(el);
  });
}

function renderRoleChart(byRole) {
  const colors = themeColors();
  const ctx = document.getElementById("chart-roles");
  const chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: byRole.map((r) => r.role),
      datasets: [
        {
          label: "Live postings",
          data: byRole.map((r) => r.count),
          backgroundColor: byRole.map((r) => colorForRole(r.role)),
          borderRadius: 3,
        },
      ],
    },
    options: {
      indexAxis: "y",
      maintainAspectRatio: false,
      onClick: (evt) => {
        const points = chart.getElementsAtEventForMode(evt, "nearest", { intersect: true }, true);
        if (points.length) {
          const role = byRole[points[0].index].role;
          goToPostings({ role });
        }
      },
      onHover: (evt, elements) => {
        evt.native.target.style.cursor = elements.length ? "pointer" : "default";
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterLabel: (item) => {
              const r = byRole[item.dataIndex];
              const extra = r.avg_days_open != null ? `avg ${r.avg_days_open}d open` : "";
              return [extra, "Click to see postings"].filter(Boolean);
            },
          },
        },
      },
      scales: {
        x: { grid: { color: colors.grid }, ticks: { color: colors.text } },
        y: { grid: { display: false }, ticks: { color: colors.text } },
      },
    },
  });
}

function renderCompanyChart(byCompany) {
  const colors = themeColors();
  const top = byCompany.slice(0, 15);
  const ctx = document.getElementById("chart-companies");
  new Chart(ctx, {
    type: "bar",
    data: {
      labels: top.map((c) => c.company),
      datasets: [
        {
          label: "Live postings",
          data: top.map((c) => c.count),
          backgroundColor: top.map((_, i) => colorForIndex(i)),
          borderRadius: 3,
        },
      ],
    },
    options: {
      indexAxis: "y",
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: colors.grid }, ticks: { color: colors.text } },
        y: { grid: { display: false }, ticks: { color: colors.text } },
      },
    },
  });
}

function renderTrendChart(history) {
  const panel = document.getElementById("trend-panel");
  const hint = document.getElementById("trend-hint");
  if (!history || history.length < 2) {
    panel.innerHTML = `<p class="hint" style="margin:0;">Not enough history yet — check back after a few daily syncs to see a trend line here.</p>`;
    if (hint) hint.textContent = "Total tracked postings at each daily sync. Needs a few days of history to become meaningful.";
    return;
  }
  const colors = themeColors();
  const ctx = document.getElementById("chart-trend");
  new Chart(ctx, {
    type: "line",
    data: {
      labels: history.map((h) => h.date),
      datasets: [
        {
          label: "Total postings",
          data: history.map((h) => h.total_postings),
          borderColor: colors.signal,
          backgroundColor: colors.signal + "22",
          fill: true,
          tension: 0.25,
          pointRadius: 3,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: colors.grid }, ticks: { color: colors.text, maxTicksLimit: 8 } },
        y: { grid: { color: colors.grid }, ticks: { color: colors.text }, beginAtZero: false },
      },
    },
  });
}

function daysColor(days) {
  const colors = themeColors();
  if (days == null) return colors.text;
  if (days > 30) return colors.stale;
  return colors.live;
}

function renderCityTable(byCity) {
  const tbody = document.querySelector("#city-table tbody");
  tbody.innerHTML = byCity
    .map(
      (c) => `<tr>
        <td>${c.city}</td>
        <td>${c.country}</td>
        <td class="num">${c.count}</td>
        <td class="num" style="color:${daysColor(c.avg_days_open)}">${c.avg_days_open ?? "—"}</td>
      </tr>`
    )
    .join("");
}

function populateRoleFilter(select, byRole, includeAllLabel) {
  select.innerHTML = `<option value="__all__">${includeAllLabel}</option>` +
    byRole.map((r) => `<option value="${r.role}">${r.role}</option>`).join("");
}

function initMap(byCity) {
  map = L.map("map", { scrollWheelZoom: false }).setView([49.5, 9.0], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
    subdomains: "abc",
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  drawMarkers(byCity);
}

function drawMarkers(byCity) {
  const colors = themeColors();
  markerLayer.clearLayers();
  const maxCount = Math.max(...byCity.map((c) => c.count), 1);
  byCity.forEach((c) => {
    if (c.lat == null || c.lon == null) return;
    const radius = 5 + (c.count / maxCount) * 25;
    L.circleMarker([c.lat, c.lon], {
      radius,
      color: colors.live,
      fillColor: colors.live,
      fillOpacity: 0.35,
      weight: 1,
    })
      .bindTooltip(`<b>${c.city}, ${c.country}</b><br>${c.count} postings · avg ${c.avg_days_open ?? "—"}d open`)
      .addTo(markerLayer);
  });
}

function filterCityRoleByRole(cityRole, byCity, role) {
  if (role === "__all__") return byCity;
  const filtered = cityRole.filter((cr) => cr.role === role);
  return filtered.map((cr) => {
    const base = byCity.find((c) => c.city === cr.city && c.country === cr.country) || {};
    return { ...base, count: cr.count, avg_days_open: cr.avg_days_open };
  });
}

function setupMapStage(data) {
  const roleFilter = document.getElementById("map-role-filter");
  populateRoleFilter(roleFilter, data.by_role, "All roles");
  initMap(data.by_city);
  renderCityTable(data.by_city);

  roleFilter.addEventListener("change", () => {
    const filtered = filterCityRoleByRole(data.city_role, data.by_city, roleFilter.value);
    const sorted = filtered.slice().sort((a, b) => b.count - a.count);
    drawMarkers(sorted);
    renderCityTable(sorted);
  });
}

function setupCompareStage(data) {
  const citySelectA = document.getElementById("city-a");
  const citySelectB = document.getElementById("city-b");
  const roleSelect = document.getElementById("compare-role");

  const eligibleCities = data.by_city.filter((c) => c.count >= 3);
  const cityOptions = eligibleCities
    .map((c) => `<option value="${c.city}|${c.country}">${c.city}, ${c.country}</option>`)
    .join("");
  citySelectA.innerHTML = cityOptions;
  citySelectB.innerHTML = cityOptions;
  if (eligibleCities.length > 1) citySelectB.selectedIndex = 1;

  populateRoleFilter(roleSelect, data.by_role, "All roles");

  function statsFor(cityKey, role) {
    const [city, country] = cityKey.split("|");
    if (role === "__all__") {
      return data.by_city.find((c) => c.city === city && c.country === country);
    }
    return data.city_role.find((cr) => cr.city === city && cr.country === country && cr.role === role);
  }

  function render() {
    const role = roleSelect.value;
    const a = statsFor(citySelectA.value, role);
    const b = statsFor(citySelectB.value, role);
    const grid = document.getElementById("compare-grid");
    const col = (label, stats) => `
      <div class="compare-col">
        <h3>${label}</h3>
        <div class="metric"><span>Live postings</span><span class="v">${stats?.count ?? 0}</span></div>
        <div class="metric"><span>Avg. days open</span><span class="v">${stats?.avg_days_open ?? "—"}</span></div>
      </div>`;
    grid.innerHTML =
      col(citySelectA.value.split("|").join(", "), a) + col(citySelectB.value.split("|").join(", "), b);
  }

  [citySelectA, citySelectB, roleSelect].forEach((el) => el.addEventListener("change", render));
  render();
}

// ---------- URL filter sync ----------

function readFiltersFromURL() {
  const params = new URLSearchParams(location.search);
  const out = {};
  ["role", "country", "city", "level", "jobtype", "sort", "q", "new"].forEach((key) => {
    if (params.has(key)) out[key] = params.get(key);
  });
  return out;
}

function writeFiltersToURL(filters) {
  const params = new URLSearchParams();
  if (filters.role && filters.role !== "__all__") params.set("role", filters.role);
  if (filters.country && filters.country !== "__all__") params.set("country", filters.country);
  if (filters.city && filters.city !== "__all__") params.set("city", filters.city);
  if (filters.level && filters.level !== "__all__") params.set("level", filters.level);
  if (filters.jobType && filters.jobType !== "__all__") params.set("jobtype", filters.jobType);
  if (filters.sort && filters.sort !== "newest") params.set("sort", filters.sort);
  if (filters.search) params.set("q", filters.search);
  if (filters.newToday) params.set("new", "1");
  const qs = params.toString();
  const newUrl = qs ? `${location.pathname}?${qs}` : location.pathname;
  history.replaceState(null, "", newUrl);
}

// ---------- Postings browser ----------

function setupPostingsStage(data) {
  const searchInput = document.getElementById("post-search");
  const roleSelect = document.getElementById("post-role");
  const countrySelect = document.getElementById("post-country");
  const citySelect = document.getElementById("post-city");
  const levelSelect = document.getElementById("post-level");
  const jobTypeSelect = document.getElementById("post-jobtype");
  const sortSelect = document.getElementById("post-sort");
  const newTodayCheckbox = document.getElementById("post-new-today");
  const clearBtn = document.getElementById("post-clear");

  populateRoleFilter(roleSelect, data.by_role, "All roles");

  const countries = [...new Set(data.postings.map((p) => p.country))].sort();
  countrySelect.innerHTML =
    `<option value="__all__">All countries</option>` +
    countries.map((c) => `<option value="${c}">${c}</option>`).join("");

  const cities = [...new Set(data.postings.map((p) => p.city))].sort();
  citySelect.innerHTML =
    `<option value="__all__">All cities</option>` +
    cities.map((c) => `<option value="${c}">${c}</option>`).join("");

  // Pre-fill from URL, if any (supports sharing a filtered link).
  const urlFilters = readFiltersFromURL();
  if (urlFilters.role) roleSelect.value = urlFilters.role;
  if (urlFilters.country) countrySelect.value = urlFilters.country;
  if (urlFilters.city) citySelect.value = urlFilters.city;
  if (urlFilters.level) levelSelect.value = urlFilters.level;
  if (urlFilters.jobtype) jobTypeSelect.value = urlFilters.jobtype;
  if (urlFilters.sort) sortSelect.value = urlFilters.sort;
  if (urlFilters.q) searchInput.value = urlFilters.q;
  if (urlFilters.new === "1") newTodayCheckbox.checked = true;

  function currentFilters() {
    return {
      search: searchInput.value.trim().toLowerCase(),
      role: roleSelect.value,
      country: countrySelect.value,
      city: citySelect.value,
      level: levelSelect.value,
      jobType: jobTypeSelect.value,
      sort: sortSelect.value,
      newToday: newTodayCheckbox.checked,
    };
  }

  function isNewToday(p) {
    return p.days_open != null && p.days_open < 1;
  }

  function filteredPostings() {
    const f = currentFilters();
    let list = data.postings.filter((p) => {
      if (f.role !== "__all__" && p.role !== f.role) return false;
      if (f.country !== "__all__" && p.country !== f.country) return false;
      if (f.city !== "__all__" && p.city !== f.city) return false;
      if (f.level !== "__all__" && p.level !== f.level) return false;
      if (f.jobType !== "__all__" && p.job_type !== f.jobType) return false;
      if (f.newToday && !isNewToday(p)) return false;
      if (f.search) {
        const haystack = `${p.title} ${p.company}`.toLowerCase();
        if (!haystack.includes(f.search)) return false;
      }
      return true;
    });
    if (f.sort === "newest") list = list.slice().sort((a, b) => (b.created || "").localeCompare(a.created || ""));
    else if (f.sort === "oldest") list = list.slice().sort((a, b) => (a.created || "").localeCompare(b.created || ""));
    else if (f.sort === "days_desc") list = list.slice().sort((a, b) => (b.days_open ?? 0) - (a.days_open ?? 0));
    return list;
  }

  function renderPage() {
    const list = filteredPostings();
    const totalPages = Math.max(1, Math.ceil(list.length / POSTINGS_PAGE_SIZE));
    postingsPage = Math.min(Math.max(1, postingsPage), totalPages);

    const start = (postingsPage - 1) * POSTINGS_PAGE_SIZE;
    const pageItems = list.slice(start, start + POSTINGS_PAGE_SIZE);

    document.getElementById("post-count").textContent = list.length
      ? `Showing ${start + 1}-${Math.min(start + POSTINGS_PAGE_SIZE, list.length)} of ${list.length} postings · page ${postingsPage} of ${totalPages}`
      : "No postings match these filters.";

    const tbody = document.querySelector("#postings-table tbody");
    tbody.innerHTML = pageItems
      .map((p) => `<tr>
        <td><a href="${p.url || "#"}" target="_blank" rel="noopener">${p.title}</a>${isNewToday(p) ? '<span class="badge-new">NEW</span>' : ""}</td>
        <td>${p.company}</td>
        <td>${p.city}, ${p.country_code?.toUpperCase() || ""}</td>
        <td class="role-cell"><span class="role-dot" style="background:${colorForRole(p.role)}"></span>${p.role}</td>
        <td>${p.level || "—"}</td>
        <td>${p.job_type || "—"}</td>
        <td class="num" style="color:${daysColor(p.days_open)}">${p.days_open ?? "—"}</td>
      </tr>`)
      .join("");

    renderPagination(totalPages);
    writeFiltersToURL(currentFilters());
  }

  function renderPagination(totalPages) {
    const el = document.getElementById("postings-pagination");
    const btn = (label, page, opts = {}) =>
      `<button ${opts.disabled ? "disabled" : ""} ${opts.current ? 'class="current"' : ""} data-page="${page}">${label}</button>`;

    let html = btn("‹ Prev", postingsPage - 1, { disabled: postingsPage <= 1 });
    html += `<span class="page-info">Page ${postingsPage} of ${totalPages}</span>`;
    html += btn("Next ›", postingsPage + 1, { disabled: postingsPage >= totalPages });
    el.innerHTML = html;

    el.querySelectorAll("button:not(:disabled)").forEach((b) => {
      b.addEventListener("click", () => {
        postingsPage = parseInt(b.dataset.page, 10);
        renderPage();
      });
    });
  }

  let searchDebounce;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      postingsPage = 1;
      renderPage();
    }, 200);
  });

  [roleSelect, countrySelect, citySelect, levelSelect, jobTypeSelect, sortSelect, newTodayCheckbox].forEach((el) =>
    el.addEventListener("change", () => {
      postingsPage = 1;
      renderPage();
    })
  );

  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    roleSelect.value = "__all__";
    countrySelect.value = "__all__";
    citySelect.value = "__all__";
    levelSelect.value = "__all__";
    jobTypeSelect.value = "__all__";
    sortSelect.value = "newest";
    newTodayCheckbox.checked = false;
    postingsPage = 1;
    renderPage();
  });

  // Exposed so the Overview role chart can jump here with a role pre-selected.
  window.__setPostingsFilter = (filters) => {
    if (filters.role) roleSelect.value = filters.role;
    postingsPage = 1;
    renderPage();
  };

  renderPage();
}

function goToPostings(filters) {
  activateStage("postings");
  if (window.__setPostingsFilter) window.__setPostingsFilter(filters);
}

// ---------- Navigation ----------

function activateStage(stageName) {
  document.querySelectorAll(".rail-item").forEach((i) => i.classList.remove("active"));
  const item = document.querySelector(`.rail-item[data-stage="${stageName}"]`);
  if (item) item.classList.add("active");
  document.querySelectorAll(".stage").forEach((s) => s.classList.remove("active"));
  const stage = document.getElementById(`stage-${stageName}`);
  if (stage) stage.classList.add("active");
  if (stageName === "map" && map) {
    setTimeout(() => map.invalidateSize(), 50);
  }
}

function setupNav() {
  document.querySelectorAll(".rail-item").forEach((item) => {
    item.addEventListener("click", () => activateStage(item.dataset.stage));
  });
}

async function init() {
  initTheme();
  setupThemeToggle();
  setupNav();
  try {
    const data = await loadData();
    DATA = data;
    setBuildStatus(data.summary, data.sync_status);
    renderCards(data.summary);
    renderRoleChart(data.by_role);
    renderTrendChart(data.history);
    renderCompanyChart(data.by_company);
    setupMapStage(data);
    setupPostingsStage(data);
    setupCompareStage(data);
  } catch (err) {
    document.querySelector(".topbar-status .log").textContent = `// data feed error: ${err.message}`;
    console.error(err);
  }
}

init();
