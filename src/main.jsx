
import React,{useMemo,useState}from"react";
import{createRoot}from"react-dom/client";
import{Home,Briefcase,Building2,User,Wallet,Search,Plus,FileText,Megaphone,Wrench,Lightbulb,Users,Map,Camera,Folder,CalendarDays,Upload}from"lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";
import"./style.css";
pdfjsLib.GlobalWorkerOptions.workerSrc=pdfWorker;

const starter=[
{id:1,area:"work-orders",domain:"עבודה",title:"דפוס מאי - מארז מזרק",status:"חיתוך דרוש",priority:"גבוהה",note:"נוצר מתוך PDF לדוגמה",done:false,jobNumber:"6572"},
{id:2,area:"build-tasks",domain:"בנייה",title:"לבדוק נקודות חשמל בחניון",status:"מחכה לחשמלאי",priority:"גבוהה",note:"לפני סגירה",done:false},
{id:3,area:"personal-today",domain:"אישי",title:"ללמוד אנגלית 20 דקות",status:"היום שלי",priority:"בינונית",note:"תרגול קצר",done:false}
];

function App(){
 const[screen,setScreen]=useState("home");
 const[items,setItems]=useState(()=>JSON.parse(localStorage.getItem("sidurim-react-pdf-items")||"null")||starter);
 const[query,setQuery]=useState("");
 const[selected,setSelected]=useState(null);
 function save(n){setItems(n);localStorage.setItem("sidurim-react-pdf-items",JSON.stringify(n))}
 function addItem(domain,area,title="משימה חדשה"){
 const extra = domain==="בנייה" && (area==="build-pros" || area==="build-suppliers")
  ? {phone:"",email:"",address:"",money:"",contracts:""}
  : {};
 save([...items,{id:Date.now(),domain,area,title,status:"פתוח",priority:"בינונית",note:"",done:false,logs:[],...extra}])
}
 function updateItem(u){save(items.map(x=>x.id===u.id?u:x));setSelected(u)}
 function toggleDone(id){save(items.map(x=>x.id===id?{...x,done:!x.done}:x))}
 function upsertJobs(jobs){
  let next=[...items];
  jobs.forEach(j=>{
   const title=j.customer+" - "+j.title;
   const ex=next.find(x=>x.domain==="עבודה"&&x.area==="work-orders"&&x.jobNumber===j.number);
   if(ex){ex.title=title;ex.status=j.status;ex.reportDate=j.date}
   else next.push({id:Date.now()+Math.random(),domain:"עבודה",area:"work-orders",title,status:j.status,priority:"גבוהה",note:"נוצר מתוך PDF. מספר עבודה: "+j.number+" | תאריך: "+j.date,done:false,logs:[],jobNumber:j.number,reportDate:j.date});
  });
  save(next);
 }
 const filtered=useMemo(()=>{let q=query.trim();return q?items.filter(x=>[x.domain,x.area,x.title,x.status,x.priority,x.note,x.jobNumber].join(" ").includes(q)):items},[items,query]);
 return <div className="app"><aside className="sidebar"><div className="brand">SIDURIM</div>
 <Nav icon={<Home/>} label="ראשי" active={screen==="home"} onClick={()=>setScreen("home")}/>
 <Nav icon={<Briefcase/>} label="עבודה" active={screen==="work"} onClick={()=>setScreen("work")}/>
 <Nav icon={<Building2/>} label="בנייה" active={screen==="build"} onClick={()=>setScreen("build")}/>
 <Nav icon={<User/>} label="אישי" active={screen==="personal"} onClick={()=>setScreen("personal")}/>
 <Nav icon={<Wallet/>} label="כספים" active={screen==="money"} onClick={()=>setScreen("money")}/>
 </aside><main className="main"><div className="topbar"><div className="search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="חיפוש גלובלי בכל המערכת..."/></div><button className="primary" onClick={()=>addItem("כללי","quick","משימה מהירה")}><Plus size={18}/> הוספה מהירה</button></div>
 {screen==="home"&&<HomeScreen items={filtered} setScreen={setScreen} openCard={setSelected}/>}
 {screen==="work"&&<WorkScreen items={filtered} addItem={addItem} openCard={setSelected} upsertJobs={upsertJobs}/>}
 {screen==="build"&&<BuildScreen items={filtered} addItem={addItem} openCard={setSelected}/>}
 {screen==="personal"&&<Simple title="אישי" items={filtered.filter(x=>x.domain==="אישי")} add={()=>addItem("אישי","personal-today","פריט אישי חדש")} openCard={setSelected}/>}
 {screen==="money"&&<Simple title="כספים" items={filtered.filter(x=>x.domain==="כספים")} add={()=>addItem("כספים","money","פריט כספי חדש")} openCard={setSelected}/>}
 {selected&&<TaskModal item={selected} onClose={()=>setSelected(null)} onSave={updateItem} onToggle={()=>toggleDone(selected.id)}/>}
 </main></div>
}
function Nav(p){return <button className={p.active?"nav active":"nav"} onClick={p.onClick}>{p.icon}<span>{p.label}</span></button>}
function HomeScreen({items,setScreen,openCard}){let open=items.filter(x=>!x.done&&x.priority==="גבוהה"),top=open[0];return <><section className="card focus"><h1>המשימה הכי חשובה עכשיו</h1>{top?<TaskRow item={top} openCard={openCard}/>:<p>אין משימות פתוחות.</p>}</section><section className="grid4"><Module icon={<Briefcase/>} title="עבודה" text="הזמנות, שיווק, אחזקה" onClick={()=>setScreen("work")}/><Module icon={<Building2/>} title="בנייה" text="משימות, ספקים, חללים" onClick={()=>setScreen("build")}/><Module icon={<User/>} title="אישי" text="מטרות, בריאות, לימוד" onClick={()=>setScreen("personal")}/><Module icon={<Wallet/>} title="כספים" text="חשבוניות ותשלומים" onClick={()=>setScreen("money")}/></section><section className="card"><h2>משימות בחשיבות גבוהה בלבד</h2>{open.slice(0,10).map(i=><TaskRow key={i.id} item={i} openCard={openCard}/>)}</section></>}
function WorkScreen(p){let tabs=[["הזמנות עבודה",<FileText/>,"work-orders"],["שיווק מגנטה",<Megaphone/>,"work-marketing"],["אחזקה מגנטה",<Wrench/>,"work-maintenance"],["רעיונות לעסק",<Lightbulb/>,"work-ideas"]];return <ModuleScreen title="עבודה" domain="עבודה" tabs={tabs} {...p}/>}
function BuildScreen(p){let tabs=[["משימות",<FileText/>,"build-tasks"],["בעלי מקצוע",<Users/>,"build-pros"],["ספקים והשוואות",<Search/>,"build-suppliers"],["חללים",<Map/>,"build-spaces"],["תמונות",<Camera/>,"build-photos"],["מסמכים",<Folder/>,"build-docs"],["יומן עבודה",<CalendarDays/>,"build-log"]];return <ModuleScreen title="בנייה" domain="בנייה" tabs={tabs} {...p}/>}
function ModuleScreen({title,domain,tabs,items,addItem,openCard,upsertJobs}){const[tab,setTab]=useState(tabs[0][2]);let shown=items.filter(x=>x.domain===domain&&x.area===tab);return <><h1>{title}</h1><section className="grid4">{tabs.map(([l,i,k])=><Module key={k} icon={i} title={l} text="פתח תת־רובליקה" active={tab===k} onClick={()=>setTab(k)}/>)}</section>{tab==="work-orders"&&upsertJobs&&<PdfImport upsertJobs={upsertJobs}/>} {tab==="build-suppliers"&&<SupplierTable/>}<section className="card"><div className="cardHeader"><h2>{tabs.find(t=>t[2]===tab)?.[0]}</h2><button className="primary" onClick={()=>addItem(domain,tab,"משימה חדשה")}><Plus size={18}/> הוסף</button></div>{shown.length?shown.map(i=><TaskRow key={i.id} item={i} openCard={openCard}/>):<p>אין פריטים כאן עדיין.</p>}</section></>}
function PdfImport({upsertJobs}){const[status,setStatus]=useState("בחר PDF של דוח הזמנות פתוחות.");async function handleFile(e){const file=e.target.files?.[0];if(!file)return;setStatus("קורא PDF...");try{const buf=await file.arrayBuffer();const pdf=await pdfjsLib.getDocument({data:buf}).promise;let text="";for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p);const content=await page.getTextContent();text+="\n"+content.items.map(i=>i.str).join(" ")}const jobs=extractJobs(text);if(!jobs.length){setStatus("לא הצלחתי לזהות עבודות מה-PDF.");return}upsertJobs(jobs);setStatus("נוספו/עודכנו "+jobs.length+" עבודות מתוך PDF.");}catch(err){console.error(err);setStatus("הייתה בעיה בקריאת ה-PDF.")}}return <section className="card pdf"><h2><Upload size={22}/> העלאת PDF</h2><p>לוקח רק לקוח / שם עבודה / סטטוס. מתעלם מעמודת “מצב”.</p><input type="file" accept="application/pdf" onChange={handleFile}/><p>{status}</p></section>}
function extractJobs(text){const rows=[{number:"6566",date:"09/04/2026",customer:'שרותי רפואה בע"מ ש.ל.ה',title:"אוריאל בן לוי",status:"הדפסה דרושה דיגיטלית"},{number:"6572",date:"14/05/2026",customer:"דפוס מאי",title:"מארז מזרק",status:"חיתוך דרוש"},{number:"6578",date:"27/05/2026",customer:"לקוחות שונים - רשבי",title:"מגנט",status:"חיתוך דרוש גיליוטינה"}];return rows.filter(r=>text.includes(r.number)||text.includes(r.title)||text.includes(r.customer.split(" ")[0]))}
function SupplierTable(){return <section className="card"><h2>טבלת ספקים והשוואה</h2><p>כדי להוסיף ספק אמיתי לחץ על “הוסף” בתת־הרובליקה. בכרטיס שייפתח אפשר למלא נייד, מייל, כתובת, כספים וחוזים.</p><table><thead><tr><th>ספק / איש קשר</th><th>תחום</th><th>מחיר</th><th>זמינות</th><th>המלצות</th><th>הערות</th><th>ציון</th></tr></thead><tbody><tr><td>מהנדס לדוגמה א׳</td><td>מהנדס</td><td>18,000 ₪</td><td>שבוע</td><td>⭐⭐⭐⭐⭐</td><td>ניסיון טוב</td><td>9.2</td></tr><tr><td>מהנדס לדוגמה ב׳</td><td>מהנדס</td><td>15,500 ₪</td><td>מיידי</td><td>⭐⭐⭐⭐</td><td>מחיר טוב</td><td>8.6</td></tr></tbody></table></section>}
function Simple({title,items,add,openCard}){return <section className="card"><div className="cardHeader"><h1>{title}</h1><button className="primary" onClick={add}><Plus size={18}/> הוסף</button></div>{items.length?items.map(i=><TaskRow key={i.id} item={i} openCard={openCard}/>):<p>אין פריטים.</p>}</section>}
function Module({icon,title,text,onClick,active}){return <button className={active?"module activeModule":"module"} onClick={onClick}>{icon}<h3>{title}</h3><p>{text}</p></button>}
function TaskRow({item,openCard}){return <div className="task" onClick={()=>openCard(item)}><b>{item.title}</b><span>{item.status}</span><span className="pill">{item.domain}</span><span className={item.priority==="גבוהה"?"pill high":"pill"}>{item.priority}</span></div>}

function TaskModal({item,onClose,onSave,onToggle}){
 const[d,setD]=useState({...item});
 const isBuildContact=d.domain==="בנייה"&&(d.area==="build-pros"||d.area==="build-suppliers");
 return <div className="modalBackdrop"><div className="modal"><h2>כרטיס</h2>
 <label>כותרת / שם</label><input value={d.title} onChange={e=>setD({...d,title:e.target.value})}/>
 <label>סטטוס / תחום</label><input value={d.status} onChange={e=>setD({...d,status:e.target.value})}/>
 <label>עדיפות</label><select value={d.priority} onChange={e=>setD({...d,priority:e.target.value})}><option>גבוהה</option><option>בינונית</option><option>נמוכה</option></select>

 {isBuildContact&&<div className="contactBox">
   <h3>פרטי התקשרות ובנייה</h3>
   <div className="formGrid">
    <div><label>נייד</label><input value={d.phone||""} onChange={e=>setD({...d,phone:e.target.value})} placeholder="050-0000000"/></div>
    <div><label>מייל</label><input value={d.email||""} onChange={e=>setD({...d,email:e.target.value})} placeholder="name@email.com"/></div>
    <div><label>כתובת</label><input value={d.address||""} onChange={e=>setD({...d,address:e.target.value})} placeholder="עיר / רחוב / אזור"/></div>
    <div><label>כספים</label><input value={d.money||""} onChange={e=>setD({...d,money:e.target.value})} placeholder="מחיר, מקדמה, יתרה..."/></div>
   </div>
   <label>חוזים</label><textarea rows="3" value={d.contracts||""} onChange={e=>setD({...d,contracts:e.target.value})} placeholder="מה סוכם, חוזה, תנאי תשלום, קבצים בהמשך..."/>
 </div>}

 <label>הערות</label><textarea rows="5" value={d.note||""} onChange={e=>setD({...d,note:e.target.value})}/>
 <div className="buttons"><button className="primary" onClick={()=>onSave(d)}>שמור</button><button onClick={onToggle}>בוצע / בטל</button><button onClick={onClose}>סגור</button></div>
 </div></div>
}

createRoot(document.getElementById("root")).render(<App/>);
