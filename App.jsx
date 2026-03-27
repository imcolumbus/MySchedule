import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  serverTimestamp 
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  Calendar, 
  Plus, 
  Trash2, 
  Clock,
  AlertTriangle,
  RefreshCw,
  MapPin,
  FileText,
  X,
  Home,
  BarChart3,
  Stethoscope,
  BrainCircuit,
  Settings,
  MoreVertical,
  ChevronRight,
  Info
} from 'lucide-react';

/**
 * [버전 정보]
 * v1.4.1 (2024-05-24)
 * - 설정 오류 해결: 환경 변수(VITE_FIREBASE_CONFIG) 인식 로직 대폭 강화
 * - 디버깅 UI 추가: 설정 실패 시 원인 파악을 위한 상태 정보 표시
 * - 상용 앱 수준 UI 유지 및 안정성 개선
 */

// 1. Firebase 설정값 추출 및 파싱 로직 개선
const getFirebaseConfig = () => {
  const parseConfig = (raw) => {
    if (!raw) return null;
    let cleaned = String(raw).trim();
    if (!cleaned || cleaned === '{}') return null;
    
    try {
      // 주석 및 JS 변수 선언부 제거
      cleaned = cleaned.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
      cleaned = cleaned.replace(/(const|let|var)\s+\w+\s*=\s*/g, '');
      cleaned = cleaned.trim().replace(/;$/, '');
      
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }
      
      try {
        return JSON.parse(cleaned);
      } catch (e) {
        // 따옴표 없는 키 등 비표준 형태 보정
        const fixed = cleaned
          .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
          .replace(/'/g, '"')
          .replace(/,\s*([\]}])/g, '$1');
        return JSON.parse(fixed);
      }
    } catch (err) {
      console.error("Config Parsing Error:", err);
      return null;
    }
  };

  let source = null;
  // 1순위: 전역 변수
  if (typeof __firebase_config !== 'undefined') source = __firebase_config;
  
  // 2순위: Vite 환경 변수 (import.meta.env)
  if (!source) {
    try {
      // @ts-ignore
      source = import.meta.env.VITE_FIREBASE_CONFIG;
    } catch (e) {}
  }

  // 3순위: process.env (Vercel 기본)
  if (!source && typeof process !== 'undefined' && process.env) {
    source = process.env.VITE_FIREBASE_CONFIG || process.env.__firebase_config;
  }

  return { config: parseConfig(source), rawSource: source };
};

const { config: firebaseConfig, rawSource } = getFirebaseConfig();

// Firebase 초기화 (apiKey 존재 여부 확인)
const app = (firebaseConfig && firebaseConfig.apiKey) ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'my-schedule-app';

function App() {
  const [user, setUser] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [activeTab, setActiveTab] = useState('홈');

  // 입력 폼 상태
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newStartDate, setNewStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [newEndDate, setNewEndDate] = useState('');
  const [isRange, setIsRange] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];
  const dateDisplay = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });

  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else { await signInAnonymously(auth); }
      } catch (e) {}
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    const unsubscribe = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'schedules'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSchedules(data.sort((a, b) => new Date(a.startDate) - new Date(b.startDate)));
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  const handleAddSchedule = async (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !db) return;
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'schedules'), {
        title: newTitle, content: newContent, location: newLocation, time: newTime, 
        startDate: newStartDate, endDate: isRange ? newEndDate : newStartDate,
        createdAt: serverTimestamp(), author: user.uid
      });
      setNewTitle(''); setNewContent(''); setNewLocation(''); setNewTime(''); setIsRange(false);
      setShowAddForm(false);
    } catch (e) {}
  };

  const handleDelete = async (id) => {
    if (!db) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'schedules', id));
  };

  const categorizedSchedules = useMemo(() => {
    return schedules.filter(s => (s.endDate || s.startDate) >= todayStr);
  }, [schedules, todayStr]);

  // 설정 오류 시 안내 화면
  if (!app) return (
    <div className="min-h-screen bg-[#F7F9FB] flex items-center justify-center p-6 text-center font-sans">
      <div className="bg-white p-10 rounded-[3rem] shadow-2xl max-w-md w-full border-t-[16px] border-red-500">
        <AlertTriangle className="text-red-500 mx-auto mb-6" size={60} />
        <h1 className="text-3xl font-black text-slate-800 mb-6">설정 확인</h1>
        
        <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 text-left mb-8">
          <p className="font-black text-blue-900 mb-3 flex items-center gap-2 text-xl">
            <Info size={24} /> 조치 방법
          </p>
          <ul className="text-blue-800 space-y-2 font-bold leading-relaxed">
            <li>1. Vercel 환경 변수 이름이 <code className="bg-white px-1">VITE_FIREBASE_CONFIG</code> 인지 확인</li>
            <li>2. 값에 중괄호 <code className="bg-white px-1">{"{ }"}</code> 데이터만 들어있는지 확인</li>
            <li>3. 저장 후 반드시 <strong>Redeploy</strong>를 실행</li>
          </ul>
        </div>

        <div className="text-left border-t border-slate-100 pt-6">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Debug Information</p>
          <div className="bg-slate-900 text-emerald-400 p-4 rounded-2xl font-mono text-[10px] break-all max-h-40 overflow-auto shadow-inner leading-relaxed">
             &gt; Variable Detected: {rawSource ? "YES" : "NO"}
             <br/>&gt; API Key Present: {firebaseConfig?.apiKey ? "YES" : "NO"}
             <br/>&gt; App Status: Initializing Failed
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F7F9FB] text-slate-900 font-sans pb-32">
      {/* 상단 프로필 바 */}
      <header className="px-6 pt-6 flex items-center justify-between max-w-2xl mx-auto">
        <div className="flex items-center gap-3 bg-white p-2 pr-6 rounded-full shadow-sm border border-slate-100">
          <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center overflow-hidden border-2 border-white shadow-sm font-bold text-orange-600">
            성
          </div>
          <div className="flex items-center gap-1">
            <span className="font-bold text-lg">어머니</span>
            <X size={14} className="text-slate-300" />
          </div>
        </div>
        <div className="flex gap-2">
          <button className="p-3 bg-white rounded-full shadow-sm border border-slate-100 text-slate-400">
            <Settings size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 mt-8">
        {/* 날짜 및 요약 섹션 */}
        <div className="flex justify-between items-end mb-6">
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            나의 일정 <span className="text-indigo-600 text-sm font-bold">v1.4.1</span>
          </h2>
          <button 
            onClick={() => setShowAddForm(true)}
            className="px-5 py-2.5 bg-white text-emerald-600 rounded-full font-bold text-sm shadow-sm border border-emerald-50 hover:bg-emerald-50 transition-all flex items-center gap-1"
          >
            일정 등록 <Plus size={16} strokeWidth={3} />
          </button>
        </div>

        {loading ? (
          <div className="py-20 text-center animate-pulse">
            <RefreshCw className="mx-auto text-indigo-300 animate-spin mb-4" size={40} />
            <p className="text-slate-400 font-bold">일정 동기화 중...</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* 상단 메인 일정 (그린 카드) */}
            <section className="bg-gradient-to-br from-[#77B300] to-[#5D8C00] rounded-[2.5rem] p-8 shadow-[0_20px_40px_-10px_rgba(119,179,0,0.3)] text-white relative overflow-hidden">
              <div className="absolute right-0 top-0 w-32 h-32 bg-white/10 rounded-full -translate-y-10 translate-x-10 blur-2xl" />
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-xl font-bold opacity-90">진료 및 주요 일정</h3>
                <div className="bg-white/20 px-4 py-1.5 rounded-full text-sm font-bold backdrop-blur-md">
                  더보기
                </div>
              </div>

              {categorizedSchedules.slice(0, 2).map((item, idx) => (
                <div key={item.id} className={`relative z-10 ${idx === 0 ? 'mb-8' : 'opacity-80 pt-6 border-t border-white/10'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="text-3xl font-black">{item.title}</h4>
                    <span className="bg-white/20 px-4 py-1.5 rounded-2xl text-lg font-bold">
                      {item.startDate.slice(5).replace('-', '/')}
                    </span>
                  </div>
                  <div className="space-y-1 opacity-90 text-xl font-bold">
                    {item.location && <p className="flex items-center gap-2"><MapPin size={18} /> {item.location}</p>}
                    <p className="flex items-center gap-2"><Clock size={18} /> {item.startDate} · {item.time || '종일'}</p>
                    {item.content && <p className="mt-3 text-lg font-medium bg-black/5 p-4 rounded-2xl border border-white/5">{item.content}</p>}
                  </div>
                </div>
              ))}
              {categorizedSchedules.length === 0 && <p className="text-2xl font-bold py-10 opacity-70">진행 중인 일정이 없습니다.</p>}
            </section>

            {/* 나머지 일정 목록 (화이트 카드) */}
            <section className="space-y-4">
              <h3 className="text-xl font-black text-slate-800 ml-2">예정된 일지</h3>
              {categorizedSchedules.length > 2 ? categorizedSchedules.slice(2).map((item) => (
                <div key={item.id} className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 flex justify-between items-center group transition-all hover:shadow-md">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-slate-400 font-bold text-sm uppercase tracking-tighter">{item.startDate}</span>
                    </div>
                    <h4 className="text-2xl font-black text-slate-800">{item.title}</h4>
                    {item.location && <p className="text-slate-400 font-bold text-lg mt-1 flex items-center gap-1"><MapPin size={16}/> {item.location}</p>}
                  </div>
                  <button onClick={() => handleDelete(item.id)} className="p-3 bg-slate-50 text-slate-300 rounded-full hover:bg-red-50 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100">
                    <Trash2 size={24} />
                  </button>
                  <ChevronRight size={24} className="text-slate-200" />
                </div>
              )) : (
                <div className="text-center py-10 text-slate-300 font-bold italic">새로운 일정을 추가해 보세요</div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* 하단 네비게이션 바 */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-slate-100 pb-10 pt-4 px-6 z-50 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          {[
            { name: '홈', icon: Home },
            { name: '일정', icon: Calendar },
            { name: '수치', icon: BarChart3 },
            { name: 'AI', icon: BrainCircuit },
            { name: '정보', icon: MoreVertical },
          ].map((tab) => (
            <button 
              key={tab.name}
              onClick={() => setActiveTab(tab.name)}
              className={`flex flex-col items-center gap-1 transition-all ${activeTab === tab.name ? 'text-emerald-600 scale-110' : 'text-slate-400'}`}
            >
              <div className={`p-2 rounded-2xl ${activeTab === tab.name ? 'bg-emerald-50' : ''}`}>
                <tab.icon size={26} strokeWidth={activeTab === tab.name ? 3 : 2} />
              </div>
              <span className="text-xs font-black">{tab.name}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* 일정 추가 모달 */}
      {showAddForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-end md:items-center justify-center p-0 md:p-6">
          <div className="bg-white w-full max-w-lg rounded-t-[3rem] md:rounded-[3rem] p-10 animate-in slide-in-from-bottom-20 duration-500">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-3xl font-black text-slate-800">새 일정 등록</h2>
              <button onClick={() => setShowAddForm(false)} className="p-2 bg-slate-100 rounded-full text-slate-400"><X/></button>
            </div>
            
            <form onSubmit={handleAddSchedule} className="space-y-6">
              <input 
                type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} 
                placeholder="제목 (예: 건국대병원 외래)" 
                className="w-full text-2xl p-6 bg-slate-50 rounded-[1.5rem] border-none font-bold focus:ring-4 focus:ring-emerald-100" 
                autoFocus 
              />
              <div className="grid grid-cols-2 gap-4">
                <input type="text" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="장소" className="p-4 bg-slate-50 rounded-2xl border-none font-bold text-lg" />
                <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="p-4 bg-slate-50 rounded-2xl border-none font-bold text-lg" />
              </div>
              <textarea 
                value={newContent} onChange={(e) => setNewContent(e.target.value)} 
                placeholder="상세 내용" rows={3}
                className="w-full p-5 bg-slate-50 rounded-[1.5rem] border-none font-bold text-lg" 
              />
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                <span className="font-black text-slate-700 text-lg">기간 설정</span>
                <button type="button" onClick={() => setIsRange(!isRange)} className={`w-14 h-8 rounded-full relative transition-colors ${isRange ? 'bg-emerald-600' : 'bg-slate-300'}`}>
                  <div className={`absolute top-1 bg-white w-6 h-6 rounded-full transition-transform ${isRange ? 'translate-x-7' : 'translate-x-1'}`} />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="date" value={newStartDate} onChange={(e) => setNewStartDate(e.target.value)} className="w-full p-4 bg-slate-50 rounded-xl border-none font-bold text-lg" />
                {isRange && <input type="date" value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)} className="w-full p-4 bg-slate-50 rounded-xl border-none font-bold text-lg" />}
              </div>
              <button type="submit" className="w-full py-6 bg-emerald-600 text-white rounded-[2rem] font-black text-2xl shadow-xl shadow-emerald-100 active:scale-95 transition-transform">저장하기</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}

export default App;
