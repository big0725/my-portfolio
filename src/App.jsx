import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell
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
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
  };
};

const firebaseConfig = getFirebaseConfig();
const appId = import.meta.env.VITE_APP_ID || 'portfolio-pro-v1';

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
  const isAdmin = user?.email === ADMIN_EMAIL;
  const [adminTab, setAdminTab] = useState('buy'); // 'buy' or 'sell'
  const [dataTab, setDataTab] = useState('inventory'); // 'inventory' or 'log'
  const [assets, setAssets] = useState([]);
  const [newAsset, setNewAsset] = useState({ symbol: '', quantity: '', buyPrice: '' });
  const [prices, setPrices] = useState({});
  const [prevPrices, setPrevPrices] = useState({});
  const [history, setHistory] = useState([]);
  const [chartRange, setChartRange] = useState('7d'); // '7d', '30d', '1y'
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState('synced');
  const [error, setError] = useState(null);
  const [aiInsights, setAiInsights] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [guruIndex, setGuruIndex] = useState(0);

  // 구루 슬라이더 자동 회전
  useEffect(() => {
    if (!aiInsights) return;
    const timer = setInterval(() => {
      setGuruIndex((prev) => (prev + 1) % 3);
    }, 5000);
    return () => clearInterval(timer);
  }, [aiInsights]);

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
      if (snap.exists()) {
        const data = snap.data();
        setAssets(data.assets || []);
        setSnapshots(data.snapshots || []);
      }
    }, (err) => {
      console.error("Firestore 동기화 에러:", err);
    });
    return () => unsubscribe();
  }, []);

  // 오늘 시점의 포트폴리오 가치를 기록합니다.
  const saveSnapshot = async (totalValue) => {
    if (!isAdmin || !db || !totalValue) return;

    const today = new Date().toISOString().split('T')[0];

    // 이미 오늘 기록이 있는지 확인 (중복 기록 방지)
    const alreadySaved = snapshots.some(s => s.date === today);
    if (alreadySaved) return;

    try {
      const newSnapshot = { date: today, value: totalValue };
      const updatedSnapshots = [...snapshots, newSnapshot].sort((a, b) => a.date.localeCompare(b.date));
      const sharedDoc = doc(db, 'artifacts', appId, 'settings', 'shared-portfolio');
      await setDoc(sharedDoc, { snapshots: updatedSnapshots }, { merge: true });
      console.log("오늘의 포트폴리오 가치가 기록되었습니다:", totalValue);
    } catch (e) {
      console.error("스냅샷 저장 실패:", e);
    }
  };

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
    if (assets.length === 0) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Yahoo Finance 티커 매핑 (코인은 -USD, 나머지는 그대로)
      const cryptoList = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT'];
      const yfTickers = assets.map(a => {
        const s = a.symbol.toUpperCase();
        return cryptoList.includes(s) ? `${s}-USD` : s;
      });

      // 2. 현재가 및 히스토리 취합을 위한 병렬 호출 (개별 실패 처리)
      const fetchHistory = async (symbol) => {
        try {
          const range = '1y';
          const interval = '1d';

          const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(`https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`)}`;
          const res = await fetch(proxyUrl);
          const data = await res.json();
          if (!data || !data.contents) return null;

          const json = JSON.parse(data.contents);
          if (!json.chart || !json.chart.result || !json.chart.result[0]) return null;

          return { originalTicker: symbol, data: json.chart.result[0] };
        } catch (e) {
          console.warn(`[MarketData] ${symbol} 로드 실패:`, e);
          return null;
        }
      };

      const results = await Promise.all(yfTickers.map(t => fetchHistory(t)));
      const validResults = results.filter(r => r !== null);

      if (validResults.length === 0) {
        throw new Error("모든 자산의 시세 데이터를 가져오는데 실패했습니다.");
      }

      const newPrices = {};
      const historyMap = {}; // date -> { SYMBOL: price }

      validResults.forEach((res) => {
        // 원래 티커 찾기 (yfTickers와 assets 순서 동일)
        const chart = res.data;
        const meta = chart.meta;
        const symbol = meta.symbol.replace('-USD', '').toUpperCase(); // 정규화

        const indicators = chart.indicators.quote[0];
        const quote = indicators.close || indicators.open || [];
        const timestamps = chart.timestamp || [];

        // 현재가 설정 (가장 최신 가격 우선)
        newPrices[symbol] = meta.regularMarketPrice || quote[quote.length - 1] || 0;

        // 히스토리 데이터 매핑
        timestamps.forEach((ts, tIdx) => {
          const date = new Date(ts * 1000).toISOString().split('T')[0];
          const price = quote[tIdx];
          if (price !== undefined && price !== null) {
            if (!historyMap[date]) historyMap[date] = { date };
            historyMap[date][symbol] = price;
          }
        });
      });

      setPrices(newPrices);

      const sortedHistory = Object.values(historyMap).sort((a, b) => a.date.localeCompare(b.date));
      setHistory(sortedHistory);

      // 전일 종가 데이터 추출 (가장 최근 과거 날짜 데이터)
      if (sortedHistory.length >= 2) {
        const yesterdayData = sortedHistory[sortedHistory.length - 2];
        setPrevPrices(yesterdayData);
      } else if (sortedHistory.length === 1) {
        setPrevPrices(sortedHistory[0]);
      }

      // AI 분석은 Yahoo Finance 가격 데이터를 바탕으로 실행
      const symbolsStr = assets.map(a => a.symbol).join(', ');
      fetchAiInsights(symbolsStr, newPrices);

    } catch (e) {
      console.error("Yahoo Finance 로드 실패:", e);
      setError("실시간 시세를 불러오는데 실패했습니다. (Yahoo Finance API)");
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
              text: `당신은 세계적인 투자 거장 3인(워렌 버핏, 스탠리 드러켄밀러, 캐시 우드)입니다. 다음 포트폴리오를 분석하고 답변은 반드시 한국어로 하세요: [${portfolioSummary}].
              현재 시장 상황을 검색(Search)하여 각 인물의 철학에 따른 분석(advice: 2문장), 구체적인 행동 지침(action: 1문장), 그리고 현재 추천하는 픽(pick: {symbol, reason})을 제공하세요.
              
              응답은 반드시 아래 형식의 순수한 JSON이어야 하며, 마크다운(\`\`\`json)이나 앞뒤 설명 없이 오직 { 로 시작해서 } 로 끝나는 JSON 데이터만 출력하세요:
        {
          "buffett": { "advice": "...", "action": "...", "pick": { "symbol": "...", "reason": "..." } },
          "druckenmiller": { "advice": "...", "action": "...", "pick": { "symbol": "...", "reason": "..." } },
          "cathie": { "advice": "...", "action": "...", "pick": { "symbol": "...", "reason": "..." } }
        }`
            }]
          }],
          tools: [{ google_search: {} }]
        })
      });

      const resData = await response.json();
      if (resData.error) throw new Error(resData.error.message);

      const textResponse = resData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textResponse) throw new Error("AI 응답 내용이 비어있습니다.");

      // 보다 강력한 JSON 추출 로직 적용
      const jsonStart = textResponse.indexOf('{');
      const jsonEnd = textResponse.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonStr = textResponse.substring(jsonStart, jsonEnd + 1);
        const content = JSON.parse(jsonStr);
        setAiInsights(content);
      } else {
        throw new Error("올바른 JSON 형식을 찾을 수 없습니다.");
      }
    } catch (e) {
      console.error("AI Insight 생성 실패:", e);
      // 에러 시 사용자에게 알리기 위해 빈 상태가 아닌 에러 상태를 표시할 수 있습니다.
      setAiInsights({ error: true });
    } finally {
      setIsAiLoading(false);
    }
  };

  useEffect(() => {
    if (assets.length > 0) {
      fetchMarketData();
    }
  }, [JSON.stringify(assets), chartRange]);

  const addAsset = (e) => {
    e.preventDefault();
    if (user?.email !== ADMIN_EMAIL) return;
    if (!newAsset.symbol || !newAsset.quantity) return;

    const cleanSymbol = newAsset.symbol.trim().toUpperCase();
    const qty = parseFloat(newAsset.quantity || 0);
    const price = parseFloat(newAsset.buyPrice || 0);

    const updated = [...assets, {
      ...newAsset,
      symbol: cleanSymbol,
      id: Date.now().toString(),
      quantity: qty,
      buyPrice: price,
      type: adminTab, // 'buy' or 'sell'
      date: new Date().toISOString() // 매매 날짜 기록
    }];

    setAssets(updated);
    saveToCloud(updated);
    setNewAsset({ symbol: '', quantity: '', buyPrice: '' });
  };

  const removeAsset = (idOrSymbol) => {
    if (user?.email !== ADMIN_EMAIL) return;
    // 티커로 삭제 (통합된 상태이므로 해당 티커의 모든 기록 삭제)
    const updated = assets.filter(a => a.id !== idOrSymbol && a.symbol !== idOrSymbol);
    setAssets(updated);
    saveToCloud(updated);
  };

  // 동일 티커 자산 통합 로직 (평균 단가 및 잔고 계산)
  const displayAssets = useMemo(() => {
    const map = new Map();
    assets.forEach(a => {
      const sym = a.symbol.toUpperCase();
      if (!map.has(sym)) {
        map.set(sym, { symbol: sym, netQty: 0, totalBuyCost: 0, totalBuyQty: 0 });
      }
      const existing = map.get(sym);
      if (a.type === 'sell') {
        existing.netQty -= a.quantity;
      } else {
        // default is 'buy'
        existing.netQty += a.quantity;
        existing.totalBuyQty += a.quantity;
        existing.totalBuyCost += a.quantity * a.buyPrice;
      }
    });

    return Array.from(map.values())
      .filter(item => item.netQty > 0) // 잔고가 있는 것만 표시
      .map(item => ({
        symbol: item.symbol,
        quantity: item.netQty,
        buyPrice: item.totalBuyQty > 0 ? item.totalBuyCost / item.totalBuyQty : 0,
        id: item.symbol
      }));
  }, [assets]);

  const stats = useMemo(() => {
    let total = 0; let cost = 0;
    displayAssets.forEach(a => {
      const p = prices[a.symbol] || a.buyPrice || 0;
      total += a.quantity * p;
      cost += a.quantity * a.buyPrice;
    });
    const dist = displayAssets.map(a => ({
      name: a.symbol,
      value: a.quantity * (prices[a.symbol] || a.buyPrice || 0)
    })).sort((a, b) => b.value - a.value); // 비중 순 정렬 추가

    // 어제의 데이터를 찾아 비교합니다.
    const todayStr = new Date().toISOString().split('T')[0];

    // 1순위: 파이어베이스 스냅샷 기록 (실제 유저의 자산 총합 기록)
    const pastSnapshots = snapshots.filter(s => s.date !== todayStr);
    const lastSnapshot = pastSnapshots.length > 0 ? pastSnapshots[pastSnapshots.length - 1] : null;

    let yesterdayValue = lastSnapshot ? lastSnapshot.value : 0;

    // 2순위: 시장 데이터 기반 (스냅샷이 아직 없는 경우 시장 히스토리 활용)
    if (!yesterdayValue && Object.keys(prevPrices).length > 0) {
      assets.forEach(a => {
        const sym = a.symbol.toUpperCase();
        yesterdayValue += a.quantity * (prevPrices[sym] || prices[sym] || a.buyPrice);
      });
    }

    const dailyChange = yesterdayValue ? total - yesterdayValue : 0;
    const dailyChangePercent = yesterdayValue ? (dailyChange / yesterdayValue) * 100 : 0;

    // 기간별 P&L 추정 계산 (7d, 30d, 1y)
    const getPeriodStats = (days) => {
      if (!history || history.length === 0) return null;
      const targetIdx = Math.max(0, history.length - 1 - days);
      const pastData = history[targetIdx];
      let pastValue = 0;
      assets.forEach(a => {
        const sym = a.symbol.toUpperCase();
        pastValue += a.quantity * (pastData[sym] || prices[sym] || a.buyPrice);
      });
      const change = total - pastValue;
      const percent = pastValue > 0 ? (change / pastValue) * 100 : 0;
      return { change, percent };
    };

    const pnl7d = getPeriodStats(7);
    const pnl30d = getPeriodStats(30);
    const pnl1y = getPeriodStats(history.length - 1);

    return { total, profit: total - cost, margin: cost > 0 ? ((total - cost) / cost) * 100 : 0, dist, dailyChange, dailyChangePercent, pnl7d, pnl30d, pnl1y };
  }, [assets, prices, snapshots, prevPrices, history]);

  // 가격 정보가 업데이트되어 총 가치가 계산되면 관리자인 경우 자동으로 스냅샷 저장
  useEffect(() => {
    if (isAdmin && stats.total > 0 && !loading) {
      saveSnapshot(stats.total);
    }
  }, [stats.total, isAdmin, loading, snapshots]);

  const chartData = useMemo(() => {
    // 실제 기록된 스냅샷이 2개 이상이면 실제 데이터를 우선 사용합니다.
    if (snapshots && snapshots.length >= 2) {
      return snapshots.map(s => ({
        date: typeof s.date === 'string' ? s.date.slice(5) : '',
        value: s.value || 0
      }));
    }

    // 스냅샷이 없으면 시장 히스토리 데이터를 가공해서 보여줍니다.
    if (!history || !history.length) return [];

    let filteredHistory = history;
    if (chartRange === '7d') filteredHistory = history.slice(-7);
    else if (chartRange === '30d') filteredHistory = history.slice(-30);

    return filteredHistory.map(d => {
      let v = 0;
      assets.forEach(a => {
        const symbol = a.symbol.toUpperCase();
        const price = d[symbol] || prices[symbol] || a.buyPrice || 0;
        v += (a.quantity || 0) * price;
      });
      return {
        date: typeof d.date === 'string' ? d.date.slice(5) : '',
        value: isNaN(v) ? 0 : v
      };
    }).filter(d => d.date); // 유효한 날짜가 있는 데이터만 표시
  }, [snapshots, history, assets, prices]);


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
    <div className="min-h-screen bg-[#020617] text-slate-200 font-sans selection:bg-indigo-500/30 selection:text-white overflow-x-hidden relative">
      {/* Premium Background Auras */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute top-[20%] -right-[10%] w-[40%] h-[40%] bg-purple-600/10 rounded-full blur-[120px]"></div>
        <div className="absolute -bottom-[10%] left-[20%] w-[60%] h-[50%] bg-blue-600/5 rounded-full blur-[150px] animate-pulse" style={{ animationDuration: '8s' }}></div>
      </div>

      <div className="max-w-[1550px] mx-auto p-4 md:p-10 space-y-10 relative z-10">

        {/* Top Navigation */}
        <nav className="flex justify-between items-center glass-card p-4 px-4 md:px-8 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-500/30">
              <Briefcase className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tighter gradient-text leading-tight">PORTFOLIO PRO</h1>
              {isAdmin && <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full uppercase tracking-tighter">관리자 모드</span>}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={fetchMarketData}
              disabled={loading}
              className="btn-secondary h-10 px-4 flex items-center justify-center gap-2 text-xs"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span className="hidden md:inline">{loading ? '동기화 중...' : '새로고침'}</span>
            </button>

            {user ? (
              <button
                onClick={handleLogout}
                className="bg-white/5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 p-2.5 rounded-xl transition-all border border-white/5 flex items-center gap-2 text-xs font-bold"
              >
                <img src={user.photoURL} className="w-5 h-5 rounded-full shadow-inner" alt="profile" />
                <span className="hidden lg:inline">로그아웃</span>
              </button>
            ) : (
              <button
                onClick={handleLogin}
                className="btn-primary py-2 px-4 text-xs flex items-center gap-2"
              >
                <Sparkles size={14} />
                <span className="hidden md:inline">관리자 로그인</span>
              </button>
            )}
          </div>
        </nav>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-2xl text-rose-400 text-sm font-medium flex items-center gap-3 animate-pulse">
            <AlertCircle size={20} /> {error}
          </div>
        )}

        {/* 메인 대시보드 그리드 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Main Balance Card (Sophisticated 2-column layout) */}
          <div className="lg:col-span-2 glass-card p-0 relative overflow-hidden group border-white/5 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] bg-white/[0.01]">
            <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-indigo-600/5 rounded-full blur-[100px] group-hover:bg-indigo-600/10 transition-all duration-1000"></div>

            <div className="relative z-10 flex flex-col md:flex-row min-h-0 md:min-h-[820px]">
              {/* Left Side: Performance Metrics */}
              <div className="md:w-[340px] p-6 md:p-12 border-b md:border-b-0 md:border-r border-white/5 flex flex-col space-y-8 md:space-y-10 bg-white/[0.01]">
                <div className="space-y-3">
                  <div className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-2 opacity-70">
                    <Wallet size={12} className="text-indigo-400" /> Total Balance
                  </div>
                  <div className="text-4xl md:text-6xl font-black text-white tracking-tighter leading-none transition-all group-hover:tracking-tight drop-shadow-2xl">
                    ${stats.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-4">
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black shadow-lg ${stats.dailyChange >= 0 ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20' : 'bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20'}`}>
                      {stats.dailyChange >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                      {stats.dailyChangePercent >= 0 ? '+' : ''}{stats.dailyChangePercent.toFixed(2)}% Today
                    </div>

                    {[
                      { label: '7D', data: stats.pnl7d },
                      { label: '30D', data: stats.pnl30d },
                      { label: '1Y', data: stats.pnl1y }
                    ].map((item, idx) => (
                      item.data && (
                        <div key={idx} className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[9px] font-black border ${item.data.change >= 0 ? 'bg-emerald-500/5 text-emerald-400/60 border-emerald-500/10' : 'bg-rose-500/5 text-rose-400/60 border-rose-500/10'}`}>
                          <span className="opacity-40 uppercase mr-1">{item.label}</span>
                          {item.data.percent >= 0 ? '+' : ''}{item.data.percent.toFixed(1)}%
                        </div>
                      )
                    ))}
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="p-6 rounded-[2rem] bg-white/[0.03] border border-white/5 backdrop-blur-xl group-hover:border-indigo-500/20 transition-all shadow-inner">
                    <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 opacity-60">미실현 손익 (Unrealized)</div>
                    <div className={`text-2xl font-black ${stats.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {stats.profit >= 0 ? '+' : ''}{stats.profit.toLocaleString()}
                      <span className="text-[10px] ml-3 opacity-40 font-bold tracking-tight text-white">${(stats.total - stats.profit).toLocaleString()} Principal</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest opacity-70">ROA</span>
                      <span className="text-sm font-black text-slate-300">{stats.margin.toFixed(1)}% Yield</span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest opacity-70">Engine</span>
                      <span className="text-sm font-black text-indigo-400/80 tracking-tighter">Hyper-Core</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Side: Chart (Top) + Guru Insights (Bottom) */}
              <div className="flex-1 flex flex-col overflow-hidden bg-white/[0.005]">
                {/* Chart Section */}
                <div className="p-6 md:p-10 border-b border-white/5 h-auto md:h-[280px] flex flex-col relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent"></div>
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex flex-col">
                      <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2 mb-2">
                        <ChartIcon size={12} className="text-indigo-400" /> Market Trajectory
                      </div>
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center bg-black/5 sm:bg-black/20 p-1 rounded-xl w-full sm:w-fit border border-white/5">
                        <div className="flex items-center gap-1">
                          {['7d', '30d', '1y'].map(range => (
                            <button
                              key={range}
                              onClick={() => setChartRange(range)}
                              className={`flex-1 sm:flex-none px-3 sm:px-4 py-1.5 rounded-lg text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${chartRange === range ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                              {range === '1y' ? '1YR' : range === '30d' ? '30D' : '7D'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 bg-indigo-500/5 px-4 py-2 rounded-2xl border border-indigo-500/10 shrink-0 self-start sm:self-auto mt-4 sm:mt-0">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,1)] animate-ping"></span>
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 absolute shadow-[0_0_10px_rgba(99,102,241,1)]"></span>
                      </div>
                      <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2">Live Stream</span>
                    </div>
                  </div>

                  <div className="flex-1 w-full min-h-[160px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorNetWorth" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" hide />
                        <YAxis hide domain={['auto', 'auto']} />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke="#818cf8"
                          strokeWidth={4}
                          fillOpacity={1}
                          fill="url(#colorNetWorth)"
                          animationDuration={2000}
                          strokeLinecap="round"
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div className="glass-card p-5 border-white/10 shadow-2xl backdrop-blur-3xl ring-1 ring-white/10 bg-black/40">
                                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 border-b border-white/5 pb-2">{payload[0].payload.date}</p>
                                  <p className="text-xl font-black text-white tracking-tighter">${payload[0].value.toLocaleString()}</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Guru Insights Section */}
                <div className="p-6 md:p-10 flex flex-col flex-1 relative overflow-hidden group/guru bg-black/5">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <div className="bg-indigo-600/10 p-2.5 rounded-2xl border border-indigo-500/10 shadow-lg shadow-indigo-500/5">
                        <Sparkles size={18} className="text-indigo-400" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[12px] font-black text-white uppercase tracking-[0.25em]">Expert Insights</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Real-time Guru Sync</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 bg-white/5 p-2 rounded-2xl border border-white/5">
                      {[0, 1, 2].map(i => (
                        <button
                          key={i}
                          onClick={() => setGuruIndex(i)}
                          className={`w-2 h-2 rounded-full transition-all duration-700 ${guruIndex === i ? 'w-8 bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.8)]' : 'bg-white/10 hover:bg-white/20'}`}
                        ></button>
                      ))}
                    </div>
                  </div>

                  <div className="relative flex-1 min-h-[460px] md:min-h-[400px]">
                    {[
                      {
                        name: "WARREN BUFFETT",
                        role: "VALUE LEGEND",
                        data: aiInsights?.buffett,
                        color: "amber",
                        image: "/buffett.png",
                        icon: <TrendingUp size={16} className="text-amber-400" />
                      },
                      {
                        name: "S. DRUCKENMILLER",
                        role: "MACRO MASTER",
                        data: aiInsights?.druckenmiller,
                        color: "blue",
                        image: "/druckenmiller.png",
                        icon: <BrainCircuit size={16} className="text-blue-400" />
                      },
                      {
                        name: "CATHIE WOOD",
                        role: "INNOVATION ICON",
                        data: aiInsights?.cathie,
                        color: "fuchsia",
                        image: "/cathie.png",
                        icon: <Sparkles size={16} className="text-fuchsia-400" />
                      }
                    ].map((guru, i) => (
                      <div
                        key={i}
                        className={`absolute inset-0 transition-all duration-500 ease-out transform bg-[#020617]/40 backdrop-blur-sm ${guruIndex === i ? 'opacity-100 translate-x-0 scale-100 pointer-events-auto' : 'opacity-0 translate-x-8 scale-95 pointer-events-none'
                          }`}
                      >
                        <div className="flex flex-col xl:flex-row gap-8 items-start h-full">
                          <div className="flex items-center gap-5 shrink-0 mb-4 xl:mb-0">
                            <div className="relative group/avatar">
                              <div className={`absolute -inset-2 bg-gradient-to-tr from-${guru.color}-500 to-transparent rounded-full opacity-20 group-hover/avatar:opacity-50 transition-all duration-700 blur-sm`}></div>
                              <img src={guru.image} alt={guru.name} className="w-16 h-16 rounded-full object-cover border-4 border-white/10 relative z-10 shadow-2xl transition-transform duration-700 group-hover/avatar:scale-105" />
                              <div className={`absolute -bottom-1 -right-1 bg-[#020617] p-2 rounded-full border border-white/10 z-20 shadow-xl group-hover/avatar:rotate-12 transition-all`}>
                                {guru.icon}
                              </div>
                            </div>
                            <div>
                              <div className="text-xl font-black text-white tracking-tighter uppercase">{guru.name}</div>
                              <div className={`text-[10px] font-black text-${guru.color}-400 uppercase tracking-[0.3em] mt-0.5 opacity-80`}>{guru.role}</div>
                            </div>
                          </div>

                          <div className="flex-1 flex flex-col gap-6 w-full min-h-0">
                            <div className="relative overflow-y-auto custom-scrollbar pr-4 -mr-4 max-h-[120px]">
                              <div className="absolute -left-5 top-0 bottom-0 w-[2px] bg-gradient-to-b from-indigo-500/40 via-transparent to-transparent"></div>
                              <p className="text-[13px] font-medium text-slate-300 leading-relaxed italic pl-1 h-full scrollbar-none">
                                "{isAiLoading ? "Analyzing market dynamics..." : (aiInsights?.error ? "Sync interrupted." : (guru.data?.advice || "Analyzing holdings..."))}"
                              </p>
                            </div>

                            {guru.data?.pick && !isAiLoading && (
                              <div className={`p-5 rounded-3xl bg-${guru.color}-500/5 border border-${guru.color}-500/10 backdrop-blur-sm shadow-xl group/pick hover:bg-${guru.color}-500/10 transition-all duration-500`}>
                                <div className="flex items-center gap-4 mb-3">
                                  <span className={`text-[9px] font-black px-3 py-1 rounded-full bg-${guru.color}-500/10 text-${guru.color}-400 uppercase tracking-widest ring-1 ring-${guru.color}-500/20`}>Alpha Focus (Top Pick)</span>
                                  <span className="text-lg font-black text-white tracking-widest">{guru.data.pick.symbol}</span>
                                </div>
                                <p className="text-[11px] font-bold text-slate-400 leading-relaxed">
                                  {guru.data.pick.reason}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats / AI Insights Placeholder */}
          <div className="space-y-6">
            <div className="glass-card p-6 md:p-10 border-white/5 bg-indigo-500/[0.03] group hover:bg-indigo-500/[0.06] transition-all relative overflow-hidden flex flex-col justify-center min-h-[200px] shadow-2xl shadow-indigo-500/5">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl -mr-16 -mt-16"></div>
              <div className="flex items-center justify-between mb-6 relative z-10">
                <div className="bg-indigo-600/20 p-3 rounded-2xl border border-indigo-500/20">
                  <Sparkles className="text-indigo-400" size={22} />
                </div>
                <span className="text-[10px] font-black text-indigo-400/80 uppercase tracking-[0.2em] border border-indigo-500/20 px-3 py-1 rounded-full">Visionary AI Report</span>
              </div>
              <p className="text-[13px] font-medium text-slate-300 leading-relaxed italic relative z-10 pr-4">
                "{stats.margin > 5 ? "Portfolio exhibits resilient alpha with strong momentum across core holdings. Current architecture is optimized for sustained growth." : "Navigating macro turbulence with a balanced defensive posture. Vigilance is advised as we approach key inflection points."}"
              </p>
            </div>

            <div className="glass-card p-6 md:p-10 flex flex-col h-full overflow-hidden bg-white/[0.01] border-white/5 shadow-2xl">
              <div className="flex items-center justify-between mb-10">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">
                  <PieIcon size={14} className="text-indigo-400" /> Asset Distribution
                </h3>
              </div>

              {/* Donut Chart with modern center */}
              <div className="h-56 w-full mb-10 relative group">
                <div className="absolute inset-0 bg-indigo-500/5 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.dist}
                      innerRadius={65}
                      outerRadius={85}
                      paddingAngle={6}
                      dataKey="value"
                      stroke="none"
                      animationBegin={0}
                      animationDuration={1500}
                    >
                      {stats.dist.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={[
                          '#6366f1', '#a855f7', '#ec4899', '#3b82f6', '#14b8a6', '#f59e0b'
                        ][index % 6]} strokeWidth={0} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="glass-card p-3 border-white/10 shadow-2xl backdrop-blur-3xl bg-black/60 scale-105 transition-transform">
                              <p className="text-[10px] font-black text-white uppercase tracking-widest">{payload[0].name}</p>
                              <p className="text-sm font-black text-slate-400 mt-1">${payload[0].value.toLocaleString()}</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none transition-transform duration-500 group-hover:scale-105">
                  <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">Dominant</span>
                  <span className="text-base font-black text-white tracking-tighter uppercase">{stats.dist[0]?.name || '-'}</span>
                </div>
              </div>

              {/* Advanced distribution list */}
              <div className="flex-1 overflow-y-auto space-y-6 pr-4 custom-scrollbar max-h-[250px]">
                {stats.dist.map((d, i) => (
                  <div key={i} className="group/item relative">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ['#6366f1', '#a855f7', '#ec4899', '#3b82f6', '#14b8a6', '#f59e0b'][i % 6] }}></div>
                        <span className="text-[11px] font-black text-slate-300 group-hover/item:text-white transition-colors tracking-tight">{d.name}</span>
                      </div>
                      <span className="text-[10px] font-black text-white opacity-40 group-hover/item:opacity-100 transition-all">
                        {stats.total > 0 ? ((d.value / stats.total) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                    <div className="w-full h-1 bg-white/[0.02] rounded-full overflow-hidden border border-white/5 p-[1px]">
                      <div
                        className="h-full rounded-full transition-all duration-1000 ease-out group-hover/item:brightness-125"
                        style={{
                          width: `${stats.total > 0 ? (d.value / stats.total) * 100 : 0}%`,
                          background: `linear-gradient(90deg, ${['#6366f1', '#a855f7', '#ec4899', '#3b82f6', '#14b8a6', '#f59e0b'][i % 6]}80, ${['#6366f1', '#a855f7', '#ec4899', '#3b82f6', '#14b8a6', '#f59e0b'][i % 6]})`,
                        }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {/* Unified Data Hub Section */}
        <div className="glass-card overflow-hidden border-white/5 shadow-3xl bg-white/[0.005]">
          <div className="p-2 border-b border-white/5 bg-white/[0.02] flex flex-col sm:flex-row justify-between items-center px-10">
            <div className="flex gap-2">
              <button
                onClick={() => setDataTab('inventory')}
                className={`flex items-center gap-3 px-8 py-6 text-[11px] font-black uppercase tracking-[0.3em] transition-all relative group/tab ${dataTab === 'inventory' ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <LayoutDashboard size={14} className={dataTab === 'inventory' ? 'animate-pulse' : ''} /> Holdings
                {dataTab === 'inventory' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-500 mx-8 rounded-t-full shadow-[0_0_12px_rgba(99,102,241,1)]"></div>}
              </button>
              <button
                onClick={() => setDataTab('log')}
                className={`flex items-center gap-3 px-8 py-6 text-[11px] font-black uppercase tracking-[0.3em] transition-all relative group/tab ${dataTab === 'log' ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <History size={14} className={dataTab === 'log' ? 'animate-pulse' : ''} /> History
                {dataTab === 'log' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500 mx-8 rounded-t-full shadow-[0_0_12px_rgba(16,185,129,1)]"></div>}
              </button>
            </div>
            <div className="py-6 sm:py-0 text-[10px] font-black text-slate-600 uppercase tracking-[0.25em] flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-slate-700"></div>
              {dataTab === 'inventory' ? `Live Tracking: ${displayAssets.length} Units` : `Audit Log: ${assets.length} Entries`}
            </div>
          </div>

          <div className="min-h-[440px] bg-white/[0.01]">
            {dataTab === 'inventory' ? (
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-separate border-spacing-0">
                  <thead>
                    <tr className="bg-white/[0.01] text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] border-b border-white/5">
                      <th className="px-4 md:px-10 py-4 md:py-6 font-black opacity-60">Asset</th>
                      <th className="px-4 md:px-10 py-4 md:py-6 font-black opacity-60">Qty</th>
                      <th className="px-4 md:px-10 py-4 md:py-6 font-black opacity-60 hidden sm:table-cell">Avg Cost</th>
                      <th className="px-4 md:px-10 py-4 md:py-6 font-black opacity-60">Price</th>
                      <th className="px-4 md:px-10 py-4 md:py-6 text-right font-black opacity-60">PnL</th>
                      {isAdmin && <th className="px-4 md:px-10 py-4 md:py-6 text-right w-20"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {displayAssets.map(a => {
                      const currentPrice = prices[a.symbol.toUpperCase()] || a.buyPrice || 0;
                      const profit = (currentPrice - a.buyPrice) * a.quantity;
                      const pPercent = a.buyPrice > 0 ? ((currentPrice - a.buyPrice) / a.buyPrice) * 100 : 0;

                      return (
                        <tr key={a.id} className="hover:bg-white/[0.03] transition-all duration-300 group/row">
                          <td className="px-2 md:px-10 py-4 md:py-8">
                            <div className="flex items-center gap-2 md:gap-5">
                              <div className={`w-8 h-8 md:w-14 md:h-14 rounded-lg md:rounded-2xl flex items-center justify-center text-[10px] md:text-sm font-black ring-1 ring-white/10 shadow-2xl transition-all group-hover/row:scale-105 ${profit >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                {a.symbol[0]}
                              </div>
                              <div className="flex flex-col">
                                <span className="font-black text-white text-[11px] md:text-lg tracking-tight uppercase">{a.symbol}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-2 md:px-10 py-4 md:py-8">
                            <span className="text-[10px] md:text-sm font-black text-slate-300 tabular-nums">{a.quantity.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                          </td>
                          <td className="px-4 md:px-10 py-6 md:py-8 text-xs md:text-sm text-slate-500 font-bold tabular-nums hidden sm:table-cell">
                            <span className="opacity-40">$</span>{a.buyPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-2 md:px-10 py-4 md:py-8">
                            <span className="font-black text-white text-[10px] md:text-sm tabular-nums">
                              ${currentPrice.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                            </span>
                          </td>
                          <td className="px-2 md:px-10 py-4 md:py-8 text-right">
                            <span className={`font-black text-[11px] md:text-lg tabular-nums ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {profit >= 0 ? '+' : ''}${profit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </span>
                          </td>
                          {isAdmin && (
                            <td className="px-4 md:px-10 py-6 md:py-8 text-right">
                              <button onClick={() => removeAsset(a.id)} className="text-slate-700 hover:text-rose-500 p-2 md:p-3 bg-white/5 rounded-2xl transition-all opacity-0 group-hover/row:opacity-100 hover:scale-110 active:scale-95 border border-white/5">
                                <Trash2 size={14} />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-separate border-spacing-0">
                  <thead>
                    <tr className="bg-white/[0.01] text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] border-b border-white/5">
                      <th className="px-4 md:px-10 py-4 md:py-6 font-black opacity-60">Timestamp</th>
                      <th className="px-4 md:px-10 py-4 md:py-6 font-black opacity-60">Type</th>
                      <th className="px-4 md:px-10 py-4 md:py-6 font-black opacity-60">Ticker</th>
                      <th className="px-4 md:px-10 py-4 md:py-6 font-black opacity-60">Quantity</th>
                      <th className="px-4 md:px-10 py-4 md:py-6 text-right font-black opacity-60">Execution Price</th>
                      {isAdmin && <th className="px-4 md:px-10 py-4 md:py-6 text-right w-20"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {[...assets].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).map(log => (
                      <tr key={log.id} className="hover:bg-white/[0.03] transition-all duration-300 group/row">
                        <td className="px-4 md:px-10 py-6 md:py-8 text-[10px] md:text-[11px] font-bold text-slate-500 tabular-nums uppercase">
                          {log.date ? new Date(log.date).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                        </td>
                        <td className="px-4 md:px-10 py-6 md:py-8">
                          <span className={`px-3 py-1.5 md:px-4 md:py-2 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest border transition-all group-hover/row:scale-105 inline-block ${log.type === 'sell' ? 'bg-rose-500/5 text-rose-400 border-rose-500/20' : 'bg-emerald-500/5 text-emerald-400 border-emerald-500/20'}`}>
                            {log.type === 'sell' ? 'Sell' : 'Buy'}
                          </span>
                        </td>
                        <td className="px-4 md:px-10 py-6 md:py-8 text-xs md:text-sm font-black text-white">{log.symbol}</td>
                        <td className="px-4 md:px-10 py-6 md:py-8 text-xs md:text-sm font-bold text-slate-400 tabular-nums">{log.quantity.toLocaleString()}</td>
                        <td className="px-4 md:px-10 py-6 md:py-8 text-xs md:text-sm font-black text-slate-400 text-right tabular-nums">
                          <span className="opacity-30 mr-1">$</span>{log.buyPrice.toLocaleString()}
                        </td>
                        {isAdmin && (
                          <td className="px-4 md:px-10 py-6 md:py-8 text-right">
                            <button onClick={() => removeAsset(log.id)} className="text-slate-700 hover:text-rose-500 p-2 md:p-3 bg-white/5 rounded-2xl transition-all opacity-0 group-hover/row:opacity-100 hover:scale-110 active:scale-95 border border-white/5">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {((dataTab === 'inventory' && displayAssets.length === 0) || (dataTab === 'log' && assets.length === 0)) && (
              <div className="py-32 text-center space-y-6">
                <div className="bg-white/[0.03] w-20 h-20 rounded-3xl flex items-center justify-center mx-auto text-slate-700 ring-1 ring-white/5">
                  <AlertCircle size={40} />
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.5em]">데이터 없음</p>
                  <p className="text-[10px] font-bold text-slate-700 uppercase">표시할 거래 내역이 존재하지 않습니다</p>
                </div>
              </div>
            )}

            {isAdmin && (
              <div className="p-6 md:p-10 bg-indigo-600/[0.03] border-t border-white/5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-6">
                  <div className="flex bg-white/5 p-1 rounded-2xl backdrop-blur-md w-full sm:w-fit">
                    <button
                      onClick={() => setAdminTab('buy')}
                      className={`flex-1 sm:flex-none px-4 md:px-6 py-2.5 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${adminTab === 'buy' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-500/40' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      (+) 매수
                    </button>
                    <button
                      onClick={() => setAdminTab('sell')}
                      className={`flex-1 sm:flex-none px-4 md:px-6 py-2.5 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${adminTab === 'sell' ? 'bg-rose-600 text-white shadow-xl shadow-rose-500/40' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      (-) 매도
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">보안 관리자 접속 중</span>
                  </div>
                </div>

                <form onSubmit={addAsset} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-end">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-500 uppercase ml-2">티커 (Ticker)</label>
                    <div className="relative">
                      <input
                        placeholder="예: BTC, NVDA"
                        className="glass-input w-full pl-12 text-sm font-black"
                        value={newAsset.symbol}
                        onChange={e => setNewAsset({ ...newAsset, symbol: e.target.value })}
                      />
                      <Sparkles className={`absolute left-4 top-1/2 -translate-y-1/2 ${adminTab === 'buy' ? 'text-indigo-500/50' : 'text-rose-500/50'}`} size={16} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-500 uppercase ml-2">보유 수량</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      className="glass-input text-sm font-black"
                      value={newAsset.quantity}
                      onChange={e => setNewAsset({ ...newAsset, quantity: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-500 uppercase ml-2">단가 ($)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      className="glass-input text-sm font-black"
                      value={newAsset.buyPrice}
                      onChange={e => setNewAsset({ ...newAsset, buyPrice: e.target.value })}
                    />
                  </div>
                  <button
                    type="submit"
                    className={`h-[52px] flex items-center justify-center gap-3 rounded-[1.25rem] font-black text-[10px] tracking-[0.2em] transition-all duration-500 hover:scale-[1.02] active:scale-[0.98] ${adminTab === 'buy'
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-2xl shadow-indigo-500/30'
                      : 'bg-rose-600 hover:bg-rose-500 text-white shadow-2xl shadow-rose-500/40'
                      }`}
                  >
                    {adminTab === 'buy' ? <Plus size={16} /> : <TrendingDown size={16} />}
                    {adminTab === 'buy' ? '매수 기록 확정' : '매도 기록 확정'}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div >

      <footer className="text-center py-8">
        <p className="text-xs font-bold text-slate-600 uppercase tracking-[0.2em]">
          퍼블릭 대시보드 • 관리자: big0725
        </p>
      </footer>
    </div >
  );
};

export default App;
