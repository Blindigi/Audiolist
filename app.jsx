import { jsxDEV } from "react/jsx-dev-runtime";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
const STORE_KEY = "audiolist.v1";
function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
  }
  return [];
}
function saveStore(lists) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(lists));
  } catch (e) {
  }
}
function fmt(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
const peakCache = /* @__PURE__ */ new Map();
function peaks(id, n) {
  if (peakCache.has(id)) return peakCache.get(id);
  let seed = 0;
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) % 1e5;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483647) / 2147483647;
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(0.2 + rnd() * 0.8);
  peakCache.set(id, arr);
  return arr;
}
function App() {
  const [lists, setLists] = useState(loadStore);
  const [openId, setOpenId] = useState(null);
  const [newName, setNewName] = useState("");
  const [recording, setRecording] = useState(false);
  const [recTicks, setRecTicks] = useState(0);
  const [playingId, setPlayingId] = useState(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const intervalRef = useRef(null);
  const playerRef = useRef(null);
  useEffect(() => saveStore(lists), [lists]);
  useEffect(() => {
    if (openId) {
      stopRecorder();
      stopAudio();
      setPlayingId(null);
    }
  }, [openId]);
  const openList = lists.find((l) => l.id === openId) || null;
  function persist(mutate) {
    const next = loadStore();
    mutate(next);
    setLists(next);
  }
  async function startRecorder() {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      alert("Microphone unavailable.");
      return;
    }
    const rec = new MediaRecorder(stream);
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.start();
    recorderRef.current = { rec, stream };
    setRecTicks(0);
    setRecording(true);
    intervalRef.current = setInterval(() => setRecTicks((t) => t + 1), 1e3);
  }
  function stopRecorder() {
    setRecording(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const hand = recorderRef.current;
    recorderRef.current = null;
    if (!hand || !openList) return;
    hand.rec.onstop = () => {
      try {
        hand.stream.getTracks().forEach((t) => t.stop());
      } catch (e) {
      }
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      if (!blob.size) return;
      const url = URL.createObjectURL(blob);
      const reader = new FileReader();
      reader.onloadend = () => {
        URL.revokeObjectURL(url);
        const id = crypto.randomUUID();
        const idx = openList.items.length + 1;
        const duration = Math.max(1, recTicks);
        const item = {
          id,
          name: `Recording ${String(idx).padStart(2, "0")}`,
          url: reader.result,
          duration
        };
        persist((next) => {
          const l = next.find((x) => x.id === openList.id);
          if (l) l.items.push(item);
        });
        setPlayingId(null);
      };
      reader.readAsDataURL(blob);
    };
    hand.rec.stop();
    setPlayingId(null);
  }
  function stopAudio() {
    if (playerRef.current) {
      try {
        playerRef.current.pause();
        playerRef.current.src = "";
      } catch (e) {
      }
      playerRef.current = null;
    }
    setPlayingId(null);
  }
  async function togglePlay(itemId) {
    const it = openList.items.find((x) => x.id === itemId);
    if (!it) return;
    if (playingId === itemId) {
      stopAudio();
      return;
    }
    stopAudio();
    const el = new Audio();
    el.src = it.url;
    el.addEventListener("ended", () => setPlayingId(null));
    playerRef.current = el;
    setPlayingId(itemId);
    try {
      el.play();
    } catch (e) {
    }
  }
  const renameItem = (itemId, name) => persist((next) => {
    const l = next.find((x) => x.id === openList.id);
    const i = l.items.find((x) => x.id === itemId);
    i.name = name;
  });
  const deleteItem = (itemId) => persist((next) => {
    const l = next.find((x) => x.id === openList.id);
    l.items = l.items.filter((x) => x.id !== itemId);
  });
  const moveItem = (itemId, dir) => {
    const l = lists.find((x) => x.id === openList.id);
    const i = l.items.findIndex((x) => x.id === itemId);
    const t = i + dir;
    if (i < 0 || t < 0 || t >= l.items.length) return;
    persist((next) => {
      const nl = next.find((x) => x.id === openList.id);
      const [it] = nl.items.splice(i, 1);
      nl.items.splice(t, 0, it);
    });
  };
  const moveItemToList = (itemId, targetId) => {
    if (targetId === openList.id) return;
    persist((next) => {
      const src = next.find((x) => x.id === openList.id);
      const i = src.items.findIndex((x) => x.id === itemId);
      if (i < 0) return;
      const [it] = src.items.splice(i, 1);
      const tgt = next.find((x) => x.id === targetId);
      if (tgt) tgt.items.push(it);
    });
  };
  const createList = () => {
    const name = newName.trim();
    if (!name) return;
    const id = crypto.randomUUID();
    persist((next) => next.push({ id, name, items: [] }));
    setNewName("");
    setOpenId(id);
  };
  if (!openList) {
    return /* @__PURE__ */ jsxDEV("div", { className: "app", children: [
      /* @__PURE__ */ jsxDEV("div", { className: "topbar", children: [
        /* @__PURE__ */ jsxDEV("h1", { children: "Audiolist" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 212,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("span", { className: "count", "aria-label": `${lists.length} lists`, children: lists.length }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 213,
          columnNumber: 11
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 211,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("main", { className: "home", children: [
        lists.length === 0 && /* @__PURE__ */ jsxDEV("p", { className: "emptyLists", children: "Make a list, then record your voice notes into it." }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 217,
          columnNumber: 13
        }, this),
        lists.map((l) => /* @__PURE__ */ jsxDEV("button", { className: "listCard", onClick: () => setOpenId(l.id), children: [
          /* @__PURE__ */ jsxDEV("span", { className: "name", children: l.name }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 221,
            columnNumber: 15
          }, this),
          /* @__PURE__ */ jsxDEV("span", { className: "meta", children: [
            l.items.length,
            " recording",
            l.items.length === 1 ? "" : "s"
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 222,
            columnNumber: 15
          }, this)
        ] }, l.id, true, {
          fileName: "<stdin>",
          lineNumber: 220,
          columnNumber: 13
        }, this)),
        /* @__PURE__ */ jsxDEV("div", { className: "newListRow", children: [
          /* @__PURE__ */ jsxDEV("label", { className: "sr-only", htmlFor: "newListName", children: "List name" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 228,
            columnNumber: 13
          }, this),
          /* @__PURE__ */ jsxDEV(
            "input",
            {
              id: "newListName",
              placeholder: "List name\u2026",
              value: newName,
              onChange: (e) => setNewName(e.target.value),
              onKeyDown: (e) => e.key === "Enter" && createList()
            },
            void 0,
            false,
            {
              fileName: "<stdin>",
              lineNumber: 229,
              columnNumber: 13
            },
            this
          ),
          /* @__PURE__ */ jsxDEV("button", { onClick: createList, "aria-label": "Add list", children: "\uFF0B" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 236,
            columnNumber: 13
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 227,
          columnNumber: 11
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 215,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 210,
      columnNumber: 7
    }, this);
  }
  return /* @__PURE__ */ jsxDEV("div", { className: "app recording-app", children: [
    /* @__PURE__ */ jsxDEV("div", { className: "topbar", children: [
      /* @__PURE__ */ jsxDEV("button", { className: "back", onClick: () => setOpenId(null), "aria-label": "Back to lists", children: "\u2039" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 247,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("h1", { children: openList.name }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 248,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("span", { className: "count", "aria-label": `${openList.items.length} recordings`, children: openList.items.length }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 249,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 246,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDEV("main", { className: "listItems", children: [
      openList.items.length === 0 && /* @__PURE__ */ jsxDEV("p", { className: "emptyList", children: "Tap the button below and speak to add a voice note." }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 253,
        columnNumber: 11
      }, this),
      openList.items.map((it, idx) => {
        const active = playingId === it.id;
        const others = lists.filter((l) => l.id !== openList.id);
        return /* @__PURE__ */ jsxDEV("div", { className: "item", "aria-current": active ? "true" : void 0, children: [
          /* @__PURE__ */ jsxDEV("div", { className: "row1", children: [
            /* @__PURE__ */ jsxDEV(
              "button",
              {
                className: "play",
                onClick: () => togglePlay(it.id),
                "aria-label": active ? `Pause ${it.name}` : `Play ${it.name}`,
                "aria-pressed": active,
                children: active ? "\u275A\u275A" : "\u25B6"
              },
              void 0,
              false,
              {
                fileName: "<stdin>",
                lineNumber: 261,
                columnNumber: 17
              },
              this
            ),
            /* @__PURE__ */ jsxDEV("label", { className: "sr-only", htmlFor: `name-${it.id}`, children: "Rename recording" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 269,
              columnNumber: 17
            }, this),
            /* @__PURE__ */ jsxDEV(
              "input",
              {
                id: `name-${it.id}`,
                className: "nameInput",
                value: it.name,
                onChange: (e) => renameItem(it.id, e.target.value)
              },
              void 0,
              false,
              {
                fileName: "<stdin>",
                lineNumber: 270,
                columnNumber: 17
              },
              this
            ),
            /* @__PURE__ */ jsxDEV(
              "button",
              {
                className: "delete",
                onClick: () => deleteItem(it.id),
                "aria-label": `Delete ${it.name}`,
                children: "\u2715"
              },
              void 0,
              false,
              {
                fileName: "<stdin>",
                lineNumber: 276,
                columnNumber: 17
              },
              this
            )
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 260,
            columnNumber: 15
          }, this),
          /* @__PURE__ */ jsxDEV("div", { className: "rowMove", children: [
            /* @__PURE__ */ jsxDEV(
              "button",
              {
                className: "move",
                onClick: () => moveItem(it.id, -1),
                disabled: idx === 0,
                "aria-label": `Move ${it.name} up`,
                children: "\u2191"
              },
              void 0,
              false,
              {
                fileName: "<stdin>",
                lineNumber: 283,
                columnNumber: 17
              },
              this
            ),
            /* @__PURE__ */ jsxDEV(
              "button",
              {
                className: "move",
                onClick: () => moveItem(it.id, 1),
                disabled: idx === openList.items.length - 1,
                "aria-label": `Move ${it.name} down`,
                children: "\u2193"
              },
              void 0,
              false,
              {
                fileName: "<stdin>",
                lineNumber: 289,
                columnNumber: 17
              },
              this
            ),
            others.length > 0 && /* @__PURE__ */ jsxDEV(
              "select",
              {
                className: "moveList",
                value: "",
                onChange: (e) => {
                  if (e.target.value) moveItemToList(it.id, e.target.value);
                },
                "aria-label": `Move ${it.name} to another list`,
                children: [
                  /* @__PURE__ */ jsxDEV("option", { value: "", disabled: true, children: "Move to list\u2026" }, void 0, false, {
                    fileName: "<stdin>",
                    lineNumber: 304,
                    columnNumber: 21
                  }, this),
                  others.map((l) => /* @__PURE__ */ jsxDEV("option", { value: l.id, children: l.name }, l.id, false, {
                    fileName: "<stdin>",
                    lineNumber: 306,
                    columnNumber: 23
                  }, this))
                ]
              },
              void 0,
              true,
              {
                fileName: "<stdin>",
                lineNumber: 296,
                columnNumber: 19
              },
              this
            )
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 282,
            columnNumber: 15
          }, this),
          /* @__PURE__ */ jsxDEV("div", { className: "wave", "aria-hidden": "true", children: peaks(it.id, 28).map((p, i) => {
            const h = Math.max(5, Math.round(p * 38));
            return /* @__PURE__ */ jsxDEV(
              "div",
              {
                style: {
                  width: 3,
                  height: h,
                  borderRadius: 2,
                  background: active ? "var(--accent)" : "var(--teal)",
                  opacity: active ? 0.4 + 0.6 * Math.abs(Math.sin(i + Date.now() / 120 % 1)) : 1
                }
              },
              i,
              false,
              {
                fileName: "<stdin>",
                lineNumber: 315,
                columnNumber: 21
              },
              this
            );
          }) }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 311,
            columnNumber: 15
          }, this),
          /* @__PURE__ */ jsxDEV("div", { className: "duration", "aria-hidden": "true", children: fmt(it.duration) }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 328,
            columnNumber: 15
          }, this)
        ] }, it.id, true, {
          fileName: "<stdin>",
          lineNumber: 259,
          columnNumber: 13
        }, this);
      })
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 251,
      columnNumber: 7
    }, this),
    recording && /* @__PURE__ */ jsxDEV("div", { className: "recIndicator", role: "status", children: [
      /* @__PURE__ */ jsxDEV("div", { className: "dot", "aria-hidden": "true" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 336,
        columnNumber: 11
      }, this),
      /* @__PURE__ */ jsxDEV("div", { className: "txt", children: [
        "Recording\u2026 ",
        fmt(recTicks)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 337,
        columnNumber: 11
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 335,
      columnNumber: 9
    }, this),
    /* @__PURE__ */ jsxDEV("div", { className: "dock", children: /* @__PURE__ */ jsxDEV(
      "button",
      {
        className: "recBtn" + (recording ? " recording" : ""),
        onClick: () => recording ? stopRecorder() : startRecorder(),
        "aria-label": recording ? "Stop recording" : "Start recording",
        children: "\u25CF"
      },
      void 0,
      false,
      {
        fileName: "<stdin>",
        lineNumber: 342,
        columnNumber: 9
      },
      this
    ) }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 341,
      columnNumber: 7
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 245,
    columnNumber: 5
  }, this);
}
const rootEl = document.getElementById("root");
if (rootEl) createRoot(rootEl).render(/* @__PURE__ */ jsxDEV(App, {}, void 0, false, {
  fileName: "<stdin>",
  lineNumber: 355,
  columnNumber: 39
}));
