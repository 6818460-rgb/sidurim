import React, { useEffect, useMemo, useRef, useState } from "react";
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
  MapIcon,
  Camera,
  Folder,
  CalendarDays,
  Upload,
  LogIn,
  LogOut,
  Archive,
} from "lucide-react";

import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";

import { auth, db, googleProvider } from "./firebaseConfig";
import {
  prepareGoogleDrive,
  uploadFileToDrive,
} from "./googleDrive";
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
import SupplierComparison from "./SupplierComparison";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const demoItems = [
  {
    id: "demo-work",
    area: "work-orders",
    domain: "עבודה",
    title: "דפוס מאי - מארז מזרק",
    status: "חיתוך דרוש",
    priority: "בינונית",
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
      createdAt: new Date().toISOString(),
      completedAt: null,
      estimatedMinutes: null,
      scheduledDate: "",
      scheduledTime: "",
      logs: [],
      ...extra,
    });
  }

  function updateItem(updatedItem) {
    saveItem(updatedItem);
    setSelected(updatedItem);
  }

  async function toggleDone(id) {
    const item = items.find(
      (current) => String(current.id) === String(id)
    );

    if (!item) return;

    const willBeDone = !item.done;

    const updatedItem = {
      ...item,
      done: willBeDone,
      completedAt: willBeDone
        ? new Date().toISOString()
        : null,
    };

    setItems((currentItems) =>
      currentItems.map((current) =>
        String(current.id) === String(id)
          ? updatedItem
          : current
      )
    );

    await saveItem(updatedItem);
  }

  async function upsertJobs(jobs) {
    if (!user) {
      alert("צריך להתחבר עם Google כדי לעדכן את רשימת העבודות.");
      return;
    }

    const numbersInCurrentPdf = new Set(
      jobs.map((job) => String(job.number))
    );

    // מוחקים רק עבודות שיובאו בעבר מ-PDF ויש להן מספר עבודה,
    // אך אינן מופיעות יותר בדוח החדש.
    const importedJobsToDelete = items.filter(
      (item) =>
        item.domain === "עבודה" &&
        item.area === "work-orders" &&
        item.jobNumber &&
        !numbersInCurrentPdf.has(String(item.jobNumber))
    );

    const deleteWrites = importedJobsToDelete.map((item) =>
      deleteDoc(
        doc(db, "users", user.uid, "items", String(item.id))
      )
    );

    const saveWrites = jobs.map((job) => {
      const title = `${job.customer} - ${job.title}`;

      const existing = items.find(
        (item) =>
          item.domain === "עבודה" &&
          item.area === "work-orders" &&
          String(item.jobNumber) === String(job.number)
      );

      if (existing) {
        return saveItem({
          ...existing,
          title,
          status: job.status,
          reportDate: job.date,
          customer: job.customer,
          jobTitle: job.title,
          priority:
            existing.priorityManuallySet === true
              ? existing.priority
              : "בינונית",
          priorityManuallySet:
            existing.priorityManuallySet === true,
        });
      }

      return saveItem({
        id: `job-${job.number}`,
        domain: "עבודה",
        area: "work-orders",
        title,
        status: job.status,
        priority: "בינונית",
        priorityManuallySet: false,
        note: `נוצר מתוך PDF. מספר עבודה: ${job.number} | תאריך: ${job.date}`,
        done: false,
        createdAt: new Date().toISOString(),
        completedAt: null,
        estimatedMinutes: null,
        scheduledDate: "",
        scheduledTime: "",
        logs: [],
        jobNumber: job.number,
        reportDate: job.date,
        customer: job.customer,
        jobTitle: job.title,
      });
    });

    await Promise.all([...deleteWrites, ...saveWrites]);
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
        <Nav
          icon={<Archive />}
          label="ארכיון משימות"
          active={screen === "archive"}
          onClick={() => setScreen("archive")}
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
            saveItem={saveItem}
            removeItem={removeItem}
          />
        )}

        {screen === "personal" && (
          <Simple
            title="אישי"
            items={filtered.filter((item) => item.domain === "אישי")}
            add={() => addItem("אישי", "personal-today", "פריט אישי חדש")}
            openCard={setSelected}
            driveFolderParts={["SIDURIM", "\u05d0\u05d9\u05e9\u05d9", "\u05db\u05dc\u05dc\u05d9"]}
          />
        )}

        {screen === "money" && (
          <Simple
            title="כספים"
            items={filtered.filter((item) => item.domain === "כספים")}
            add={() => addItem("כספים", "money", "פריט כספי חדש")}
            openCard={setSelected}
            driveFolderParts={["SIDURIM", "\u05db\u05e1\u05e4\u05d9\u05dd", "\u05db\u05dc\u05dc\u05d9"]}
          />
        )}

        {screen === "archive" && (
          <ArchiveScreen items={filtered} openCard={setSelected} />
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
    ["חללים", <MapIcon />, "build-spaces"],
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
  saveItem,
  removeItem,
}) {
  const [tab, setTab] = useState(tabs[0][2]);
  const contentRef = useRef(null);

  function selectTab(key) {
    setTab(key);

    if (window.innerWidth <= 850) {
      window.setTimeout(() => {
        contentRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 0);
    }
  }

  const shown = items.filter(
    (item) =>
      item.domain === domain &&
      item.area === tab &&
      !item.done &&
      item.itemType !== "supplier-comparison"
  );

  const supplierComparisons = items.filter(
    (item) =>
      item.domain === "בנייה" &&
      item.area === "build-suppliers" &&
      item.itemType === "supplier-comparison"
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
            onClick={() => selectTab(key)}
          />
        ))}
      </section>

      {tab === "work-orders" && upsertJobs && (
        <PdfImport upsertJobs={upsertJobs} />
      )}

      {tab === "build-suppliers" && (
        <SupplierComparison
          comparisons={supplierComparisons}
          onSave={saveItem}
          onDelete={removeItem}
        />
      )}

      {(tab.startsWith("build-") ||
        (tab.startsWith("work-") && tab !== "work-orders")) && (
        <DriveUpload
          folderParts={[
            "SIDURIM",
            domain,
            tabs.find((current) => current[2] === tab)?.[0] || tab,
          ]}
        />
      )}

      <section
        className="card"
        ref={contentRef}
        style={tab === "build-suppliers" ? { display: "none" } : undefined}
      >
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


function DriveUpload({
  folderParts,
  heading = "\u05d4\u05e2\u05dc\u05d0\u05ea \u05de\u05e1\u05de\u05da \u05dc-Google Drive",
}) {
  const [status, setStatus] = useState(
    "\u05d1\u05d7\u05e8 \u05de\u05e1\u05de\u05da \u05d5\u05dc\u05d0\u05d7\u05e8 \u05de\u05db\u05df \u05dc\u05d7\u05e5 \u05e2\u05dc \u05d4\u05e2\u05dc\u05d0\u05d4 \u05dc-Google Drive."
  );
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDriveReady, setIsDriveReady] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);

  useEffect(() => {
    let active = true;

    prepareGoogleDrive()
      .then(() => {
        if (active) setIsDriveReady(true);
      })
      .catch((error) => {
        console.error("Google Drive preparation error:", error);
        if (active) {
          setStatus(
            "\u05dc\u05d0 \u05e0\u05d9\u05ea\u05df \u05dc\u05d8\u05e2\u05d5\u05df \u05d0\u05ea \u05e9\u05d9\u05e8\u05d5\u05ea \u05d4\u05d4\u05e8\u05e9\u05d0\u05d5\u05ea \u05e9\u05dc Google Drive."
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  function handleDriveFile(event) {
    const file = event.target.files?.[0] || null;

    setSelectedFile(file);
    setUploadedFile(null);

    if (file) {
      setStatus(`\u05d4\u05e7\u05d5\u05d1\u05e5 "${file.name}" \u05de\u05d5\u05db\u05df \u05dc\u05d4\u05e2\u05dc\u05d0\u05d4.`);
    } else {
      setStatus("\u05dc\u05d0 \u05e0\u05d1\u05d7\u05e8 \u05e7\u05d5\u05d1\u05e5.");
    }
  }

  async function uploadSelectedFile() {
    if (!selectedFile) {
      setStatus("\u05d1\u05d7\u05e8 \u05ea\u05d7\u05d9\u05dc\u05d4 \u05e7\u05d5\u05d1\u05e5.");
      return;
    }

    if (!isDriveReady) {
      setStatus("\u05e9\u05d9\u05e8\u05d5\u05ea Google Drive \u05e2\u05d3\u05d9\u05d9\u05df \u05e0\u05d8\u05e2\u05df. \u05e0\u05e1\u05d4 \u05e9\u05d5\u05d1 \u05d1\u05e2\u05d5\u05d3 \u05e8\u05d2\u05e2.");
      return;
    }

    const file = selectedFile;

    setIsUploading(true);
    setUploadedFile(null);
    setStatus(`\u05de\u05e2\u05dc\u05d4 \u05d0\u05ea "${file.name}" \u05dc-Google Drive...`);

    try {
      const result = await uploadFileToDrive(file, folderParts);

      setUploadedFile(result);
      setSelectedFile(null);
      setStatus(`\u05d4\u05e7\u05d5\u05d1\u05e5 "${result.name || file.name}" \u05d4\u05d5\u05e2\u05dc\u05d4 \u05d1\u05d4\u05e6\u05dc\u05d7\u05d4.`);
    } catch (error) {
      console.error("Google Drive upload error:", error);

      const details =
        error instanceof Error
          ? error.message
          : error?.type ||
            error?.error ||
            JSON.stringify(error);

      setStatus(
        `\u05d4\u05d4\u05e2\u05dc\u05d0\u05d4 \u05dc-Google Drive \u05e0\u05db\u05e9\u05dc\u05d4: ${details || "\u05e9\u05d2\u05d9\u05d0\u05d4 \u05dc\u05d0 \u05d9\u05d3\u05d5\u05e2\u05d4"}`
      );
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <section className="card pdf">
      <h2>
        <Upload size={22} />
        {heading}
      </h2>

      <p>{folderParts.join(" / ")}</p>

      <input
        type="file"
        onChange={handleDriveFile}
        disabled={isUploading}
      />

      <button
        className="primary"
        type="button"
        onClick={uploadSelectedFile}
        disabled={!selectedFile || !isDriveReady || isUploading}
      >
        <Upload size={18} />
        {isUploading
          ? "\u05de\u05e2\u05dc\u05d4..."
          : "\u05d4\u05e2\u05dc\u05d4 \u05dc-Google Drive"}
      </button>

      <p>{status}</p>

      {uploadedFile?.webViewLink && (
        <a
          href={uploadedFile.webViewLink}
          target="_blank"
          rel="noreferrer"
        >
          {"\u05e4\u05ea\u05d7 \u05d0\u05ea \u05d4\u05e7\u05d5\u05d1\u05e5 \u05d1-Google Drive"}
        </a>
      )}
    </section>
  );
}

function PdfImport({ upsertJobs }) {
  const [status, setStatus] = useState(
    "בחר PDF של דוח הזמנות פתוחות."
  );
  const [lastJobs, setLastJobs] = useState([]);

  async function handleFile(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    setStatus("קורא את טבלת ה-PDF...");
    setLastJobs([]);

    try {
      const buffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(buffer),
      });
      const pdf = await loadingTask.promise;
      const allJobs = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();

        const pageJobs = extractJobsFromFixedReport(content.items);
        allJobs.push(...pageJobs);
      }

      const uniqueJobs = Array.from(
        new Map(
          allJobs
            .filter((job) => job.number)
            .map((job) => [job.number, job])
        ).values()
      );

      if (!uniqueJobs.length) {
        setStatus(
          "לא נמצאו שורות עבודה. ודא שזה דוח הזמנות פתוחות במבנה הקבוע."
        );
        return;
      }

      setLastJobs(uniqueJobs);
      await upsertJobs(uniqueJobs);

      setStatus(
        `הקריאה הצליחה: ${uniqueJobs.length} עבודות נוספו או עודכנו בענן.`
      );
    } catch (error) {
      console.error("PDF import error:", error);
      const details =
        error instanceof Error && error.message
          ? ` (${error.message})`
          : "";

      setStatus(`הייתה בעיה בקריאת טבלת ה-PDF${details}`);
    } finally {
      event.target.value = "";
    }
  }

  return (
    <section className="card pdf">
      <h2>
        <Upload size={22} />
        העלאת PDF
      </h2>

      <p>
        המערכת קוראת את כל שורות הדוח, שומרת לקוח, שם עבודה וסטטוס,
        ומתעלמת מעמודת “מצב”.
      </p>

      <input
        type="file"
        accept="application/pdf"
        onChange={handleFile}
      />

      <p>{status}</p>

      {lastJobs.length > 0 && (
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>מספר</th>
                <th>לקוח</th>
                <th>שם העבודה</th>
                <th>סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {lastJobs.map((job) => (
                <tr key={job.number}>
                  <td>{job.number}</td>
                  <td>{job.customer}</td>
                  <td>{job.title}</td>
                  <td>{job.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/*
 * קורא את דוח "הזמנות פתוחות" לפי מיקומי העמודות הקבועים:
 * מספר | מתאריך | לקוח | כותרת | סוכן | סטטוס | מצב
 *
 * עמודת "מצב" אינה נקראת כלל.
 */
function extractJobsFromFixedReport(rawItems) {
  const items = rawItems
    .map((item) => {
      const transform = Array.isArray(item.transform)
        ? item.transform
        : [];

      return {
        text: cleanPdfText(item.str),
        x: Number(transform[4]),
        y: Number(transform[5]),
      };
    })
    .filter(
      (item) =>
        item.text &&
        Number.isFinite(item.x) &&
        Number.isFinite(item.y)
    );

  // מספרי העבודה נמצאים תמיד בעמודה הימנית ביותר.
  const anchors = items
    .map((item) => ({
      ...item,
      digits: item.text.replace(/[^\d]/g, ""),
    }))
    .filter(
      (item) =>
        item.x >= 520 &&
        item.x <= 575 &&
        /^\d{4,10}$/.test(item.digits)
    )
    .sort((a, b) => b.y - a.y);

  if (!anchors.length) return [];

  return anchors
    .map((anchor, index) => {
      const previous = anchors[index - 1];
      const next = anchors[index + 1];

      // גבולות השורה נקבעים באמצע בין מספרי העבודות.
      const upperBoundary = previous
        ? (previous.y + anchor.y) / 2
        : anchor.y + 17;

      const lowerBoundary = next
        ? (anchor.y + next.y) / 2
        : anchor.y - 37;

      const rowItems = items.filter(
        (item) =>
          item.y <= upperBoundary &&
          item.y > lowerBoundary
      );

      return {
        number: anchor.digits,
        date: readPdfColumn(rowItems, 462, 522),
        customer: readPdfColumn(rowItems, 372, 463),
        title: readPdfColumn(rowItems, 232, 372),
        status: readPdfColumn(rowItems, 145, 198),
      };
    })
    .map((job) => ({
      ...job,
      date: cleanField(job.date),
      customer: cleanField(job.customer),
      title: cleanField(job.title),
      status: cleanField(job.status),
    }))
    .filter(
      (job) =>
        job.number &&
        job.customer &&
        job.title &&
        job.status
    );
}

function readPdfColumn(items, minX, maxX) {
  const columnItems = items.filter(
    (item) => item.x >= minX && item.x < maxX
  );

  if (!columnItems.length) return "";

  const lines = [];

  columnItems
    .sort((a, b) => b.y - a.y || b.x - a.x)
    .forEach((item) => {
      let line = lines.find(
        (current) => Math.abs(current.y - item.y) <= 2.5
      );

      if (!line) {
        line = {
          y: item.y,
          items: [],
        };
        lines.push(line);
      }

      line.items.push(item);
    });

  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) =>
      line.items
        .sort((a, b) => b.x - a.x)
        .map((item) => item.text)
        .join(" ")
    )
    .join(" ");
}

function cleanPdfText(value) {
  return String(value ?? "")
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\u00ad/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanField(value) {
  return cleanPdfText(value)
    .replace(/\s+([,.:])/g, "$1")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
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


function ArchiveScreen({ items, openCard }) {
  const completedItems = items
    .filter((item) => item.done)
    .sort((a, b) => {
      const aTime = new Date(a.completedAt || 0).getTime();
      const bTime = new Date(b.completedAt || 0).getTime();
      return bTime - aTime;
    });

  return (
    <section className="card">
      <div className="cardHeader">
        <h1>ארכיון משימות</h1>
        <span className="pill">{completedItems.length} משימות</span>
      </div>

      {completedItems.length ? (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>משימה</th>
                <th>תחום</th>
                <th>התחילה</th>
                <th>הסתיימה</th>
                <th>הערכת זמן</th>
                <th>משך טיפול</th>
              </tr>
            </thead>
            <tbody>
              {completedItems.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => openCard(item)}
                  style={{ cursor: "pointer" }}
                >
                  <td>{item.title}</td>
                  <td>{item.domain}</td>
                  <td>{formatTaskDate(item.createdAt)}</td>
                  <td>{formatTaskDate(item.completedAt)}</td>
                  <td>{formatEstimatedTime(item.estimatedMinutes)}</td>
                  <td>{formatTaskDuration(item.createdAt, item.completedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>עדיין אין משימות שהסתיימו.</p>
      )}
    </section>
  );
}

function formatTaskDate(value) {
  if (!value) return "לא ידוע";

  const date =
    typeof value?.toDate === "function"
      ? value.toDate()
      : new Date(value);

  if (Number.isNaN(date.getTime())) return "לא ידוע";

  return new Intl.DateTimeFormat("he-IL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}


function formatTaskDuration(createdAt, completedAt) {
  if (!createdAt || !completedAt) return "לא ידוע";

  const start =
    typeof createdAt?.toDate === "function"
      ? createdAt.toDate()
      : new Date(createdAt);

  const end =
    typeof completedAt?.toDate === "function"
      ? completedAt.toDate()
      : new Date(completedAt);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end < start
  ) {
    return "לא ידוע";
  }

  const totalMinutes = Math.floor((end - start) / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  const parts = [];

  if (days) parts.push(`${days} ${days === 1 ? "יום" : "ימים"}`);
  if (hours) parts.push(`${hours} ${hours === 1 ? "שעה" : "שעות"}`);
  if (!days && minutes) {
    parts.push(`${minutes} ${minutes === 1 ? "דקה" : "דקות"}`);
  }

  return parts.length ? parts.join(" ו־") : "פחות מדקה";
}


function formatEstimatedTime(value) {
  const minutes = Number(value);

  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "לא הוגדר";
  }

  if (minutes < 60) {
    return `${minutes} ${minutes === 1 ? "דקה" : "דקות"}`;
  }

  if (minutes < 1440) {
    const hours = minutes / 60;
    return Number.isInteger(hours)
      ? `${hours} ${hours === 1 ? "שעה" : "שעות"}`
      : `${hours.toFixed(1)} שעות`;
  }

  const days = minutes / 1440;

  if (days < 7) {
    return Number.isInteger(days)
      ? `${days} ${days === 1 ? "יום" : "ימים"}`
      : `${days.toFixed(1)} ימים`;
  }

  const weeks = days / 7;
  return Number.isInteger(weeks)
    ? `${weeks} ${weeks === 1 ? "שבוע" : "שבועות"}`
    : `${weeks.toFixed(1)} שבועות`;
}

function Simple({
  title,
  items,
  add,
  openCard,
  driveFolderParts,
}) {
  const activeItems = items.filter((item) => !item.done);

  return (
    <>
      {driveFolderParts && (
        <DriveUpload folderParts={driveFolderParts} />
      )}

      <section className="card">
        <div className="cardHeader">
          <h1>{title}</h1>

          <button className="primary" onClick={add}>
            <Plus size={18} />
            {"\u05d4\u05d5\u05e1\u05e3"}
          </button>
        </div>

        {activeItems.length ? (
          activeItems.map((item) => (
            <TaskRow key={item.id} item={item} openCard={openCard} />
          ))
        ) : (
          <p>{"\u05d0\u05d9\u05df \u05e4\u05e8\u05d9\u05d8\u05d9\u05dd."}</p>
        )}
      </section>
    </>
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


function formatScheduledDateTime(dateValue, timeValue) {
  if (!dateValue) return "לא נקבע";

  const [year, month, day] = String(dateValue).split("-");
  const dateText =
    year && month && day
      ? `${day}/${month}/${year}`
      : String(dateValue);

  return timeValue ? `${dateText} בשעה ${timeValue}` : dateText;
}

function TaskRow({ item, openCard }) {
  const estimatedMinutes = Number(item.estimatedMinutes);

  const estimateIndicator =
    Number.isFinite(estimatedMinutes) && estimatedMinutes > 0
      ? estimatedMinutes <= 60
        ? "🟢"
        : estimatedMinutes <= 480
        ? "🟡"
        : "🔴"
      : "";

  return (
    <div className="task" onClick={() => openCard(item)}>
      <b>{item.title}</b>
      <span>{item.status}</span>
      <span className="pill">{item.domain}</span>
      <span className={item.priority === "גבוהה" ? "pill high" : "pill"}>
        {item.priority}
      </span>
      <span className="pill">
        {estimateIndicator
          ? `${estimateIndicator} ${formatEstimatedTime(item.estimatedMinutes)}`
          : "⏱ לא הוגדר"}
      </span>
      <span className="pill">
        📅 {formatScheduledDateTime(item.scheduledDate, item.scheduledTime)}
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
            setDraft({
              ...draft,
              priority: event.target.value,
              priorityManuallySet: true,
            })
          }
        >
          <option>גבוהה</option>
          <option>בינונית</option>
          <option>נמוכה</option>
        </select>

        <label>הערכת זמן</label>
        <select
          value={draft.estimatedMinutes ?? ""}
          onChange={(event) =>
            setDraft({
              ...draft,
              estimatedMinutes: event.target.value
                ? Number(event.target.value)
                : null,
            })
          }
        >
          <option value="">לא הוגדר</option>
          <option value="5">5 דקות</option>
          <option value="15">15 דקות</option>
          <option value="30">30 דקות</option>
          <option value="60">שעה</option>
          <option value="120">שעתיים</option>
          <option value="240">חצי יום</option>
          <option value="480">יום עבודה</option>
          <option value="960">יומיים</option>
          <option value="2400">שבוע עבודה</option>
        </select>

        <label>תאריך מתוכנן</label>
        <input
          type="date"
          value={draft.scheduledDate || ""}
          onChange={(event) =>
            setDraft({
              ...draft,
              scheduledDate: event.target.value,
            })
          }
        />

        <label>שעת התחלה</label>
        <input
          type="time"
          value={draft.scheduledTime || ""}
          onChange={(event) =>
            setDraft({
              ...draft,
              scheduledTime: event.target.value,
            })
          }
        />

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

        <div className="contactBox">
          <h3>תאריכי המשימה</h3>
          <p>התחילה: {formatTaskDate(draft.createdAt)}</p>
          <p>הערכת זמן: {formatEstimatedTime(draft.estimatedMinutes)}</p>
          <p>
            מועד מתוכנן:{" "}
            {formatScheduledDateTime(
              draft.scheduledDate,
              draft.scheduledTime
            )}
          </p>
          {draft.done && (
            <>
              <p>הסתיימה: {formatTaskDate(draft.completedAt)}</p>
              <p>
                משך טיפול:{" "}
                {formatTaskDuration(draft.createdAt, draft.completedAt)}
              </p>
            </>
          )}
        </div>

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

          <button
            onClick={() => {
              onToggle();
              onClose();
            }}
          >
            {draft.done ? "החזר למשימות פעילות" : "סמן כבוצע"}
          </button>

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