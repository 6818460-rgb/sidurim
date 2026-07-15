import React, { useMemo, useState } from "react";
import { Plus, Save, Trash2, Trophy } from "lucide-react";
import "./supplierComparison.css";

const FIELD_OPTIONS = [
  "מהנדס",
  "קונסטרוקטור",
  "אדריכל",
  "מנהל פרויקט",
  "קבלן",
  "חשמלאי",
  "אינסטלטור",
  "ספק חומרי גלם",
  "הובלה",
  "אחר",
];

const CRITERIA = [
  { key: "experience", label: "ניסיון בפרויקטים דומים", weight: 0.2 },
  { key: "professionalism", label: "מקצועיות והבנת הפרויקט", weight: 0.2 },
  { key: "reliability", label: "אמינות והמלצות", weight: 0.15 },
  { key: "schedule", label: "תכנית עבודה ועמידה בזמנים", weight: 0.1 },
  { key: "communication", label: "זמינות, שירות ותקשורת", weight: 0.05 },
  { key: "clarity", label: "בהירות ההצעה, אחריות ומה כלול", weight: 0.05 },
];

function blankSupplier(index) {
  return {
    id: `supplier-${index + 1}`,
    name: "",
    phone: "",
    email: "",
    price: "",
    notes: "",
    experience: "",
    professionalism: "",
    reliability: "",
    schedule: "",
    communication: "",
    clarity: "",
  };
}

function blankDraft() {
  return {
    id: "",
    field: "מהנדס",
    customField: "",
    projectName: "",
    selectedSupplierId: "",
    suppliers: Array.from({ length: 5 }, (_, index) => blankSupplier(index)),
  };
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function fixed(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "—";
}

function normalizeSavedComparison(item) {
  const savedSuppliers = Array.isArray(item.suppliers) ? item.suppliers : [];

  return {
    id: item.id || "",
    field: item.field || "מהנדס",
    customField: item.customField || "",
    projectName: item.projectName || item.title || "",
    selectedSupplierId: item.selectedSupplierId || "",
    suppliers: Array.from({ length: 5 }, (_, index) => ({
      ...blankSupplier(index),
      ...(savedSuppliers[index] || {}),
      id: savedSuppliers[index]?.id || `supplier-${index + 1}`,
    })),
  };
}

export default function SupplierComparison({ comparisons = [], onSave, onDelete }) {
  const [draft, setDraft] = useState(blankDraft);
  const [message, setMessage] = useState("");

  const results = useMemo(() => {
    const positivePrices = draft.suppliers
      .map((supplier) => toNumber(supplier.price))
      .filter((price) => price > 0);

    const lowestPrice = positivePrices.length ? Math.min(...positivePrices) : 0;

    const calculated = draft.suppliers.map((supplier) => {
      const scoresComplete = CRITERIA.every((criterion) => {
        const score = toNumber(supplier[criterion.key]);
        return score >= 1 && score <= 10;
      });

      const price = toNumber(supplier.price);
      const qualityPoints = CRITERIA.reduce(
        (sum, criterion) => sum + toNumber(supplier[criterion.key]) * criterion.weight,
        0
      );
      const priceScore = price > 0 && lowestPrice > 0 ? (lowestPrice / price) * 10 : 0;
      const pricePoints = priceScore * 0.25;
      const complete = Boolean(supplier.name.trim()) && price > 0 && scoresComplete;
      const total = complete ? qualityPoints + pricePoints : null;

      return {
        complete,
        qualityPoints,
        priceScore,
        pricePoints,
        total,
        rank: null,
      };
    });

    const ranked = calculated
      .map((result, index) => ({ index, total: result.total }))
      .filter((entry) => Number.isFinite(entry.total))
      .sort((a, b) => b.total - a.total);

    ranked.forEach((entry, position) => {
      const previous = ranked[position - 1];
      calculated[entry.index].rank =
        previous && previous.total === entry.total
          ? calculated[previous.index].rank
          : position + 1;
    });

    return calculated;
  }, [draft.suppliers]);

  function updateDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage("");
  }

  function updateSupplier(index, key, value) {
    setDraft((current) => ({
      ...current,
      suppliers: current.suppliers.map((supplier, supplierIndex) =>
        supplierIndex === index ? { ...supplier, [key]: value } : supplier
      ),
    }));
    setMessage("");
  }

  function newComparison() {
    setDraft(blankDraft());
    setMessage("");
  }

  function editComparison(comparison) {
    setDraft(normalizeSavedComparison(comparison));
    setMessage("ההשוואה נטענה לעריכה.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveComparison() {
    const projectName = draft.projectName.trim();
    const fieldName = draft.field === "אחר" ? draft.customField.trim() : draft.field;

    if (!projectName) {
      setMessage("צריך למלא שם פרויקט או עבודה לפני השמירה.");
      return;
    }

    if (!fieldName) {
      setMessage("צריך לבחור או לכתוב תחום.");
      return;
    }

    const id = draft.id || `supplier-comparison-${Date.now()}`;

    await onSave?.({
      id,
      domain: "בנייה",
      area: "build-suppliers",
      itemType: "supplier-comparison",
      title: projectName,
      status: "השוואת ספקים",
      priority: "בינונית",
      note: "",
      done: false,
      field: draft.field,
      customField: draft.customField,
      projectName,
      selectedSupplierId: draft.selectedSupplierId,
      suppliers: draft.suppliers.map((supplier) => ({
        ...supplier,
        price: supplier.price === "" ? "" : toNumber(supplier.price),
        ...Object.fromEntries(
          CRITERIA.map((criterion) => [
            criterion.key,
            supplier[criterion.key] === "" ? "" : toNumber(supplier[criterion.key]),
          ])
        ),
      })),
    });

    setDraft((current) => ({ ...current, id }));
    setMessage("ההשוואה נשמרה בענן.");
  }

  async function deleteComparison(comparison) {
    if (!window.confirm(`למחוק את ההשוואה "${comparison.title}"?`)) return;
    await onDelete?.(comparison.id);
    if (draft.id === comparison.id) newComparison();
  }

  const fieldName = draft.field === "אחר" ? draft.customField : draft.field;

  return (
    <section className="card supplierComparison">
      <div className="supplierComparisonHeader">
        <div>
          <h2>השוואת 5 ספקים — 75% איכות / 25% מחיר</h2>
          <p>
            המחיר הזול ביותר מקבל ציון 10. שאר מחירי הספקים מחושבים ביחס אליו.
          </p>
        </div>
        <button type="button" onClick={newComparison}>
          <Plus size={18} /> השוואה חדשה
        </button>
      </div>

      <div className="supplierComparisonMeta">
        <div>
          <label>באיזה תחום מחפשים?</label>
          <select value={draft.field} onChange={(event) => updateDraft("field", event.target.value)}>
            {FIELD_OPTIONS.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>

        {draft.field === "אחר" && (
          <div>
            <label>תחום אחר</label>
            <input
              value={draft.customField}
              onChange={(event) => updateDraft("customField", event.target.value)}
              placeholder="כתוב את התחום"
            />
          </div>
        )}

        <div className="supplierProjectName">
          <label>שם הפרויקט / העבודה</label>
          <input
            value={draft.projectName}
            onChange={(event) => updateDraft("projectName", event.target.value)}
            placeholder="לדוגמה: תכנון מבנה התעשייה והחניון"
          />
        </div>
      </div>

      <div className="supplierDesktopTable">
        <table className="supplierScoreTable">
          <thead>
            <tr>
              <th>פרט / קריטריון</th>
              <th>משקל</th>
              {draft.suppliers.map((supplier, index) => (
                <th key={supplier.id}>ספק {index + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>שם הספק</th>
              <td>—</td>
              {draft.suppliers.map((supplier, index) => (
                <td key={supplier.id}>
                  <input
                    value={supplier.name}
                    onChange={(event) => updateSupplier(index, "name", event.target.value)}
                    placeholder="שם הספק"
                  />
                </td>
              ))}
            </tr>
            <tr>
              <th>טלפון</th>
              <td>—</td>
              {draft.suppliers.map((supplier, index) => (
                <td key={supplier.id}>
                  <input
                    value={supplier.phone}
                    onChange={(event) => updateSupplier(index, "phone", event.target.value)}
                    inputMode="tel"
                  />
                </td>
              ))}
            </tr>
            <tr>
              <th>מחיר ההצעה בפועל</th>
              <td>—</td>
              {draft.suppliers.map((supplier, index) => (
                <td key={supplier.id}>
                  <input
                    type="number"
                    min="0"
                    value={supplier.price}
                    onChange={(event) => updateSupplier(index, "price", event.target.value)}
                    placeholder="₪"
                  />
                </td>
              ))}
            </tr>
            <tr className="priceWeightRow">
              <th>משקל המחיר בחישוב</th>
              <td>25%</td>
              {draft.suppliers.map((supplier) => (
                <td key={supplier.id}>25%</td>
              ))}
            </tr>

            {CRITERIA.map((criterion) => (
              <tr key={criterion.key}>
                <th>{criterion.label}</th>
                <td>{Math.round(criterion.weight * 100)}%</td>
                {draft.suppliers.map((supplier, index) => (
                  <td key={supplier.id}>
                    <input
                      className="scoreInput"
                      type="number"
                      min="1"
                      max="10"
                      value={supplier[criterion.key]}
                      onChange={(event) => updateSupplier(index, criterion.key, event.target.value)}
                      placeholder="1–10"
                    />
                  </td>
                ))}
              </tr>
            ))}

            <tr className="calculatedRow">
              <th>נקודות איכות</th>
              <td>מתוך 7.5</td>
              {results.map((result, index) => <td key={index}>{fixed(result.qualityPoints)}</td>)}
            </tr>
            <tr className="calculatedRow">
              <th>ציון מחיר אוטומטי</th>
              <td>מתוך 10</td>
              {results.map((result, index) => <td key={index}>{result.priceScore ? fixed(result.priceScore) : "—"}</td>)}
            </tr>
            <tr className="calculatedRow">
              <th>נקודות מחיר</th>
              <td>מתוך 2.5</td>
              {results.map((result, index) => <td key={index}>{result.pricePoints ? fixed(result.pricePoints) : "—"}</td>)}
            </tr>
            <tr className="finalScoreRow">
              <th>ציון משוקלל סופי</th>
              <td>מתוך 10</td>
              {results.map((result, index) => (
                <td key={index} className={result.rank === 1 ? "winnerCell" : ""}>
                  {result.total === null ? "חסרים נתונים" : fixed(result.total)}
                  {result.rank === 1 && <span className="winnerBadge">★ מומלץ</span>}
                </td>
              ))}
            </tr>
            <tr>
              <th>דירוג</th>
              <td>—</td>
              {results.map((result, index) => <td key={index}>{result.rank ? `מקום ${result.rank}` : "—"}</td>)}
            </tr>
            <tr>
              <th>ספק שנבחר</th>
              <td>—</td>
              {draft.suppliers.map((supplier) => (
                <td key={supplier.id}>
                  <label className="chooseSupplier">
                    <input
                      type="radio"
                      name="selectedSupplier"
                      checked={draft.selectedSupplierId === supplier.id}
                      onChange={() => updateDraft("selectedSupplierId", supplier.id)}
                    />
                    בחר
                  </label>
                </td>
              ))}
            </tr>
            <tr>
              <th>הערות</th>
              <td>—</td>
              {draft.suppliers.map((supplier, index) => (
                <td key={supplier.id}>
                  <textarea
                    rows="3"
                    value={supplier.notes}
                    onChange={(event) => updateSupplier(index, "notes", event.target.value)}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="supplierMobileCards">
        {draft.suppliers.map((supplier, index) => {
          const result = results[index];
          return (
            <article className={result.rank === 1 ? "supplierMobileCard mobileWinner" : "supplierMobileCard"} key={supplier.id}>
              <h3>ספק {index + 1} {result.rank === 1 ? "★" : ""}</h3>
              <label>שם הספק</label>
              <input value={supplier.name} onChange={(event) => updateSupplier(index, "name", event.target.value)} />
              <label>טלפון</label>
              <input value={supplier.phone} onChange={(event) => updateSupplier(index, "phone", event.target.value)} inputMode="tel" />
              <label>מחיר ההצעה בפועל</label>
              <input type="number" min="0" value={supplier.price} onChange={(event) => updateSupplier(index, "price", event.target.value)} />
              <div className="mobilePriceWeight">
                <span>משקל המחיר בחישוב</span>
                <b>25%</b>
              </div>

              {CRITERIA.map((criterion) => (
                <div className="mobileCriterion" key={criterion.key}>
                  <label>{criterion.label} ({Math.round(criterion.weight * 100)}%)</label>
                  <input type="number" min="1" max="10" value={supplier[criterion.key]} onChange={(event) => updateSupplier(index, criterion.key, event.target.value)} placeholder="1–10" />
                </div>
              ))}

              <div className="mobileResultGrid">
                <span>איכות: <b>{fixed(result.qualityPoints)} / 7.5</b></span>
                <span>מחיר: <b>{result.pricePoints ? fixed(result.pricePoints) : "—"} / 2.5</b></span>
                <span>סופי: <b>{result.total === null ? "—" : fixed(result.total)} / 10</b></span>
                <span>דירוג: <b>{result.rank ? `מקום ${result.rank}` : "—"}</b></span>
              </div>

              <label>הערות</label>
              <textarea rows="3" value={supplier.notes} onChange={(event) => updateSupplier(index, "notes", event.target.value)} />
              <label className="chooseSupplier">
                <input type="radio" name="selectedSupplierMobile" checked={draft.selectedSupplierId === supplier.id} onChange={() => updateDraft("selectedSupplierId", supplier.id)} />
                בחר כספק לביצוע
              </label>
            </article>
          );
        })}
      </div>

      <div className="supplierFormula">
        <b>נוסחת המחיר:</b> המחיר הנמוך ביותר ÷ מחיר הספק × 10. ציון המחיר מוכפל ב־25%, וסכום ציוני האיכות מוכפל במשקל של כל סעיף.
      </div>

      <div className="supplierComparisonActions">
        <button className="primary" type="button" onClick={saveComparison}>
          <Save size={18} /> שמור השוואה
        </button>
        <span>{message}</span>
      </div>

      {comparisons.length > 0 && (
        <div className="savedComparisons">
          <h3>השוואות שמורות</h3>
          <div className="savedComparisonGrid">
            {comparisons.map((comparison) => {
              const normalized = normalizeSavedComparison(comparison);
              const chosen = normalized.suppliers.find((supplier) => supplier.id === normalized.selectedSupplierId);
              const savedField = normalized.field === "אחר" ? normalized.customField : normalized.field;

              return (
                <article key={comparison.id} className="savedComparisonCard">
                  <div>
                    <b>{comparison.projectName || comparison.title}</b>
                    <p>{savedField || "ללא תחום"}</p>
                    {chosen?.name && <p><Trophy size={15} /> נבחר: {chosen.name}</p>}
                  </div>
                  <div className="savedComparisonButtons">
                    <button type="button" onClick={() => editComparison(comparison)}>פתח / ערוך</button>
                    <button type="button" onClick={() => deleteComparison(comparison)}><Trash2 size={16} /> מחק</button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      <p className="supplierCurrentContext">
        השוואה נוכחית: {fieldName || "ללא תחום"}{draft.projectName ? ` — ${draft.projectName}` : ""}
      </p>
    </section>
  );
}
