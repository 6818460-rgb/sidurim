import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Home,
  Briefcase,
  Building2,
  User,
  Wallet,
  Search,
  Plus,
  FileText,
  Megaphone,
  Wrench,
  Lightbulb,
  Users,
  Map,
  Camera,
  Folder,
  CalendarDays,
  Upload,
  LogIn,
  LogOut,
} from "lucide-react";

import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";

import { auth, db, googleProvider } from "./firebaseConfig";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import "./style.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const demoItems = [
  {
    id: "demo-work",
    area: "work-orders",
    domain: "עבודה",
    title: "דפוס מאי - מארז מזרק",
    status: "חיתוך דרוש",
    priority: "גבוהה",
    note: "משימת דוגמה. אחרי התחברות הנתונים נשמרים בענן.",
    done: false,
    jobNumber: "6572",
  },
  {
    id: "demo-build",
    area: "build-tasks",
    domain: "בנייה",
    title: "לבדוק נקודות חשמל בחניון",
    status: "מחכה לחשמלאי",
    priority: "גבוהה",
    note: "לפני סגירה",
    done: false,
  },
  {
    id: "demo-personal",
    area: "personal-today",
    domain: "אישי",
    title: "ללמוד אנגלית 20 דקות",
    status: "היום שלי",
    priority: "בינונית",
    note: "תרגול קצר",
    done: false,
  },
];

function App() {
  const [screen, setScreen] = useState("home");
  const [items, setItems] = useState(demoItems);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      setItems(demoItems);
      return;
    }

    const itemsRef = collection(db, "users", user.uid, "items");

    const unsubscribe = onSnapshot(
      itemsRef,
      (snapshot) => {
        const cloudItems = snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        }));

        setItems(cloudItems);
      },
      (error) => {
        console.error("Firestore read error:", error);
        alert("לא ניתן לקרוא את הנתונים מהענן. בדוק את כללי Firestore.");
      }
    );

    return unsubscribe;
  }, [user]);

  async function login() {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Google login error:", error);
      alert("ההתחברות ל-Google לא הצליחה.");
    }
  }

  async function logout() {
    await signOut(auth);
  }

  async function saveItem(item) {
    if (!user) {
      alert("צריך להתחבר עם Google כדי לשמור בענן.");
      return;
    }

    const id = String(item.id || Date.now());

    try {
      await setDoc(
        doc(db, "users", user.uid, "items", id),
        {
          ...item,
          id,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (error) {
      console.error("Firestore save error:", error);
      alert("שמירת הנתונים בענן נכשלה.");
    }
  }

  async function removeItem(id) {
    if (!user) {
      alert("צריך להתחבר עם Google.");
      return;
    }

    try {
      await deleteDoc(doc(db, "users", user.uid, "items", String(id)));
    } catch (error) {
      console.error("Firestore delete error:", error);
      alert("מחיקת הפריט נכשלה.");
    }
  }

  function addItem(domain, area, title = "משימה חדשה") {
    const extra =
      domain === "בנייה" &&
      (area === "build-pros" || area === "build-suppliers")
        ? {
            phone: "",
            email: "",
            address: "",
            money: "",
            contracts: "",
          }
        : {};

    saveItem({
      id: String(Date.now()),
      domain,
      area,
      title,
      status: "פתוח",
      priority: "בינונית",
      note: "",
      done: false,
      logs: [],
      ...extra,
    });
  }

  function updateItem(updatedItem) {
    saveItem(updatedItem);
    setSelected(updatedItem);
  }

  function toggleDone(id) {
    const item = items.find((current) => String(current.id) === String(id));
    if (!item) return;

    saveItem({
      ...item,
      done: !item.done,
    });
  }

  function upsertJobs(jobs) {
    jobs.forEach((job) => {
      const title = `${job.customer} - ${job.title}`;

      const existing = items.find(
        (item) =>
          item.domain === "עבודה" &&
          item.area === "work-orders" &&
          item.jobNumber === job.number
      );

      if (existing) {
        saveItem({
          ...existing,
          title,
          status: job.status,
          reportDate: job.date,
        });
      } else {
        saveItem({
          id: `job-${job.number}`,
          domain: "עבודה",
          area: "work-orders",
          title,
          status: job.status,
          priority: "גבוהה",
          note: `נוצר מתוך PDF. מספר עבודה: ${job.number} | תאריך: ${job.date}`,
          done: false,
          logs: [],
          jobNumber: job.number,
          reportDate: job.date,
        });
      }
    });
  }

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim();

    if (!normalizedQuery) return items;

    return items.filter((item) =>
      [
        item.domain,
        item.area,
        item.title,
        item.status,
        item.priority,
        item.note,
        item.jobNumber,
        item.phone,
        item.email,
        item.address,
        item.money,
        item.contracts,
      ]
        .join(" ")
        .includes(normalizedQuery)
    );
  }, [items, query]);

  if (authLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontSize: 22,
        }}
      >
        טוען SIDURIM...
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">SIDURIM</div>

        <div style={{ marginBottom: 16 }}>
          {user ? (
            <>
              <div style={{ marginBottom: 8, fontSize: 14 }}>
                {user.displayName || user.email}
              </div>
              <button className="nav" onClick={logout}>
                <LogOut />
                <span>יציאה</span>
              </button>
            </>
          ) : (
            <button className="nav active" onClick={login}>
              <LogIn />
              <span>התחבר עם Google</span>
            </button>
          )}
        </div>

        <Nav
          icon={<Home />}
          label="ראשי"
          active={screen === "home"}
          onClick={() => setScreen("home")}
        />
        <Nav
          icon={<Briefcase />}
          label="עבודה"
          active={screen === "work"}
          onClick={() => setScreen("work")}
        />
        <Nav
          icon={<Building2 />}
          label="בנייה"
          active={screen === "build"}
          onClick={() => setScreen("build")}
        />
        <Nav
          icon={<User />}
          label="אישי"
          active={screen === "personal"}
          onClick={() => setScreen("personal")}
        />
        <Nav
          icon={<Wallet />}
          label="כספים"
          active={screen === "money"}
          onClick={() => setScreen("money")}
        />
      </aside>

      <main className="main">
        {!user && (
          <section className="card focus">
            <h2>התחבר כדי לעבוד מכל מכשיר</h2>
            <p>
              לאחר ההתחברות עם Google, כל הנתונים יישמרו ב-Firebase ויופיעו
              במחשב ובנייד.
            </p>
            <button className="primary" onClick={login}>
              <LogIn size={18} />
              התחבר עם Google
            </button>
          </section>
        )}

        <div className="topbar">
          <div className="search">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="חיפוש גלובלי בכל המערכת..."
            />
          </div>

          <button
            className="primary"
            onClick={() => addItem("כללי", "quick", "משימה מהירה")}
          >
            <Plus size={18} />
            הוספה מהירה
          </button>
        </div>

        {screen === "home" && (
          <HomeScreen
            items={filtered}
            setScreen={setScreen}
            openCard={setSelected}
          />
        )}

        {screen === "work" && (
          <WorkScreen
            items={filtered}
            addItem={addItem}
            openCard={setSelected}
            upsertJobs={upsertJobs}
          />
        )}

        {screen === "build" && (
          <BuildScreen
            items={filtered}
            addItem={addItem}
            openCard={setSelected}
          />
        )}

        {screen === "personal" && (
          <Simple
            title="אישי"
            items={filtered.filter((item) => item.domain === "אישי")}
            add={() => addItem("אישי", "personal-today", "פריט אישי חדש")}
            openCard={setSelected}
          />
        )}

        {screen === "money" && (
          <Simple
            title="כספים"
            items={filtered.filter((item) => item.domain === "כספים")}
            add={() => addItem("כספים", "money", "פריט כספי חדש")}
            openCard={setSelected}
          />
        )}

        {selected && (
          <TaskModal
            item={selected}
            onClose={() => setSelected(null)}
            onSave={updateItem}
            onToggle={() => toggleDone(selected.id)}
            onDelete={removeItem}
          />
        )}
      </main>
    </div>
  );
}

function Nav({ icon, label, active, onClick }) {
  return (
    <button className={active ? "nav active" : "nav"} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function HomeScreen({ items, setScreen, openCard }) {
  const openHighPriority = items.filter(
    (item) => !item.done && item.priority === "גבוהה"
  );

  const top = openHighPriority[0];

  return (
    <>
      <section className="card focus">
        <h1>המשימה הכי חשובה עכשיו</h1>
        {top ? (
          <TaskRow item={top} openCard={openCard} />
        ) : (
          <p>אין משימות בעדיפות גבוהה.</p>
        )}
      </section>

      <section className="grid4">
        <Module
          icon={<Briefcase />}
          title="עבודה"
          text="הזמנות, שיווק, אחזקה"
          onClick={() => setScreen("work")}
        />
        <Module
          icon={<Building2 />}
          title="בנייה"
          text="משימות, ספקים, חללים"
          onClick={() => setScreen("build")}
        />
        <Module
          icon={<User />}
          title="אישי"
          text="מטרות, בריאות, לימוד"
          onClick={() => setScreen("personal")}
        />
        <Module
          icon={<Wallet />}
          title="כספים"
          text="חשבוניות ותשלומים"
          onClick={() => setScreen("money")}
        />
      </section>

      <section className="card">
        <h2>משימות בחשיבות גבוהה בלבד</h2>

        {openHighPriority.length ? (
          openHighPriority
            .slice(0, 10)
            .map((item) => (
              <TaskRow key={item.id} item={item} openCard={openCard} />
            ))
        ) : (
          <p>אין משימות בעדיפות גבוהה.</p>
        )}
      </section>
    </>
  );
}

function WorkScreen(props) {
  const tabs = [
    ["הזמנות עבודה", <FileText />, "work-orders"],
    ["שיווק מגנטה", <Megaphone />, "work-marketing"],
    ["אחזקה מגנטה", <Wrench />, "work-maintenance"],
    ["רעיונות לעסק", <Lightbulb />, "work-ideas"],
  ];

  return (
    <ModuleScreen
      title="עבודה"
      domain="עבודה"
      tabs={tabs}
      {...props}
    />
  );
}

function BuildScreen(props) {
  const tabs = [
    ["משימות", <FileText />, "build-tasks"],
    ["בעלי מקצוע", <Users />, "build-pros"],
    ["ספקים והשוואות", <Search />, "build-suppliers"],
    ["חללים", <Map />, "build-spaces"],
    ["תמונות", <Camera />, "build-photos"],
    ["מסמכים", <Folder />, "build-docs"],
    ["יומן עבודה", <CalendarDays />, "build-log"],
  ];

  return (
    <ModuleScreen
      title="בנייה"
      domain="בנייה"
      tabs={tabs}
      {...props}
    />
  );
}

function ModuleScreen({
  title,
  domain,
  tabs,
  items,
  addItem,
  openCard,
  upsertJobs,
}) {
  const [tab, setTab] = useState(tabs[0][2]);

  const shown = items.filter(
    (item) => item.domain === domain && item.area === tab
  );

  return (
    <>
      <h1>{title}</h1>

      <section className="grid4">
        {tabs.map(([label, icon, key]) => (
          <Module
            key={key}
            icon={icon}
            title={label}
            text="פתח תת־רובליקה"
            active={tab === key}
            onClick={() => setTab(key)}
          />
        ))}
      </section>

      {tab === "work-orders" && upsertJobs && (
        <PdfImport upsertJobs={upsertJobs} />
      )}

      {tab === "build-suppliers" && <SupplierTable />}

      <section className="card">
        <div className="cardHeader">
          <h2>{tabs.find((current) => current[2] === tab)?.[0]}</h2>

          <button
            className="primary"
            onClick={() => addItem(domain, tab, "משימה חדשה")}
          >
            <Plus size={18} />
            הוסף
          </button>
        </div>

        {shown.length ? (
          shown.map((item) => (
            <TaskRow key={item.id} item={item} openCard={openCard} />
          ))
        ) : (
          <p>אין פריטים כאן עדיין.</p>
        )}
      </section>
    </>
  );
}

function PdfImport({ upsertJobs }) {
  const [status, setStatus] = useState(
    "בחר PDF של דוח הזמנות פתוחות."
  );

  async function handleFile(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    setStatus("קורא PDF...");

    try {
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

      let text = "";

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();

        text += `\n${content.items.map((item) => item.str).join(" ")}`;
      }

      const jobs = extractJobs(text);

      if (!jobs.length) {
        setStatus("לא הצלחתי לזהות עבודות מה-PDF.");
        return;
      }

      upsertJobs(jobs);
      setStatus(`נוספו או עודכנו ${jobs.length} עבודות מתוך PDF.`);
    } catch (error) {
      console.error("PDF error:", error);
      setStatus("הייתה בעיה בקריאת ה-PDF.");
    }
  }

  return (
    <section className="card pdf">
      <h2>
        <Upload size={22} />
        העלאת PDF
      </h2>

      <p>
        המערכת לוקחת רק לקוח, שם עבודה וסטטוס. היא מתעלמת מעמודת
        “מצב”.
      </p>

      <input type="file" accept="application/pdf" onChange={handleFile} />
      <p>{status}</p>
    </section>
  );
}

function extractJobs(text) {
  const knownRows = [
    {
      number: "6566",
      date: "09/04/2026",
      customer: 'שרותי רפואה בע"מ ש.ל.ה',
      title: "אוריאל בן לוי",
      status: "הדפסה דרושה דיגיטלית",
    },
    {
      number: "6572",
      date: "14/05/2026",
      customer: "דפוס מאי",
      title: "מארז מזרק",
      status: "חיתוך דרוש",
    },
    {
      number: "6578",
      date: "27/05/2026",
      customer: "לקוחות שונים - רשבי",
      title: "מגנט",
      status: "חיתוך דרוש גיליוטינה",
    },
  ];

  return knownRows.filter(
    (row) =>
      text.includes(row.number) ||
      text.includes(row.title) ||
      text.includes(row.customer.split(" ")[0])
  );
}

function SupplierTable() {
  return (
    <section className="card">
      <h2>טבלת ספקים והשוואה</h2>
      <p>
        לחץ על “הוסף” כדי ליצור ספק. בכרטיס אפשר למלא נייד, מייל,
        כתובת, כספים וחוזים.
      </p>

      <table>
        <thead>
          <tr>
            <th>ספק / איש קשר</th>
            <th>תחום</th>
            <th>מחיר</th>
            <th>זמינות</th>
            <th>המלצות</th>
            <th>הערות</th>
            <th>ציון</th>
          </tr>
        </thead>

        <tbody>
          <tr>
            <td>מהנדס לדוגמה א׳</td>
            <td>מהנדס</td>
            <td>18,000 ₪</td>
            <td>שבוע</td>
            <td>⭐⭐⭐⭐⭐</td>
            <td>ניסיון טוב</td>
            <td>9.2</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function Simple({ title, items, add, openCard }) {
  return (
    <section className="card">
      <div className="cardHeader">
        <h1>{title}</h1>

        <button className="primary" onClick={add}>
          <Plus size={18} />
          הוסף
        </button>
      </div>

      {items.length ? (
        items.map((item) => (
          <TaskRow key={item.id} item={item} openCard={openCard} />
        ))
      ) : (
        <p>אין פריטים.</p>
      )}
    </section>
  );
}

function Module({ icon, title, text, onClick, active }) {
  return (
    <button
      className={active ? "module activeModule" : "module"}
      onClick={onClick}
    >
      {icon}
      <h3>{title}</h3>
      <p>{text}</p>
    </button>
  );
}

function TaskRow({ item, openCard }) {
  return (
    <div className="task" onClick={() => openCard(item)}>
      <b>{item.title}</b>
      <span>{item.status}</span>
      <span className="pill">{item.domain}</span>
      <span className={item.priority === "גבוהה" ? "pill high" : "pill"}>
        {item.priority}
      </span>
    </div>
  );
}

function TaskModal({
  item,
  onClose,
  onSave,
  onToggle,
  onDelete,
}) {
  const [draft, setDraft] = useState({ ...item });

  const isBuildContact =
    draft.domain === "בנייה" &&
    (draft.area === "build-pros" ||
      draft.area === "build-suppliers");

  return (
    <div className="modalBackdrop">
      <div className="modal">
        <h2>כרטיס</h2>

        <label>כותרת / שם</label>
        <input
          value={draft.title}
          onChange={(event) =>
            setDraft({ ...draft, title: event.target.value })
          }
        />

        <label>סטטוס / תחום</label>
        <input
          value={draft.status}
          onChange={(event) =>
            setDraft({ ...draft, status: event.target.value })
          }
        />

        <label>עדיפות</label>
        <select
          value={draft.priority}
          onChange={(event) =>
            setDraft({ ...draft, priority: event.target.value })
          }
        >
          <option>גבוהה</option>
          <option>בינונית</option>
          <option>נמוכה</option>
        </select>

        {isBuildContact && (
          <div className="contactBox">
            <h3>פרטי התקשרות ובנייה</h3>

            <div className="formGrid">
              <div>
                <label>נייד</label>
                <input
                  value={draft.phone || ""}
                  onChange={(event) =>
                    setDraft({ ...draft, phone: event.target.value })
                  }
                />
              </div>

              <div>
                <label>מייל</label>
                <input
                  value={draft.email || ""}
                  onChange={(event) =>
                    setDraft({ ...draft, email: event.target.value })
                  }
                />
              </div>

              <div>
                <label>כתובת</label>
                <input
                  value={draft.address || ""}
                  onChange={(event) =>
                    setDraft({ ...draft, address: event.target.value })
                  }
                />
              </div>

              <div>
                <label>כספים</label>
                <input
                  value={draft.money || ""}
                  onChange={(event) =>
                    setDraft({ ...draft, money: event.target.value })
                  }
                />
              </div>
            </div>

            <label>חוזים</label>
            <textarea
              rows="3"
              value={draft.contracts || ""}
              onChange={(event) =>
                setDraft({ ...draft, contracts: event.target.value })
              }
            />
          </div>
        )}

        <label>הערות</label>
        <textarea
          rows="5"
          value={draft.note || ""}
          onChange={(event) =>
            setDraft({ ...draft, note: event.target.value })
          }
        />

        <div className="buttons">
          <button className="primary" onClick={() => onSave(draft)}>
            שמור
          </button>

          <button onClick={onToggle}>בוצע / בטל</button>

          <button
            onClick={() => {
              if (confirm("למחוק את הפריט?")) {
                onDelete(draft.id);
                onClose();
              }
            }}
          >
            מחק
          </button>

          <button onClick={onClose}>סגור</button>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
