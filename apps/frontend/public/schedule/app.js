(() => {
  const ICONS = {
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6"/><circle cx="17" cy="9" r="2.4"/><path d="M15.3 14.2c2.8.5 5.2 2.4 5.2 5.8"/>',
    cap: '<path d="M12 3 2 8l10 5 10-5-10-5Z"/><path d="M6 11v4c0 1.7 2.7 3 6 3s6-1.3 6-3v-4"/><path d="M22 8v6"/>',
    "chevron-left": '<path d="M15 6l-6 6 6 6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    switch: '<path d="M7 7h13M17 3l3 4-3 4"/><path d="M17 17H4M7 21l-3-4 3-4"/>',
    bell: '<path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2Z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
    "bell-outline": '<path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2Z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    pin: '<path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z"/><circle cx="12" cy="10" r="2.3"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    bolt: '<path d="M13 2 3 14h7l-1 8 11-14h-7l1-6Z"/>',
  };

  function iconSvg(name, cls) {
    const paths = ICONS[name] || "";
    return `<svg class="icon${cls ? " " + cls : ""}" viewBox="0 0 24 24">${paths}</svg>`;
  }

  function stampIcons(root) {
    (root || document).querySelectorAll("[data-icon]").forEach((el) => {
      if (el.dataset.iconDone) return;
      el.innerHTML = iconSvg(el.dataset.icon);
      el.dataset.iconDone = "1";
    });
  }

  // window.WebApp — мост MAX (https://st.max.ru/js/max-web-app.js), подключён безусловно
  // в index.html; вне клиента MAX просто не создаёт этот объект, и всё ниже остаётся no-op.
  const tg = window.WebApp;

  stampIcons(document);

  const haptic = (style) => tg?.HapticFeedback?.impactOccurred?.(style || "light");

  const DAY_ORDER = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
  const DAY_SHORT = { Понедельник: "Пн", Вторник: "Вт", Среда: "Ср", Четверг: "Чт", Пятница: "Пт", Суббота: "Сб", Воскресенье: "Вс" };
  const RU_MONTHS_GEN = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
  ];

  function mondayOfThisWeek() {
    const now = new Date();
    const dow = now.getDay(); // 0=Sun..6=Sat
    const diff = dow === 0 ? -6 : 1 - dow;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  }

  function dateForDay(dayName) {
    const idx = DAY_ORDER.indexOf(dayName);
    if (idx === -1) return null;
    const monday = mondayOfThisWeek();
    return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + idx);
  }

  function formatDateShort(d) {
    return d ? `${d.getDate()} ${RU_MONTHS_GEN[d.getMonth()]}` : "";
  }

  const state = {
    schedule: null,
    changes: null,
    role: null, // 'student' | 'teacher' | 'room'
    selectedGroup: null,
    selectedTeacher: null,
    selectedRoom: null,
    selectedCourse: null,
    selectedDay: null,
    view: "day", // 'day' | 'week'
    currentWeek: null,
    currentScreen: null,
    now: new Date(),
    todayIso: new Intl.DateTimeFormat("en-CA").format(new Date()),
    todayWeekday: capitalize(new Intl.DateTimeFormat("ru-RU", { weekday: "long" }).format(new Date())),
  };

  function capitalize(s) {
    return s ? s[0].toUpperCase() + s.slice(1) : s;
  }

  function formatRoom(room) {
    if (!room) return "";
    return /ауд/i.test(room) ? room : `ауд. ${room}`;
  }

  function timeStartMinutes(time) {
    const m = (time || "").match(/(\d{1,2}):(\d{2})/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
  }

  function parseTimeRange(time) {
    const m = (time || "").match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return { start: Number(m[1]) * 60 + Number(m[2]), end: Number(m[3]) * 60 + Number(m[4]) };
  }

  function nowMinutes() {
    return state.now.getHours() * 60 + state.now.getMinutes();
  }

  function formatMinutes(mins) {
    if (mins < 60) return `${mins} мин`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h} ч ${m} мин` : `${h} ч`;
  }

  async function api(path) {
    const res = await fetch(`/api/college-schedule/${path}`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
    return res.json();
  }

  const SCREENS = ["role", "picker", "picker-teacher", "picker-room", "main"];
  function showScreen(name) {
    state.currentScreen = name;
    for (const s of SCREENS) {
      document.getElementById(`screen-${s}`).hidden = s !== name;
    }
    window.scrollTo(0, 0);
  }

  // ================= Role picker =================
  function goRolePicker() {
    showScreen("role");
  }

  function goPicker(target) {
    if (target === "teacher") {
      showScreen("picker-teacher");
      renderTeacherPicker();
    } else if (target === "room") {
      showScreen("picker-room");
      renderRoomPicker();
    } else {
      showScreen("picker");
      renderGroupPicker();
    }
  }

  document.getElementById("role-student").onclick = () => {
    haptic("light");
    goPicker("student");
  };
  document.getElementById("role-teacher").onclick = () => {
    haptic("light");
    goPicker("teacher");
  };
  document.getElementById("role-room").onclick = () => {
    haptic("light");
    goPicker("room");
  };
  document.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.onclick = () => goPicker(btn.dataset.goto);
  });
  document.getElementById("btn-picker-back").onclick = () => goRolePicker();
  document.getElementById("btn-teacher-picker-back").onclick = () => goRolePicker();
  document.getElementById("btn-room-picker-back").onclick = () => goRolePicker();

  // ================= Student: group picker =================
  function renderGroupPicker() {
    const tabsEl = document.getElementById("course-tabs");
    const gridEl = document.getElementById("group-grid");
    const courses = state.schedule.courses;
    if (!state.selectedCourse) state.selectedCourse = courses[0];

    tabsEl.innerHTML = "";
    for (const course of courses) {
      const chip = document.createElement("button");
      chip.className = "course-chip" + (course === state.selectedCourse ? " active" : "");
      chip.textContent = course;
      chip.onclick = () => {
        haptic("light");
        state.selectedCourse = course;
        renderGroupPicker();
      };
      tabsEl.appendChild(chip);
    }

    gridEl.innerHTML = "";
    const groups = state.schedule.groupsByCourse[state.selectedCourse] || [];
    for (const group of groups) {
      const card = document.createElement("button");
      card.className = "group-card";
      card.textContent = group;
      card.onclick = () => selectGroup(group);
      gridEl.appendChild(card);
    }
  }

  function selectGroup(group) {
    haptic("medium");
    state.role = "student";
    state.selectedGroup = group;
    state.teacherAgenda = null;
    state.selectedDay = null;
    localStorage.setItem("role", "student");
    localStorage.setItem("selectedGroup", group);
    history.replaceState(null, "", `?group=${encodeURIComponent(group)}`);
    showScreen("main");
    renderMain();
  }

  // ================= Teacher picker =================
  function getAllTeachers() {
    const set = new Set();
    for (const group of Object.values(state.schedule.groups)) {
      for (const slot of group.slots) {
        for (const lesson of slot.lessons) {
          (lesson.teacher || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((n) => set.add(n));
        }
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, "ru"));
  }

  const notifications = document.getElementById("notification-dialog");
  const notificationTitle = document.getElementById("notification-title");
  const notificationStatus = document.getElementById("notification-status");
  const notificationSettings = document.getElementById("notification-settings");
  const notificationSelection = document.getElementById("notification-selection");
  const notificationAnnouncements = document.getElementById("notification-announcements");
  const notificationSave = document.getElementById("notification-save");
  const openMax = document.getElementById("notification-open-max");

  function maxInitData() {
    return window.WebApp?.initData || new URLSearchParams(location.hash.slice(1)).get("WebAppData");
  }

  function displayedSchedule() {
    if (state.role === "student" && state.selectedGroup) return { scope: "group", target: state.selectedGroup };
    if (state.role === "teacher" && state.selectedTeacher) return { scope: "teacher", target: state.selectedTeacher };
    return null;
  }

  async function subscriptionRequest(method, data) {
    const response = await fetch("/api/college-schedule/max/subscription", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, initData: maxInitData() }),
      signal: AbortSignal.timeout(8000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(typeof result.message === "string" ? result.message : "Настройки подписки недоступны");
    return result;
  }

  function fillNotificationSettings(subscription, current) {
    const value = (selection) => selection ? JSON.stringify(selection) : "";
    notificationSelection.replaceChildren(new Option("Не получать замены", ""));
    const groups = Object.keys(state.schedule.groups).sort((a, b) => a.localeCompare(b, "ru"));
    for (const [scope, label, targets] of [["group", "Группы", groups], ["teacher", "Преподаватели", getAllTeachers()]]) {
      const section = document.createElement("optgroup");
      section.label = label;
      for (const target of targets) section.appendChild(new Option(target, value({ scope, target })));
      notificationSelection.appendChild(section);
    }
    const selection = current ?? subscription.selection;
    const selectedValue = value(selection);
    for (const item of [selection, subscription.selection]) {
      const itemValue = value(item);
      if (item && !Array.from(notificationSelection.options).some((option) => option.value === itemValue)) {
        notificationSelection.appendChild(new Option(item.target, itemValue));
      }
    }
    notificationSelection.value = selectedValue;
    notificationAnnouncements.checked = subscription.announcements;
  }

  async function openNotifications() {
    const current = displayedSchedule();
    notificationTitle.textContent = current ? `Подписка · ${current.target}` : "Уведомления MAX";
    notificationSettings.hidden = true;
    openMax.hidden = true;
    notificationStatus.textContent = "Загружаем настройки…";
    if (!notifications.open) notifications.showModal();
    try {
      if (!maxInitData()) {
        notificationStatus.textContent = "Для подписки откройте это расписание в мини-приложении бота MAX.";
        const { url } = await api("max/mini-app");
        if (url) {
          const link = new URL(url);
          const bytes = new TextEncoder().encode(JSON.stringify(current));
          const payload = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
          link.searchParams.set("startapp", `notifications_${payload}`);
          openMax.href = link.href;
          openMax.hidden = false;
        }
        return;
      }
      const subscription = await subscriptionRequest("POST", {});
      fillNotificationSettings(subscription, current);
      const previous = subscription.selection;
      const switching = current && previous && (current.scope !== previous.scope || current.target !== previous.target);
      notificationStatus.textContent = switching
        ? `Сейчас вы получаете замены для «${previous.target}». При сохранении нового выбора подписка изменится.`
        : "Если вы ещё не запускали этого бота, нажмите «Начать» в его чате.";
      notificationSettings.hidden = false;
    } catch (error) {
      notificationStatus.textContent = error.message || "Настройки подписки недоступны. Попробуйте снова.";
    }
  }

  function notificationStart() {
    const start = new URLSearchParams(maxInitData() ?? "").get("start_param") ?? new URLSearchParams(location.search).get("WebAppStartParam");
    if (!start?.startsWith("notifications_") || !maxInitData()) return undefined;
    try {
      const payload = start.slice("notifications_".length).replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))));
    } catch {
      return null;
    }
  }

  document.querySelectorAll("[data-notifications]").forEach((button) => { button.onclick = openNotifications; });
  document.getElementById("notification-close").onclick = () => notifications.close();
  document.getElementById("notification-form").onsubmit = async (event) => {
    event.preventDefault();
    if (notificationSave.disabled || notificationSettings.hidden) return;
    notificationSave.disabled = true;
    try {
      const selection = notificationSelection.value ? JSON.parse(notificationSelection.value) : null;
      const announcements = notificationAnnouncements.checked;
      await subscriptionRequest("PUT", { selection, announcements });
      notificationStatus.textContent = selection || announcements ? "Подписка сохранена." : "Уведомления отключены.";
    } catch (error) {
      notificationStatus.textContent = error.message || "Не удалось сохранить подписку.";
    } finally {
      notificationSave.disabled = false;
    }
  };

  function renderTeacherPicker() {
    if (!state.allTeachers) state.allTeachers = getAllTeachers();
    const input = document.getElementById("teacher-search");
    const listEl = document.getElementById("teacher-list");

    function renderList() {
      const query = input.value.trim().toLowerCase();
      const filtered = query ? state.allTeachers.filter((t) => t.toLowerCase().includes(query)) : state.allTeachers;
      listEl.innerHTML = "";
      if (filtered.length === 0) {
        listEl.innerHTML = `<div class="empty-note">Никого не нашлось</div>`;
        return;
      }
      for (const name of filtered.slice(0, 200)) {
        const row = document.createElement("button");
        row.className = "teacher-row";
        row.innerHTML = `<span class="avatar sm">${escapeHtml(initialsFor(name))}</span><span class="teacher-name"></span>`;
        row.querySelector(".teacher-name").textContent = name;
        row.onclick = () => selectTeacher(name);
        listEl.appendChild(row);
      }
    }

    input.oninput = renderList;
    renderList();
  }

  function initialsFor(name) {
    return (name.trim()[0] || "?").toUpperCase();
  }

  function selectTeacher(name) {
    haptic("medium");
    state.role = "teacher";
    state.selectedTeacher = name;
    state.teacherAgenda = null;
    state.selectedDay = null;
    localStorage.setItem("role", "teacher");
    localStorage.setItem("selectedTeacher", name);
    history.replaceState(null, "", `?teacher=${encodeURIComponent(name)}`);
    showScreen("main");
    renderMain();
  }

  // ================= Room picker =================
  // Лист замен пишет кабинет как "303 ауд.", основное расписание — просто "303":
  // сравнивать/группировать нужно по этому нормализованному виду, а не по сырой строке.
  function normalizeRoom(room) {
    return (room || "").replace(/ауд\.?/gi, "").trim();
  }

  /** Кабинет для подгрупп пишется через запятую в одной ячейке ("20, 12" — как и
   * преподаватели там же: "Волкова А.Д., Шибанова В.Д."), это не один кабинет "20, 12". */
  function splitRooms(room) {
    return (room || "")
      .split(",")
      .map((s) => normalizeRoom(s))
      .filter(Boolean);
  }

  function compareRooms(a, b) {
    const na = Number(a);
    const nb = Number(b);
    const aNum = a !== "" && String(na) === a;
    const bNum = b !== "" && String(nb) === b;
    if (aNum && bNum) return na - nb;
    if (aNum) return -1;
    if (bNum) return 1;
    return a.localeCompare(b, "ru");
  }

  function getAllRooms() {
    const set = new Set();
    for (const group of Object.values(state.schedule.groups)) {
      for (const slot of group.slots) {
        for (const lesson of slot.lessons) {
          splitRooms(lesson.room).forEach((r) => set.add(r));
        }
      }
    }
    return [...set].sort(compareRooms);
  }

  function renderRoomPicker() {
    if (!state.allRooms) state.allRooms = getAllRooms();
    const input = document.getElementById("room-search");
    const listEl = document.getElementById("room-list");

    function renderList() {
      const query = input.value.trim().toLowerCase();
      const filtered = query ? state.allRooms.filter((r) => r.toLowerCase().includes(query)) : state.allRooms;
      listEl.innerHTML = "";
      if (filtered.length === 0) {
        listEl.innerHTML = `<div class="empty-note">Ничего не нашлось</div>`;
        return;
      }
      for (const room of filtered.slice(0, 200)) {
        const row = document.createElement("button");
        row.className = "teacher-row";
        row.innerHTML = `<span class="avatar sm">${iconSvg("pin")}</span><span class="teacher-name"></span>`;
        row.querySelector(".teacher-name").textContent = room;
        row.onclick = () => selectRoom(room);
        listEl.appendChild(row);
      }
    }

    input.oninput = renderList;
    renderList();
  }

  function selectRoom(room) {
    haptic("medium");
    state.role = "room";
    state.selectedRoom = room;
    state.selectedDay = null;
    localStorage.setItem("role", "room");
    localStorage.setItem("selectedRoom", room);
    history.replaceState(null, "", `?room=${encodeURIComponent(room)}`);
    showScreen("main");
    renderMain();
  }

  /** Что по факту происходит в это время у этой группы: с учётом сегодняшних замен
   * (если они есть на этот день), иначе — как в основном расписании с учётом недели. */
  function effectiveSlotItems(groupName, slot, isToday) {
    const changeEntry = isToday ? state.changes.groups[groupName]?.entries.find((c) => c.pair === slot.pair) : null;
    if (changeEntry) {
      // отмена пары или замена без указания кабинета — кабинет не занят, items пустой
      return splitRooms(changeEntry.room).map((room) => ({
        subject: changeEntry.subject,
        teacher: changeEntry.teacher,
        room,
        isChange: true,
      }));
    }
    return visibleLessons(slot.lessons).flatMap((l) =>
      splitRooms(l.room).map((room) => ({ subject: l.subject, teacher: l.teacher, room, isChange: false }))
    );
  }

  function roomHasChangeToday(day) {
    if (!state.changes || state.changes.isoDate !== isoOfDay(day)) return false;
    const normRoom = normalizeRoom(state.selectedRoom);
    for (const gc of Object.values(state.changes.groups)) {
      for (const entry of gc.entries) {
        if (normalizeRoom(entry.room) === normRoom) return true;
      }
    }
    return false;
  }

  /** Единая сетка пар/времени на день — у всех групп одинаковый звонковый расписание,
   * поэтому список пар можно собрать из любых групп, у кого есть пары в этот день. */
  function getDayPairGrid(day) {
    const map = new Map();
    for (const group of Object.values(state.schedule.groups)) {
      for (const slot of group.slots) {
        if (slot.day === day && !map.has(slot.pair)) map.set(slot.pair, slot.time);
      }
    }
    return [...map.entries()]
      .map(([pair, time]) => ({ pair, time }))
      .sort((a, b) => timeStartMinutes(a.time) - timeStartMinutes(b.time));
  }

  function buildRoomDayCards(day) {
    const grid = getDayPairGrid(day);
    if (grid.length === 0) return null;

    const normRoom = normalizeRoom(state.selectedRoom);
    const isToday = state.changes && state.changes.isoDate === isoOfDay(day);
    const byPair = new Map();
    for (const group of Object.values(state.schedule.groups)) {
      for (const slot of group.slots) {
        if (slot.day !== day) continue;
        for (const item of effectiveSlotItems(group.group, slot, isToday)) {
          if (item.room !== normRoom) continue;
          if (!byPair.has(slot.pair)) byPair.set(slot.pair, []);
          byPair.get(slot.pair).push({ ...item, group: group.group });
        }
      }
    }

    const cards = [];
    for (const { pair, time } of grid) {
      const isBreak = pair === "-";
      const items = byPair.get(pair) || [];
      const live = isLiveNow(day, time) && items.length > 0;
      const card = document.createElement("div");
      card.className =
        "slot-card" +
        (isBreak ? " is-break" : "") +
        (items.length === 0 ? " is-empty" : "") +
        (items.some((i) => i.isChange) ? " has-change" : "") +
        (live ? " is-live" : "");

      const timeEl = document.createElement("div");
      timeEl.className = "slot-time";
      timeEl.innerHTML = `<div class="slot-pair-num">${isBreak ? "•" : escapeHtml(pair)}</div><div class="slot-time-range">${escapeHtml(time)}</div>${live ? '<div class="live-tag">Сейчас</div>' : ""}`;
      card.appendChild(timeEl);

      const body = document.createElement("div");
      body.className = "slot-body";
      if (items.length === 0) {
        const empty = document.createElement("div");
        empty.className = "lesson-meta";
        empty.textContent = isBreak ? "—" : "Свободен";
        body.appendChild(empty);
      } else {
        items.forEach((item) => {
          body.appendChild(lessonBlock({ subject: item.subject, teacher: item.teacher }, {
            showTeacher: true,
            groupTag: item.group,
            badge: item.isChange ? "Замена" : null,
          }));
        });
      }

      card.appendChild(body);
      cards.push(card);
    }
    return cards;
  }

  function getAllScheduleDays() {
    if (state.allDays) return state.allDays;
    const days = [];
    for (const group of Object.values(state.schedule.groups)) {
      for (const slot of group.slots) {
        if (!days.includes(slot.day)) days.push(slot.day);
      }
    }
    days.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
    state.allDays = days;
    return days;
  }

  document.getElementById("btn-change-group").onclick = () => {
    haptic("light");
    goPicker(state.role === "teacher" ? "teacher" : state.role === "room" ? "room" : "student");
  };

  // ================= Main schedule screen =================
  function visibleLessons(lessons) {
    if (!state.currentWeek) return lessons;
    return lessons.filter((l) => !l.week || l.week === state.currentWeek);
  }

  /**
   * The changes sheet is keyed by calendar date (isoDate), not by weekday name — and
   * the college sometimes publishes tomorrow's substitutions before midnight. Comparing
   * against the actual date of `day` (this week's occurrence of that weekday) instead of
   * `state.todayWeekday` means a change overlay still shows up when browsing that day's
   * tab even before it becomes "today".
   */
  function isoOfDay(day) {
    const d = dateForDay(day);
    return d ? new Intl.DateTimeFormat("en-CA").format(d) : null;
  }

  function dayHasChangeForGroup(group, day) {
    if (!state.changes || state.changes.isoDate !== isoOfDay(day)) return false;
    return Boolean(state.changes.groups[group]);
  }

  function teacherHasChangeToday(day) {
    if (!state.changes || state.changes.isoDate !== isoOfDay(day)) return false;
    const name = state.selectedTeacher;
    for (const gc of Object.values(state.changes.groups)) {
      for (const entry of gc.entries) {
        const names = (entry.teacher || "").split(",").map((s) => s.trim());
        if (names.includes(name)) return true;
      }
    }
    return false;
  }

  function dayHasChangeAny(day) {
    if (state.role === "teacher") return teacherHasChangeToday(day);
    if (state.role === "room") return roomHasChangeToday(day);
    return dayHasChangeForGroup(state.selectedGroup, day);
  }

  function renderViewToggle() {
    const el = document.getElementById("view-toggle");
    el.querySelectorAll(".view-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === state.view);
      btn.onclick = () => {
        if (state.view === btn.dataset.view) return;
        haptic("light");
        state.view = btn.dataset.view;
        el.querySelectorAll(".view-tab").forEach((b) => b.classList.toggle("active", b === btn));
        renderScheduleBody();
      };
    });
  }

  function renderDateStrip(days) {
    const el = document.getElementById("date-strip");
    el.hidden = state.view !== "day";
    el.innerHTML = "";
    for (const day of days) {
      const d = dateForDay(day);
      const cell = document.createElement("button");
      cell.className =
        "date-cell" + (day === state.selectedDay ? " active" : "") + (day === state.todayWeekday ? " is-today" : "");
      cell.innerHTML = `<span class="dow">${escapeHtml(DAY_SHORT[day] || day.slice(0, 2))}</span><span class="dnum">${d ? d.getDate() : ""}</span>`;
      if (dayHasChangeAny(day)) {
        const dot = document.createElement("span");
        dot.className = "change-dot";
        cell.appendChild(dot);
      }
      cell.onclick = () => {
        haptic("light");
        state.selectedDay = day;
        renderScheduleBody();
      };
      el.appendChild(cell);
    }
  }

  function renderDayHeading() {
    const el = document.getElementById("day-heading");
    el.hidden = state.view !== "day";
    const d = dateForDay(state.selectedDay);
    el.innerHTML = `${escapeHtml(state.selectedDay || "")}<span class="day-heading-date">${formatDateShort(d)}</span>`;
  }

  function lessonBlock(lesson, opts = {}) {
    const wrap = document.createElement("div");
    wrap.className = "lesson-block";
    if (opts.badge) {
      const badge = document.createElement("div");
      badge.className = "badge";
      badge.textContent = opts.badge;
      wrap.appendChild(badge);
    }

    const row = document.createElement("div");
    row.className = "lesson-row";
    const details = document.createElement("div");
    details.className = "lesson-details";
    row.appendChild(details);
    wrap.appendChild(row);

    const subj = document.createElement("div");
    subj.className = "lesson-subject";
    if (lesson.week) {
      const tag = document.createElement("span");
      tag.className = `week-tag ${lesson.week}`;
      subj.appendChild(tag);
    }
    subj.appendChild(document.createTextNode(lesson.subject || "—"));
    if (opts.groupTag) {
      const gtag = document.createElement("span");
      gtag.className = "lesson-group-tag";
      gtag.textContent = opts.groupTag;
      subj.appendChild(gtag);
    }
    details.appendChild(subj);

    const metaParts = [];
    if (opts.showTeacher && lesson.teacher) metaParts.push({ icon: "cap", text: lesson.teacher });
    else if (lesson.teacher && !opts.showTeacher) metaParts.push({ icon: null, text: lesson.teacher });
    if (metaParts.length) {
      const metaEl = document.createElement("div");
      metaEl.className = "lesson-meta";
      metaEl.innerHTML = metaParts
        .map((p) => `<span class="meta-item">${p.icon ? iconSvg(p.icon) : ""}${escapeHtml(p.text)}</span>`)
        .join("");
      details.appendChild(metaEl);
    }

    const room = normalizeRoom(lesson.room);
    if (room) {
      const el = document.createElement("div");
      el.className = "lesson-room";
      el.innerHTML = `${iconSvg("pin")}<span>${escapeHtml(room)}</span>`;
      row.appendChild(el);
    }
    return wrap;
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function isLiveNow(day, time) {
    if (day !== state.todayWeekday) return false;
    const range = parseTimeRange(time);
    if (!range) return false;
    const n = nowMinutes();
    return n >= range.start && n < range.end;
  }

  function buildStudentDayCards(groupData, day) {
    const slots = groupData.slots.filter((s) => s.day === day);
    if (slots.length === 0) return null;
    const showChanges = dayHasChangeForGroup(state.selectedGroup, day);
    const changeEntries = showChanges ? state.changes.groups[state.selectedGroup].entries : [];
    const cards = [];

    for (const slot of slots) {
      const card = document.createElement("div");
      const isBreak = slot.pair === "-";
      const changeEntry = changeEntries.find((c) => c.pair === slot.pair);
      const lessons = visibleLessons(slot.lessons);
      const live = isLiveNow(day, slot.time) && (lessons.length > 0 || Boolean(changeEntry));
      card.className =
        "slot-card" +
        (isBreak ? " is-break" : "") +
        (lessons.length === 0 && !changeEntry ? " is-empty" : "") +
        (changeEntry ? " has-change" : "") +
        (live ? " is-live" : "");

      const time = document.createElement("div");
      time.className = "slot-time";
      time.innerHTML = `<div class="slot-pair-num">${isBreak ? "•" : escapeHtml(slot.pair)}</div><div class="slot-time-range">${escapeHtml(slot.time)}</div>${live ? '<div class="live-tag">Сейчас</div>' : ""}`;
      card.appendChild(time);

      const body = document.createElement("div");
      body.className = "slot-body";

      if (changeEntry) {
        body.appendChild(lessonBlock(changeEntry, { showTeacher: true, badge: "Замена" }));
        if (lessons.length > 0) {
          const orig = document.createElement("div");
          orig.className = "original-lesson";
          for (const l of lessons) {
            const line = document.createElement("span");
            line.textContent = [l.subject, l.teacher, formatRoom(l.room)].filter(Boolean).join(" · ");
            orig.appendChild(line);
          }
          body.appendChild(orig);
        }
      } else if (lessons.length > 0) {
        lessons.forEach((l) => body.appendChild(lessonBlock(l, { showTeacher: true })));
      } else {
        const empty = document.createElement("div");
        empty.className = "lesson-meta";
        empty.textContent = isBreak ? "—" : slot.lessons.length > 0 ? "На этой неделе пары нет" : "Нет пары";
        body.appendChild(empty);
      }

      card.appendChild(body);
      cards.push(card);
    }
    return cards;
  }

  function buildTeacherAgenda() {
    const name = state.selectedTeacher;
    const rows = new Map();
    for (const group of Object.values(state.schedule.groups)) {
      group.slots.forEach((slot) => {
        for (const lesson of slot.lessons) {
          const names = (lesson.teacher || "").split(",").map((s) => s.trim());
          if (!names.includes(name)) continue;
          const key = `${slot.day}::${slot.pair}`;
          if (!rows.has(key)) rows.set(key, { day: slot.day, pair: slot.pair, time: slot.time, entries: [] });
          rows.get(key).entries.push({ group: group.group, subject: lesson.subject, room: lesson.room, week: lesson.week });
        }
      });
    }
    return [...rows.values()];
  }

  function computeTeacherRowItems(row, isToday, name) {
    const normalEntries = visibleLessons(row.entries);
    const items = []; // {kind, group, subject, room, week, teacher}
    const usedGroups = new Set();

    for (const entry of normalEntries) {
      const changeEntry = isToday ? state.changes.groups[entry.group]?.entries.find((c) => c.pair === row.pair) : null;
      if (changeEntry) {
        const changeTeachers = (changeEntry.teacher || "").split(",").map((s) => s.trim());
        if (changeTeachers.includes(name)) {
          items.push({ kind: "changed", group: entry.group, subject: changeEntry.subject, room: changeEntry.room, original: entry });
        } else {
          items.push({ kind: "reassigned", group: entry.group, subject: entry.subject, room: entry.room, week: entry.week, newTeacher: changeEntry.teacher });
        }
      } else {
        items.push({ kind: "normal", group: entry.group, subject: entry.subject, room: entry.room, week: entry.week });
      }
      usedGroups.add(entry.group);
    }

    if (isToday) {
      for (const [groupName, gc] of Object.entries(state.changes.groups)) {
        if (usedGroups.has(groupName)) continue;
        const changeEntry = gc.entries.find((c) => c.pair === row.pair);
        if (!changeEntry) continue;
        const changeTeachers = (changeEntry.teacher || "").split(",").map((s) => s.trim());
        if (changeTeachers.includes(name)) {
          items.push({ kind: "substitute", group: groupName, subject: changeEntry.subject, room: changeEntry.room });
        }
      }
    }
    return items;
  }

  /** Any group's slot for this day/pair — pair numbers share the same time across groups, so this is a reliable time lookup for a pair the teacher has no regular class in. */
  function timeForPair(day, pair) {
    for (const group of Object.values(state.schedule.groups)) {
      const slot = group.slots.find((s) => s.day === day && s.pair === pair);
      if (slot) return slot.time;
    }
    return "";
  }

  /**
   * A substitute assignment ("замещение") can land on a pair where this teacher has no
   * regular class anywhere that day — buildTeacherAgenda() never creates a row for such a
   * pair (it only knows about the teacher's own timetable), so without this the whole
   * assignment would silently vanish from their day. This adds a synthetic empty-entries
   * row for any such pair so computeTeacherRowItems' substitute scan actually runs on it.
   */
  function getTeacherDayRows(day) {
    if (!state.teacherAgenda) state.teacherAgenda = buildTeacherAgenda();
    const rows = state.teacherAgenda.filter((r) => r.day === day);
    const isToday = state.changes && state.changes.isoDate === isoOfDay(day);
    if (isToday) {
      const name = state.selectedTeacher;
      const havePairs = new Set(rows.map((r) => r.pair));
      for (const gc of Object.values(state.changes.groups)) {
        for (const entry of gc.entries) {
          if (havePairs.has(entry.pair)) continue;
          const changeTeachers = (entry.teacher || "").split(",").map((s) => s.trim());
          if (!changeTeachers.includes(name)) continue;
          rows.push({ day, pair: entry.pair, time: timeForPair(day, entry.pair), entries: [] });
          havePairs.add(entry.pair);
        }
      }
    }
    return rows.sort((a, b) => timeStartMinutes(a.time) - timeStartMinutes(b.time));
  }

  function buildTeacherDayCards(day) {
    const rows = getTeacherDayRows(day);
    if (rows.length === 0) return null;

    const isToday = state.changes && state.changes.isoDate === isoOfDay(day);
    const name = state.selectedTeacher;
    const cards = [];

    for (const row of rows) {
      const isBreak = row.pair === "-";
      const allItems = computeTeacherRowItems(row, isToday, name);
      // a pair taken away and given to someone else just disappears from this teacher's
      // day — no strikethrough card, no "проведёт X" note, it's simply not their class anymore
      const items = allItems.filter((i) => i.kind !== "reassigned");
      if (items.length === 0 && allItems.length > 0) continue;

      const card = document.createElement("div");
      const hasChange = items.some((i) => i.kind === "changed" || i.kind === "substitute");
      const live = isLiveNow(day, row.time) && items.length > 0;
      card.className =
        "slot-card" +
        (isBreak ? " is-break" : "") +
        (items.length === 0 ? " is-empty" : "") +
        (hasChange ? " has-change" : "") +
        (live ? " is-live" : "");

      const time = document.createElement("div");
      time.className = "slot-time";
      time.innerHTML = `<div class="slot-pair-num">${isBreak ? "•" : escapeHtml(row.pair)}</div><div class="slot-time-range">${escapeHtml(row.time)}</div>${live ? '<div class="live-tag">Сейчас</div>' : ""}`;
      card.appendChild(time);

      const body = document.createElement("div");
      body.className = "slot-body";

      if (items.length === 0) {
        const empty = document.createElement("div");
        empty.className = "lesson-meta";
        empty.textContent = row.entries.length > 0 ? "На этой неделе пары нет" : "Окно";
        body.appendChild(empty);
      } else {
        items.forEach((item) => {
          const block = lessonBlock(item, {
            groupTag: item.group,
            badge: item.kind === "changed" ? "Замена" : item.kind === "substitute" ? "Замещение" : null,
          });
          if (item.kind === "changed" && item.original) {
            const orig = document.createElement("div");
            orig.className = "original-lesson";
            orig.innerHTML = `<span>${escapeHtml([item.original.subject, formatRoom(item.original.room)].filter(Boolean).join(" · "))}</span>`;
            block.appendChild(orig);
          }
          body.appendChild(block);
        });
      }

      card.appendChild(body);
      cards.push(card);
    }
    return cards;
  }

  function getGroupData() {
    return state.schedule.groups[state.selectedGroup];
  }

  function buildDayCards(day) {
    if (state.role === "teacher") return buildTeacherDayCards(day);
    if (state.role === "room") return buildRoomDayCards(day);
    return buildStudentDayCards(getGroupData(), day);
  }

  function renderDayContent(day) {
    const el = document.getElementById("slots");
    el.className = "slots";
    el.innerHTML = "";
    const cards = day ? buildDayCards(day) : null;
    if (!cards) {
      el.innerHTML = `<div class="empty-note">На этот день ${state.role === "teacher" ? "занятий" : "пар"} нет 🎉</div>`;
      return;
    }
    cards.forEach((c) => el.appendChild(c));
  }

  function renderWeekContent(days) {
    const el = document.getElementById("slots");
    el.className = "slots is-week";
    el.innerHTML = "";
    for (const day of days) {
      const cards = buildDayCards(day);
      const section = document.createElement("div");
      section.className = "day-section";
      const header = document.createElement("div");
      header.className = "day-section-header" + (day === state.todayWeekday ? " is-today" : "");
      const d = dateForDay(day);
      header.innerHTML = `<span class="day-section-name">${escapeHtml(day)}</span><span class="day-section-date">${formatDateShort(d)}</span>`;
      section.appendChild(header);

      const list = document.createElement("div");
      list.className = "day-section-list";
      if (cards) {
        cards.forEach((c) => {
          c.classList.add("compact");
          list.appendChild(c);
        });
      } else {
        const empty = document.createElement("div");
        empty.className = "empty-note tiny";
        empty.textContent = state.role === "teacher" ? "Занятий нет" : "Пар нет";
        list.appendChild(empty);
      }
      section.appendChild(list);
      el.appendChild(section);
    }
  }

  function renderScheduleBody() {
    const days = state.days || [];
    renderDateStrip(days);
    renderDayHeading();
    if (state.view === "week") renderWeekContent(days);
    else renderDayContent(state.selectedDay);
  }

  function getTodayFlatItems() {
    const day = state.todayWeekday;
    const items = [];

    if (state.role === "teacher") {
      const isToday = state.changes && state.changes.isoDate === state.todayIso;
      const name = state.selectedTeacher;
      const rows = getTeacherDayRows(day);
      for (const row of rows) {
        const range = parseTimeRange(row.time);
        if (!range) continue;
        const rowItems = computeTeacherRowItems(row, isToday, name);
        for (const item of rowItems) {
          if (item.kind === "reassigned") continue;
          items.push({
            pair: row.pair,
            range,
            subject: item.subject,
            room: item.room,
            groupTag: item.group,
            badge: item.kind === "changed" ? "Замена" : item.kind === "substitute" ? "Замещение" : null,
          });
        }
      }
    } else if (state.role === "room") {
      const normRoom = normalizeRoom(state.selectedRoom);
      const isToday = state.changes && state.changes.isoDate === state.todayIso;
      for (const group of Object.values(state.schedule.groups)) {
        const slots = group.slots.filter((s) => s.day === day);
        for (const slot of slots) {
          const range = parseTimeRange(slot.time);
          if (!range) continue;
          for (const item of effectiveSlotItems(group.group, slot, isToday)) {
            if (item.room !== normRoom) continue;
            items.push({ pair: slot.pair, range, subject: item.subject, room: null, groupTag: group.group, badge: item.isChange ? "Замена" : null });
          }
        }
      }
    } else {
      const groupData = getGroupData();
      if (!groupData) return [];
      const slots = groupData.slots.filter((s) => s.day === day);
      const showChanges = dayHasChangeForGroup(state.selectedGroup, day);
      const changeEntries = showChanges ? state.changes.groups[state.selectedGroup].entries : [];
      for (const slot of slots) {
        const range = parseTimeRange(slot.time);
        if (!range) continue;
        const changeEntry = changeEntries.find((c) => c.pair === slot.pair);
        if (changeEntry) {
          items.push({ pair: slot.pair, range, subject: changeEntry.subject, room: changeEntry.room, groupTag: null, badge: "Замена" });
        } else {
          for (const l of visibleLessons(slot.lessons)) {
            items.push({ pair: slot.pair, range, subject: l.subject, room: l.room, groupTag: null, badge: null });
          }
        }
      }
    }
    return items;
  }

  function getLiveStatus() {
    const items = getTodayFlatItems();
    if (items.length === 0) return null;
    const nowMin = nowMinutes();

    const current = items.find((it) => nowMin >= it.range.start && nowMin < it.range.end);
    if (current) {
      return {
        kind: "current",
        ...current,
        minutesLeft: current.range.end - nowMin,
        progress: (nowMin - current.range.start) / (current.range.end - current.range.start),
      };
    }

    const upcoming = items.filter((it) => it.range.start > nowMin).sort((a, b) => a.range.start - b.range.start)[0];
    if (upcoming) return { kind: "next", ...upcoming, minutesUntil: upcoming.range.start - nowMin };

    return null;
  }

  function renderLiveBanner() {
    const el = document.getElementById("live-banner");
    const status = getLiveStatus();
    if (!status) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const pairLabel = status.pair === "-" ? "" : `${escapeHtml(status.pair)} пара · `;
    const groupTag = status.groupTag ? `<span class="lesson-group-tag">${escapeHtml(status.groupTag)}</span>` : "";
    const badge = status.badge ? `<span class="lesson-group-tag live-change-tag">${escapeHtml(status.badge)}</span>` : "";
    const metaBits = [];
    if (status.room) metaBits.push(`<span class="meta-item meta-item-room">${iconSvg("pin")}${escapeHtml(normalizeRoom(status.room))}</span>`);

    if (status.kind === "current") {
      const pct = Math.round(Math.max(0, Math.min(1, status.progress)) * 100);
      el.className = "live-banner is-current";
      el.innerHTML = `
        <div class="live-top">
          <span class="live-dot"></span>
          <span class="live-label">${pairLabel}идёт сейчас</span>
          <span class="live-time">ещё ${formatMinutes(status.minutesLeft)}</span>
        </div>
        <div class="live-subject">${escapeHtml(status.subject || "—")}${groupTag}${badge}</div>
        ${metaBits.length ? `<div class="lesson-meta">${metaBits.join("")}</div>` : ""}
        <div class="live-progress"><div class="live-progress-fill" style="width:${pct}%"></div></div>
      `;
    } else {
      el.className = "live-banner is-next";
      el.innerHTML = `
        <div class="live-top">
          <span class="live-dot next"></span>
          <span class="live-label">${pairLabel}далее</span>
          <span class="live-time">через ${formatMinutes(status.minutesUntil)}</span>
        </div>
        <div class="live-subject">${escapeHtml(status.subject || "—")}${groupTag}${badge}</div>
        ${metaBits.length ? `<div class="lesson-meta">${metaBits.join("")}</div>` : ""}
      `;
    }
  }

  function renderBanner() {
    const el = document.getElementById("changes-banner");
    const hasToday = dayHasChangeAny(state.todayWeekday);
    if (!hasToday) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML = `<span class="banner-icon">${iconSvg("bolt")}</span><span>Сегодня (${escapeHtml(state.changes.dateLabel || "сегодня")}) есть замены — они уже отмечены ниже.</span>`;
  }

  function renderWeekBar() {
    const el = document.getElementById("week-bar");
    if (!state.currentWeek) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const pill = document.createElement("span");
    pill.className = `week-pill is-${state.currentWeek}`;
    pill.textContent = state.currentWeek === "red" ? "🔴 Красная неделя" : "🔵 Синяя неделя";
    el.innerHTML = "";
    el.appendChild(pill);
  }

  function renderMain() {
    document.getElementById("current-avatar").innerHTML =
      state.role === "teacher" ? escapeHtml(initialsFor(state.selectedTeacher || "?")) : state.role === "room" ? iconSvg("pin") : iconSvg("users");

    let days;
    if (state.role === "teacher") {
      document.getElementById("current-group").textContent = state.selectedTeacher || "—";
      document.getElementById("current-course").textContent = "Преподаватель";
      if (!state.teacherAgenda) state.teacherAgenda = buildTeacherAgenda();
      days = [];
      for (const row of state.teacherAgenda) if (!days.includes(row.day)) days.push(row.day);
    } else if (state.role === "room") {
      document.getElementById("current-group").textContent = state.selectedRoom || "—";
      document.getElementById("current-course").textContent = "Кабинет";
      days = getAllScheduleDays();
    } else {
      const groupData = state.schedule.groups[state.selectedGroup];
      document.getElementById("current-group").textContent = state.selectedGroup;
      document.getElementById("current-course").textContent = groupData?.course || "";
      days = [];
      if (groupData) for (const slot of groupData.slots) if (!days.includes(slot.day)) days.push(slot.day);
    }
    days.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
    state.days = days;

    if (!state.selectedDay || !days.includes(state.selectedDay)) {
      state.selectedDay = days.includes(state.todayWeekday) ? state.todayWeekday : days[0];
    }

    renderViewToggle();
    renderWeekBar();
    renderLiveBanner();
    renderBanner();

    if (state.role === "student" && !state.schedule.groups[state.selectedGroup]) {
      document.getElementById("slots").innerHTML = `<div class="empty-note">Расписание для этой группы не найдено.</div>`;
      return;
    }
    renderScheduleBody();
  }

  setInterval(() => {
    state.now = new Date();
    state.todayIso = new Intl.DateTimeFormat("en-CA").format(state.now);
    state.todayWeekday = capitalize(new Intl.DateTimeFormat("ru-RU", { weekday: "long" }).format(state.now));
    if (state.currentScreen === "main" && state.schedule) renderLiveBanner();
  }, 20000);

  function applySettings(settings) {
    state.currentWeek = settings.currentWeek;
    const announcement = document.getElementById("schedule-announcement");
    announcement.textContent = settings.announcement ?? "";
    announcement.hidden = !settings.announcement;
  }

  async function refreshSchedule() {
    const [schedule, changes, settings] = await Promise.allSettled([api("schedule"), api("changes"), api("week")]);
    if (schedule.status === "fulfilled") {
      state.schedule = schedule.value;
      state.teacherAgenda = null;
    }
    if (changes.status === "fulfilled") state.changes = changes.value;
    if (settings.status === "fulfilled") applySettings(settings.value);
    if (state.currentScreen === "main" && state.schedule) renderMain();
  }

  async function boot() {
    try {
      const [schedule, changes] = await Promise.all([api("schedule"), api("changes")]);
      document.getElementById("schedule-load-error").hidden = true;
      state.schedule = schedule;
      state.changes = changes;

      // Шаринг расписания по ссылке: ?group=... / ?teacher=... / ?room=... побеждает сохранённый
      // выбор, чтобы ссылка, переданная другому человеку, всегда открывала именно то, что в ней указано.
      const params = new URLSearchParams(location.search);
      const start = notificationStart();
      const linkGroup = params.get("group") || (start?.scope === "group" && typeof start.target === "string" ? start.target : null);
      const linkTeacher = params.get("teacher") || (start?.scope === "teacher" && typeof start.target === "string" ? start.target : null);
      const linkRoom = params.get("room");
      const role = linkGroup ? "student" : linkTeacher ? "teacher" : linkRoom ? "room" : localStorage.getItem("role");
      const savedGroup = linkGroup || localStorage.getItem("selectedGroup");
      const savedTeacher = linkTeacher || localStorage.getItem("selectedTeacher");
      const savedRoom = linkRoom || localStorage.getItem("selectedRoom");

      if (role === "student" && savedGroup && schedule.groups[savedGroup]) {
        state.role = "student";
        state.selectedGroup = savedGroup;
        localStorage.setItem("role", "student");
        localStorage.setItem("selectedGroup", savedGroup);
        showScreen("main");
        renderMain();
      } else if (role === "teacher" && savedTeacher) {
        state.role = "teacher";
        state.selectedTeacher = savedTeacher;
        localStorage.setItem("role", "teacher");
        localStorage.setItem("selectedTeacher", savedTeacher);
        showScreen("main");
        renderMain();
      } else if (role === "room" && savedRoom) {
        state.role = "room";
        state.selectedRoom = savedRoom;
        localStorage.setItem("role", "room");
        localStorage.setItem("selectedRoom", savedRoom);
        showScreen("main");
        renderMain();
      } else {
        showScreen("role");
      }
      if (start !== undefined) void openNotifications();
    } catch (e) {
      console.error(e);
      document.getElementById("schedule-load-error").hidden = false;
    }
  }

  void api("week").then((settings) => {
    applySettings(settings);
    if (state.currentScreen === "main" && state.schedule) renderMain();
  }).catch(console.error);
  void boot();
  setInterval(() => {
    void (state.schedule ? refreshSchedule() : boot()).catch(console.error);
  }, 90000);
})();
