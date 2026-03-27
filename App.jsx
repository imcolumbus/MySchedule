/**
 * [버전 정보]
 * v1.5.1 (2024-05-24)
 * - 설정 오류 해결: 환경 변수(VITE_FIREBASE_CONFIG) 인식 로직 대폭 강화
 * - 빌드 환경 호환성 개선: 다양한 환경 변수 접근 방식 지원
 * - 디버깅 UI 추가: 설정 실패 시 원인 파악을 위한 상태 정보 및 조치 방법 표시
 */

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
  BrainCircuit,
  Settings,
  MoreVertical,
  ChevronRight,
  Info,
  CalendarDays
} from 'lucide-react';

// 1. Firebase 설정값 추출 및 파싱 로직 강화
const getFirebaseConfig = () => {
  const parseConfig = (raw) => {
    if (!raw) return null;
    let cleaned = String(raw).trim();
    if (!cleaned || cleaned === '{}') return null;
    
    try {
      // 주석 및 JS 변수 선언부(const/let/var) 제거
      cleaned = cleaned.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
      cleaned = cleaned.replace(/(const|let|var)\s+\w+\s*=\s*/g, '');
      cleaned = cleaned.trim().replace(/;$/, '');
      
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }
      
      try {
        // 1차: 표준 JSON 파싱
        return JSON.parse(cleaned);
      } catch (e) {
        // 2차: 따옴표 없는 키 등 비표준 형태 보정 후 재시도
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
  // 1순위: 전역 변수 (__firebase_config)
  if (typeof __firebase_config !== 'undefined') source = __firebase_config;
  
  // 2순위: Vite 환경 변수 (import.meta.env) - 빌드 타임 주입
  if (!source) {
    try {
      // @ts-ignore
      source = import.meta.env.VITE_FIREBASE_CONFIG;
    } catch (e) {}
  }

  // 3순위: process.env (Vercel 기본/Node)
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

  // 설정 오류 시 안내 화면 (Firebase 초기화 실패 시)
  if (!app) return (
    <div className="min-h-screen bg-[#F7F9FB] flex items-center justify-center p-6 text-center font-sans">
      <div className="bg-white p-10 rounded-[3rem] shadow-2xl max-w-md w-full border-t-[16px] border-red-500">
        <AlertTriangle className="text-red-500 mx-auto mb-6" size={64} />
        <h1 className="text-3xl font-black text-slate-800 mb-6">설정 확인 필요</h1>
        
        <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 text-left mb-8">
          <p className="font-black text-blue-900 mb-3 flex items-center gap-2 text-xl">
            <Info size={24} /> 해결 방법
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
             <br/>&gt; Status: Initializing Failed
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F4F7F2] text-slate-900 font-sans pb-32 overflow-x-hidden">
      {/* 상단 프로필 및 앱 바 */}
      <header className="px-6 pt-8 pb-4 flex items-center justify-between max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center border-4 border-white shadow-sm">
             <span className="text-orange-600 font-black text-xl">성</span>
          </div>
          <div>
            <h1 className="text-2xl font-black flex items-center gap-1 text-[#4A6D00]">
              나의 일정 <span className="text-slate-300 font-bold text-sm tracking-tighter">v1.5.1</span>
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
           <button className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-slate-400 border border-slate-100">
             <Settings size={20} />
           </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 mt-4">
        {/* 메인 비주얼 카드: 오늘/예정된 핵심 일정 */}
        <section className="bg-gradient-to-br from-[#8DC63F] to-[#72A632] rounded-[2.5rem] p-8 shadow-[0_20px_50px_-12px_rgba(141,198,63,0.4)] text-white mb-10 transition-all">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-black opacity-90">진료 및 주요 일정</h2>
            <button className="bg-white/20 hover:bg-white/30 px-5 py-2 rounded-full text-sm font-black backdrop-blur-md transition-all">
              더보기
            </button>
          </div>

          <div className="space-y-6">
            {categorizedSchedules.length > 0 ? categorizedSchedules.slice(0, 2).map((item, idx) => (
              <div key={item.id} className={`group relative ${idx === 0 ? '' : 'pt-6 border-t border-white/20'}`}>
                <div className="flex justify-between items-start mb-2">
                   <div>
                      <h3 className="text-[2.2rem] font-black leading-tight mb-2 break-keep">{item.title}</h3>
                      <div className="flex flex-wrap gap-4 text-xl font-bold opacity-90 mt-4">
                        {item.location && <span className="flex items-center gap-2 bg-white/10 px-4 py-1 rounded-xl"><MapPin size={20} /> {item.location}</span>}
                        <span className="flex items-center gap-2 bg-white/10 px-4 py-1 rounded-xl"><Clock size={20} /> {item.startDate} {item.time && `· ${item.time}`}</span>
                      </div>
                   </div>
                   <div className="bg-white/20 px-5 py-2 rounded-2xl text-2xl font-black backdrop-blur-md whitespace-nowrap">
                     {item.startDate.slice(5).replace('-', '/')}
                   </div>
                </div>
                {item.content && (
                   <p className="mt-4 text-xl font-bold bg-black/10 p-5 rounded-2xl border border-white/10 opacity-95">
                     {item.content}
                   </p>
                )}
                <button 
                  onClick={() => handleDelete(item.id)}
                  className="absolute -right-2 -top-2 p-3 bg-red-500 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all scale-75"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            )) : (
              <div className="py-12 text-center">
                <CalendarDays size={64} className="mx-auto mb-4 opacity-30" />
                <p className="text-2xl font-black opacity-60">오늘 예정된 일정이 없어요</p>
              </div>
            )}
          </div>
        </section>

        {/* 하단 리스트 섹션 */}
        <div className="flex justify-between items-center mb-6 px-2">
           <h3 className="text-2xl font-black text-slate-800">예정된 일지</h3>
           <button 
             onClick={() => setShowAddForm(true)}
             className="bg-[#E9F3D5] text-[#5D8C00] px-6 py-2.5 rounded-full font-black text-lg shadow-sm active:scale-95 transition-all"
           >
             상세입력
           </button>
        </div>

        {loading ? (
          <div className="py-20 text-center">
            <RefreshCw className="animate-spin mx-auto text-[#8DC63F]" size={48} />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {categorizedSchedules.slice(2).map((item) => (
              <div key={item.id} className="bg-white rounded-[2.5rem] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-50 group relative hover:shadow-xl transition-all">
                <div className="flex justify-between items-start">
                   <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-[#8DC63F] font-black text-sm uppercase tracking-wider">{item.startDate}</span>
                        {item.time && <span className="bg-slate-50 px-2 py-0.5 rounded text-xs font-bold text-slate-400">{item.time}</span>}
                      </div>
                      <h4 className="text-[1.75rem] font-black text-slate-800 leading-tight mb-2">{item.title}</h4>
                      {item.location && <p className="text-slate-400 font-bold text-lg flex items-center gap-1"><MapPin size={18}/> {item.location}</p>}
                   </div>
                   <button 
                     onClick={() => handleDelete(item.id)}
                     className="p-3 bg-red-50 text-red-300 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white"
                   >
                     <Trash2 size={24} />
                   </button>
                </div>
              </div>
            ))}
            {categorizedSchedules.length === 0 && (
              <div className="col-span-full py-20 text-center text-slate-300 font-black text-2xl">
                비어있음
              </div>
            )}
          </div>
        )}
      </main>

      {/* 하단 내비게이션 바 */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-2xl border-t border-slate-100 pb-12 pt-5 px-8 z-50 flex justify-between items-center max-w-4xl mx-auto md:rounded-t-[3rem] shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
         {[
           { name: '홈', icon: Home, active: true },
           { name: '일정', icon: CalendarDays },
           { name: '수치', icon: BarChart3 },
           { name: '약', icon: Stethoscope },
           { name: 'AI', icon: BrainCircuit },
         ].map((tab) => (
           <button key={tab.name} className={`flex flex-col items-center gap-1 transition-all ${tab.active ? 'text-[#72A632] scale-110' : 'text-slate-300 hover:text-slate-500'}`}>
              <div className={`p-2 rounded-2xl ${tab.active ? 'bg-[#F0F7E6]' : ''}`}>
                <tab.icon size={28} strokeWidth={tab.active ? 3 : 2} />
              </div>
              <span className="text-sm font-black tracking-tighter">{tab.name}</span>
           </button>
         ))}
      </nav>

      {/* 일정 추가 모달 */}
      {showAddForm && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-lg z-[100] flex items-end md:items-center justify-center p-0 md:p-6 transition-all">
          <div className="bg-white w-full max-w-xl rounded-t-[4rem] md:rounded-[4rem] p-10 animate-in slide-in-from-bottom-20 duration-500">
            <div className="flex justify-between items-center mb-8">
               <h2 className="text-3xl font-black text-slate-800">새로운 일정 등록</h2>
               <button onClick={() => setShowAddForm(false)} className="p-3 bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"><X/></button>
            </div>
            
            <form onSubmit={handleAddSchedule} className="space-y-8">
              <div>
                <label className="block text-slate-400 font-black mb-3 ml-2 text-base uppercase tracking-widest">어떤 일인가요?</label>
                <input 
                  type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} 
                  placeholder="예: 건국대학교병원 정기검진" 
                  className="w-full text-2xl p-6 bg-slate-50 rounded-[2rem] border-none font-bold focus:ring-4 focus:ring-[#8DC63F]/20 transition-all" 
                  autoFocus 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 font-black mb-2 ml-2 text-sm uppercase">장소</label>
                  <input type="text" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="어디서?" className="w-full p-5 bg-slate-50 rounded-2xl border-none font-bold text-lg" />
                </div>
                <div>
                  <label className="block text-slate-400 font-black mb-2 ml-2 text-sm uppercase">시간</label>
                  <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="w-full p-5 bg-slate-50 rounded-2xl border-none font-bold text-lg" />
                </div>
              </div>

              <div>
                 <label className="block text-slate-400 font-black mb-2 ml-2 text-sm uppercase">상세 메모</label>
                 <textarea 
                  value={newContent} onChange={(e) => setNewContent(e.target.value)} 
                  placeholder="주의사항이나 준비물 등을 적어주세요" rows={3}
                  className="w-full p-6 bg-slate-50 rounded-[2rem] border-none font-bold text-lg resize-none" 
                />
              </div>

              <div className="flex items-center justify-between p-5 bg-slate-50 rounded-[2rem] border border-slate-100">
                <span className="font-black text-slate-700 text-lg">여러 날 일정</span>
                <button type="button" onClick={() => setIsRange(!isRange)} className={`w-16 h-10 rounded-full relative transition-all ${isRange ? 'bg-[#8DC63F]' : 'bg-slate-300'}`}>
                  <div className={`absolute top-1 bg-white w-8 h-8 rounded-full transition-transform ${isRange ? 'translate-x-7' : 'translate-x-1'} shadow-sm`} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 ml-2">시작일</label>
                  <input type="date" value={newStartDate} onChange={(e) => setNewStartDate(e.target.value)} className="w-full p-5 bg-slate-50 rounded-2xl border-none font-bold text-xl" />
                </div>
                {isRange && (
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 ml-2">종료일</label>
                    <input type="date" value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)} className="w-full p-5 bg-slate-50 rounded-2xl border-none font-bold text-xl" />
                  </div>
                )}
              </div>
              
              <button 
                type="submit" 
                className="w-full py-7 bg-[#8DC63F] text-white rounded-[2.5rem] font-black text-[1.75rem] shadow-2xl shadow-[#8DC63F]/20 active:scale-95 transition-all"
              >
                일정 저장하기
              </button>
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
