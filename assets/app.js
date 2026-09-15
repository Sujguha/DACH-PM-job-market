const DATA_FILES = ["summary", "by_role", "by_city", "city_role", "by_company"];

const COLORS = {
  live: "#3FB950",
  stale: "#D29922",
  signal: "#58A6FF",
  grid: "#232B33",
  text: "#8B98A5",
};

let DATA = {};

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
  new Chart(ctx, {
    type: "bar",
    data: {
      labels: byRole.map((r) => r.role),
      datasets: [
        {
          label: "Live postings",
          data: byRole.map((r) => r.count),
          backgroundColor: COLORS.live,
          borderRadius: 3,
        },
      ],
    },
    options: {
      indexAxis: "y",
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterLabel: (item) => {
              const r = byRole[item.dataIndex];
              return r.avg_days_open != null ? `avg ${r.avg_days_open}d open` : "";
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
          backgroundColor: COLORS.signal,
          borderRadius: 3,
        },
      ],
    },
    options: {
      indexAxis: "y",
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

let map, markerLayer;

function initMap(byCity) {
  map = L.map("map", { scrollWheelZoom: false }).setView([48.5, 10.5], 5);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 12,
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

function setupNav() {
  const items = document.querySelectorAll(".rail-item");
  items.forEach((item) => {
    item.addEventListener("click", () => {
      items.forEach((i) => i.classList.remove("active"));
      item.classList.add("active");
      document.querySelectorAll(".stage").forEach((s) => s.classList.remove("active"));
      document.getElementById(`stage-${item.dataset.stage}`).classList.add("active");
      if (item.dataset.stage === "map" && map) {
        setTimeout(() => map.invalidateSize(), 50);
      }
    });
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
    setupCompareStage(data);
  } catch (err) {
    document.querySelector(".topbar-status .log").textContent = `// data feed error: ${err.message}`;
    console.error(err);
  }
}

init();
