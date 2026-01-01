import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import {
  Plus, PlusCircle, Trash2, RefreshCw, TrendingUp, TrendingDown, Wallet,
  PieChart as PieIcon, LineChart as ChartIcon, Sparkles, BrainCircuit, Newspaper, AlertCircle, Save, CheckCircle,
  LayoutDashboard, History, Settings, ArrowUpRight, ArrowDownRight, Briefcase
} from 'lucide-react';

// Firebase SDK
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut
} from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// 1. 보안 설정
const ADMIN_EMAIL = "big0725@gmail.com";

// 2. Firebase 설정 안전하게 가져오기
const getFirebaseConfig = () => {
  if (typeof __firebase_config !== 'undefined' && __firebase_config) {
    return JSON.parse(__firebase_config);
  }
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

let auth, db, googleProvider;
try {
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  auth = getAuth(app);
  db = getFirestore(app);
  googleProvider = new GoogleAuthProvider();
} catch (e) {
  console.error("Firebase 초기화 에러:", e);
}

// API 키 가져오기 헬퍼 (보안을 위해 환경 변수만 사용)
const getApiKey = () => {
  return import.meta.env.VITE_GEMINI_API_KEY;
};

const App = () => {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [assets, setAssets] = useState([]);
  const [newAsset, setNewAsset] = useState({ symbol: '', quantity: '', buyPrice: '' });
  const [prices, setPrices] = useState({});
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState('synced');
  const [error, setError] = useState(null);
  const [aiInsights, setAiInsights] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // 초기 로드 시 에러 체크
  useEffect(() => {
    if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "YOUR_FIREBASE_API_KEY") {
      setError("Firebase 설정이 필요합니다. 가이드를 참고하세요.");
    }
  }, []);

  // 인증 감시
  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error("로그인 실패:", e);
      setError("로그인에 실패했습니다.");
    }
  };

  const handleLogout = () => signOut(auth);

  // 데이터 동기화 (이제 모든 유저가 동일한 shared 경로를 봅니다)
  useEffect(() => {
    if (!db) return;
    // 고정된 경로에서 데이터를 읽어옵니다.
    const sharedDoc = doc(db, 'artifacts', appId, 'settings', 'shared-portfolio');
    const unsubscribe = onSnapshot(sharedDoc, (snap) => {
      if (snap.exists()) setAssets(snap.data().assets || []);
    }, (err) => {
      console.error("Firestore 동기화 에러:", err);
    });
    return () => unsubscribe();
  }, []);

  const saveToCloud = async (updated) => {
    // 본인이 아니면 저장 시도를 차단합니다.
    if (!user || user.email !== ADMIN_EMAIL) {
      alert("관리자만 수정할 수 있습니다.");
      return;
    }
    setSaveStatus('saving');
    try {
      const sharedDoc = doc(db, 'artifacts', appId, 'settings', 'shared-portfolio');
      await setDoc(sharedDoc, { assets: updated }, { merge: true });
      setSaveStatus('synced');
    } catch (e) {
      setSaveStatus('error');
    }
  };

  const fetchMarketData = async () => {
    const currentApiKey = getApiKey();

    if (!currentApiKey) {
      setError("Gemini API 키가 설정되지 않았습니다. 관리자 설정을 확인해주세요.");
      setLoading(false);
      return;
    }
    if (assets.length === 0) return;

    setLoading(true);
    try {
      const symbols = assets.map(a => a.symbol).join(', ');
      const currentDate = new Date().toISOString().split('T')[0];
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${currentApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Current Date: ${currentDate}. Using Google Search, find the absolute latest real-time market prices and 7-day history for: ${symbols}.
              Return ONLY a JSON object string. Do not add markdown code blocks.
              {
                "currentPrices": { "TICKER": 1234.56 },
                "history": [{ "date": "YYYY-MM-DD", "TICKER": 1234.56 }]
              }`
            }]
          }],
          tools: [{ google_search: {} }]
          // Search Grounding과 호환되지 않는 response_mime_type 제거
        })
      });
      const resData = await response.json();

      if (resData.error) throw new Error(resData.error.message);

      let textResponse = resData.candidates[0].content.parts[0].text;
      // 마크다운 코드 블록이 포함되어 있을 경우 추출
      const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("JSON 응답을 찾을 수 없습니다.");

      const content = JSON.parse(jsonMatch[0]);
      if (content.currentPrices) {
        const normalizedPrices = {};
        // 티커 대소문자 무관하게 매칭하기 위해 모든 키를 대문자로 변환
        Object.keys(content.currentPrices).forEach(key => {
          const val = content.currentPrices[key];
          const cleanKey = key.toUpperCase();
          normalizedPrices[cleanKey] = typeof val === 'string' ? parseFloat(val.replace(/[^0-9.]/g, '')) : val;
        });
        setPrices(normalizedPrices);
      }
      if (content.history) setHistory(content.history);
      setError(null);

      // 가격 데이터를 가져온 후 AI 분석 실행
      fetchAiInsights(symbols, content.currentPrices);
    } catch (e) {
      console.error("시세 로드 실패:", e);
      setError(`시세 로드 실패: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchAiInsights = async (symbols, currentPrices) => {
    const currentApiKey = getApiKey();
    if (!currentApiKey || !assets.length) return;
    setIsAiLoading(true);
    try {
      const portfolioSummary = assets.map(a => `${a.symbol}: ${a.quantity}주 (보유단가: $${a.buyPrice || 'unknown'})`).join(', ');

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${currentApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `당신은 세계적인 투자 거장 3인(워렌 버핏, 스탠리 드러켄밀러, 캐시 우드)입니다. 다음 포트폴리오를 분석해주세요: [${portfolioSummary}].
              구글 검색(Google Search)을 사용하여 현재 시장 상황을 반영한 각 인물의 철학에 따른 분석과 구체적인 행동 지침, 그리고 현재 시점에서 새롭게 매수를 추천하는 '최애 종목' 하나를 제안해주세요.
              
              반드시 다음 JSON 구조로만 응답하세요 (Markdown 블록 없이 스트링만):
              {
                "buffett": { "advice": "조언", "action": "지침", "pick": { "symbol": "TICKER", "reason": "이유" } },
                "druckenmiller": { "advice": "조언", "action": "지침", "pick": { "symbol": "TICKER", "reason": "이유" } },
                "cathie": { "advice": "조언", "action": "지침", "pick": { "symbol": "TICKER", "reason": "이유" } }
              }`
            }]
          }],
          tools: [{ google_search: {} }]
        })
      });
      const resData = await response.json();
      if (resData.error) throw new Error(resData.error.message);

      const textResponse = resData.candidates[0].content.parts[0].text;
      const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        setAiInsights(JSON.parse(jsonMatch[0]));
      }
    } catch (e) {
      console.error("AI Insight 생성 실패:", e);
    } finally {
      setIsAiLoading(false);
    }
  };

  useEffect(() => {
    if (assets.length > 0) {
      console.log("Assets changed, fetching market data...", assets);
      fetchMarketData();
    }
  }, [JSON.stringify(assets)]); // 자산 데이터 자체가 변경될 때마다 실행 (deep comparison 대용)

  const addAsset = (e) => {
    e.preventDefault();
    if (user?.email !== ADMIN_EMAIL) return;
    if (!newAsset.symbol) return;
    const cleanSymbol = newAsset.symbol.trim().toUpperCase();
    const updated = [...assets, { ...newAsset, symbol: cleanSymbol, id: Date.now().toString(), quantity: parseFloat(newAsset.quantity || 0), buyPrice: parseFloat(newAsset.buyPrice || 0) }];
    setAssets(updated);
    saveToCloud(updated);
    setNewAsset({ symbol: '', quantity: '', buyPrice: '' });
  };

  const removeAsset = (id) => {
    if (user?.email !== ADMIN_EMAIL) return;
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

  const isAdmin = user?.email === ADMIN_EMAIL;

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-slate-400 font-bold animate-pulse">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200">
      <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8">

        {/* Top Navigation */}
        <nav className="flex justify-between items-center glass-card p-4 px-8 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-500/30">
              <Briefcase className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tighter gradient-text leading-tight">PORTFOLIO PRO</h1>
              {isAdmin && <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full uppercase tracking-tighter">Admin Mode</span>}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={fetchMarketData}
              disabled={loading}
              className="btn-secondary h-10 px-4 flex items-center justify-center gap-2 text-xs"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span className="hidden md:inline">{loading ? 'SYNCING...' : 'REFRESH'}</span>
            </button>

            {user ? (
              <button
                onClick={handleLogout}
                className="bg-white/5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 p-2.5 rounded-xl transition-all border border-white/5 flex items-center gap-2 text-xs font-bold"
              >
                <img src={user.photoURL} className="w-5 h-5 rounded-full shadow-inner" alt="profile" />
                <span className="hidden lg:inline">EXIT</span>
              </button>
            ) : (
              <button
                onClick={handleLogin}
                className="btn-primary py-2 px-4 text-xs flex items-center gap-2"
              >
                <Sparkles size={14} />
                <span className="hidden md:inline">ADMIN LOGIN</span>
              </button>
            )}
          </div>
        </nav>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-2xl text-rose-400 text-sm font-medium flex items-center gap-3 animate-pulse">
            <AlertCircle size={20} /> {error}
          </div>
        )}

        {/* Guru Insights Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              name: "워렌 버핏",
              role: "Value Legend",
              data: aiInsights?.buffett,
              color: "amber",
              image: "/buffett.png",
              icon: <TrendingUp className="text-amber-400" size={16} />
            },
            {
              name: "S. 드러켄밀러",
              role: "Macro Master",
              data: aiInsights?.druckenmiller,
              color: "blue",
              image: "/druckenmiller.png",
              icon: <BrainCircuit className="text-blue-400" size={16} />
            },
            {
              name: "캐시 우드",
              role: "Innovation Icon",
              data: aiInsights?.cathie,
              color: "fuchsia",
              image: "/cathie.png",
              icon: <Sparkles className="text-fuchsia-400" size={16} />
            }
          ].map((guru, i) => (
            <div key={i} className={`glass-card p-6 border-${guru.color}-500/10 group hover:border-${guru.color}-500/30 transition-all duration-500 flex flex-col h-full`}>
              <div className="flex items-center gap-4 mb-4">
                <div className="relative">
                  <div className={`absolute -inset-1 bg-gradient-to-tr from-${guru.color}-500 to-transparent rounded-full opacity-20 group-hover:opacity-40 transition-opacity`}></div>
                  <img src={guru.image} alt={guru.name} className="w-12 h-12 rounded-full object-cover border-2 border-white/10 relative z-10" />
                  <div className={`absolute -bottom-1 -right-1 bg-[#1e293b] p-1 rounded-full border border-white/5 z-20`}>
                    {guru.icon}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">{guru.name}</h3>
                  <p className={`text-[9px] font-bold text-${guru.color}-400 uppercase tracking-widest`}>{guru.role}</p>
                </div>
              </div>

              <div className="flex-1 space-y-4">
                {isAiLoading ? (
                  <div className="space-y-3 py-2">
                    <div className="h-2 bg-white/5 rounded-full w-full animate-pulse"></div>
                    <div className="h-2 bg-white/5 rounded-full w-4/5 animate-pulse"></div>
                    <div className="h-8 bg-white/5 rounded-xl w-full animate-pulse mt-4"></div>
                  </div>
                ) : (
                  <>
                    <p className="text-xs font-medium text-slate-400 leading-relaxed italic">
                      "{guru.data?.advice || "시장을 분석하고 있습니다..."}"
                    </p>
                    {guru.data?.action && (
                      <div className={`mt-4 p-3 rounded-xl bg-${guru.color}-500/5 border border-${guru.color}-500/10`}>
                        <div className="flex items-center gap-2 mb-1">
                          <CheckCircle size={10} className={`text-${guru.color}-400`} />
                          <span className={`text-[10px] font-black text-${guru.color}-400 uppercase tracking-tighter`}>Action Plan</span>
                        </div>
                        <p className="text-[11px] font-black text-white leading-snug">
                          {guru.data.action}
                        </p>
                      </div>
                    )}
                    {guru.data?.pick && (
                      <div className={`mt-3 p-3 rounded-xl bg-white/5 border border-white/5 relative overflow-hidden group/pick`}>
                        <div className={`absolute top-0 right-0 p-1 bg-${guru.color}-500/10 rounded-bl-lg`}>
                          <Sparkles size={8} className={`text-${guru.color}-400`} />
                        </div>
                        <div className="flex items-start gap-3">
                          <div className={`text-xl font-black text-white italic`}>{guru.data.pick.symbol}</div>
                          <div className="flex-1">
                            <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Top Pick</div>
                            <p className="text-[10px] font-bold text-slate-400 leading-tight line-clamp-2">
                              {guru.data.pick.reason}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Main Balance Card */}
          <div className="lg:col-span-2 glass-card p-10 relative overflow-hidden group">
            <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-indigo-600/10 rounded-full blur-[80px] group-hover:bg-indigo-600/20 transition-all duration-700"></div>
            <div className="relative z-10 space-y-4">
              <div className="text-slate-500 text-xs font-black uppercase tracking-widest flex items-center gap-2">
                <Wallet size={14} /> Total Net Worth
              </div>
              <div className="text-6xl font-black text-white tracking-tight">
                ${stats.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div className="flex items-center gap-3">
                <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black ${stats.profit >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                  {stats.profit >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {stats.profit >= 0 ? '+' : ''}{Math.abs(stats.profit).toLocaleString()} ({stats.margin.toFixed(2)}%)
                </div>
                <div className="text-slate-500 text-xs font-bold uppercase">Public View</div>
              </div>
            </div>

            <div className="mt-12 h-48 w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={4} fillOpacity={1} fill="url(#colorValue)" />
                  <Tooltip cursor={{ stroke: '#ffffff20', strokeWidth: 2 }} contentStyle={{ display: 'none' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Quick Stats / AI Insights Placeholder */}
          <div className="space-y-6">
            <div className="glass-card p-8 border-indigo-500/20 bg-indigo-500/5 group hover:bg-indigo-500/10 transition-colors">
              <div className="flex items-center justify-between mb-6">
                <div className="bg-indigo-600/20 p-3 rounded-2xl">
                  <Sparkles className="text-indigo-400" size={20} />
                </div>
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Market Analysis</span>
              </div>
              <p className="text-sm font-medium text-slate-300 leading-relaxed italic">
                "{stats.margin > 5 ? "Portfolio is performing well. High growth momentum detected in current holdings." : "Monitoring market volatility. Staying balanced is key in the current cycle."}"
              </p>
            </div>

            <div className="glass-card p-6">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <PieIcon size={14} /> Allocation
              </h3>
              <div className="space-y-3">
                {stats.dist.slice(0, 3).map((d, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-400">{d.name}</span>
                    <div className="flex-1 mx-4 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500" style={{ width: `${stats.total > 0 ? (d.value / stats.total) * 100 : 0}%` }}></div>
                    </div>
                    <span className="text-sm font-black text-white">{stats.total > 0 ? ((d.value / stats.total) * 100).toFixed(1) : 0}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Asset Table Section */}
        <div className="glass-card overflow-hidden">
          <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
            <h2 className="text-sm font-black text-slate-300 uppercase tracking-widest flex items-center gap-2">
              <LayoutDashboard size={16} className="text-indigo-400" /> Investment Inventory
            </h2>
            <div className="text-xs text-slate-500 font-bold">{assets.length} Assets</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white/2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <th className="px-8 py-5">Ticker</th>
                  <th className="px-8 py-5">Qty</th>
                  <th className="px-8 py-5 text-indigo-400/70">Avg. Cost</th>
                  <th className="px-8 py-5">Current</th>
                  <th className="px-8 py-5">P/L (Return)</th>
                  {isAdmin && <th className="px-8 py-5 text-right"><Settings size={14} /></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {assets.map(a => {
                  const currentPrice = prices[a.symbol] || a.buyPrice || 0;
                  const profit = (currentPrice - a.buyPrice) * a.quantity;
                  const pPercent = a.buyPrice > 0 ? ((currentPrice - a.buyPrice) / a.buyPrice) * 100 : 0;

                  return (
                    <tr key={a.id} className="hover:bg-white/5 transition-colors group">
                      <td className="px-8 py-5 font-black text-white text-lg">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${profit >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                            {a.symbol[0]}
                          </div>
                          {a.symbol}
                        </div>
                      </td>
                      <td className="px-8 py-5 text-slate-400 font-bold">{a.quantity.toLocaleString()}</td>
                      <td className="px-8 py-5 text-slate-500 font-medium">${a.buyPrice.toLocaleString()}</td>
                      <td className="px-8 py-5 font-black text-white">${currentPrice.toLocaleString()}</td>
                      <td className="px-8 py-5">
                        <div className={`flex flex-col`}>
                          <span className={`font-black text-sm ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {profit >= 0 ? '+' : '-'}${Math.abs(profit).toLocaleString()}
                          </span>
                          <span className={`text-[10px] font-bold ${profit >= 0 ? 'text-emerald-500/50' : 'text-rose-500/50'}`}>
                            ({pPercent.toFixed(2)}%)
                          </span>
                        </div>
                      </td>
                      {isAdmin && (
                        <td className="px-8 py-5 text-right">
                          <button onClick={() => removeAsset(a.id)} className="text-slate-600 hover:text-rose-500 p-2 bg-white/5 rounded-xl transition-all">
                            <Trash2 size={18} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {isAdmin && (
            <div className="p-8 bg-indigo-600/5 animate-in slide-in-from-bottom duration-500 border-t border-white/5">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                  <PlusCircle size={14} /> 매수 자산 등록
                </h3>
                <span className="text-[10px] text-slate-500 font-bold uppercase">Admin Console</span>
              </div>
              <form onSubmit={addAsset} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
                <div className="relative col-span-1 md:col-span-2">
                  <input
                    placeholder="Ticker (e.g. BTC, NVDA)"
                    className="glass-input w-full pl-12"
                    value={newAsset.symbol}
                    onChange={e => setNewAsset({ ...newAsset, symbol: e.target.value })}
                  />
                  <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500/50" size={16} />
                </div>
                <input
                  type="number"
                  step="any"
                  placeholder="Quantity"
                  className="glass-input"
                  value={newAsset.quantity}
                  onChange={e => setNewAsset({ ...newAsset, quantity: e.target.value })}
                />
                <input
                  type="number"
                  step="any"
                  placeholder="Avg. Buy Price ($)"
                  className="glass-input"
                  value={newAsset.buyPrice}
                  onChange={e => setNewAsset({ ...newAsset, buyPrice: e.target.value })}
                />
                <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2 group h-[52px]">
                  <Plus size={18} />
                  ADD TO PORT
                </button>
              </form>
            </div>
          )}
        </div>

        <footer className="text-center py-8">
          <p className="text-xs font-bold text-slate-600 uppercase tracking-[0.2em]">
            Public Dashboard • Admin: big0725
          </p>
        </footer>
      </div>
    </div>
  );
};

export default App;
