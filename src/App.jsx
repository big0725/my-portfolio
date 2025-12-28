import React, { useState, useEffect, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { 
  Plus, Trash2, RefreshCw, TrendingUp, TrendingDown, Wallet, 
  PieChart as PieIcon, LineChart as ChartIcon, Sparkles, BrainCircuit, Newspaper, AlertCircle, Save, CheckCircle
} from 'lucide-react';

// Firebase imports
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, collection, query } from 'firebase/firestore';

// Environment variables provided by the platform
const firebaseConfig = JSON.parse(__firebase_config);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'portfolio-tracker-pro';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const apiKey = "";

const App = () => {
  const [user, setUser] = useState(null);
  const [assets, setAssets] = useState([]);
  const [newAsset, setNewAsset] = useState({ symbol: '', quantity: '', buyPrice: '' });
  const [prices, setPrices] = useState({});
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState('synced'); // 'synced', 'saving', 'error'
  const [error, setError] = useState(null);

  // Gemini AI States
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [marketBriefing, setMarketBriefing] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // 1. Authentication (RULE 3)
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
        setError("인증에 실패했습니다.");
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. Sync Assets with Firestore (RULE 1 & 2)
  useEffect(() => {
    if (!user) return;

    const userAssetsDoc = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'portfolio');
    
    const unsubscribe = onSnapshot(userAssetsDoc, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setAssets(data.assets || []);
      } else {
        // Initial state if no data exists
        setAssets([
          { id: '1', symbol: 'AAPL', quantity: 10, buyPrice: 150 },
          { id: '2', symbol: 'BTC', quantity: 0.1, buyPrice: 40000 }
        ]);
      }
    }, (err) => {
      console.error("Firestore sync error:", err);
      setError("데이터 동기화 중 오류가 발생했습니다.");
    });

    return () => unsubscribe();
  }, [user]);

  // Save to Firestore helper
  const saveToCloud = async (newAssets) => {
    if (!user) return;
    setSaveStatus('saving');
    try {
      const userAssetsDoc = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'portfolio');
      await setDoc(userAssetsDoc, { assets: newAssets }, { merge: true });
      setSaveStatus('synced');
    } catch (err) {
      setSaveStatus('error');
      console.error("Save error:", err);
    }
  };

  // 3. Market Data Fetching
  const fetchWithRetry = async (url, options, retries = 5, backoff = 1000) => {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return await response.json();
    } catch (err) {
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, backoff));
        return fetchWithRetry(url, options, retries - 1, backoff * 2);
      }
      throw err;
    }
  };

  const fetchMarketData = async () => {
    if (assets.length === 0) return;
    setLoading(true);
    setError(null);

    const symbols = assets.map(a => a.symbol).join(', ');
    const userQuery = `Get the current price and the last 7 days daily closing prices for these assets: ${symbols}. Return the data in a structured JSON format: { "currentPrices": { "SYMBOL": price }, "history": [ { "date": "YYYY-MM-DD", "SYMBOL": price } ] }`;

    try {
      const result = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: userQuery }] }],
            tools: [{ "google_search": {} }],
            generationConfig: { responseMimeType: "application/json" }
          })
        }
      );

      const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      const data = JSON.parse(rawText);

      if (data.currentPrices) setPrices(data.currentPrices);
      if (data.history) setHistory(data.history);
      
    } catch (err) {
      setError('실시간 시세를 가져오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // Initial price fetch once assets are loaded
  useEffect(() => {
    if (assets.length > 0 && Object.keys(prices).length === 0) {
      fetchMarketData();
    }
  }, [assets]);

  // ✨ AI Functions
  const analyzePortfolio = async () => {
    setIsAiLoading(true);
    const portfolioSummary = assets.map(a => ({
      symbol: a.symbol,
      value: (prices[a.symbol] || a.buyPrice) * a.quantity,
      profit: ((prices[a.symbol] || a.buyPrice) - a.buyPrice) * a.quantity
    }));

    const prompt = `Analyze this portfolio and provide in Korean: 1. Risk level, 2. Diversification score, 3. Top 3 tips. Data: ${JSON.stringify(portfolioSummary)}`;

    try {
      const result = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            systemInstruction: { parts: [{ text: "You are a professional financial advisor. Respond in Korean with a confident and helpful tone." }] }
          })
        }
      );
      setAiAnalysis(result.candidates?.[0]?.content?.parts?.[0]?.text);
    } catch (err) {
      setAiAnalysis("AI 분석 중 오류가 발생했습니다.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const getMarketBriefing = async () => {
    setIsAiLoading(true);
    const symbols = assets.map(a => a.symbol).join(', ');
    const prompt = `Find and summarize 3 latest news in Korean for: ${symbols}. Include sentiment analysis.`;

    try {
      const result = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            tools: [{ "google_search": {} }]
          })
        }
      );
      setMarketBriefing(result.candidates?.[0]?.content?.parts?.[0]?.text);
    } catch (err) {
      setMarketBriefing("시장 뉴스를 가져오지 못했습니다.");
    } finally {
      setIsAiLoading(false);
    }
  };

  // Handlers
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

  // Calculations
  const portfolioStats = useMemo(() => {
    let totalValue = 0;
    let totalCost = 0;
    const distribution = assets.map(asset => {
      const currentPrice = prices[asset.symbol] || asset.buyPrice || 0;
      const value = asset.quantity * currentPrice;
      const cost = asset.quantity * asset.buyPrice;
      totalValue += value;
      totalCost += cost;
      return { name: asset.symbol, value };
    });
    const profit = totalValue - totalCost;
    const profitMargin = totalCost > 0 ? (profit / totalCost) * 100 : 0;
    return { totalValue, totalCost, profit, profitMargin, distribution };
  }, [assets, prices]);

  const chartData = useMemo(() => {
    if (history.length === 0) return [];
    return history.map(day => {
      let total = 0;
      assets.forEach(asset => {
        const priceAtDate = day[asset.symbol] || prices[asset.symbol] || asset.buyPrice;
        total += asset.quantity * priceAtDate;
      });
      return { date: day.date, value: total };
    });
  }, [history, assets, prices]);

  const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981'];

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 font-medium">포트폴리오를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-3xl font-bold tracking-tight">클라우드 포트폴리오</h1>
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full text-xs font-semibold">
                {saveStatus === 'saving' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                {saveStatus === 'saving' ? '저장 중...' : '클라우드 동기화됨'}
              </div>
            </div>
            <p className="text-slate-500 text-sm">User ID: {user.uid}</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={fetchMarketData}
              disabled={loading}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl transition-all disabled:opacity-50 shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              시세 갱신
            </button>
          </div>
        </header>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl flex items-center gap-2">
            <AlertCircle className="w-5 h-5" /> {error}
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-4 text-slate-500">
              <Wallet className="w-5 h-5" />
              <span className="text-sm font-medium">총 자산 가치</span>
            </div>
            <div className="text-2xl font-bold">${portfolioStats.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-4 text-slate-500">
              {portfolioStats.profit >= 0 ? <TrendingUp className="w-5 h-5 text-emerald-500" /> : <TrendingDown className="w-5 h-5 text-rose-500" />}
              <span className="text-sm font-medium">총 손익</span>
            </div>
            <div className={`text-2xl font-bold ${portfolioStats.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {portfolioStats.profit >= 0 ? '+' : ''}{portfolioStats.profit.toLocaleString(undefined, { minimumFractionDigits: 2 })} 
              <span className="text-sm ml-2 opacity-70">({portfolioStats.profitMargin.toFixed(2)}%)</span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
            <div className="flex items-center gap-3 mb-4 text-slate-500">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <span className="text-sm font-medium">AI 투자 조언</span>
            </div>
            <div className="flex gap-2 mt-auto">
               <button onClick={analyzePortfolio} disabled={isAiLoading} className="flex-1 text-xs bg-slate-900 text-white py-2 rounded-lg hover:bg-slate-800 disabled:opacity-50">분석</button>
               <button onClick={getMarketBriefing} disabled={isAiLoading} className="flex-1 text-xs border border-slate-200 py-2 rounded-lg hover:bg-slate-50 disabled:opacity-50">뉴스</button>
            </div>
          </div>
        </div>

        {/* AI Insight Section */}
        {(aiAnalysis || marketBriefing || isAiLoading) && (
          <div className="bg-indigo-900 text-white p-6 rounded-3xl shadow-xl space-y-4 relative overflow-hidden transition-all">
            <h3 className="text-xl font-bold flex items-center gap-2"><BrainCircuit className="w-6 h-6" /> AI 투자 인사이트</h3>
            {isAiLoading ? (
              <div className="flex items-center gap-2 animate-pulse text-indigo-200">데이터를 분석하고 시장을 탐색하는 중입니다...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                {aiAnalysis && <div className="bg-white/10 p-4 rounded-2xl border border-white/10 text-sm leading-relaxed whitespace-pre-wrap">{aiAnalysis}</div>}
                {marketBriefing && <div className="bg-white/10 p-4 rounded-2xl border border-white/10 text-sm leading-relaxed whitespace-pre-wrap">{marketBriefing}</div>}
              </div>
            )}
            {!isAiLoading && <button onClick={() => {setAiAnalysis(null); setMarketBriefing(null);}} className="text-xs text-indigo-300">결과 닫기</button>}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-6"><ChartIcon className="w-5 h-5 text-indigo-600" /> 자산 변동 (7일)</h2>
            <div className="h-[300px] w-full">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{fontSize: 10}} />
                    <YAxis hide domain={['auto', 'auto']} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none' }} formatter={(val) => `$${val.toLocaleString()}`} />
                    <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <div className="h-full flex items-center justify-center text-slate-400 italic text-sm">시세 갱신을 누르면 차트가 생성됩니다.</div>}
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-6"><PieIcon className="w-5 h-5 text-indigo-600" /> 비중 분석</h2>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={portfolioStats.distribution} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {portfolioStats.distribution.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(val) => `$${val.toLocaleString()}`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Asset Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex justify-between items-center">
            <h2 className="text-lg font-semibold">내 보유 자산</h2>
            <div className="text-xs text-slate-400 flex items-center gap-1">
              <Save className="w-3 h-3" /> 변경사항은 클라우드에 자동 저장됩니다.
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 text-slate-500 text-xs uppercase font-bold tracking-wider">
                  <th className="px-6 py-4">종목</th>
                  <th className="px-6 py-4">수량</th>
                  <th className="px-6 py-4">평단가</th>
                  <th className="px-6 py-4">현재가</th>
                  <th className="px-6 py-4">수익률</th>
                  <th className="px-6 py-4 text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assets.map((asset) => {
                  const currentPrice = prices[asset.symbol] || 0;
                  const profitPct = asset.buyPrice > 0 ? ((currentPrice - asset.buyPrice) / asset.buyPrice) * 100 : 0;
                  return (
                    <tr key={asset.id} className="hover:bg-slate-50/30 transition-colors text-sm">
                      <td className="px-6 py-4 font-bold text-indigo-600">{asset.symbol}</td>
                      <td className="px-6 py-4">{asset.quantity}</td>
                      <td className="px-6 py-4 text-slate-500">${asset.buyPrice.toLocaleString()}</td>
                      <td className="px-6 py-4 font-bold">{currentPrice > 0 ? `$${currentPrice.toLocaleString()}` : '-'}</td>
                      <td className={`px-6 py-4 font-bold ${profitPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {currentPrice > 0 ? `${profitPct >= 0 ? '+' : ''}${profitPct.toFixed(2)}%` : '-'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => removeAsset(asset.id)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-6 bg-slate-50/30 border-t border-slate-100">
            <form onSubmit={addAsset} className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <input placeholder="티커 (예: TSLA)" className="px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500" value={newAsset.symbol} onChange={e => setNewAsset({...newAsset, symbol: e.target.value.toUpperCase()})} />
              <input type="number" placeholder="수량" className="px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500" value={newAsset.quantity} onChange={e => setNewAsset({...newAsset, quantity: e.target.value})} />
              <input type="number" placeholder="평균 단가 ($)" className="px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500" value={newAsset.buyPrice} onChange={e => setNewAsset({...newAsset, buyPrice: e.target.value})} />
              <button type="submit" className="bg-slate-900 text-white px-4 py-2 rounded-xl hover:bg-slate-800 transition-all font-bold">종목 추가</button>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
};

export default App;
