import React, { useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";

const STORAGE_KEY = "ultimate-habit-app-v1";

const themes = {
  violet: {
    accent: "#6d5efc",
    accent2: "#8b5cf6",
    bg1: "#eef2ff",
    bg2: "#fdf2f8"
  },
  ocean: {
    accent: "#0ea5e9",
    accent2: "#06b6d4",
    bg1: "#ecfeff",
    bg2: "#eff6ff"
  },
  sunset: {
    accent: "#f97316",
    accent2: "#ec4899",
    bg1: "#fff7ed",
    bg2: "#fdf2f8"
  }
};

const challengeTemplates = [
  { id: "c1", name: "21 Days Challenge", goal: "Complete any 1 task for 21 days" },
  { id: "c2", name: "No Phone Challenge", goal: "Reduce distractions and finish focus tasks" }
];

const colorClasses = [
  "taskColor1",
  "taskColor2",
  "taskColor3",
  "taskColor4",
  "taskColor5",
  "taskColor6"
];

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function createEmptyTask(idx = 0) {
  return {
    id: Date.now() + Math.random(),
    title: "",
    notes: "",
    subtasks: [],
    repeatType: "daily",
    customRepeatDays: 2,
    completed: false,
    streak: 0,
    lastCompletedDate: "",
    createdAt: todayKey(),
    completedHistory: [],
    reminderTime: "",
    locationReminder: "",
    colorClass: colorClasses[idx % colorClasses.length]
  };
}

function loadData() {
  const today = todayKey();
  const fallback = {
    profile: {
      name: "",
      username: "",
      bio: "",
      email: "",
      phone: "",
      photo: ""
    },
    tasks: [],
    challenges: challengeTemplates.map((c) => ({
      ...c,
      joined: false,
      progress: 0
    })),
    settings: {
      darkMode: false,
      theme: "violet"
    },
    gamification: {
      xp: 0,
      level: 1,
      dailyRewardClaimedDate: ""
    },
    ui: {
      selectedTaskId: null
    },
    lastOpenDate: today
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);

    const safe = {
      ...fallback,
      ...parsed,
      profile: { ...fallback.profile, ...(parsed.profile || {}) },
      settings: { ...fallback.settings, ...(parsed.settings || {}) },
      gamification: { ...fallback.gamification, ...(parsed.gamification || {}) },
      ui: { ...fallback.ui, ...(parsed.ui || {}) },
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      challenges: Array.isArray(parsed.challenges)
        ? parsed.challenges
        : fallback.challenges
    };

    if (safe.lastOpenDate !== today) {
      safe.tasks = safe.tasks.map((task) => ({
        ...task,
        completed: false
      }));
      safe.lastOpenDate = today;
    }

    return safe;
  } catch (e) {
    return fallback;
  }
}

function getLevelFromXP(xp) {
  return Math.floor(xp / 100) + 1;
}

function buildBadges(tasks) {
  const maxStreak = tasks.reduce((m, t) => Math.max(m, t.streak || 0), 0);
  return [
    { id: "b1", label: "Starter", unlocked: tasks.length >= 1 },
    { id: "b2", label: "7 Day Streak", unlocked: maxStreak >= 7 },
    { id: "b3", label: "30 Day Streak", unlocked: maxStreak >= 30 },
    { id: "b4", label: "Task Master", unlocked: tasks.filter((t) => t.completedHistory?.length >= 10).length >= 1 }
  ];
}

function matchesRepeat(task, date = new Date()) {
  if (task.repeatType === "daily") return true;
  if (task.repeatType === "weekly") {
    return date.getDay() === new Date(task.createdAt).getDay();
  }
  if (task.repeatType === "custom") {
    const created = new Date(task.createdAt);
    const diffDays = Math.floor((date - created) / (1000 * 60 * 60 * 24));
    return diffDays % Math.max(1, Number(task.customRepeatDays || 1)) === 0;
  }
  return true;
}

function App() {
  const [data, setData] = useState(loadData);
  const [taskDraft, setTaskDraft] = useState(createEmptyTask());
  const [editingId, setEditingId] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [filter, setFilter] = useState("today");
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    taskId: null
  });
  const fileInputRef = useRef(null);
  const reminderTimers = useRef([]);
  const recognitionRef = useRef(null);

  const today = todayKey();
  const theme = themes[data.settings.theme] || themes.violet;

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", theme.accent);
    document.documentElement.style.setProperty("--accent2", theme.accent2);
    document.documentElement.style.setProperty("--bg1", theme.bg1);
    document.documentElement.style.setProperty("--bg2", theme.bg2);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...data,
        lastOpenDate: today
      })
    );
  }, [data, today]);

  useEffect(() => {
    const close = () => setContextMenu((p) => ({ ...p, visible: false }));
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  useEffect(() => {
    reminderTimers.current.forEach(clearTimeout);
    reminderTimers.current = [];

    data.tasks.forEach((task) => {
      if (!task.reminderTime) return;
      const [hh, mm] = task.reminderTime.split(":").map(Number);
      if (Number.isNaN(hh) || Number.isNaN(mm)) return;

      const now = new Date();
      const target = new Date();
      target.setHours(hh, mm, 0, 0);

      if (target <= now) return;

      const timer = setTimeout(() => {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(`Reminder: ${task.title}`, {
            body: task.notes || "Time to complete your task"
          });
        } else {
          alert(`Reminder: ${task.title}`);
        }
      }, target - now);

      reminderTimers.current.push(timer);
    });

    return () => {
      reminderTimers.current.forEach(clearTimeout);
      reminderTimers.current = [];
    };
  }, [data.tasks]);

  const filteredTasks = useMemo(() => {
    const now = new Date();
    if (filter === "all") return data.tasks;
    if (filter === "today") return data.tasks.filter((t) => matchesRepeat(t, now));
    if (filter === "completed") return data.tasks.filter((t) => t.completed);
    if (filter === "pending") return data.tasks.filter((t) => !t.completed);
    return data.tasks;
  }, [data.tasks, filter]);

  const completedCount = data.tasks.filter((t) => t.completed).length;
  const progress = data.tasks.length ? Math.round((completedCount / data.tasks.length) * 100) : 0;

  const badges = useMemo(() => buildBadges(data.tasks), [data.tasks]);

  const weeklyData = useMemo(() => {
    const arr = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;
      const count = data.tasks.filter((t) => (t.completedHistory || []).includes(key)).length;
      arr.push({ label: formatDateLabel(key), value: count });
    }
    return arr;
  }, [data.tasks]);

  const monthlyData = useMemo(() => {
    const arr = [];
    for (let i = 3; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const month = d.getMonth();
      const year = d.getFullYear();
      const count = data.tasks.reduce((acc, t) => {
        const hit = (t.completedHistory || []).filter((h) => {
          const hd = new Date(h);
          return hd.getMonth() === month && hd.getFullYear() === year;
        }).length;
        return acc + hit;
      }, 0);
      arr.push({
        label: d.toLocaleDateString(undefined, { month: "short" }),
        value: count
      });
    }
    return arr;
  }, [data.tasks]);

  const consistencyMessage = useMemo(() => {
    const possible = weeklyData.length * Math.max(1, data.tasks.length || 1);
    const done = weeklyData.reduce((a, b) => a + b.value, 0);
    const pct = data.tasks.length ? Math.min(100, Math.round((done / possible) * 100 * 7)) : 0;
    return `इस हफ्ते तुम ${pct}% consistent रहे`;
  }, [weeklyData, data.tasks.length]);

  const claimDailyReward = () => {
    if (data.gamification.dailyRewardClaimedDate === today) return;
    const xp = data.gamification.xp + 20;
    setData((prev) => ({
      ...prev,
      gamification: {
        xp,
        level: getLevelFromXP(xp),
        dailyRewardClaimedDate: today
      }
    }));
  };

  const updateProfile = (field, value) => {
    setData((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        [field]: value
      }
    }));
  };

  const onPhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      updateProfile("photo", reader.result);
    };
    reader.readAsDataURL(file);
  };

  const resetDraft = () => {
    setTaskDraft(createEmptyTask(data.tasks.length));
    setEditingId(null);
  };

  const saveTask = () => {
    if (!taskDraft.title.trim()) return;

    if (editingId) {
      setData((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) =>
          t.id === editingId
            ? {
                ...t,
                ...taskDraft,
                id: editingId
              }
            : t
        )
      }));
    } else {
      const newTask = {
        ...taskDraft,
        id: Date.now() + Math.random(),
        createdAt: today
      };
      setData((prev) => ({
        ...prev,
        tasks: [...prev.tasks, newTask]
      }));
    }

    resetDraft();
  };

  const editTask = (taskId) => {
    const task = data.tasks.find((t) => t.id === taskId);
    if (!task) return;
    setTaskDraft({
      ...task,
      subtasks: Array.isArray(task.subtasks) ? task.subtasks : []
    });
    setEditingId(taskId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteTask = (taskId) => {
    setData((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((t) => t.id !== taskId)
    }));
    if (editingId === taskId) resetDraft();
  };

  const toggleTask = (taskId) => {
    setData((prev) => {
      let xpGain = 0;
      const tasks = prev.tasks.map((task) => {
        if (task.id !== taskId) return task;

        const willComplete = !task.completed;
        let streak = task.streak || 0;
        let completedHistory = Array.isArray(task.completedHistory)
          ? [...task.completedHistory]
          : [];

        if (willComplete) {
          if (task.lastCompletedDate !== today) {
            const last = task.lastCompletedDate ? new Date(task.lastCompletedDate) : null;
            const td = new Date(today);
            if (last) {
              const diff = Math.round((td - last) / (1000 * 60 * 60 * 24));
              streak = diff === 1 ? streak + 1 : 1;
            } else {
              streak = 1;
            }
          }
          if (!completedHistory.includes(today)) completedHistory.push(today);
          xpGain += 10;
        }

        return {
          ...task,
          completed: willComplete,
          streak: willComplete ? streak : task.streak,
          lastCompletedDate: willComplete ? today : task.lastCompletedDate,
          completedHistory
        };
      });

      const xp = prev.gamification.xp + xpGain;
      return {
        ...prev,
        tasks,
        gamification: {
          ...prev.gamification,
          xp,
          level: getLevelFromXP(xp)
        }
      };
    });
  };

  const addSubtask = () => {
    setTaskDraft((prev) => ({
      ...prev,
      subtasks: [...prev.subtasks, { id: Date.now() + Math.random(), text: "", done: false }]
    }));
  };

  const updateSubtask = (subId, field, value) => {
    setTaskDraft((prev) => ({
      ...prev,
      subtasks: prev.subtasks.map((s) => (s.id === subId ? { ...s, [field]: value } : s))
    }));
  };

  const removeSubtask = (subId) => {
    setTaskDraft((prev) => ({
      ...prev,
      subtasks: prev.subtasks.filter((s) => s.id !== subId)
    }));
  };

  const joinChallenge = (id) => {
    setData((prev) => ({
      ...prev,
      challenges: prev.challenges.map((c) =>
        c.id === id ? { ...c, joined: !c.joined } : c
      )
    }));
  };

  const createCustomChallenge = () => {
    const name = prompt("Challenge name?");
    if (!name) return;
    const goal = prompt("Challenge goal?");
    if (!goal) return;

    setData((prev) => ({
      ...prev,
      challenges: [
        ...prev.challenges,
        { id: Date.now().toString(), name, goal, joined: true, progress: 0 }
      ]
    }));
  };

  const requestNotifications = async () => {
    if (!("Notification" in window)) {
      alert("This browser does not support notifications.");
      return;
    }
    const permission = await Notification.requestPermission();
    alert(`Notification permission: ${permission}`);
  };

  const checkLocationReminder = () => {
    const tasksWithLocation = data.tasks.filter((t) => t.locationReminder.trim());
    if (!tasksWithLocation.length) {
      alert("No location reminder found.");
      return;
    }

    if (!navigator.geolocation) {
      alert("Geolocation not supported.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      () => {
        const list = tasksWithLocation.map((t) => `• ${t.title} → ${t.locationReminder}`).join("\n");
        alert(`Location reminder check:\n${list}\n\nApp open होने पर basic check काम करेगा.`);
      },
      () => alert("Location permission denied.")
    );
  };

  const startVoiceInput = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("Voice input not supported in this browser.");
      return;
    }

    const rec = new SR();
    recognitionRef.current = rec;
    rec.lang = "hi-IN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      const text = event.results[0][0].transcript || "";
      setTaskDraft((prev) => ({ ...prev, title: text }));
    };

    rec.start();
  };

  const shareProgress = async () => {
    const text = `I completed ${data.tasks.reduce(
      (m, t) => Math.max(m, t.streak || 0),
      0
    )} days streak 🔥 on my habit tracker!`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "My Progress",
          text
        });
      } catch (e) {}
    } else {
      navigator.clipboard.writeText(text);
      alert("Share text copied:\n" + text);
    }
  };

  const maxWeekly = Math.max(1, ...weeklyData.map((d) => d.value));
  const maxMonthly = Math.max(1, ...monthlyData.map((d) => d.value));

  return (
    <div className={`app ${data.settings.darkMode ? "dark" : ""}`}>
      <div className="container">
        <header className="hero">
          <div>
            <p className="eyebrow">Gamified productivity app</p>
            <h1>🔥 FocusQuest</h1>
            <p className="heroSub">
              Daily tasks, habits, streaks, rewards, reminders, analytics, challenges.
            </p>
          </div>

          <div className="heroActions">
            <button className="secondaryBtn" onClick={() => setShowHelp(true)}>
              Help
            </button>
            <button className="secondaryBtn" onClick={shareProgress}>
              Share
            </button>
          </div>
        </header>

        <section className="grid2">
          <div className="panel">
            <div className="sectionHead">
              <h2>Profile</h2>
            </div>

            <div className="profileWrap">
              <div className="photoCol">
                {data.profile.photo ? (
                  <img src={data.profile.photo} alt="profile" className="profilePhoto" />
                ) : (
                  <div className="profilePhoto placeholder">+</div>
                )}
                <button className="secondaryBtn" onClick={() => fileInputRef.current?.click()}>
                  Upload Photo
                </button>
                <input
                  ref={fileInputRef}
                  className="hidden"
                  type="file"
                  accept="image/*"
                  onChange={onPhotoUpload}
                />
              </div>

              <div className="profileFields">
                <input
                  placeholder="Name"
                  value={data.profile.name}
                  onChange={(e) => updateProfile("name", e.target.value)}
                />
                <input
                  placeholder="Username"
                  value={data.profile.username}
                  onChange={(e) => updateProfile("username", e.target.value)}
                />
                <input
                  placeholder="Bio"
                  value={data.profile.bio}
                  onChange={(e) => updateProfile("bio", e.target.value)}
                />
                <input
                  placeholder="Email"
                  value={data.profile.email}
                  onChange={(e) => updateProfile("email", e.target.value)}
                />
                <input
                  placeholder="Phone"
                  value={data.profile.phone}
                  onChange={(e) => updateProfile("phone", e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="sectionHead">
              <h2>Theme & Rewards</h2>
            </div>

            <div className="settingsRow">
              <label className="toggleRow">
                <input
                  type="checkbox"
                  checked={data.settings.darkMode}
                  onChange={(e) =>
                    setData((prev) => ({
                      ...prev,
                      settings: { ...prev.settings, darkMode: e.target.checked }
                    }))
                  }
                />
                <span>Dark Mode</span>
              </label>

              <select
                value={data.settings.theme}
                onChange={(e) =>
                  setData((prev) => ({
                    ...prev,
                    settings: { ...prev.settings, theme: e.target.value }
                  }))
                }
              >
                <option value="violet">Violet</option>
                <option value="ocean">Ocean</option>
                <option value="sunset">Sunset</option>
              </select>

              <button className="secondaryBtn" onClick={claimDailyReward}>
                Daily Reward
              </button>
            </div>

            <div className="statsGrid">
              <div className="statCard">
                <span>XP</span>
                <strong>{data.gamification.xp}</strong>
              </div>
              <div className="statCard">
                <span>Level</span>
                <strong>{data.gamification.level}</strong>
              </div>
              <div className="statCard">
                <span>Total Tasks</span>
                <strong>{data.tasks.length}</strong>
              </div>
              <div className="statCard">
                <span>Completed</span>
                <strong>{completedCount}</strong>
              </div>
            </div>

            <div className="progressWrap">
              <div className="progressLabel">Progress {progress}%</div>
              <div className="progressBar">
                <div className="progressFill" style={{ width: `${progress}%` }} />
              </div>
            </div>

            <div className="badgeWrap">
              {badges.map((b) => (
                <div key={b.id} className={`badge ${b.unlocked ? "badgeOn" : ""}`}>
                  {b.label}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="sectionHead">
            <h2>Create Task / Habit</h2>
            <div className="miniActions">
              <button className="secondaryBtn" onClick={startVoiceInput}>
                Voice Input
              </button>
              <button className="secondaryBtn" onClick={requestNotifications}>
                Enable Reminders
              </button>
              <button className="secondaryBtn" onClick={checkLocationReminder}>
                Check Location
              </button>
            </div>
          </div>

          <div className="taskEditor">
            <div className="editorGrid">
              <input
                placeholder="Task title"
                value={taskDraft.title}
                onChange={(e) => setTaskDraft((p) => ({ ...p, title: e.target.value }))}
              />
              <select
                value={taskDraft.repeatType}
                onChange={(e) => setTaskDraft((p) => ({ ...p, repeatType: e.target.value }))}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="custom">Custom Repeat</option>
              </select>

              {taskDraft.repeatType === "custom" && (
                <input
                  type="number"
                  min="1"
                  placeholder="Repeat every X days"
                  value={taskDraft.customRepeatDays}
                  onChange={(e) =>
                    setTaskDraft((p) => ({ ...p, customRepeatDays: e.target.value }))
                  }
                />
              )}

              <input
                type="time"
                value={taskDraft.reminderTime}
                onChange={(e) => setTaskDraft((p) => ({ ...p, reminderTime: e.target.value }))}
              />

              <input
                placeholder='Location reminder e.g. "घर पहुँचते ही पढ़ाई"'
                value={taskDraft.locationReminder}
                onChange={(e) =>
                  setTaskDraft((p) => ({ ...p, locationReminder: e.target.value }))
                }
              />
            </div>

            <textarea
              rows="4"
              placeholder="Notes..."
              value={taskDraft.notes}
              onChange={(e) => setTaskDraft((p) => ({ ...p, notes: e.target.value }))}
            />

            <div className="subtaskHead">
              <h3>Checklist / Subtasks</h3>
              <button className="secondaryBtn" onClick={addSubtask}>
                Add Subtask
              </button>
            </div>

            <div className="subtaskList">
              {taskDraft.subtasks.map((s) => (
                <div key={s.id} className="subtaskRow">
                  <input
                    type="checkbox"
                    checked={s.done}
                    onChange={(e) => updateSubtask(s.id, "done", e.target.checked)}
                  />
                  <input
                    placeholder="Subtask"
                    value={s.text}
                    onChange={(e) => updateSubtask(s.id, "text", e.target.value)}
                  />
                  <button className="dangerBtn" onClick={() => removeSubtask(s.id)}>
                    ×
                  </button>
                </div>
              ))}
            </div>

            <div className="actionRow">
              <button className="primaryBtn" onClick={saveTask}>
                {editingId ? "Update Task" : "Add Task"}
              </button>
              <button className="secondaryBtn" onClick={resetDraft}>
                Clear
              </button>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="sectionHead">
            <h2>Your Tasks</h2>

            <div className="miniActions">
              <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="today">Today</option>
                <option value="all">All</option>
                <option value="completed">Completed</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>

          <div className="taskGrid">
            {filteredTasks.length === 0 ? (
              <div className="emptyCard">No tasks yet.</div>
            ) : (
              filteredTasks.map((task) => (
                <div
                  key={task.id}
                  className={`taskCard ${task.colorClass} ${task.completed ? "taskCompleted" : ""}`}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({
                      visible: true,
                      x: e.clientX,
                      y: e.clientY,
                      taskId: task.id
                    });
                  }}
                >
                  <div className="taskTop">
                    <div className="taskTopLeft">
                      <label className="checkWrap">
                        <input
                          type="checkbox"
                          checked={task.completed}
                          onChange={() => toggleTask(task.id)}
                        />
                        <span className="customCheck"></span>
                      </label>
                      <span className="pill">{task.completed ? "Completed" : "Pending"}</span>
                    </div>

                    <div className="taskBtns">
                      <button className="miniBtn" onClick={() => editTask(task.id)}>
                        Edit
                      </button>
                      <button className="miniBtn dangerMini" onClick={() => deleteTask(task.id)}>
                        ×
                      </button>
                    </div>
                  </div>

                  <div className="taskTitle">{task.title}</div>

                  {task.notes ? <div className="taskNotes">{task.notes}</div> : null}

                  {task.subtasks?.length ? (
                    <div className="subtaskPreview">
                      {task.subtasks.map((s) => (
                        <div key={s.id} className="subtaskPreviewRow">
                          <span>{s.done ? "✅" : "⬜"}</span>
                          <span>{s.text || "Untitled subtask"}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="taskMeta">
                    <span>Repeat: {task.repeatType}</span>
                    <span>🔥 {task.streak}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="grid2">
          <div className="panel">
            <div className="sectionHead">
              <h2>Progress Analytics</h2>
            </div>
            <p className="consistency">{consistencyMessage}</p>

            <h3 className="chartTitle">Weekly</h3>
            <div className="chart">
              {weeklyData.map((d) => (
                <div key={d.label} className="barCol">
                  <div className="barTrack">
                    <div
                      className="barFill"
                      style={{ height: `${(d.value / maxWeekly) * 100}%` }}
                    />
                  </div>
                  <span className="barLabel">{d.label}</span>
                </div>
              ))}
            </div>

            <h3 className="chartTitle">Monthly</h3>
            <div className="chart">
              {monthlyData.map((d) => (
                <div key={d.label} className="barCol">
                  <div className="barTrack">
                    <div
                      className="barFill alt"
                      style={{ height: `${(d.value / maxMonthly) * 100}%` }}
                    />
                  </div>
                  <span className="barLabel">{d.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="sectionHead">
              <h2>Challenge System</h2>
              <button className="secondaryBtn" onClick={createCustomChallenge}>
                Create Challenge
              </button>
            </div>

            <div className="challengeList">
              {data.challenges.map((c) => (
                <div key={c.id} className="challengeCard">
                  <div>
                    <strong>{c.name}</strong>
                    <p>{c.goal}</p>
                  </div>
                  <button className={c.joined ? "secondaryBtn" : "primaryBtn"} onClick={() => joinChallenge(c.id)}>
                    {c.joined ? "Joined" : "Join"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {contextMenu.visible && (
          <div className="contextMenu" style={{ top: contextMenu.y, left: contextMenu.x }}>
            <button onClick={() => toggleTask(contextMenu.taskId)}>Complete / Undo</button>
            <button onClick={() => editTask(contextMenu.taskId)}>Edit</button>
            <button onClick={() => deleteTask(contextMenu.taskId)}>Delete</button>
          </div>
        )}

        {showHelp && (
          <div className="overlay" onClick={() => setShowHelp(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>Help Center</h2>
              <ul>
                <li>Checkbox से task complete करो</li>
                <li>Right click से quick menu खुलता है</li>
                <li>Voice Input browser support पर depend करता है</li>
                <li>Time reminder app open/tab active होने पर best काम करता है</li>
                <li>Location reminder basic है, background geofencing नहीं</li>
                <li>Email / phone fields profile info हैं, real auth नहीं</li>
              </ul>
              <button className="primaryBtn" onClick={() => setShowHelp(false)}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;