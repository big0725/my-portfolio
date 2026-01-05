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
import { getFirestore, doc, setDoc, onSnapshot, initializeFirestore } from 'firebase/firestore';

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
  // WebChannelConnection RPC 'Write' 에러 방지를 위해 Long Polling 강제 활성화
  db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
  });
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
  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  const [adminTab, setAdminTab] = useState('buy'); // 'buy' or 'sell'
  const [dataTab, setDataTab] = useState('inventory'); // 'inventory' or 'log'
  const [assets, setAssets] = useState([]);
  const [newAsset, setNewAsset] = useState({ symbol: '', quantity: '', buyPrice: '' });
  const [prices, setPrices] = useState({});
  const [prevPrices, setPrevPrices] = useState({});
  const [marketStates, setMarketStates] = useState({}); // 'REGULAR', 'CLOSED', etc.
  const [history, setHistory] = useState([]);
  const [chartRange, setChartRange] = useState('7d'); // '7d', '30d', '1y'
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState('synced');
  const [error, setError] = useState(null);
  const [aiInsights, setAiInsights] = useState(null);
  const [cachedAiDate, setCachedAiDate] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [guruIndex, setGuruIndex] = useState(0);

  // 멀티 포트폴리오 상태
  const [currentPortfolioId, setCurrentPortfolioId] = useState('shared-portfolio');
  const [availablePortfolios, setAvailablePortfolios] = useState([
    { id: 'shared-portfolio', name: '대표 포트폴리오' }
  ]);

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

  // 데이터 동기화 (단일 문서 체제로 통합하여 권한 문제 해결)
  useEffect(() => {
    if (!db) return;

    // 유일하게 권한이 허용된 'shared-portfolio' 문서 하나만 감시합니다.
    const masterDoc = doc(db, 'artifacts', appId, 'settings', 'shared-portfolio');
    const unsubscribe = onSnapshot(masterDoc, (snap) => {
      setLoading(true);
      if (snap.exists()) {
        const data = snap.data();

        // 1. 포트폴리오 목록 업데이트
        if (data.portfolioList) {
          setAvailablePortfolios(data.portfolioList);
        }

        // 2. 현재 선택된 포트폴리오의 데이터 추출
        const pData = data.portfoliosData?.[currentPortfolioId] || {};

        // 만약 'shared-portfolio'(순정 상태) 데이터가 루트에 있다면 그것을 기본값으로 활용
        const finalAssets = pData.assets || (currentPortfolioId === 'shared-portfolio' ? data.assets : []) || [];
        const finalSnapshots = pData.snapshots || (currentPortfolioId === 'shared-portfolio' ? data.snapshots : []) || [];
        const finalAi = pData.dailyAiInsights || (currentPortfolioId === 'shared-portfolio' ? data.dailyAiInsights : null);

        setAssets(finalAssets);

        const normalize = (d) => {
          if (!d || typeof d !== 'string') return d;
          const parts = d.split('-');
          if (parts.length !== 3) return d;
          return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        };

        const cleanSnapshots = finalSnapshots.map(s => ({
          ...s,
          date: normalize(s.date)
        }));
        setSnapshots(cleanSnapshots);

        if (finalAi) {
          setAiInsights(finalAi.content);
          setCachedAiDate(finalAi.date);
        } else {
          setAiInsights(null);
          setCachedAiDate(null);
        }
      }
      setLoading(false);
    }, (err) => {
      console.error("Firestore 동기화 에러:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentPortfolioId]);

  // 새로운 포트폴리오 추가 기능 (권한 우회를 위해 단일 문서 내에 저장)
  const addNewPortfolio = async () => {
    if (!isAdmin) return;
    const name = window.prompt("새로운 포트폴리오 이름을 입력하세요:");
    if (!name || name.trim() === '') return;

    const id = `portfolio-${Date.now()}`;
    const newPortfolios = [...availablePortfolios, { id, name: name.trim() }];

    try {
      const masterDoc = doc(db, 'artifacts', appId, 'settings', 'shared-portfolio');
      await setDoc(masterDoc, {
        portfolioList: newPortfolios
      }, { merge: true });
      setCurrentPortfolioId(id);
    } catch (e) {
      console.error("포트폴리오 추가 실패:", e);
      alert("추가에 실패했습니다: " + e.message);
    }
  };

  // 포트폴리오 삭제 기능
  const deletePortfolio = async (idToDelete) => {
    if (!isAdmin || idToDelete === 'shared-portfolio') return;
    if (!window.confirm("이 포트폴리오와 모든 데이터를 삭제하시겠습니까?")) return;

    const newPortfolios = availablePortfolios.filter(p => p.id !== idToDelete);
    try {
      const masterDoc = doc(db, 'artifacts', appId, 'settings', 'shared-portfolio');
      await setDoc(masterDoc, {
        portfolioList: newPortfolios
      }, { merge: true });

      if (currentPortfolioId === idToDelete) {
        setCurrentPortfolioId('shared-portfolio');
      }
    } catch (e) {
      console.error("포트폴리오 삭제 실패:", e);
    }
  };

  // 오늘 시점의 포트폴리오 가치를 기록합니다.
  const saveSnapshot = async (totalValue) => {
    if (!isAdmin || !db || !totalValue) return;

    const today = new Date().toISOString().split('T')[0]; // 항상 YYYY-MM-DD

    // 주말(토, 일)에는 저장하지 않음 (휴장일 제외 로직)
    const dayOfWeek = new Date().getDay(); // 0: 일요일, 6: 토요일
    if (dayOfWeek === 0 || dayOfWeek === 6) return;

    // 데이터 누락 방지: 오늘 이미 저장된 값이 있지만, 
    // 새로 계산된 값이 이전에 저장된 값보다 크게 다르면(충실한 로딩 후라면) 업데이트 허용
    const existingIdx = snapshots.findIndex(s => s.date === today);
    if (existingIdx !== -1) {
      const existingVal = snapshots[existingIdx].value;
      // 이미 저장된 값이 현재 값과 비슷하거나, 현재 값이 터무니없이 작으면 업데이트 안 함
      if (totalValue <= existingVal || totalValue < existingVal * 0.7) return;
      console.log("포트폴리오 가치 업데이트 (더 정확한 데이터 감지):", totalValue);
    }

    // 유효성 검사: 이전 대비 데이터가 너무 급격히 떨어지면(오류 가능성) 저장하지 않음
    if (snapshots.length > 0) {
      const lastVal = snapshots[snapshots.length - 1].value;
      // 가치가 50% 이상 급락한 경우는 데이터 누락일 확률이 큼
      if (totalValue < lastVal * 0.5) {
        console.warn("데이터 누락 의심으로 스냅샷 저장을 건너뜁니다 (이전 대비 급락):", totalValue);
        return;
      }
    }

    try {
      const newSnapshot = { date: today, value: Math.round(totalValue) };
      const updatedSnapshots = [...snapshots, newSnapshot]
        .filter((v, i, a) => a.findIndex(t => t.date === v.date) === i)
        .sort((a, b) => a.date.localeCompare(b.date));

      const masterDoc = doc(db, 'artifacts', appId, 'settings', 'shared-portfolio');
      if (currentPortfolioId === 'shared-portfolio') {
        await setDoc(masterDoc, { snapshots: updatedSnapshots }, { merge: true });
      } else {
        // 중첩 구조로 저장
        await setDoc(masterDoc, {
          portfoliosData: { [currentPortfolioId]: { snapshots: updatedSnapshots } }
        }, { merge: true });
      }
      console.log("포트폴리오 가치가 기록되었습니다:", totalValue);
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
      const masterDoc = doc(db, 'artifacts', appId, 'settings', 'shared-portfolio');
      if (currentPortfolioId === 'shared-portfolio') {
        await setDoc(masterDoc, { assets: updated }, { merge: true });
      } else {
        await setDoc(masterDoc, {
          portfoliosData: { [currentPortfolioId]: { assets: updated } }
        }, { merge: true });
      }
      setSaveStatus('synced');
    } catch (e) {
      setSaveStatus('error');
    }
  };

  const resetTodayData = async () => {
    if (!isAdmin || !db) return;
    if (!window.confirm("오늘의 스냅샷과 AI 분석 데이터를 초기화하시겠습니까? (차트와 AI가 새로고침됩니다)")) return;

    setSaveStatus('saving');
    try {
      const today = new Date().toISOString().split('T')[0];
      const updatedSnapshots = snapshots.filter(s => s.date !== today);
      const masterDoc = doc(db, 'artifacts', appId, 'settings', 'shared-portfolio');

      if (currentPortfolioId === 'shared-portfolio') {
        await setDoc(masterDoc, {
          snapshots: updatedSnapshots,
          dailyAiInsights: { date: 'reset', content: null }
        }, { merge: true });
      } else {
        await setDoc(masterDoc, {
          portfoliosData: {
            [currentPortfolioId]: {
              snapshots: updatedSnapshots,
              dailyAiInsights: { date: 'reset', content: null }
            }
          }
        }, { merge: true });
      }

      setSnapshots(updatedSnapshots);
      setAiInsights(null);
      setCachedAiDate(null);
      setSaveStatus('synced');

      await fetchMarketData();
      await fetchAiInsights(true);
      alert("오늘의 데이터가 초기화되었습니다.");
    } catch (e) {
      console.error("초기화 실패:", e);
      setSaveStatus('error');
      alert("초기화 중 오류가 발생했습니다.");
    }
  };

  const resetAllSnapshots = async () => {
    if (!isAdmin || !db) return;
    if (!window.confirm("차트의 모든 히스토리 데이터를 삭제하시겠습니까? (야후 파이낸스 데이터로 다시 채워집니다)")) return;

    setSaveStatus('saving');
    try {
      const masterDoc = doc(db, 'artifacts', appId, 'settings', 'shared-portfolio');
      if (currentPortfolioId === 'shared-portfolio') {
        await setDoc(masterDoc, { snapshots: [] }, { merge: true });
      } else {
        await setDoc(masterDoc, {
          portfoliosData: { [currentPortfolioId]: { snapshots: [] } }
        }, { merge: true });
      }
      setSnapshots([]);
      setSaveStatus('synced');
      alert("차트 데이터가 초기화되었습니다. 새로고침 시 다시 수집됩니다.");
    } catch (e) {
      console.error("차트 초기화 실패:", e);
      setSaveStatus('error');
    }
  };

  const backfillSnapshots = async (historyData) => {
    if (!isAdmin || !db || !historyData || historyData.length === 0) return;
    if (snapshots.length > 10) return; // 이미 데이터가 충분하면 자동 보충 안 함

    console.log("차트 데이터 정밀 보충 시작...");
    try {
      const lastKnownPrices = {};
      const newSnapshots = historyData.map(d => {
        let v = 0;
        assets.forEach(a => {
          const sym = a.symbol.toUpperCase();
          if (d[sym] !== undefined && d[sym] !== null && d[sym] > 0) {
            lastKnownPrices[sym] = d[sym];
          }
          const price = lastKnownPrices[sym] || a.buyPrice || 0;
          v += (a.quantity || 0) * price;
        });
        return { date: d.date, value: Math.round(v) };
      }).filter(s => s.value > 100); // 비정상적 저가는 제외

      const masterDoc = doc(db, 'artifacts', appId, 'settings', 'shared-portfolio');
      if (currentPortfolioId === 'shared-portfolio') {
        await setDoc(masterDoc, { snapshots: newSnapshots }, { merge: true });
      } else {
        await setDoc(masterDoc, {
          portfoliosData: { [currentPortfolioId]: { snapshots: newSnapshots } }
        }, { merge: true });
      }
      setSnapshots(newSnapshots);
      console.log("차트 데이터 보충 완료:", newSnapshots.length, "건");
    } catch (e) {
      console.error("차트 보충 실패:", e);
    }
  };

  const fetchMarketData = async () => {
    if (assets.length === 0) return;
    setLoading(true);
    setError(null);

    try {
      // 1. 티커 정리 및 중복 제거
      const uniqueSymbols = [...new Set(assets.map(a => a.symbol.toUpperCase()))];

      // 암호화폐 감지 로직 강화
      const yfTickers = uniqueSymbols.map(s => {
        // 이미 -USD가 붙어있거나 .으로 시장이 지정되어 있으면 그대로 사용
        if (s.includes('-') || s.includes('.')) return s;
        // 일반적으로 3~5글자 대문자이면서 숫자가 섞인 경우 등 crypto일 확률이 높은 경우 시도 (현실적으로는 목록 관리가 안전)
        const commonCryptos = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT', 'BNB', 'LINK', 'AVAX', 'MATIC', 'TRX', 'UNI'];
        return commonCryptos.includes(s) ? `${s}-USD` : s;
      });

      // 2. 1차: 실시간 시세 로드 (v7 quote API)
      const targetUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${yfTickers.join(',')}`;
      // 다중 프록시 시도 (CORS 및 안정성 확보)
      const proxies = [
        `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
        `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`
      ];

      const fetchWithProxy = async (proxyList) => {
        for (const url of proxyList) {
          try {
            const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
            if (!res.ok) continue;
            const data = await res.json();
            const contents = data.contents || data;
            const json = typeof contents === 'string' ? JSON.parse(contents) : contents;
            if (json) return json;
          } catch (e) {
            console.warn(`Proxy ${url} failed or timed out.`);
          }
        }
        return null;
      };

      try {
        const quoteJson = await fetchWithProxy(proxies);
        if (quoteJson) {
          const quotes = quoteJson.quoteResponse?.result || [];
          const quickPrices = {};
          const quickPrevPrices = {};
          const quickStates = {};
          quotes.forEach(q => {
            const sym = q.symbol.replace('-USD', '').toUpperCase();
            quickPrices[sym] = q.regularMarketPrice || q.postMarketPrice || q.preMarketPrice || 0;
            quickStates[sym] = q.marketState; // REGULAR, POSTPOST, CLOSED, etc.

            // 기준가 설정 로직:
            // 장 종료 후에도 Yahoo API는 보통 해당 세션의 Open 정보를 유지하므로 이를 우선 활용합니다.
            quickPrevPrices[sym] = q.regularMarketOpen || q.regularMarketPreviousClose || quickPrices[sym];
          });

          setPrices(prev => ({ ...prev, ...quickPrices }));
          setPrevPrices(prev => ({ ...prev, ...quickPrevPrices }));
          setMarketStates(prev => ({ ...prev, ...quickStates }));

          // 데이터가 일부라도 로드되었으면 로딩 종료
          if (Object.keys(quickPrices).length > 0) {
            setLoading(false);
          }
        }
      } catch (e) {
        console.warn("현재가 API 로딩 실패, 차트 데이터로 대체 시도:", e);
      }

      // 3. 2차: 과거 데이터 및 상세 정보 로드 (차트용)
      const fetchHistory = async (symbol) => {
        const chartUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1y`;
        const historyProxies = [
          `https://corsproxy.io/?${encodeURIComponent(chartUrl)}`,
          `https://api.allorigins.win/get?url=${encodeURIComponent(chartUrl)}`,
          `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(chartUrl)}`
        ];

        try {
          const json = await fetchWithProxy(historyProxies);
          if (!json || !json.chart || !json.chart.result || !json.chart.result[0]) return null;
          return { originalTicker: symbol, data: json.chart.result[0] };
        } catch (e) {
          console.error(`${symbol} 데이터 로드 실패:`, e);
          return null;
        }
      };

      // 병렬 요청 (단, 프록시 과부하 방지를 위해 티커가 너무 많으면 주의 필요)
      const results = await Promise.all(yfTickers.map(t => fetchHistory(t)));
      const validResults = results.filter(r => r !== null);

      const historyMap = {};
      const finalPricesFromHistory = {};

      validResults.forEach((res) => {
        const chart = res.data;
        const symbol = chart.meta.symbol.replace('-USD', '').toUpperCase();
        const quotes = chart.indicators.quote[0];
        const closePrices = quotes.close || [];
        const openPrices = quotes.open || [];
        const timestamps = chart.timestamp || [];

        // 실시간 시세가 아직 없다면 차트의 마지막 값을 사용
        finalPricesFromHistory[symbol] = chart.meta.regularMarketPrice || closePrices[closePrices.length - 1] || 0;

        timestamps.forEach((ts, tIdx) => {
          // UTC 대신 현지 날짜 기준으로 변환 (날짜 어긋남 방지)
          const dObj = new Date(ts * 1000);
          const date = `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, '0')}-${String(dObj.getDate()).padStart(2, '0')}`;

          const cPrice = closePrices[tIdx];
          const oPrice = openPrices[tIdx];
          if (cPrice !== undefined && cPrice !== null) {
            if (!historyMap[date]) historyMap[date] = { date };
            historyMap[date][symbol] = cPrice;
            // 시초가 데이터도 히스토리에 저장 (_open 접미사 사용)
            if (oPrice !== undefined && oPrice !== null) {
              historyMap[date][symbol + '_OPEN'] = oPrice;
            }
          }
        });
      });

      const sortedHistory = Object.values(historyMap).sort((a, b) => a.date.localeCompare(b.date));

      // 최종 가격 및 이전 가격 병합 업데이트
      setPrices(prev => {
        const merged = { ...prev };
        Object.keys(finalPricesFromHistory).forEach(s => {
          if (!merged[s] || merged[s] === 0) merged[s] = finalPricesFromHistory[s];
        });
        return merged;
      });

      if (sortedHistory.length >= 1) {
        setPrevPrices(prev => {
          const merged = { ...prev };
          uniqueSymbols.forEach(sym => {
            // 각 심볼별로 가장 최신의 시초가(_OPEN)를 히스토리에서 역으로 찾음
            // (암호화폐는 오늘 데이터가 있고 주식은 금요일 데이터만 있는 경우 대비)
            for (let i = sortedHistory.length - 1; i >= 0; i--) {
              const dayData = sortedHistory[i];
              if (dayData[sym + '_OPEN']) {
                merged[sym] = dayData[sym + '_OPEN'];
                break;
              } else if (dayData[sym] && !merged[sym]) {
                // 시초가가 없는 데이터(오래된 암호화폐 히스토리 등)의 경우 종가를 사용
                merged[sym] = dayData[sym];
                break;
              }
            }
          });
          return merged;
        });
      }

      setHistory(sortedHistory);

      // 만약 저장된 스냅샷(캐시)이 부족하면 야후 파이낸스 데이터로 보충합니다.
      if (isAdmin && snapshots.length <= 5) {
        backfillSnapshots(sortedHistory);
      }

    } catch (e) {
      console.error("데이터 로드 중 치명적 오류:", e);
      setError("데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const fetchAiInsights = async (force = false) => {
    const currentApiKey = getApiKey();
    if (!assets.length) return;

    if (!currentApiKey) {
      if (isAdmin) {
        setError("Gemini API 키가 설정되지 않았습니다. .env 파일에 VITE_GEMINI_API_KEY를 추가하세요.");
      }
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    // 오늘 날짜의 캐시된 데이터가 이미 있으면 호출하지 않음 (강제 새로고침 제외)
    if (!force && cachedAiDate === today && aiInsights && !aiInsights.error) {
      console.log("오늘의 AI 분석이 이미 존재합니다. (캐시 사용)");
      return;
    }

    // 관리자가 아닐 경우 다른 사용자가 캐시를 생성할 때까지 대기 (API 사용량 절약)
    if (user?.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      console.log("관리자가 분석을 업데이트할 때까지 대기 중...");
      return;
    }

    setIsAiLoading(true);
    try {
      const portfolioSummary = assets.map(a => `${a.symbol}: ${a.quantity}주 (보유단가: $${a.buyPrice || 'unknown'})`).join(', ');

      // v1beta 및 gemini-2.0-flash 사용 (사용자 요청에 따라 최신 모델로 업데이트)
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(currentApiKey)}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `다음 자산 목록을 바탕으로 거장 3인(워렌 버핏, 스탠리 드러켄밀러, 캐시 우드)의 스타일로 투자 조언을 생성하세요: [${portfolioSummary}].
              결과는 반드시 순수 JSON이어야 하며, 다른 말은 하지 마세요.
              구조: {"buffett": {"advice": "...", "action": "...", "pick": {"symbol": "...", "reason": "..."}}, "druckenmiller": ..., "cathie": ...}`
            }]
          }]
        })
      });

      const resData = await response.json();

      if (!response.ok) {
        console.error("Gemini API 에러 상세:", resData);
        throw new Error(resData.error?.message || `API 요청 실패 (Status: ${response.status})`);
      }

      let textResponse = resData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textResponse) throw new Error("AI 응답이 비어있습니다.");

      // JSON만 추출
      const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("JSON 형식을 찾을 수 없거나 형식이 잘못되었습니다.");
      textResponse = jsonMatch[0];

      let content = JSON.parse(textResponse);

      // 키 매핑 (유연한 키 지원)
      const mappedContent = {
        buffett: content.buffett || content.warren_buffett || content.Buffett || {},
        druckenmiller: content.druckenmiller || content.stanley_druckenmiller || content.Druckenmiller || {},
        cathie: content.cathie || content.cathie_wood || content.Cathie || {}
      };

      setAiInsights(mappedContent);
      setIsAiLoading(false); // 분석 결과가 나오면 로딩 종료

      // Firestore에 오늘자 분석 결과 저장 (백그라운드에서 실행)
      try {
        const masterDoc = doc(db, 'artifacts', appId, 'settings', 'shared-portfolio');
        if (currentPortfolioId === 'shared-portfolio') {
          await setDoc(masterDoc, {
            dailyAiInsights: { date: today, content: mappedContent }
          }, { merge: true });
        } else {
          await setDoc(masterDoc, {
            portfoliosData: {
              [currentPortfolioId]: {
                dailyAiInsights: { date: today, content: mappedContent }
              }
            }
          }, { merge: true });
        }
      } catch (dbErr) {
        console.warn("Firestore 캐시 저장 실패 (하지만 분석은 완료됨):", dbErr);
      }

    } catch (e) {
      console.error("AI Insight 생성 실패:", e);
      setIsAiLoading(false);
      if (!aiInsights || force) {
        setAiInsights({ error: true });
      }
    }
  };

  useEffect(() => {
    if (assets.length > 0) {
      fetchMarketData();
    }
  }, [JSON.stringify(assets)]); // chartRange 제거 (로딩 속도 개선)

  useEffect(() => {
    if (assets.length > 0) {
      fetchAiInsights();
    }
  }, [JSON.stringify(assets)]);
  // AI 인사이트 중복 호출 방지를 위해 마켓 데이터와 분리하여 관리합니다.

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
      const sym = a.symbol.toUpperCase();
      // 실시간 시세(prices) 우선 -> 시세 누락 시 마지막 히스토리 가격(history) -> 그것도 없으면 매수가
      let currentPrice = prices[sym];
      // 개장 전(null/0)이거나 데이터 누락 시 히스토리에서 가장 최신 가격을 끝까지 추적
      if (currentPrice === undefined || currentPrice === null || currentPrice === 0) {
        if (history && history.length > 0) {
          for (let i = history.length - 1; i >= 0; i--) {
            if (history[i][sym] > 0) {
              currentPrice = history[i][sym];
              break;
            }
          }
        }
      }
      const p = currentPrice || a.buyPrice || 0;
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
        // 과거 가치 계산 시 오늘 가격(prices)을 사용하던 오류 수정
        pastValue += a.quantity * (pastData[sym] || a.buyPrice || 0);
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
    // 로딩이 완전히 끝나고 데이터가 유효할 때만 저장 트리거
    if (isAdmin && stats.total > 0 && !loading && history.length > 0) {
      saveSnapshot(stats.total);
    }
  }, [stats.total, isAdmin, loading, history.length]);

  const chartData = useMemo(() => {
    if (!history || history.length === 0) return [];

    // 날짜 정규화 함수 (YYYY-MM-DD 10자리로 통일)
    const normalizeDate = (d) => {
      if (!d || typeof d !== 'string') return null;
      const parts = d.split('-');
      if (parts.length !== 3) return d.trim();
      const y = parts[0];
      const m = parts[1].padStart(2, '0').slice(-2);
      const day = parts[2].padStart(2, '0').slice(-2);
      return `${y}-${m}-${day}`;
    };

    const combinedMap = new Map();
    const lastKnownPrices = {};

    // 1. 히스토리 기반 데이터 생성 (정렬 보장)
    const sortedRawHistory = [...history]
      .filter(h => h.date)
      .sort((a, b) => a.date.localeCompare(b.date));

    sortedRawHistory.forEach(day => {
      const normDate = normalizeDate(day.date);
      if (!normDate) return;

      let totalValue = 0;
      let hasPriceUpdateThisDay = false;

      assets.forEach(asset => {
        const sym = asset.symbol.toUpperCase();
        // 해당 날짜에 실제 데이터가 존재하는지 확인
        if (day[sym] !== undefined && day[sym] !== null && day[sym] > 0) {
          lastKnownPrices[sym] = day[sym];
          // 특정 자산이라도 새로운 가격 정보가 있으면 거래가 발생한 날로 간주
          hasPriceUpdateThisDay = true;
        }

        // 중요: 과거 가치 계산 시 실시간 시세(prices[sym])를 절대 섞지 않음.
        // 현재까지 알려진 역사적 가격(lastKnown) -> 없으면 매수가(buyPrice) 순으로 적용.
        const price = lastKnownPrices[sym] || asset.buyPrice || 0;
        totalValue += (asset.quantity || 0) * price;
      });

      // 주말(토, 일)은 무조건 제외
      const dateObj = new Date(day.date);
      const dayOfWeek = dateObj.getDay(); // 0: 일요일, 6: 토요일
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      // 주말이 아니고, 최소한 하나 이상의 자산에 가격 업데이트가 있었던 날만 차트에 표시 (공휴일 필터링)
      if (!isWeekend && hasPriceUpdateThisDay && totalValue > 0) {
        combinedMap.set(normDate, totalValue);
      }
    });

    // 2. 관리자 스냅샷 병합 (정밀 실시간 기록 데이터)
    if (snapshots && snapshots.length > 0) {
      snapshots.forEach(s => {
        const normDate = normalizeDate(s.date);
        const dayOfWeek = new Date(s.date).getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        if (normDate && s.value > 0 && !isWeekend) {
          // 신뢰도 검사: 이미 동일 날짜에 히스토리 기반 데이터가 있다면 비교
          const historyValue = combinedMap.get(normDate);
          if (historyValue) {
            // 저장된 스냅샷이 히스토리 계산값보다 너무 낮으면(30% 이상 차이) 
            // 이는 데이터 누락 시점에 잘못 저장된 "오염된 데이터"로 간주하고 무시함
            if (s.value < historyValue * 0.7) {
              console.warn(`[Chart] ${normDate}의 스냅샷 데이터 오염 감지(급락), 무시하고 히스토리 값을 사용합니다.`);
              return;
            }
          }
          combinedMap.set(normDate, s.value);
        }
      });
    }

    if (combinedMap.size === 0) return [];

    // 3. 전체 날짜 재정렬 및 기간 필터링
    const finalSortedDates = Array.from(combinedMap.keys()).sort();
    let targetDates = finalSortedDates;
    if (chartRange === '7d') targetDates = finalSortedDates.slice(-7);
    else if (chartRange === '30d') targetDates = finalSortedDates.slice(-30);
    else if (chartRange === '1y') targetDates = finalSortedDates.slice(-365);

    return targetDates.map(date => ({
      fullDate: date,
      date: date.slice(5),
      value: Math.round(combinedMap.get(date))
    }));
  }, [snapshots, history, assets, prices, chartRange]);


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
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-500/30">
                <Briefcase className="text-white" size={24} />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-xl font-black tracking-tighter gradient-text leading-tight">PORTFOLIO PRO</h1>
                {isAdmin && <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full uppercase tracking-tighter">관리자 모드</span>}
              </div>
            </div>

            {/* Portfolio Selector */}
            <div className="h-10 flex items-center bg-black/20 rounded-xl border border-white/5 p-1 transition-all">
              <div className="hidden md:flex items-center gap-2 px-3 opacity-40">
                <LayoutDashboard size={14} />
                <span className="text-[10px] font-black uppercase tracking-widest">Select</span>
              </div>
              <div className="flex items-center gap-1">
                {availablePortfolios.map(p => (
                  <div key={p.id} className="relative group">
                    <button
                      onClick={() => setCurrentPortfolioId(p.id)}
                      className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${currentPortfolioId === p.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
                    >
                      {p.name}
                    </button>
                    {isAdmin && p.id !== 'shared-portfolio' && currentPortfolioId === p.id && (
                      <button
                        onClick={(e) => { e.stopPropagation(); deletePortfolio(p.id); }}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="삭제"
                      >
                        <Trash2 size={8} />
                      </button>
                    )}
                  </div>
                ))}
                {isAdmin && (
                  <button
                    onClick={addNewPortfolio}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-indigo-400 hover:bg-white/5 transition-all"
                    title="새 포트폴리오 추가"
                  >
                    <Plus size={16} />
                  </button>
                )}
              </div>
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

            {isAdmin && (
              <div className="flex items-center gap-2">
                <button
                  onClick={resetTodayData}
                  disabled={loading}
                  className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 h-10 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-xs font-bold"
                  title="오늘 데이터 초기화"
                >
                  <Trash2 size={14} />
                  <span className="hidden md:inline">오늘 리셋</span>
                </button>
              </div>
            )}

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

                  <div className="flex-1 w-full min-h-[200px] md:min-h-[220px] h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 30, right: 10, left: 10, bottom: 60 }}>
                        <defs>
                          <linearGradient id="colorNetWorth" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="fullDate" hide />
                        <YAxis
                          hide
                          domain={([dataMin, dataMax]) => {
                            const range = dataMax - dataMin;
                            if (range === 0) return [dataMin * 0.9, dataMax * 1.1];
                            return [dataMin - (range * 0.4), dataMax + (range * 0.3)];
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke="#818cf8"
                          strokeWidth={4}
                          fillOpacity={1}
                          fill="url(#colorNetWorth)"
                          connectNulls={true}
                          animationDuration={500}
                          strokeLinecap="round"
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div className="glass-card p-5 border-white/10 shadow-2xl backdrop-blur-3xl ring-1 ring-white/10 bg-black/40">
                                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 border-b border-white/5 pb-2">
                                    {payload[0].payload.fullDate || payload[0].payload.date}
                                  </p>
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
                          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                            {cachedAiDate === new Date().toISOString().split('T')[0] ? 'Today\'s Analysis Cached' : 'Real-time Guru Sync'}
                          </p>
                          {isAdmin && (
                            <button
                              onClick={() => fetchAiInsights(true)}
                              className="ml-2 p-1 rounded-md bg-white/5 hover:bg-white/10 transition-colors"
                              title="Force AI Refresh"
                            >
                              <RefreshCw size={10} className={`${isAiLoading ? 'animate-spin text-indigo-400' : 'text-slate-500'}`} />
                            </button>
                          )}
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

                  <div className="relative flex-1 min-h-[450px] md:min-h-[500px]">
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
                        className={`transition-all duration-700 ease-in-out transform ${guruIndex === i
                          ? 'relative opacity-100 translate-x-0 scale-100 pointer-events-auto'
                          : 'absolute top-0 left-0 w-full opacity-0 translate-x-12 scale-95 pointer-events-none'
                          }`}
                      >
                        <div className="flex flex-col gap-8 h-full">
                          {/* Guru Header */}
                          <div className="flex items-center gap-6 shrink-0 bg-white/[0.02] p-6 rounded-[2.5rem] border border-white/5">
                            <div className="relative group/avatar">
                              <div className={`absolute -inset-2 bg-gradient-to-tr from-${guru.color}-500 to-transparent rounded-full opacity-20 group-hover/avatar:opacity-40 transition-all duration-700 blur-md`}></div>
                              <img src={guru.image} alt={guru.name} className="w-20 h-20 rounded-full object-cover border-4 border-white/10 relative z-10 shadow-2xl transition-transform duration-700 group-hover/avatar:scale-110" />
                              <div className={`absolute -bottom-1 -right-1 bg-[#020617] p-2.5 rounded-full border border-white/10 z-20 shadow-xl group-hover/avatar:rotate-12 transition-all`}>
                                {guru.icon}
                              </div>
                            </div>
                            <div>
                              <div className="text-2xl font-black text-white tracking-tighter uppercase leading-none">{guru.name}</div>
                              <div className={`text-[11px] font-black text-${guru.color}-400 uppercase tracking-[0.4em] mt-2 opacity-80`}>{guru.role}</div>
                            </div>
                          </div>

                          {/* Advice & Content */}
                          <div className="flex-1 flex flex-col gap-6 px-4">
                            <div className="relative">
                              <div className="absolute -left-6 top-0 bottom-0 w-[3px] bg-gradient-to-b from-indigo-500/50 via-indigo-500/10 to-transparent rounded-full"></div>
                              <div className="text-[15px] font-semibold text-slate-200 leading-[1.8] italic">
                                {isAiLoading ? (
                                  <div className="space-y-3 animate-pulse">
                                    <div className="h-4 bg-white/5 rounded-full w-3/4"></div>
                                    <div className="h-4 bg-white/5 rounded-full w-1/2"></div>
                                  </div>
                                ) :
                                  aiInsights?.error ? "현재 AI 분석이 지연되고 있습니다. 잠시 후 관리자 동기화를 대기해 주세요." :
                                    !assets.length ? "분석할 자산이 없습니다." :
                                      guru.data?.advice ? `"${guru.data.advice}"` :
                                        !user ? "분석 대기 중..." : "데이터 로딩 중..."}
                              </div>
                            </div>

                            {/* Action & Pick */}
                            <div className="mt-2 space-y-4">
                              {guru.data?.action && (
                                <div className="text-[11px] font-black text-indigo-400 uppercase tracking-[0.2em] flex items-center gap-3">
                                  <span className="w-8 h-[1px] bg-indigo-500/30"></span>
                                  Next Action: {guru.data.action}
                                </div>
                              )}

                              {guru.data?.pick && !isAiLoading && (
                                <div className={`p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] bg-${guru.color}-500/[0.03] border border-${guru.color}-500/10 backdrop-blur-xl group/pick hover:bg-${guru.color}-500/05 transition-all duration-500 mb-4`}>
                                  <div className="flex items-center justify-between mb-3 md:mb-4">
                                    <div className="flex items-center gap-2 md:gap-3">
                                      <div className={`w-1.5 md:w-2 h-1.5 md:h-2 rounded-full bg-${guru.color}-500 animate-pulse`}></div>
                                      <span className={`text-[9px] md:text-[10px] font-black text-${guru.color}-400 uppercase tracking-widest`}>Strategic Pick</span>
                                    </div>
                                    <span className="text-base md:text-xl font-black text-white tracking-[0.1em] md:tracking-[0.15em] drop-shadow-lg">{guru.data.pick.symbol}</span>
                                  </div>
                                  <p className="text-[11px] md:text-[12px] font-medium text-slate-400 leading-relaxed pl-3 md:pl-5 border-l-2 border-white/5 group-hover/pick:border-indigo-500/30 transition-colors">
                                    {guru.data.pick.reason}
                                  </p>
                                </div>
                              )}
                            </div>
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
                      <th className="px-4 md:px-10 py-4 md:py-6 text-right font-black opacity-60">Day Chg</th>
                      <th className="px-4 md:px-10 py-4 md:py-6 text-right font-black opacity-60">PnL</th>
                      {isAdmin && <th className="px-4 md:px-10 py-4 md:py-6 text-right w-20"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {displayAssets.map(a => {
                      const sym = a.symbol.toUpperCase();
                      const currentPrice = prices[sym] || a.buyPrice || 0;
                      const prevPrice = prevPrices[sym] || currentPrice;
                      const mState = marketStates[sym] || 'CLOSED';
                      const isRegular = mState === 'REGULAR';

                      const dChg = currentPrice - prevPrice;
                      const dChgPercent = prevPrice > 0 ? (dChg / prevPrice) * 100 : 0;

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
                                <span className="text-[8px] font-bold text-slate-600 opacity-60 tracking-tighter uppercase">{mState}</span>
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
                            <div className={`flex flex-col items-end`}>
                              <span className={`font-black text-[10px] md:text-sm tabular-nums ${dChg >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {dChg >= 0 ? '+' : ''}{dChgPercent.toFixed(2)}%
                              </span>
                              <span className="text-[9px] font-bold text-slate-600 uppercase tracking-tighter">
                                vs Open
                              </span>
                            </div>
                          </td>
                          <td className="px-2 md:px-10 py-4 md:py-8 text-right">
                            <span className={`font-black text-[11px] md:text-lg tabular-nums ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {profit >= 0 ? '+' : ''}${profit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </span>
                            <div className="text-[9px] font-bold text-slate-600 tabular-nums">
                              {pPercent >= 0 ? '+' : ''}{pPercent.toFixed(1)}% Total
                            </div>
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
