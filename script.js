// Application State
let participants = []; // { id, name, department }
let assignments = new Map(); // Map<giverId, receiverObject>
let sentIds = new Set();

// Views
const organizerView = document.getElementById("organizer-view");
const employeeView = document.getElementById("employee-view");

// Organizer DOM
const setupSection = document.getElementById("setup-section");
const resultsSection = document.getElementById("results-section");
const eventTitleInput = document.getElementById("event-title-input");
const eventBudgetInput = document.getElementById("event-budget-input");
const eventDateInput = document.getElementById("event-date-input");
const form = document.getElementById("participant-form");
const nameInput = document.getElementById("name-input");
const deptInput = document.getElementById("dept-input");
const deptSuggestions = document.getElementById("department-suggestions");
const statusMessage = document.getElementById("status-message");
const participantCount = document.getElementById("participant-count");
const deptSummary = document.getElementById("dept-summary");
const participantList = document.getElementById("participant-list");
const drawBtn = document.getElementById("draw-btn");
const sampleBtn = document.getElementById("sample-btn");
const clearBtn = document.getElementById("clear-btn");
const redrawBtn = document.getElementById("redraw-btn");
const editBtn = document.getElementById("edit-btn");
const linksList = document.getElementById("links-list");
const toggleMasterBtn = document.getElementById("toggle-master-btn");
const exportCsvBtn = document.getElementById("export-csv-btn");
const sentCounter = document.getElementById("sent-counter");
const masterResults = document.getElementById("master-results");
const masterTableBody = document.getElementById("master-table-body");

// Employee Reveal DOM
const empEventBadge = document.getElementById("emp-event-badge");
const empGiverName = document.getElementById("emp-giver-name");
const empLockedBox = document.getElementById("emp-locked-box");
const unwrapBtn = document.getElementById("unwrap-btn");
const empRevealedBox = document.getElementById("emp-revealed-box");
const empReceiverName = document.getElementById("emp-receiver-name");
const empReceiverDept = document.getElementById("emp-receiver-dept");
const empMetaPills = document.getElementById("emp-meta-pills");
const empErrorBox = document.getElementById("emp-error-box");

/* =========================================================
   Link Encoding / Decoding (URL-Safe Obfuscation)
   ========================================================= */

const XOR_KEY = 42;

function encodeMatchPayload(payload) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  const scrambled = bytes.map((b, i) => b ^ ((XOR_KEY + i * 7) & 0xff));
  let binary = "";
  scrambled.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeMatchPayload(token) {
  const padded = token.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (token.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i) ^ ((XOR_KEY + i * 7) & 0xff);
  }
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json);
}

function buildRevealLink(giver, receiver) {
  const payload = {
    g: giver.name,
    r: receiver.name,
    d: receiver.department,
    t: eventTitleInput.value.trim(),
    b: eventBudgetInput.value.trim(),
    dt: eventDateInput.value.trim()
  };
  const token = encodeMatchPayload(payload);
  const baseUrl = window.location.href.split("#")[0].split("?")[0];
  return `${baseUrl}#m=${token}`;
}

/* =========================================================
   Utility & Pairing Algorithm
   ========================================================= */

function normalize(str) {
  return str.trim().toLowerCase();
}

function setStatus(text = "", type = "") {
  statusMessage.textContent = text;
  statusMessage.className = type ? `status-message ${type}` : "status-message";
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function checkFeasibility(list) {
  if (list.length < 2) {
    return { valid: false, reason: "Add at least 2 participants from different departments." };
  }

  const counts = new Map();
  for (const person of list) {
    const key = normalize(person.department);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  if (counts.size < 2) {
    return { valid: false, reason: "Participants must belong to at least 2 different departments." };
  }

  const maxAllowed = Math.floor(list.length / 2);
  for (const person of list) {
    const count = counts.get(normalize(person.department));
    if (count > maxAllowed) {
      return {
        valid: false,
        reason: `"${person.department}" has ${count} of ${list.length} people. No single department can exceed half the group (${maxAllowed}).`
      };
    }
  }

  return { valid: true, reason: "" };
}

function generateSecretSantaMatches(list) {
  const feasibility = checkFeasibility(list);
  if (!feasibility.valid) {
    throw new Error(feasibility.reason);
  }

  const n = list.length;

  // Attempt 1: Fast uniform random shuffles
  for (let attempt = 0; attempt < 500; attempt++) {
    const receivers = shuffleArray(list);
    let allValid = true;

    for (let i = 0; i < n; i++) {
      if (
        list[i].id === receivers[i].id ||
        normalize(list[i].department) === normalize(receivers[i].department)
      ) {
        allValid = false;
        break;
      }
    }

    if (allValid) {
      const result = new Map();
      list.forEach((giver, i) => result.set(giver.id, receivers[i]));
      return result;
    }
  }

  // Attempt 2: Guaranteed department-shifted base + valid random 2-swaps
  const deptGroups = new Map();
  for (const person of list) {
    const key = normalize(person.department);
    if (!deptGroups.has(key)) deptGroups.set(key, []);
    deptGroups.get(key).push(person);
  }

  const orderedGivers = [];
  for (const group of shuffleArray([...deptGroups.values()])) {
    orderedGivers.push(...shuffleArray(group));
  }

  const shift = Math.floor(n / 2);
  const receivers = orderedGivers.map((_, i) => orderedGivers[(i + shift) % n]);

  const swaps = n * 15;
  for (let s = 0; s < swaps; s++) {
    const i = Math.floor(Math.random() * n);
    const j = Math.floor(Math.random() * n);
    if (i === j) continue;

    const giverI = orderedGivers[i];
    const giverJ = orderedGivers[j];
    const recI = receivers[i];
    const recJ = receivers[j];

    const iCanTakeJ =
      giverI.id !== recJ.id && normalize(giverI.department) !== normalize(recJ.department);
    const jCanTakeI =
      giverJ.id !== recI.id && normalize(giverJ.department) !== normalize(recI.department);

    if (iCanTakeJ && jCanTakeI) {
      receivers[i] = recJ;
      receivers[j] = recI;
    }
  }

  const result = new Map();
  orderedGivers.forEach((giver, i) => result.set(giver.id, receivers[i]));
  return result;
}

/* =========================================================
   Organizer Rendering
   ========================================================= */

function renderParticipantList() {
  participantCount.textContent = participants.length;

  const deptCounts = new Map();
  for (const p of participants) {
    const key = normalize(p.department);
    if (!deptCounts.has(key)) deptCounts.set(key, p.department);
  }

  deptSuggestions.innerHTML = "";
  for (const label of deptCounts.values()) {
    const option = document.createElement("option");
    option.value = label;
    deptSuggestions.appendChild(option);
  }

  deptSummary.textContent =
    deptCounts.size > 0
      ? `${deptCounts.size} ${deptCounts.size === 1 ? "department" : "departments"}`
      : "";

  participantList.innerHTML = "";
  if (participants.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "No participants yet. Add at least 2 people from different departments.";
    participantList.appendChild(empty);
  } else {
    participants.forEach((person) => {
      const li = document.createElement("li");
      li.className = "participant-item";

      const info = document.createElement("div");
      info.className = "participant-info";

      const nameSpan = document.createElement("span");
      nameSpan.className = "participant-name";
      nameSpan.textContent = person.name;

      const deptSpan = document.createElement("span");
      deptSpan.className = "dept-pill";
      deptSpan.textContent = person.department;

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "remove-btn";
      removeBtn.setAttribute("aria-label", `Remove ${person.name}`);
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => {
        participants = participants.filter((p) => p.id !== person.id);
        setStatus();
        renderParticipantList();
      });

      info.append(nameSpan, deptSpan);
      li.append(info, removeBtn);
      participantList.appendChild(li);
    });
  }

  const feasibility = checkFeasibility(participants);
  drawBtn.disabled = !feasibility.valid;

  if (participants.length >= 2 && !feasibility.valid) {
    setStatus(feasibility.reason, "error");
  } else if (statusMessage.classList.contains("error") && feasibility.valid) {
    setStatus();
  }
}

function updateSentCounter() {
  sentCounter.textContent = `${sentIds.size} / ${participants.length} links shared`;
}

function renderLinksAndMasterTable() {
  linksList.innerHTML = "";
  masterTableBody.innerHTML = "";

  const eventLabel = eventTitleInput.value.trim() || "Secret Santa";

  participants.forEach((giver) => {
    const receiver = assignments.get(giver.id);
    const link = buildRevealLink(giver, receiver);
    const isSent = sentIds.has(giver.id);

    // 1. Shareable Link Row
    const row = document.createElement("div");
    row.className = `link-row${isSent ? " sent" : ""}`;

    const info = document.createElement("div");
    info.className = "participant-info";

    const nameEl = document.createElement("span");
    nameEl.className = "participant-name";
    nameEl.textContent = giver.name;

    const deptEl = document.createElement("span");
    deptEl.className = "dept-pill";
    deptEl.textContent = giver.department;

    info.append(nameEl, deptEl);

    const actions = document.createElement("div");
    actions.className = "link-actions";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = `btn btn-sm ${isSent ? "btn-copied" : "btn-secondary"}`;
    copyBtn.textContent = isSent ? "✓ Copied" : "📋 Copy Link";
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(link);
      } catch {
        window.prompt(`Copy private link for ${giver.name}:`, link);
      }
      sentIds.add(giver.id);
      renderLinksAndMasterTable();
    });

    const msgText = `Hi ${giver.name}! 🎁 Here is your private ${eventLabel} reveal link (don't share it!): ${link}`;

    const waBtn = document.createElement("a");
    waBtn.className = "btn btn-sm btn-whatsapp";
    waBtn.href = `https://wa.me/?text=${encodeURIComponent(msgText)}`;
    waBtn.target = "_blank";
    waBtn.rel = "noopener noreferrer";
    waBtn.textContent = "WhatsApp";
    waBtn.addEventListener("click", () => {
      sentIds.add(giver.id);
      renderLinksAndMasterTable();
    });

    const mailBtn = document.createElement("a");
    mailBtn.className = "btn btn-sm btn-ghost";
    mailBtn.href = `mailto:?subject=${encodeURIComponent(`Your ${eventLabel} Match 🎁`)}&body=${encodeURIComponent(msgText)}`;
    mailBtn.textContent = "Email";
    mailBtn.addEventListener("click", () => {
      sentIds.add(giver.id);
      renderLinksAndMasterTable();
    });

    actions.append(copyBtn, waBtn, mailBtn);
    row.append(info, actions);
    linksList.appendChild(row);

    // 2. Master Table Row
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(giver.name)}</strong></td>
      <td>${escapeHtml(giver.department)}</td>
      <td><strong>${escapeHtml(receiver.name)}</strong></td>
      <td>${escapeHtml(receiver.department)}</td>
    `;
    masterTableBody.appendChild(tr);
  });

  updateSentCounter();
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadCsv() {
  const headers = ["Giver", "Giver Department", "Gifts To", "Receiver Department", "Private Reveal Link"];
  const rows = participants.map((giver) => {
    const receiver = assignments.get(giver.id);
    const link = buildRevealLink(giver, receiver);
    return [giver.name, giver.department, receiver.name, receiver.department, link]
      .map((val) => `"${String(val).replace(/"/g, '""')}"`)
      .join(",");
  });

  const csvContent = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "secret-santa-matches.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/* =========================================================
   Employee Reveal View Logic
   ========================================================= */

function initEmployeeView(token) {
  organizerView.classList.add("hidden");
  employeeView.classList.remove("hidden");

  try {
    const data = decodeMatchPayload(token);
    if (!data || !data.g || !data.r) throw new Error("Invalid data");

    if (data.t) {
      empEventBadge.textContent = `🎁 ${data.t}`;
    }
    empGiverName.textContent = data.g;
    empReceiverName.textContent = data.r;
    empReceiverDept.textContent = data.d ? `${data.d} Department` : "";

    empMetaPills.innerHTML = "";
    if (data.b) {
      const pill = document.createElement("span");
      pill.className = "meta-pill";
      pill.textContent = `💰 Budget: ${data.b}`;
      empMetaPills.appendChild(pill);
    }
    if (data.dt) {
      const pill = document.createElement("span");
      pill.className = "meta-pill";
      pill.textContent = `📅 Date: ${data.dt}`;
      empMetaPills.appendChild(pill);
    }

    unwrapBtn.addEventListener("click", () => {
      empLockedBox.classList.add("hidden");
      empRevealedBox.classList.remove("hidden");
    });
  } catch {
    empLockedBox.classList.add("hidden");
    empErrorBox.classList.remove("hidden");
  }
}

/* =========================================================
   Event Listeners & Bootstrapping
   ========================================================= */

function runDraw() {
  try {
    assignments = generateSecretSantaMatches(participants);
    sentIds.clear();
    masterResults.classList.add("hidden");
    toggleMasterBtn.textContent = "👁️ Show Master Results";
    setupSection.classList.add("hidden");
    resultsSection.classList.remove("hidden");
    renderLinksAndMasterTable();
  } catch (err) {
    setStatus(err.message, "error");
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const trimmedName = nameInput.value.trim();
  const trimmedDept = deptInput.value.trim();

  if (!trimmedName || !trimmedDept) {
    setStatus("Please enter both a name and a department.", "error");
    return;
  }

  if (participants.some((p) => normalize(p.name) === normalize(trimmedName))) {
    setStatus(`"${trimmedName}" is already in the list. Use a unique name or initial.`, "error");
    return;
  }

  participants.push({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    name: trimmedName,
    department: trimmedDept
  });

  nameInput.value = "";
  deptInput.value = "";
  nameInput.focus();
  setStatus();
  renderParticipantList();
});

sampleBtn.addEventListener("click", () => {
  eventTitleInput.value = "Office Secret Santa 2026";
  eventBudgetInput.value = "100 AED";
  eventDateInput.value = "Dec 20";
  participants = [
    { id: "1", name: "Maya Lin", department: "Engineering" },
    { id: "2", name: "Liam Patel", department: "Engineering" },
    { id: "3", name: "Sofia Alvarez", department: "Design" },
    { id: "4", name: "Noah Brooks", department: "Design" },
    { id: "5", name: "Hannah Kim", department: "Marketing" },
    { id: "6", name: "Omar Hassan", department: "Operations" }
  ];
  setStatus("Sample team loaded. Click Draw Names to generate private links!", "info");
  renderParticipantList();
});

clearBtn.addEventListener("click", () => {
  participants = [];
  assignments.clear();
  sentIds.clear();
  setStatus();
  renderParticipantList();
});

drawBtn.addEventListener("click", runDraw);
redrawBtn.addEventListener("click", runDraw);

editBtn.addEventListener("click", () => {
  resultsSection.classList.add("hidden");
  setupSection.classList.remove("hidden");
  renderParticipantList();
});

toggleMasterBtn.addEventListener("click", () => {
  const isHidden = masterResults.classList.toggle("hidden");
  toggleMasterBtn.textContent = isHidden ? "👁️ Show Master Results" : "🙈 Hide Master Results";
});

exportCsvBtn.addEventListener("click", downloadCsv);

// Check URL on load: Employee Reveal Mode vs Organizer Mode
function checkRoute() {
  const hash = window.location.hash;
  if (hash && hash.startsWith("#m=")) {
    const token = hash.slice(3);
    initEmployeeView(token);
  } else {
    renderParticipantList();
  }
}

checkRoute();