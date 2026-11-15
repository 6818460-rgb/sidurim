import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, setDoc, writeBatch } from "firebase/firestore";
import { db } from "./firebaseConfig";
import "./magentaCRM.css";

const STATUS = ["טרם פניתי", "נוצר קשר", "ממתין לאישור דיוור", "אושר דיוור", "נשלח חומר", "ממתין לתשובה", "הצעת מחיר", "לקוח פעיל", "לא רלוונטי"];
const CONSENT = ["לא ידוע", "הסכים", "סירב"];
const today = () => new Date().toLocaleDateString("en-CA");
const nextId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()+"-"+Math.random().toString(36).slice(2));
const displayDate = d => d ? new Date(d).toLocaleString("he-IL") : "";
const text = (s, max=20000) => typeof s === "string" ? s.slice(0,max) : "";
function saveBackup(data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));
  const a = document.createElement("a"); a.href=url; a.download="magenta-crm-backup-"+today()+".json"; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
export default function MagentaCRM({user}) {
  const [companies,setCompanies]=useState([]);
  const [contacts,setContacts]=useState([]);
  const [activities,setActivities]=useState([]);
  const [ready,setReady]=useState([false,false,false]);
  const [error,setError]=useState("");
  const [info,setInfo]=useState("");
  const [busy,setBusy]=useState(false);
  const [selectedId,setSelectedId]=useState("");
  const [search,setSearch]=useState("");
  const [newName,setNewName]=useState("");
  const [newType,setNewType]=useState("");
  const [contact,setContact]=useState({name:"",role:"",phone:"",email:""});
  const [call,setCall]=useState({type:"שיחה",summary:"",contactName:"",followUp:""});
  const [tab,setTab]=useState("companies");
  useEffect(()=>{
    setCompanies([]);setContacts([]);setActivities([]);setReady([false,false,false]);setSelectedId("");setError("");
    if (!user?.uid) return;
    const entries=[["magentaCompanies",setCompanies],["magentaContacts",setContacts],["magentaActivities",setActivities]];
    return entries.map(([key,set],i)=>onSnapshot(collection(db,"users",user.uid,key),snap=>{
      set(snap.docs.map(d=>({...d.data(),id:d.id})));
      setReady(r=>r.map((v,j)=>j===i?true:v));
    },e=>setError("קריאת Firebase נכשלה: "+e.message))).reduce((cleanup,fn)=>()=>{cleanup();fn()},()=>{});
  },[user?.uid]);
  const selected=companies.find(c=>c.id===selectedId);
  const people=contacts.filter(c=>c.companyId===selectedId);
  const logs=activities.filter(a=>a.companyId===selectedId).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const visible=useMemo(()=>companies.filter(c=>[c.name,c.type,c.status,...contacts.filter(p=>p.companyId===c.id).map(p=>p.name)].join(" ").toLowerCase().includes(search.trim().toLowerCase())),[companies,contacts,search]);
  const followups=companies.filter(c=>c.followUp).sort((a,b)=>a.followUp.localeCompare(b.followUp));
  async function run(task) {
    if(!user?.uid||busy) return;setBusy(true);setError("");setInfo("");
    try{await task()}catch(e){setError("לא נשמר: "+(e.message||e))}finally{setBusy(false)}
  }
  const save=(col,id,values)=>setDoc(doc(db,"users",user.uid,col,id),{...values,updatedAt:new Date().toISOString()},{merge:true});
  function addCompany() {
    if(!newName.trim())return setError("יש להזין שם חברה");
    run(async()=>{const id=nextId();await save("magentaCompanies",id,{name:text(newName.trim(),200),type:text(newType,200),status:STATUS[0],consent:CONSENT[0],consentDetails:"",followUp:"",createdAt:new Date().toISOString()});setSelectedId(id);setNewName("");setNewType("")});
  }
  function addContact(){
    if(!selected||!contact.name.trim())return setError("יש להזין שם איש קשר");
    run(async()=>{await save("magentaContacts",nextId(),{companyId:selected.id,...Object.fromEntries(Object.entries(contact).map(([k,v])=>[k,text(v,500)]))});setContact({name:"",role:"",phone:"",email:""})});
  }
  function addCall(){
    if(!selected||!call.summary.trim())return setError("יש לכתוב סיכום");
    run(async()=>{
      await save("magentaActivities",nextId(),{companyId:selected.id,type:call.type,summary:text(call.summary),contactName:call.contactName,date:new Date().toISOString()});
      if(call.followUp) await save("magentaCompanies",selected.id,{followUp:call.followUp});
      setCall({type:"שיחה",summary:"",contactName:"",followUp:""});setInfo("השיחה נשמרה");
    });
  }
  async function importBackup(event){
    const file=event.target.files?.[0];event.target.value="";if(!file)return;
    if(!ready.every(Boolean)||companies.length||contacts.length||activities.length)return setError("יבוא אפשרי רק למאגר ריק לאחר טעינה מלאה");
    if(file.size>5000000)return setError("הקובץ גדול מדי");
    run(async()=>{
      const data=JSON.parse(await file.text());
      if(!Array.isArray(data.companies)||!Array.isArray(data.contacts)||!Array.isArray(data.activities))throw Error("זה אינו גיבוי JSON מתאים");
      if(data.companies.length>2000||data.contacts.length>10000||data.activities.length>15000)throw Error("הגיבוי גדול מדי");
      const validIds=new Set(data.companies.map(x=>String(x.id)));
      const allowed={
        magentaCompanies:["name","type","status","priority","email","phone","notes","followUp","nextFollowUp","consent","consentDetails","source"],
        magentaContacts:["companyId","name","role","email","phone","notes","source"],
        magentaActivities:["companyId","type","summary","contactName","date"]
      };
      const rows=[];
      const mapped=new Map(data.companies.map(c=>[String(c.id),nextId()]));
      for(const [col,items] of [["magentaCompanies",data.companies],["magentaContacts",data.contacts],["magentaActivities",data.activities]]){
        for(const item of items){
          if(!item||typeof item!=="object")throw Error("רשומה לא תקינה");
          if(col!=="magentaCompanies"&&!validIds.has(String(item.companyId)))throw Error("נמצא איש קשר או תיעוד ללא חברה");
          const values={};for(const key of allowed[col])if(item[key]!==undefined)values[key]=text(item[key]);
          if(col!=="magentaCompanies")values.companyId=mapped.get(String(item.companyId));
          if(col==="magentaCompanies"){values.name=values.name||"ללא שם";values.followUp=values.followUp||values.nextFollowUp||"";delete values.nextFollowUp;values.status=STATUS.includes(values.status)?values.status:STATUS[0];values.consent=CONSENT.includes(values.consent)?values.consent:CONSENT[0];}
          rows.push({col,id:col==="magentaCompanies"?mapped.get(String(item.id)):nextId(),values});
        }
      }
      if(!window.confirm("לייבא "+data.companies.length+" חברות, "+data.contacts.length+" אנשי קשר ו-"+data.activities.length+" פעילויות לחשבון הפרטי שלך?"))return;
      for(let i=0;i<rows.length;i+=300){const batch=writeBatch(db);rows.slice(i,i+300).forEach(r=>batch.set(doc(db,"users",user.uid,r.col,r.id),{...r.values,updatedAt:new Date().toISOString()}));await batch.commit();}
      setInfo("היבוא הושלם. מומלץ לוודא את הנתונים לפני מחיקת הגיבוי המקומי.");
    });
  }
  if(!user)return <section className="mcrm" dir="rtl"><h2>מגנטה CRM</h2><p>התחבר לחשבון Google ב־SIDURIM כדי להמשיך.</p></section>;
  return <section className="mcrm" dir="rtl">
    <header><div><h2>מגנטה CRM</h2><p>מעקב פניות, שיחות ואנשי קשר</p></div><button disabled={!ready.every(Boolean)} onClick={()=>saveBackup({companies,contacts,activities})}>הורדת גיבוי JSON</button></header>
    {error&&<p role="alert" className="crm-error">{error}</p>}{info&&<p className="crm-info">{info}</p>}
    {!ready.every(Boolean)?<p>טוען נתונים מ־Firebase...</p>:<>
    <div className="crm-stats"><span><strong>{companies.length}</strong> חברות</span><span><strong>{contacts.length}</strong> אנשי קשר</span><span><strong>{activities.length}</strong> שיחות</span><span><strong>{followups.filter(c=>c.followUp<=today()).length}</strong> מעקבים להיום</span></div>
    {!companies.length&&<div className="crm-import"><b>ייבוא רשימת הלקוחות</b><p>בחר קובץ גיבוי JSON מגרסת הניסיון במחשב. נתוני הלקוחות לא מועלים ל־GitHub הציבורי.</p><input type="file" accept=".json,application/json" disabled={busy} onChange={importBackup}/></div>}
    <div className="crm-tabs"><button onClick={()=>setTab("companies")} className={tab==="companies"?"active":""}>חברות</button><button onClick={()=>setTab("followups")} className={tab==="followups"?"active":""}>מעקבים</button></div>
    {tab==="followups"?<div>{followups.map(c=><button className="crm-followup" key={c.id} onClick={()=>{setSelectedId(c.id);setTab("companies")}}><b>{c.name}</b><span>{c.followUp}</span><span>{c.status}</span></button>)}</div>:<div className="crm-layout"><aside><input placeholder="חיפוש חברה או איש קשר" value={search} onChange={e=>setSearch(e.target.value)}/><div className="crm-add"><input placeholder="שם חברה חדשה" value={newName} onChange={e=>setNewName(e.target.value)}/><input placeholder="תחום פעילות" value={newType} onChange={e=>setNewType(e.target.value)}/><button disabled={busy} onClick={addCompany}>הוסף חברה</button></div><div className="crm-company-list">{visible.map(c=><button key={c.id} className={selectedId===c.id?"selected":""} onClick={()=>setSelectedId(c.id)}><b>{c.name}</b><small>{c.status}</small></button>)}</div></aside>
      <article>{selected?<><h3>{selected.name}</h3><div className="crm-fields"><label>סטטוס<select value={selected.status||STATUS[0]} onChange={e=>run(()=>save("magentaCompanies",selected.id,{status:e.target.value}))}>{STATUS.map(s=><option key={s}>{s}</option>)}</select></label><label>תאריך לחזרה<input type="date" value={selected.followUp||""} onChange={e=>run(()=>save("magentaCompanies",selected.id,{followUp:e.target.value}))}/></label><label>הסכמה לדיוור<select value={selected.consent||CONSENT[0]} onChange={e=>run(()=>save("magentaCompanies",selected.id,{consent:e.target.value}))}>{CONSENT.map(s=><option key={s}>{s}</option>)}</select></label></div><p className="crm-muted">כתובת מייל פומבית איננה אישור לשליחת פרסומת.</p><h4>אנשי קשר ({people.length})</h4>{people.map(p=><div key={p.id} className="crm-person"><b>{p.name} · {p.role}</b><span>{p.email&&<a href={"mailto:"+encodeURIComponent(p.email)}>{p.email}</a>} {p.phone&&<a href={"tel:"+p.phone}>{p.phone}</a>}</span></div>)}<div className="crm-fields">{[["name","שם"],["role","תפקיד"],["email","דוא״ל"],["phone","טלפון"]].map(([k,label])=><label key={k}>{label}<input value={contact[k]} onChange={e=>setContact(o=>({...o,[k]:e.target.value}))}/></label>)}</div><button disabled={busy} onClick={addContact}>שמור איש קשר</button><h4>תיעוד שיחה חדשה</h4><div className="crm-fields"><label>סוג<select value={call.type} onChange={e=>setCall(o=>({...o,type:e.target.value}))}>{["שיחה","דוא״ל","פגישה","הערה"].map(s=><option key={s}>{s}</option>)}</select></label><label>איש קשר<select value={call.contactName} onChange={e=>setCall(o=>({...o,contactName:e.target.value}))}><option value="">בחר איש קשר</option>{people.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}</select></label><label>תאריך לחזרה<input type="date" value={call.followUp} onChange={e=>setCall(o=>({...o,followUp:e.target.value}))}/></label></div><textarea rows={4} placeholder="מה נאמר בשיחה ומה סוכם?" value={call.summary} onChange={e=>setCall(o=>({...o,summary:e.target.value}))}/><button disabled={busy} onClick={addCall}>שמור שיחה</button><h4>היסטוריית פעילות</h4>{logs.map(a=><div className="crm-log" key={a.id}><small>{a.type} · {displayDate(a.date)} · {a.contactName}</small><p>{a.summary}</p></div>)}</>:<p>בחר חברה מהעמודה מימין</p>}</article>
    </div>}
    <p className="crm-muted">המידע נשמר ב־Firebase בחשבון המחובר. לא נשלחים מיילים אוטומטית.</p></>}
  </section>;
