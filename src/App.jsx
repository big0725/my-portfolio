import React, { useState, useEffect, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { 
  Plus, Trash2, RefreshCw, TrendingUp, TrendingDown, Wallet, 
  PieChart as PieIcon, LineChart as ChartIcon, Sparkles, BrainCircuit, Newspaper, AlertCircle, Save, CheckCircle
} from 'lucide-react';

// Firebase SDK
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// 1. Firebase 설정 안전하게 가져오기
const getFirebaseConfig = () => {
  // 플랫폼 제공 설정 확인
  if (typeof __firebase_config !== 'undefined' && __firebase_config) {
    return JSON.parse(__firebase_config);
  }
  
  // Vercel 배포 시 사용자가 직접 입력해야 하는 값
  // 여기에 네 Firebase Console에서 복사한 값을 넣어야 저장 기능이 작동해!
  return {
    apiKey: "AIzaSyAXDclvf7UOOeHy99YLodyRUzoaU8qfJMQ",
  authDomain: "my-portfolio-21a66.firebaseapp.com",
  projectId: "my-portfolio-21a66",
  storageBucket: "my-portfolio-21a66.firebasestorage.app",
  messagingSenderId: "165388093088",
  appId: "1:165388093088:web:8499e24bf37fd078386bc5"
  };
};

const firebaseConfig = getFirebaseConfig();
const appId = typeof __app_id !== 'undefined' ? __app_id : 'portfolio-pro-v1';

// Firebase 초기화 실패 방지 로직
let auth, db;
try {
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase 초기화 에러. 설정값을 확인해줘:", e);
}

// [중요] Gemini API 키
const apiKey = "AIzaSyAF8EGHeS5pAitoMI4yFwG4Rb-5Vd_Dpkk"; 

const App = () => {
  const [user, setUser] = useState(null);
  const [assets, setAssets] = useState([]);
  const [newAsset, setNewAsset] = useState({ symbol: '', quantity: '', buyPrice: '' });
  const [prices, setPrices] = useState({});
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState('synced');
  const [error, setError] = useState(null);

  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [marketBriefing, setMarketBriefing] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // 초기 로드 시 에러 체크
  useEffect(() => {
    if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "YOUR_FIREBASE_API_KEY") {
      console.warn("Firebase API Key가 비어있어. 클라우드 저장 기능이 작동하지 않을 거야.");
      // 만약 Firebase가 없으면 로컬 스토리지로 대체하거나 에러 메시지 표시
      setError("Firebase 설정이 필요해. 가이드를 보고 설정을 마쳐줘.");
    }
  }, []);

  // 인증
  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
      } else {
        signInAnonymously(auth).catch(e => {
          console.error("익명 로그인 실패:", e);
          setError("로그인에 실패했어. Firebase Console에서 익명 로그인을 활성화했니?");
        });
      }
    });
    return () => unsubscribe();
  }, []);

  // 데이터 동기화
  useEffect(() => {
    if (!user || !db) return;
    const userDoc = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'portfolio');
    const unsubscribe = onSnapshot(userDoc, (snap) => {
      if (snap.exists()) setAssets(snap.data().assets || []);
    }, (err) => {
      console.error("Firestore 동기화 에러:", err);
    });
    return () => unsubscribe();
  }, [user]);

  const saveToCloud = async (updated) => {
    if (!user || !db) return;
    setSaveStatus('saving');
    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'portfolio'), { assets: updated }, { merge: true });
      setSaveStatus('synced');
    } catch (e) {
      setSaveStatus('error');
    }
  };

  // 시세 데이터 가져오기 (Gemini)
  const fetchMarketData = async () => {
    if (!apiKey) {
      setError("Gemini API 키가 설정되지 않았어. 시세를 가져올 수 없어.");
      return;
    }
    if (assets.length === 0) return;
    
    setLoading(true);
    try {
      const symbols = assets.map(a => a.symbol).join(', ');
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Get current price and 7D history for: ${symbols}. JSON format: { "currentPrices": { "TICKER": price }, "history": [] }` }] }],
          tools: [{ "google_search": {} }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });
      const resData = await response.json();
      const content = JSON.parse(resData.candidates[0].content.parts[0].text);
      if (content.currentPrices) setPrices(content.currentPrices);
      if (content.history) setHistory(content.history);
      setError(null);
    } catch (e) {
      console.error("시세 로드 실패:", e);
      setError("시세를 가져오지 못했어. API 키를 확인해봐.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (assets.length > 0 && Object.keys(prices).length === 0) fetchMarketData();
  }, [assets]);

  const addAsset = (e) => {
    e.preventDefault();
    if (!newAsset.symbol) return;
    const updated = [...assets, { ...newAsset, id: Date.now().toString(), quantity: parseFloat(newAsset.quantity || 0), buyPrice: parseFloat(newAsset.buyPrice || 0) }];
    setAssets(updated);
    saveToCloud(updated);
    setNewAsset({ symbol: '', quantity: '', buyPrice: '' });
  };

  const removeAsset = (id) => {
    const updated = assets.filter(a => a.id !== id);
    setAssets(updated);
    saveToCloud(updated);
  };

  const stats = useMemo(() => {
    let total = 0; let cost = 0;
    const dist = assets.map(a => {
      const p = prices[a.symbol] || a.buyPrice || 0;
      total += a.quantity * p;
      cost += a.quantity * a.buyPrice;
      return { name: a.symbol, value: a.quantity * p };
    });
    return { total, profit: total - cost, margin: cost > 0 ? ((total - cost) / cost) * 100 : 0, dist };
  }, [assets, prices]);

  const chartData = useMemo(() => {
    if (!history.length) return [];
    return history.map(d => {
      let v = 0;
      assets.forEach(a => v += a.quantity * (d[a.symbol] || prices[a.symbol] || a.buyPrice));
      return { date: d.date, value: v };
    });
  }, [history, assets, prices]);

  // 화면 렌더링
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <div>
            <h1 className="text-2xl font-black text-indigo-600 tracking-tight">INVEST PORTFOLIO</h1>
            <div className="text-[10px] font-bold text-slate-400 uppercase mt-1">
              Cloud Status: <span className={saveStatus === 'error' ? 'text-rose-500' : 'text-emerald-500'}>{saveStatus}</span>
            </div>
          </div>
          <button onClick={fetchMarketData} disabled={loading} className="bg-slate-900 text-white px-5 py-2 rounded-2xl text-sm font-bold flex items-center gap-2 hover:bg-indigo-600 transition-all">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> UPDATE
          </button>
        </header>

        {error && (
          <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl text-rose-600 text-sm font-medium flex items-center gap-2">
            <AlertCircle size={18} /> {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
            <div className="text-slate-400 text-xs font-black uppercase mb-2">Total Balance</div>
            <div className="text-4xl font-black">${stats.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            <div className={`text-sm font-bold mt-2 ${stats.profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
              {stats.profit >= 0 ? '+' : ''}{stats.profit.toLocaleString()} ({stats.margin.toFixed(2)}%)
            </div>
          </div>
          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-center">
             <div className="w-full h-32">
               <ResponsiveContainer width="100%" height="100%">
                 <LineChart data={chartData}>
                   <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={4} dot={false} />
                 </LineChart>
               </ResponsiveContainer>
             </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
              <tr>
                <th className="px-6 py-4">Asset</th>
                <th className="px-6 py-4">Qty</th>
                <th className="px-6 py-4">Price</th>
                <th className="px-6 py-4 text-right">Delete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {assets.map(a => (
                <tr key={a.id} className="font-bold">
                  <td className="px-6 py-4 text-indigo-600">{a.symbol}</td>
                  <td className="px-6 py-4">{a.quantity}</td>
                  <td className="px-6 py-4">${(prices[a.symbol] || a.buyPrice).toLocaleString()}</td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => removeAsset(a.id)} className="text-slate-300 hover:text-rose-500"><Trash2 size={16}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form onSubmit={addAsset} className="p-6 bg-slate-50/50 flex flex-wrap gap-3">
            <input placeholder="SYMBOL" className="flex-1 min-w-[100px] p-3 rounded-2xl border-none ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-xs font-bold" value={newAsset.symbol} onChange={e => setNewAsset({...newAsset, symbol: e.target.value.toUpperCase()})} />
            <input type="number" placeholder="QTY" className="w-24 p-3 rounded-2xl border-none ring-1 ring-slate-200 outline-none text-xs font-bold" value={newAsset.quantity} onChange={e => setNewAsset({...newAsset, quantity: e.target.value})} />
            <button type="submit" className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black text-xs">ADD ASSET</button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default App;
