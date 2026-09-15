const DATA_FILES = ["summary", "by_role", "by_city", "city_role", "by_company", "postings"];

const COLORS = {
  live: "#1A7F37",
  stale: "#9A6700",
  signal: "#0969DA",
  grid: "#D7DEE3",
  text: "#57606A",
};

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
  return ROLE_COLORS[role] || COLORS.signal;
}

function colorForIndex(i) {
  return FALLBACK_PALETTE[i % FALLBACK_PALETTE.length];
}

let DATA = {};
let map, markerLayer;
let postingsPage = 1;
const POSTINGS_PAGE_SIZE = 10;

async function loadData() {
  const entries = await Promise.all(
    DATA_FILES.map(async (name) => {
      const res = await fetch(`data/${name}.json?_=${Date.now()}`);
      if (!res.ok) throw new Error(`Failed to load ${name}.json`);
      return [name, await res.json()];
    })
  );
  return Object.fromEntries(entries);
}

function setBuildStatus(summary) {
  const dot = document.getElementById("build-dot");
  const log = document.querySelector(".topbar-status .log");
  const sample = summary.is_sample_data ? " (sample data — first live sync pending)" : "";
  log.textContent = `// last sync ${summary.last_updated} · ${summary.total_postings} postings tracked${sample}`;
  dot.style.background = COLORS.live;
}

function renderCards(summary) {
  document.getElementById("stat-total").textContent = summary.total_postings ?? "—";
  document.getElementById("stat-de").textContent = summary.by_country?.Germany ?? 0;
  document.getElementById("stat-at").textContent = summary.by_country?.Austria ?? 0;
  document.getElementById("stat-ch").textContent = summary.by_country?.Switzerland ?? 0;
}

function renderRoleChart(byRole) {
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
        x: { grid: { color: COLORS.grid }, ticks: { color: COLORS.text } },
        y: { grid: { display: false }, ticks: { color: COLORS.text } },
      },
    },
  });
}

function renderCompanyChart(byCompany) {
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
        x: { grid: { color: COLORS.grid }, ticks: { color: COLORS.text } },
        y: { grid: { display: false }, ticks: { color: COLORS.text } },
      },
    },
  });
}

function daysColor(days) {
  if (days == null) return COLORS.text;
  if (days > 30) return COLORS.stale;
  return COLORS.live;
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
  map = L.map("map", { scrollWheelZoom: false }).setView([48.5, 10.5], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
    subdomains: "abc",
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  drawMarkers(byCity);
}

function drawMarkers(byCity) {
  markerLayer.clearLayers();
  const maxCount = Math.max(...byCity.map((c) => c.count), 1);
  byCity.forEach((c) => {
    if (c.lat == null || c.lon == null) return;
    const radius = 5 + (c.count / maxCount) * 25;
    L.circleMarker([c.lat, c.lon], {
      radius,
      color: COLORS.live,
      fillColor: COLORS.live,
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

// ---------- Postings browser ----------

function setupPostingsStage(data) {
  const roleSelect = document.getElementById("post-role");
  const countrySelect = document.getElementById("post-country");
  const citySelect = document.getElementById("post-city");
  const levelSelect = document.getElementById("post-level");
  const jobTypeSelect = document.getElementById("post-jobtype");
  const sortSelect = document.getElementById("post-sort");
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

  function currentFilters() {
    return {
      role: roleSelect.value,
      country: countrySelect.value,
      city: citySelect.value,
      level: levelSelect.value,
      jobType: jobTypeSelect.value,
      sort: sortSelect.value,
    };
  }

  function filteredPostings() {
    const f = currentFilters();
    let list = data.postings.filter((p) => {
      if (f.role !== "__all__" && p.role !== f.role) return false;
      if (f.country !== "__all__" && p.country !== f.country) return false;
      if (f.city !== "__all__" && p.city !== f.city) return false;
      if (f.level !== "__all__" && p.level !== f.level) return false;
      if (f.jobType !== "__all__" && p.job_type !== f.jobType) return false;
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
        <td><a href="${p.url || "#"}" target="_blank" rel="noopener">${p.title}</a></td>
        <td>${p.company}</td>
        <td>${p.city}, ${p.country_code?.toUpperCase() || ""}</td>
        <td class="role-cell"><span class="role-dot" style="background:${colorForRole(p.role)}"></span>${p.role}</td>
        <td>${p.level || "—"}</td>
        <td>${p.job_type || "—"}</td>
        <td class="num" style="color:${daysColor(p.days_open)}">${p.days_open ?? "—"}</td>
      </tr>`)
      .join("");

    renderPagination(totalPages);
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

  [roleSelect, countrySelect, citySelect, levelSelect, jobTypeSelect, sortSelect].forEach((el) =>
    el.addEventListener("change", () => {
      postingsPage = 1;
      renderPage();
    })
  );

  clearBtn.addEventListener("click", () => {
    roleSelect.value = "__all__";
    countrySelect.value = "__all__";
    citySelect.value = "__all__";
    levelSelect.value = "__all__";
    jobTypeSelect.value = "__all__";
    sortSelect.value = "newest";
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
  setupNav();
  try {
    const data = await loadData();
    DATA = data;
    setBuildStatus(data.summary);
    renderCards(data.summary);
    renderRoleChart(data.by_role);
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
