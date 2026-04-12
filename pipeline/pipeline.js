const STAGE_LABELS = {
  discovery_complete: { label: "DISCOVERY", cssClass: "stage-discovery" },
  solution_complete: { label: "SOLUTION", cssClass: "stage-solution" },
  bom_complete: { label: "BOM", cssClass: "stage-bom" },
  proposal_complete: { label: "COMPLETE", cssClass: "stage-complete" }
};

const TAB_ORDER = ["ALL", "DISCOVERY", "SOLUTION", "BOM", "COMPLETE"];

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

function stageBadge(status) {
  const s = STAGE_LABELS[status] ?? { label: status ?? "—", cssClass: "stage-discovery" };
  return `<span class="stage-badge ${s.cssClass}">${s.label}</span>`;
}

function exportBtn(label, action, projectId) {
  return `<button class="btn" data-export="${action}" data-pid="${encodeURIComponent(projectId)}">${label}</button>`;
}

function dealCard(project) {
  const pid = project.id;
  const status = project.status ?? "";
  const category = project.requirements_json?.category ?? project.intake_json?.primary_use_case ?? "—";
  const date = formatDate(project.updated_at ?? project.created_at);

  const exports = [];
  if (["bom_complete", "proposal_complete"].includes(status)) {
    exports.push(exportBtn("Export BOM (.xlsx)", "bom", pid));
    exports.push(exportBtn("Export Spec Sheet (.docx)", "spec", pid));
  }
  if (["solution_complete", "bom_complete", "proposal_complete"].includes(status)) {
    exports.push(exportBtn("Export Solution (.docx)", "solution", pid));
  }
  if (status === "proposal_complete") {
    exports.push(exportBtn("Download Proposal (.docx)", "proposal", pid));
  }

  return `
    <div class="deal-card" data-stage="${STAGE_LABELS[status]?.label ?? "OTHER"}">
      <div class="deal-top">
        <div>
          <div class="deal-name">${project.customer_name ?? "ไม่ระบุชื่อลูกค้า"}</div>
          <div class="deal-meta">${category} · อัปเดต ${date}</div>
        </div>
        ${stageBadge(status)}
      </div>
      <div class="deal-actions">
        <button class="btn btn-primary" data-resume="${encodeURIComponent(pid)}">Resume</button>
        ${exports.join("")}
      </div>
    </div>
  `;
}

function renderTabs(projects, activeTab) {
  const counts = { ALL: projects.length, DISCOVERY: 0, SOLUTION: 0, BOM: 0, COMPLETE: 0 };
  projects.forEach(p => {
    const label = STAGE_LABELS[p.status]?.label;
    if (label && counts[label] !== undefined) counts[label]++;
  });

  return TAB_ORDER.map(tab => `
    <div class="tab ${tab === activeTab ? "active" : ""}" data-tab="${tab}">
      ${tab} <span class="count">${counts[tab]}</span>
    </div>
  `).join("");
}

let allProjects = [];
let activeTab = "ALL";

function filtered() {
  if (activeTab === "ALL") return allProjects;
  return allProjects.filter(p => (STAGE_LABELS[p.status]?.label ?? "OTHER") === activeTab);
}

function render() {
  document.getElementById("tabs").innerHTML = renderTabs(allProjects, activeTab);
  const list = document.getElementById("deal-list");
  const deals = filtered();
  list.innerHTML = deals.length === 0
    ? `<div class="empty">ไม่มี deal ใน ${activeTab}</div>`
    : deals.map(dealCard).join("");

  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => { activeTab = tab.dataset.tab; render(); });
  });

  document.querySelectorAll("[data-resume]").forEach(btn => {
    btn.addEventListener("click", () => {
      window.location.href = `/chat?project_id=${btn.dataset.resume}`;
    });
  });

  document.querySelectorAll("[data-export]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const pid = decodeURIComponent(btn.dataset.pid);
      const action = btn.dataset.export;
      const urlMap = {
        bom: `/api/projects/${pid}/export/bom`,
        spec: `/api/projects/${pid}/export/spec`,
        solution: `/api/projects/${pid}/export/solution`,
        proposal: `/api/projects/${pid}/export/proposal`
      };
      const url = urlMap[action];
      if (!url) return;
      const originalText = btn.textContent;
      btn.textContent = "กำลังโหลด...";
      btn.disabled = true;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(await res.text());
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${action}_${pid}.${action === "bom" ? "xlsx" : "docx"}`;
        a.click();
      } catch (e) {
        alert(`Export failed: ${e.message}`);
      } finally {
        btn.textContent = originalText;
        btn.disabled = false;
      }
    });
  });
}

async function load() {
  try {
    const res = await fetch("/api/projects");
    if (res.status === 401) { window.location.replace("/login"); return; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    allProjects = Array.isArray(data) ? data : (data.projects ?? []);
    allProjects.sort((a, b) => new Date(b.updated_at ?? b.created_at) - new Date(a.updated_at ?? a.created_at));
    render();
  } catch (e) {
    document.getElementById("error-msg").style.display = "block";
    document.getElementById("error-msg").textContent = `ไม่สามารถโหลด projects: ${e.message}`;
  }
}

load();
