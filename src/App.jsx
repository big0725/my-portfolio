import React, { useState, useEffect, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { 
  Plus, Trash2, RefreshCw, TrendingUp, TrendingDown, Wallet, 
  PieChart as PieIcon, LineChart as ChartIcon, Sparkles, BrainCircuit, Newspaper, AlertCircle, Save, CheckCircle
} from 'lucide-react';

// Firebase SDK 임포트
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

/**
 * [운영 가이드]
 * 1. __firebase_config는 이 환경 전용이야. Vercel 배포 시에는 직접 Firebase 프로젝트를 만들고
 * 아래 fallbackConfig에 네 설정값을 넣어야 데이터가 저장돼.
 * 2. apiKey (Gemini) 역시 직접 발급받은 키를 넣어야 실시간 시세가 작동해.
 */

const getFirebaseConfig = () => {
  try {
    if (typeof __firebase_config !== 'undefined' && __firebase_config) {
      return JSON.parse(__firebase_config);
    }
  } catch (e) {
    console.warn("Global config not found. Using fallback.");
  }
  
  // Vercel 배포 시 여기에 네 실제 Firebase 설정을 넣어줘
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

// Firebase 초기화 (중복 방지)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);

// [중요] 여기에 Gemini API 키를 입력해!
const apiKey = "AIzaSyAF8EGHeS5pAitoMI4yFwG4Rb-5Vd_Dpkk"; 

const App = () => {
  const [user, setUser] = useState(null);
  const [assets, setAssets] = useState([]);
  const [newAsset, setNewAsset] = useState({ symbol: '', quantity: '', buyPrice: '' });
  const [prices, setPrices] = useState({});
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState('synced'); // 'synced', 'saving', 'error'
  const [error, setError] = useState(null);

  // AI 관련 상태
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [marketBriefing, setMarketBriefing] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // 1. 인증 로직 (RULE 3 준수)
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
        setError("인증 실패: 설정을 확인해줘.");
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. 데이터 동기화 (RULE 1 준수)
  useEffect(() => {
    if (!user) return;

    // 경로: /artifacts/{appId}/users/{userId}/{collectionName}
    const userDoc = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'portfolio');
    
    const unsubscribe = onSnapshot(userDoc, (docSnap) => {
      if (docSnap.exists()) {
        setAssets(docSnap.data().assets || []);
      }
    }, (err) => {
      console.error("Sync error:", err);
    });

    return () => unsubscribe();
  }, [user]);

  // 클라우드 저장 함수
  const saveToCloud = async (updatedAssets) => {
    if (!user) return;
    setSaveStatus('saving');
    try {
      const userDoc = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'portfolio');
      await setDoc(userDoc, { assets: updatedAssets }, { merge: true });
      setSaveStatus('synced');
    } catch (err) {
      setSaveStatus('error');
    }
  };

  // 3. 시장 데이터 가져오기
  const fetchWithRetry = async (url, options, retries = 5, backoff = 1000) => {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      if (retries > 0) {
        await new Promise(r => setTimeout(r, backoff));
        return fetchWithRetry(url, options, retries - 1, backoff * 2);
      }
      throw err;
    }
  };

  const fetchMarketData = async () => {
    if (assets.length === 0 || !apiKey) {
      if (!apiKey) setError("Gemini API 키가 필요해.");
      return;
    }
    setLoading(true);
    const symbols = assets.map(a => a.symbol).join(', ');
    const queryStr = `Get current and 7D history for: ${symbols}. JSON: { "currentPrices": {}, "history": [] }`;

    try {
      const result = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: queryStr }] }],
            tools: [{ "google_search": {} }],
            generationConfig: { responseMimeType: "application/json" }
          })
        }
      );
      const data = JSON.parse(result.candidates[0].content.parts[0].text);
      if (data.currentPrices) setPrices(data.currentPrices);
      if (data.history) setHistory(data.history);
    } catch (err) {
      setError("시세 정보를 가져오지 못했어. 키를 확인해봐.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (assets.length > 0 && Object.keys(prices).length === 0) fetchMarketData();
  }, [assets]);

  // AI 분석 기능들
  const analyzePortfolio = async () => {
    if (!apiKey) return;
    setIsAiLoading(true);
    try {
      const result = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `이 포트폴리오를 분석해서 한국어로 조언해줘: ${JSON.stringify(assets)}` }] }]
          })
        }
      );
      setAiAnalysis(result.candidates[0].content.parts[0].text);
    } finally {
      setIsAiLoading(false);
    }
  };

  const getBriefing = async () => {
    if (!apiKey) return;
    setIsAiLoading(true);
    try {
      const result = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${assets.map(a=>a.symbol).join(', ')}에 대한 최신 뉴스를 한국어로 요약해줘.` }] }],
            tools: [{ "google_search": {} }]
          })
        }
      );
      setMarketBriefing(result.candidates[0].content.parts[0].text);
    } finally {
      setIsAiLoading(false);
    }
  };

  const addAsset = (e) => {
    e.preventDefault();
    if (!newAsset.symbol || !newAsset.quantity) return;
    const updated = [...assets, { ...newAsset, id: Date.now().toString(), quantity: parseFloat(newAsset.quantity), buyPrice: parseFloat(newAsset.buyPrice || 0) }];
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
    let totalValue = 0;
    let totalCost = 0;
    const distribution = assets.map(a => {
      const cp = prices[a.symbol] || a.buyPrice || 0;
      const val = a.quantity * cp;
      totalValue += val;
      totalCost += a.quantity * a.buyPrice;
      return { name: a.symbol, value: val };
    });
    const profit = totalValue - totalCost;
    const margin = totalCost > 0 ? (profit / totalCost) * 100 : 0;
    return { totalValue, profit, margin, distribution };
  }, [assets, prices]);

  const chartData = useMemo(() => {
    if (history.length === 0) return [];
    return history.map(day => {
      let total = 0;
      assets.forEach(a => {
        const p = day[a.symbol] || prices[a.symbol] || a.buyPrice;
        total += a.quantity * p;
      });
      return { date: day.date, value: total };
    });
  }, [history, assets, prices]);

  const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981'];

  if (!user && !error) return <div className="min-h-screen bg-slate-50 flex items-center justify-center">접속 중...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
      <div className="max-w-6xl mx-auto space-y-6">
        
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-2">
              <Wallet className="text-indigo-600" /> 클라우드 포트폴리오
            </h1>
            <div className="flex items-center gap-2 mt-1">
               <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-bold uppercase tracking-widest">
                 {saveStatus === 'saving' ? 'Saving...' : 'Synced'}
               </span>
               <span className="text-[10px] text-slate-400 font-mono">ID: {user?.uid.slice(0, 8)}</span>
            </div>
          </div>
          <button onClick={fetchMarketData} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl flex items-center gap-2 font-bold transition-all shadow-lg shadow-indigo-100 disabled:opacity-50">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> 시세 갱신
          </button>
        </header>

        {error && <div className="bg-rose-50 border-2 border-rose-100 text-rose-600 p-4 rounded-2xl font-medium flex items-center gap-2"><AlertCircle size={20}/> {error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <div className="text-slate-400 text-xs font-bold uppercase mb-2">총 자산</div>
            <div className="text-3xl font-black">${stats.totalValue.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
          </div>
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <div className="text-slate-400 text-xs font-bold uppercase mb-2">총 손익</div>
            <div className={`text-3xl font-black ${stats.profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
              {stats.profit >= 0 ? '+' : ''}{stats.profit.toLocaleString()} ({stats.margin.toFixed(1)}%)
            </div>
          </div>
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-center">
            <div className="flex gap-2">
              <button onClick={analyzePortfolio} disabled={isAiLoading} className="flex-1 bg-slate-900 text-white py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-slate-800"><BrainCircuit size={14}/> 분석</button>
              <button onClick={getBriefing} disabled={isAiLoading} className="flex-1 border-2 border-slate-100 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-slate-50"><Newspaper size={14}/> 뉴스</button>
            </div>
          </div>
        </div>

        {(aiAnalysis || marketBriefing || isAiLoading) && (
          <div className="bg-indigo-900 text-white p-6 rounded-3xl shadow-xl relative overflow-hidden">
            <Sparkles className="absolute -right-4 -top-4 w-24 h-24 opacity-10 rotate-12" />
            <h4 className="text-indigo-200 text-xs font-black uppercase mb-4 tracking-widest flex items-center gap-2">
              <Sparkles size={14}/> Gemini AI Insight
            </h4>
            <div className="text-sm leading-relaxed whitespace-pre-wrap font-medium">
              {isAiLoading ? "데이터를 분석하고 시장 소식을 확인하는 중이야..." : (aiAnalysis || marketBriefing)}
            </div>
            {!isAiLoading && <button onClick={()=>{setAiAnalysis(null); setMarketBriefing(null);}} className="mt-4 text-[10px] text-indigo-400 hover:text-white underline">닫기</button>}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-slate-100 h-[380px]">
            <h3 className="font-black text-sm uppercase tracking-wider mb-6 flex items-center gap-2"><ChartIcon size={16}/> Performance (7D)</h3>
            <div className="h-[280px]">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="date" hide />
                    <YAxis hide domain={['auto', 'auto']} />
                    <Tooltip contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)'}} />
                    <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={4} dot={false} activeDot={{r: 6, fill: '#6366f1'}} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <div className="h-full flex items-center justify-center text-slate-300 italic text-sm font-medium">시세 갱신을 누르면 차트가 활성화돼.</div>}
            </div>
          </div>
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 h-[380px]">
            <h3 className="font-black text-sm uppercase tracking-wider mb-6 flex items-center gap-2"><PieIcon size={16}/> Allocation</h3>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.distribution} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {stats.distribution.map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 bg-slate-50/50 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-black text-sm uppercase tracking-wider">Asset List</h3>
            <div className="text-[10px] text-slate-400 flex items-center gap-1 font-bold"><Save size={10}/> 실시간 클라우드 저장 중</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-400 font-black text-[10px] uppercase tracking-widest border-b border-slate-50">
                <tr>
                  <th className="px-6 py-4">Symbol</th>
                  <th className="px-6 py-4">Quantity</th>
                  <th className="px-6 py-4">Avg. Cost</th>
                  <th className="px-6 py-4">Price</th>
                  <th className="px-6 py-4">Gain</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {assets.map((a) => {
                  const cp = prices[a.symbol] || 0;
                  const g = a.buyPrice > 0 ? ((cp - a.buyPrice) / a.buyPrice) * 100 : 0;
                  return (
                    <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-5 font-black text-indigo-600">{a.symbol}</td>
                      <td className="px-6 py-5 font-bold">{a.quantity.toLocaleString()}</td>
                      <td className="px-6 py-5 text-slate-400 font-medium">${a.buyPrice.toLocaleString()}</td>
                      <td className="px-6 py-5 font-black">${cp > 0 ? cp.toLocaleString() : '-'}</td>
                      <td className={`px-6 py-5 font-black ${g >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {cp > 0 ? `${g >= 0 ? '+' : ''}${g.toFixed(1)}%` : '-'}
                      </td>
                      <td className="px-6 py-5 text-right">
                        <button onClick={() => removeAsset(a.id)} className="p-2 text-slate-200 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><Trash2 size={16}/></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <form onSubmit={addAsset} className="p-6 bg-slate-50/30 grid grid-cols-1 md:grid-cols-4 gap-4 border-t border-slate-100">
            <input placeholder="Symbol (TSLA)" className="p-3 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 focus:ring-0 outline-none font-bold" value={newAsset.symbol} onChange={e => setNewAsset({...newAsset, symbol: e.target.value.toUpperCase()})} />
            <input type="number" placeholder="Qty" className="p-3 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 focus:ring-0 outline-none font-bold" value={newAsset.quantity} onChange={e => setNewAsset({...newAsset, quantity: e.target.value})} />
            <input type="number" placeholder="Cost ($)" className="p-3 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 focus:ring-0 outline-none font-bold" value={newAsset.buyPrice} onChange={e => setNewAsset({...newAsset, buyPrice: e.target.value})} />
            <button type="submit" className="bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">추가</button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default App;
