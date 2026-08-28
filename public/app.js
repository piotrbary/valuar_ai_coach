const statusEl = document.getElementById("status");
const connectEl = document.getElementById("connect");
const summaryEl = document.getElementById("summary");
const activitiesEl = document.getElementById("activities");

function statCard(value, label) {
  const div = document.createElement("div");
  div.className = "stat";
  div.innerHTML = `<div class="value">${value}</div><div class="label">${label}</div>`;
  return div;
}

function renderSummary(rows) {
  const totalDistance = rows.reduce((sum, row) => sum + Number(row["Distance (km)"]), 0);
  const totalElevation = rows.reduce((sum, row) => sum + Number(row["Elev Gain (m)"]), 0);

  summaryEl.innerHTML = "";
  summaryEl.appendChild(statCard(rows.length, "Activities"));
  summaryEl.appendChild(statCard(`${totalDistance.toFixed(1)} km`, "Distance"));
  summaryEl.appendChild(statCard(`${Math.round(totalElevation)} m`, "Elevation"));
  summaryEl.classList.remove("hidden");
}

function metric(value, label) {
  const div = document.createElement("div");
  div.className = "metric";
  div.innerHTML = `<span class="value">${value}</span><span class="label">${label}</span>`;
  return div;
}

function renderActivities(rows) {
  activitiesEl.innerHTML = "";

  for (const row of rows) {
    const li = document.createElement("li");
    li.className = "activity-card";

    const top = document.createElement("div");
    top.className = "row-top";
    top.innerHTML = `<span class="name">${row.Name}</span><span class="date">${row.Date}</span>`;

    const typeBadge = document.createElement("span");
    typeBadge.className = "type-badge";
    typeBadge.textContent = row.Type;

    const stats = document.createElement("div");
    stats.className = "stats";
    stats.appendChild(metric(`${row["Distance (km)"]} km`, "Distance"));
    stats.appendChild(metric(row.Time, "Time"));
    stats.appendChild(metric(row.Pace, "Pace"));
    stats.appendChild(metric(row["Avg HR"], "Avg HR"));
    stats.appendChild(metric(`${row["Elev Gain (m)"]} m`, "Elevation"));

    li.appendChild(top);
    li.appendChild(typeBadge);
    li.appendChild(stats);
    activitiesEl.appendChild(li);
  }
}

async function loadActivities() {
  try {
    const response = await fetch("/api/activities?perPage=30");
    const data = await response.json();

    if (!data.authenticated) {
      statusEl.classList.add("hidden");
      connectEl.classList.remove("hidden");
      return;
    }

    if (data.error) {
      statusEl.textContent = `Couldn't load activities: ${data.error}`;
      return;
    }

    statusEl.classList.add("hidden");

    if (data.activities.length === 0) {
      statusEl.textContent = "No activities found yet.";
      statusEl.classList.remove("hidden");
      return;
    }

    renderSummary(data.activities);
    renderActivities(data.activities);
  } catch (err) {
    statusEl.textContent = "Couldn't reach the server. Check your connection and try again.";
  }
}

loadActivities();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Non-fatal: the app still works without offline support.
    });
  });
}
