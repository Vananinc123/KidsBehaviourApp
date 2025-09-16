import React, { useEffect, useMemo, useState } from "react";
// Firebase (v9+ modular)
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, where, writeBatch } from "firebase/firestore";

/******************************
 * Firebase Setup
 *
 * 1) Add a .env file with:
 *    VITE_FB_API_KEY=...
 *    VITE_FB_AUTH_DOMAIN=...
 *    VITE_FB_PROJECT_ID=...
 *    VITE_FB_STORAGE_BUCKET=...
 *    VITE_FB_MSG_SENDER_ID=...
 *    VITE_FB_APP_ID=...
 *
 * 2) Firestore Rules (start with this safe version):
 *
 * rules_version = '2';
 * service cloud.firestore {
 *   match /databases/{database}/documents {
 *     match /users/{uid} {
 *       allow read, write: if request.auth != null && request.auth.uid == uid;
 *       match /entries/{entryId} {
 *         allow read, write: if request.auth != null && request.auth.uid == uid;
 *       }
 *     }
 *   }
 * }
 ******************************/

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_MSG_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};
console.log('FB apiKey prefix:', (import.meta.env.VITE_FB_API_KEY || '').slice(0, 6));
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ====== Utils ======
const fmtDate = (d) => new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
const todayStr = () => fmtDate(new Date());
const weekday = (iso) => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(iso).getDay()];
const uidLocal = () => Math.random().toString(36).slice(2,9);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

// ====== Defaults ======
const defaultChildren = [ { id: uidLocal(), name: "Samantha" }, { id: uidLocal(), name: "Diya" } ];

const defaultBehaviors = [
  "Said \"please & thank you\"",
  "Used kind words / thoughtful",
  "Listened the first time",
  "Didn't talk back",
  "Didn't interrupt",
  "Didn't yell or scream",
  "Didn't whine or cry",
  "Helped clean up",
  "Ate meal without complaining",
  "Brushed teeth 2×",
  "Completed chores",
  "Used nice voice / good manners",
  "Made good choices",
  "Was a good listener",
  "Cleaned my room",
  "Homework / studies completed",
  "Reading (20 min)",
  "Screen time within limit",
].map(label => ({ id: uidLocal(), label, enabled: true }));

const rewardTiers = [
  { id: "bronze", label: "Bronze", min: 40, emoji: "🥉" },
  { id: "silver", label: "Silver", min: 70, emoji: "🥈" },
  { id: "gold", label: "Gold", min: 100, emoji: "🥇" },
];

// ====== UI Bits ======
const Btn = ({className="", ...p}) => (
  <button {...p} className={"px-3 py-2 rounded-xl shadow-sm border text-sm hover:opacity-90 active:scale-[.98] transition " + className} />
);
const Card = ({title, right, children}) => (
  <div className="bg-white/90 backdrop-blur border rounded-2xl p-4 shadow-sm">
    <div className="flex items-center justify-between mb-2">
      <h3 className="font-semibold text-slate-800">{title}</h3>
      <div>{right}</div>
    </div>
    {children}
  </div>
);
const Ribbon = ({text, color}) => (
  <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border ${color}`}>{text}</div>
);

/*********** Auth ***********/
function Login(){
  const [mode,setMode]=useState("login");
  const [email,setEmail]=useState("");
  const [pw,setPw]=useState("");
  const [err,setErr]=useState("");

  const submit = async (e)=>{
    e.preventDefault(); setErr("");
    try{
      if(mode==="login"){
        await signInWithEmailAndPassword(auth, email, pw);
      } else {
        // sign up -> create user doc
        const cred = await createUserWithEmailAndPassword(auth, email, pw);
        const userRef = doc(db, "users", cred.user.uid);
        await setDoc(userRef, { email, children: defaultChildren, behaviors: defaultBehaviors });
      }
    }catch(e){ setErr(e.message); }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-indigo-50 via-sky-50 to-teal-50">
      <div className="w-full max-w-md bg-white/80 backdrop-blur p-6 rounded-3xl border shadow-sm">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">Kids Behavior Tracker</h1>
        <p className="text-slate-500 mb-6">{mode==="login"?"Sign in":"Create account"} with Email & Password</p>
        <form onSubmit={submit} className="space-y-3">
          <input className="w-full border rounded-xl px-3 py-2" placeholder="Email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} />
          <input className="w-full border rounded-xl px-3 py-2" placeholder="Password" type="password" value={pw} onChange={(e)=>setPw(e.target.value)} />
          {err && <div className="text-red-600 text-sm">{err}</div>}
          <Btn type="submit" className="w-full bg-indigo-600 text-white border-indigo-600">{mode==="login"?"Login":"Sign Up"}</Btn>
        </form>
        <div className="text-sm text-slate-600 mt-3">
          {mode==="login"? (
            <button onClick={()=>setMode("signup")} className="underline">New here? Create an account</button>
          ) : (
            <button onClick={()=>setMode("login")} className="underline">Have an account? Login</button>
          )}
        </div>
      </div>
    </div>
  );
}

/*********** Main App ***********/
function TrackerApp({user, profile}){
  const [activeTab,setActiveTab]=useState("daily");
  const [childId,setChildId]=useState(profile.children[0]?.id);
  const [date,setDate]=useState(todayStr());
  const [entry, setEntry] = useState(null); // current day entry doc
  const behaviors = profile.behaviors.filter(b=>b.enabled);

  // load entry for (childId, date)
  useEffect(()=>{
    const entryId = `${childId}_${date}`; // unique per child per day
    const ref = doc(db, "users", user.uid, "entries", entryId);
    const unsub = onSnapshot(ref, (snap)=>{
      if(snap.exists()) setEntry(snap.data()); else setEntry({ childId, date, items:{} });
    });
    return ()=>unsub();
  },[user.uid, childId, date]);

  const saveItem = async (behaviorId, delta)=>{
    const ref = doc(db, "users", user.uid, "entries", `${childId}_${date}`);
    const cur = (entry?.items?.[behaviorId]||0);
    const next = clamp(cur + delta, -1, 1);
    await setDoc(ref, { childId, date, items: { ...(entry?.items||{}), [behaviorId]: next } }, { merge:true });
  };

  const dayTotal = useMemo(()=>{
    if(!entry) return 0;
    return Object.values(entry.items||{}).reduce((a,b)=>a+(b||0),0);
  },[entry]);

  // monthly stats
  const [monthStats,setMonthStats]=useState({ total:0, byBehavior:{} });
  useEffect(()=>{
    const ym = date.slice(0,7);
    const col = collection(db, "users", user.uid, "entries");
    // naive client-side filter via snapshot (small scale MVP)
    const unsub = onSnapshot(col, (snap)=>{
      const stat = { total:0, byBehavior:{} };
      snap.forEach(d=>{
        const en = d.data();
        if(en.childId===childId && en.date?.startsWith(ym)){
          Object.entries(en.items||{}).forEach(([bid,val])=>{
            stat.total += val||0;
            stat.byBehavior[bid] = (stat.byBehavior[bid]||0) + (val||0);
          });
        }
      });
      setMonthStats(stat);
    });
    return ()=>unsub();
  },[user.uid, childId, date]);

  const currentTier = rewardTiers.slice().reverse().find(t=>monthStats.total>=t.min) || null;

  const BehaviorRow = ({b}) => {
    const val = entry?.items?.[b.id] || 0;
    return (
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-2 border-b">
        <div className="text-slate-700 text-sm flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-slate-100 border">⭐</span>
          {b.label}
        </div>
        <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-full transition-all ${val>0?"bg-emerald-400":""} ${val<0?"bg-rose-400":""}`} style={{width: `${Math.abs(val)*100}%`}}/>
        </div>
        <div className="flex items-center gap-2">
          <Btn className="border-rose-300 text-rose-600" onClick={()=>saveItem(b.id,-1)}>−</Btn>
          <div className={`w-10 text-center text-sm font-semibold ${val>0?"text-emerald-600": val<0?"text-rose-600":"text-slate-500"}`}>{val}</div>
          <Btn className="border-emerald-300 text-emerald-600" onClick={()=>saveItem(b.id,1)}>+</Btn>
        </div>
      </div>
    );
  };

  // Update profile in Firestore (children / behaviors)
  const updateProfile = async (mutator)=>{
    const newProfile = JSON.parse(JSON.stringify(profile));
    mutator(newProfile);
    await setDoc(doc(db, "users", user.uid), newProfile, { merge:true });
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white via-sky-50 to-indigo-50">
      {/* Topbar */}
      <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl">🧒</span>
          <select className="border rounded-xl px-3 py-2" value={childId} onChange={(e)=>setChildId(e.target.value)}>
            {profile.children.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="date" className="border rounded-xl px-3 py-2" value={date} onChange={(e)=>setDate(e.target.value)} />
          <Ribbon text={`${weekday(date)}, ${date}`} color="border-slate-200 text-slate-600" />
        </div>
        <div className="flex items-center gap-2">
          <Btn onClick={()=>setActiveTab("daily")}>Daily</Btn>
          <Btn onClick={()=>setActiveTab("report")}>Report</Btn>
          <Btn onClick={()=>setActiveTab("settings")}>Settings</Btn>
          <Btn className="bg-slate-800 text-white border-slate-800" onClick={()=>signOut(auth)}>Logout</Btn>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 pb-16 space-y-6">
        {activeTab==="daily" && (
          <Card title="Behavior Tracker" right={<Ribbon text={`Day Total: ${dayTotal}`} color="border-emerald-200 text-emerald-700"/>}>
            <div className="divide-y">
              {behaviors.map(b=> <BehaviorRow key={b.id} b={b} />)}
            </div>
          </Card>
        )}

        {activeTab==="report" && (
          <Card title="Monthly Summary" right={<Ribbon text={`Total: ${monthStats.total}`} color="border-indigo-200 text-indigo-700"/>}>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="md:col-span-2">
                <ul className="space-y-2">
                  {behaviors.map(b=> (
                    <li key={b.id} className="flex items-center justify-between border rounded-xl p-2">
                      <span className="text-sm text-slate-700">{b.label}</span>
                      <span className={`text-sm font-semibold ${ (monthStats.byBehavior[b.id]||0) >=0 ? "text-emerald-700" : "text-rose-700"}`}>{monthStats.byBehavior[b.id]||0}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-3">
                <h4 className="font-semibold text-slate-700">Reward Tiers</h4>
                {rewardTiers.map(t=> (
                  <div key={t.id} className={`flex items-center justify-between border rounded-xl px-3 py-2 ${monthStats.total>=t.min?"bg-emerald-50 border-emerald-200":"bg-white"}`}>
                    <div className="flex items-center gap-2"><span>{t.emoji}</span><span className="font-medium">{t.label}</span></div>
                    <span className="text-slate-600 text-sm">{t.min} pts</span>
                  </div>
                ))}
                {currentTier ? (
                  <div className="mt-2 text-emerald-700 text-sm">Current tier: <b>{currentTier.label}</b></div>
                ) : (
                  <div className="mt-2 text-slate-600 text-sm">Keep going to reach Bronze!</div>
                )}
              </div>
            </div>
          </Card>
        )}

        {activeTab==="settings" && (
          <Card title="Parent Settings">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold mb-2">Children</h4>
                <ul className="space-y-2">
                  {profile.children.map((c,i)=> (
                    <li key={c.id} className="flex items-center justify-between border rounded-xl px-3 py-2">
                      <span>{c.name}</span>
                      <div className="flex gap-2">
                        <Btn onClick={async()=>{
                          const n = prompt("Rename child", c.name); if(!n) return;
                          await updateProfile(p=>{ p.children[i].name=n; });
                        }}>Rename</Btn>
                        {profile.children.length>1 && <Btn className="text-rose-700" onClick={async()=>{
                          if(!confirm("Remove child?")) return;
                          await updateProfile(p=>{ p.children = p.children.filter(x=>x.id!==c.id); });
                          if(c.id===childId) setChildId(profile.children[0]?.id);
                        }}>Remove</Btn>}
                      </div>
                    </li>
                  ))}
                </ul>
                <Btn className="mt-3" onClick={async()=>{
                  await updateProfile(p=>{ p.children.push({id:uidLocal(), name:`Child ${p.children.length+1}`}); });
                }}>+ Add Child</Btn>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Behaviors</h4>
                <ul className="space-y-2 max-h-72 overflow-auto pr-1">
                  {profile.behaviors.map((b,i)=> (
                    <li key={b.id} className="flex items-center justify-between border rounded-xl px-3 py-2">
                      <span className={!b.enabled?"line-through text-slate-400":""}>{b.label}</span>
                      <div className="flex gap-2 items-center">
                        <Btn onClick={async()=>{
                          const n = prompt("Rename behavior", b.label); if(!n) return;
                          await updateProfile(p=>{ p.behaviors[i].label=n; });
                        }}>Rename</Btn>
                        <Btn onClick={async()=>{
                          await updateProfile(p=>{ p.behaviors[i].enabled=!p.behaviors[i].enabled; });
                        }}>{b.enabled?"Disable":"Enable"}</Btn>
                        <Btn className="text-rose-700" onClick={async()=>{
                          await updateProfile(p=>{ p.behaviors = p.behaviors.filter(x=>x.id!==b.id); });
                        }}>Delete</Btn>
                      </div>
                    </li>
                  ))}
                </ul>
                <Btn className="mt-3" onClick={async()=>{
                  const n = prompt("New behavior label"); if(!n) return;
                  await updateProfile(p=>{ p.behaviors.push({id:uidLocal(), label:n, enabled:true}); });
                }}>+ Add Behavior</Btn>
              </div>
            </div>
            <div className="mt-6">
              <h4 className="font-semibold mb-2">Reward Tiers (points only)</h4>
              <div className="grid grid-cols-3 gap-3">
                {rewardTiers.map(t=> (
                  <div key={t.id} className="border rounded-xl p-3 text-center">
                    <div className="text-2xl">{t.emoji}</div>
                    <div className="font-semibold">{t.label}</div>
                    <div className="text-slate-500 text-sm">{t.min} pts</div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function App(){
  const [fbUser,setFbUser]=useState(null);
  const [profile,setProfile]=useState(null);

  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, async (u)=>{
      setFbUser(u||null);
      if(!u){ setProfile(null); return; }
      const ref = doc(db, "users", u.uid);
      // live updates
      return onSnapshot(ref, async (snap)=>{
        if(snap.exists()) setProfile(snap.data());
        else {
          await setDoc(ref, { email: u.email, children: defaultChildren, behaviors: defaultBehaviors });
          setProfile({ email: u.email, children: defaultChildren, behaviors: defaultBehaviors });
        }
      });
    });
    return ()=>unsub();
  },[]);

  if(!fbUser) return <Login/>;
  if(!profile) return <div className="min-h-screen grid place-items-center text-slate-600">Loading…</div>;

  return <TrackerApp user={fbUser} profile={profile} />;
}