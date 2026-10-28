(() => {
  const STATUSES = [
    { id: "todo", label: "To do", color: "#8a8a84" },
    { id: "progress", label: "In progress", color: "#3b82f6" },
    { id: "review", label: "Review", color: "#f59e0b" },
    { id: "done", label: "Done", color: "#2f9e63" },
  ];
  const COLORS = ["#f7c31b", "#3b82f6", "#2f9e63", "#e5484d", "#8b5cf6", "#ec4899"];
  const KEY = "tiger-pm-v1";

  const uid = () => Math.random().toString(36).slice(2, 10);
  const $ = (s) => document.querySelector(s);
  const esc = (s = "") => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = () => new Date().toISOString().slice(0, 10);

  function seed() {
    const p1 = uid(), p2 = uid(), p3 = uid();
    const d = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    return {
      projects: [
        { id: p1, name: "Fleet Operations", color: COLORS[0] },
        { id: p2, name: "Warehouse Rollout", color: COLORS[1] },
        { id: p3, name: "Customer Onboarding", color: COLORS[2] },
      ],
      tasks: [
        { id: uid(), projectId: p1, title: "Route optimisation for Q4", desc: "Review delivery routes and cut empty miles.", status: "progress", priority: "high", assignee: "Saurav", due: d(3) },
        { id: uid(), projectId: p1, title: "Driver schedule update", desc: "", status: "todo", priority: "medium", assignee: "Amit", due: d(7) },
        { id: uid(), projectId: p2, title: "Barcode scanner setup", desc: "Configure scanners at Dock 2.", status: "review", priority: "medium", assignee: "Priya", due: d(-1) },
        { id: uid(), projectId: p2, title: "Inventory audit", desc: "", status: "done", priority: "low", assignee: "Rahul", due: d(-4) },
        { id: uid(), projectId: p3, title: "Client portal walkthrough", desc: "Demo tracking portal to new accounts.", status: "todo", priority: "high", assignee: "Saurav", due: d(2) },
      ],
    };
  }

  let state;
  try { state = JSON.parse(localStorage.getItem(KEY)); } catch { state = null; }
  if (!state || !state.tasks) state = seed();
  const ui = { view: "dashboard", project: null, q: "", editing: null };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };

  const proj = (id) => state.projects.find((p) => p.id === id);
  const initials = (n) => (n || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const isOverdue = (t) => t.due && t.status !== "done" && t.due < today();
  const fmt = (d) => (d ? new Date(d + "T00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "No date");

  function visible() {
    const q = ui.q.toLowerCase();
    return state.tasks.filter((t) =>
      (!ui.project || t.projectId === ui.project) &&
      (!q || (t.title + " " + t.desc + " " + t.assignee).toLowerCase().includes(q)));
  }

  /* ---------- Rendering ---------- */
  function renderSidebar() {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === ui.view));
    $("#projectList").innerHTML =
      `<button class="proj ${!ui.project ? "active" : ""}" data-p=""><span class="dot" style="background:#1d1d1b"></span>All projects</button>` +
      state.projects.map((p) => {
        const n = state.tasks.filter((t) => t.projectId === p.id && t.status !== "done").length;
        return `<button class="proj ${ui.project === p.id ? "active" : ""}" data-p="${p.id}"><span class="dot" style="background:${p.color}"></span>${esc(p.name)}<span class="count">${n}</span></button>`;
      }).join("");
  }

  function taskCard(t) {
    const p = proj(t.projectId);
    return `<div class="card" draggable="true" data-id="${t.id}">
      <div class="title">${esc(t.title)}</div>
      ${t.desc ? `<div class="desc">${esc(t.desc)}</div>` : ""}
      <div class="meta-row">
        <span class="tag ${t.priority}">${t.priority}</span>
        <span class="${isOverdue(t) ? "overdue" : ""}">${fmt(t.due)}</span>
        ${p ? `<span class="dot" style="background:${p.color}" title="${esc(p.name)}"></span>` : ""}
        ${t.assignee ? `<span class="avatar" title="${esc(t.assignee)}">${initials(t.assignee)}</span>` : ""}
      </div></div>`;
  }

  function renderDashboard(tasks) {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "done").length;
    const active = tasks.filter((t) => t.status === "progress").length;
    const overdue = tasks.filter(isOverdue).length;
    const upcoming = tasks.filter((t) => t.status !== "done" && t.due).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 6);
    const pct = total ? Math.round((done / total) * 100) : 0;

    const progress = state.projects.filter((p) => !ui.project || p.id === ui.project).map((p) => {
      const pt = tasks.filter((t) => t.projectId === p.id);
      const pd = pt.filter((t) => t.status === "done").length;
      const pp = pt.length ? Math.round((pd / pt.length) * 100) : 0;
      return `<div class="prog"><div class="meta"><span><span class="dot" style="background:${p.color};display:inline-block;margin-right:8px"></span>${esc(p.name)}</span><span>${pd}/${pt.length}</span></div><div class="bar"><i style="width:${pp}%"></i></div></div>`;
    }).join("") || `<div class="empty">No projects yet.</div>`;

    return `
      <div class="stats">
        <div class="stat hero"><div class="label">Completion</div><div class="num">${pct}%</div></div>
        <div class="stat"><div class="label">Total tasks</div><div class="num">${total}</div></div>
        <div class="stat"><div class="label">In progress</div><div class="num">${active}</div></div>
        <div class="stat"><div class="label">Overdue</div><div class="num" style="color:${overdue ? "var(--red)" : "inherit"}">${overdue}</div></div>
      </div>
      <div class="grid2">
        <div class="panel"><h3>Project progress</h3>${progress}</div>
        <div class="panel"><h3>Upcoming deadlines</h3>
          ${upcoming.map((t) => `<div class="mini" data-id="${t.id}"><span class="dot" style="background:${proj(t.projectId)?.color || "#999"}"></span><span class="t">${esc(t.title)}</span><span class="${isOverdue(t) ? "overdue" : "sub"}">${fmt(t.due)}</span></div>`).join("") || `<div class="empty">Nothing due. 🎉</div>`}
        </div>
      </div>`;
  }

  function renderBoard(tasks) {
    return `<div class="board">${STATUSES.map((s) => {
      const items = tasks.filter((t) => t.status === s.id);
      return `<div class="col" data-status="${s.id}">
        <div class="col-head"><span class="dot" style="background:${s.color}"></span>${s.label}<span class="n">${items.length}</span></div>
        ${items.map(taskCard).join("")}</div>`;
    }).join("")}</div>`;
  }

  function renderList(tasks) {
    if (!tasks.length) return `<div class="empty">No tasks found.</div>`;
    const label = Object.fromEntries(STATUSES.map((s) => [s.id, s.label]));
    return `<table><thead><tr><th>Task</th><th>Project</th><th>Status</th><th>Priority</th><th>Assignee</th><th>Due</th></tr></thead><tbody>
      ${tasks.map((t) => `<tr class="row" data-id="${t.id}">
        <td><b>${esc(t.title)}</b></td>
        <td>${esc(proj(t.projectId)?.name || "—")}</td>
        <td>${label[t.status]}</td>
        <td><span class="tag ${t.priority}">${t.priority}</span></td>
        <td>${esc(t.assignee || "—")}</td>
        <td class="${isOverdue(t) ? "overdue" : ""}">${fmt(t.due)}</td></tr>`).join("")}</tbody></table>`;
  }

  function render() {
    const tasks = visible();
    const titles = { dashboard: "Dashboard", board: "Board", list: "All tasks" };
    $("#viewTitle").textContent = ui.project ? proj(ui.project).name : titles[ui.view];
    $("#viewSub").textContent = `${tasks.length} task${tasks.length === 1 ? "" : "s"}${ui.project ? " · " + titles[ui.view] : ""}`;
    $("#content").innerHTML = { dashboard: renderDashboard, board: renderBoard, list: renderList }[ui.view](tasks);
    renderSidebar();
    if (ui.view === "board") bindDrag();
  }

  /* ---------- Drag & drop ---------- */
  function bindDrag() {
    document.querySelectorAll(".card").forEach((c) => {
      c.addEventListener("dragstart", (e) => { c.classList.add("dragging"); e.dataTransfer.setData("text/plain", c.dataset.id); });
      c.addEventListener("dragend", () => c.classList.remove("dragging"));
    });
    document.querySelectorAll(".col").forEach((col) => {
      col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("over"); });
      col.addEventListener("dragleave", () => col.classList.remove("over"));
      col.addEventListener("drop", (e) => {
        e.preventDefault();
        const t = state.tasks.find((x) => x.id === e.dataTransfer.getData("text/plain"));
        if (t) { t.status = col.dataset.status; save(); render(); }
      });
    });
  }

  /* ---------- Task dialog ---------- */
  const taskDlg = $("#taskDialog"), taskForm = $("#taskForm");
  function openTask(id) {
    ui.editing = id || null;
    const t = id ? state.tasks.find((x) => x.id === id) : { projectId: ui.project || state.projects[0]?.id, status: "todo", priority: "medium" };
    $("#taskDialogTitle").textContent = id ? "Edit task" : "New task";
    $("#deleteTask").style.display = id ? "" : "none";
    taskForm.projectId.innerHTML = state.projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
    for (const k of ["title", "desc", "projectId", "status", "priority", "assignee", "due"]) taskForm[k].value = t[k] || "";
    taskDlg.showModal();
  }
  taskForm.addEventListener("submit", () => {
    const data = Object.fromEntries(new FormData(taskForm));
    if (ui.editing) Object.assign(state.tasks.find((x) => x.id === ui.editing), data);
    else state.tasks.push({ id: uid(), ...data });
    save(); render();
  });
  $("#cancelTask").onclick = () => taskDlg.close();
  $("#deleteTask").onclick = () => {
    if (!confirm("Delete this task?")) return;
    state.tasks = state.tasks.filter((x) => x.id !== ui.editing);
    save(); taskDlg.close(); render();
  };

  /* ---------- Project dialog ---------- */
  const projDlg = $("#projectDialog"), projForm = $("#projectForm");
  $("#addProject").onclick = () => { projForm.reset(); projDlg.showModal(); };
  $("#cancelProject").onclick = () => projDlg.close();
  projForm.addEventListener("submit", () => {
    const name = projForm.name.value.trim();
    if (!name) return;
    state.projects.push({ id: uid(), name, color: COLORS[state.projects.length % COLORS.length] });
    save(); render();
  });

  /* ---------- Events ---------- */
  document.querySelectorAll(".nav-item").forEach((b) => (b.onclick = () => { ui.view = b.dataset.view; $("#sidebar").classList.remove("open"); render(); }));
  $("#projectList").addEventListener("click", (e) => {
    const b = e.target.closest(".proj"); if (!b) return;
    ui.project = b.dataset.p || null; $("#sidebar").classList.remove("open"); render();
  });
  $("#content").addEventListener("click", (e) => {
    const el = e.target.closest("[data-id]"); if (el) openTask(el.dataset.id);
  });
  $("#addTask").onclick = () => state.projects.length ? openTask() : alert("Create a project first.");
  $("#search").addEventListener("input", (e) => { ui.q = e.target.value; render(); });
  $("#menuBtn").onclick = () => $("#sidebar").classList.toggle("open");

  render();
})();
