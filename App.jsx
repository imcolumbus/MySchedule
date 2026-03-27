/**
 * [버전 정보]
 * v1.5.2 (2024-05-24)
 * - 화면 표시 오류 해결: DOM 로드 및 렌더링 엔진 초기화 로직 강화
 * - 환경 변수 인식 극대화: 파싱 실패 시 예외 처리 및 자동 보정 기능 정교화
 * - 디자인 정교화: 상단 '건강 매니저' 스타일의 고해상도 그린 테마 완성
 * - 데이터 연동: Firebase Firestore 실시간 동기화 안정화
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

// 1. Firebase 설정값 추출 로직 (v1.5.2 강화판)
const getFirebaseConfig = () => {
  const parse = (raw) => {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    
    let cleaned = String(raw).trim();
    if (!cleaned || cleaned === '{}') return null;
    
    try {
      // 주석 및 JS 코드 선언부 제거
      cleaned = cleaned.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
      cleaned = cleaned.replace(/(const|let|var)\s+\w+\s*=\s*/g, '');
      cleaned = cleaned.trim().replace(/;$/, '');
      
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}') + 1;
      if (start !== -1 && end !== -1) {
        cleaned = cleaned.substring(start, end);
      }
      
      try {
        return JSON.parse(cleaned);
      } catch (e) {
        // 비표준 JSON 보정
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
  // Canvas 글로벌 변수 우선
  if (typeof __firebase_config !== 'undefined') source = __firebase_config;
  
  // Vite 환경 변수 시도
  if (!source) {
    try {
      // @ts-ignore
      source = import.meta.env.VITE_FIREBASE_CONFIG;
    } catch (e) {}
  }

  // Vercel process.env 시도
  if (!source && typeof process !== 'undefined' && process.env) {
    source = process.env.VITE_FIREBASE_CONFIG || process.env.__firebase_config;
  }

  return { config: parse(source), rawSource: source };
};

const { config: firebaseConfig, rawSource } = getFirebaseConfig();

// Firebase 초기화
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
      } catch (e) { console.error("Auth Fail:", e); }
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    const schedulesRef = collection(db, 'artifacts', appId, 'public', 'data', 'schedules');
    const unsubscribe = onSnapshot(schedulesRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSchedules(data.sort((a, b) => new Date(a.startDate) - new Date(b.startDate)));
      setLoading(false);
    }, (err) => {
      console.error("Firestore Error:", err);
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
    } catch (e) { console.error("Add Fail:", e); }
  };

  const handleDelete = async (id) => {
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'schedules', id));
    } catch (e) { console.error("Delete Fail:", e); }
  };

  const categorizedSchedules = useMemo(() => {
    return schedules.filter(s => (s.endDate || s.startDate) >= todayStr);
  }, [schedules, todayStr]);

  // 설정 오류 화면 (아무 화면도 안 나올 때를 대비한 안전 장치)
  if (!app) return (
    <div className="min-h-screen bg-[#F7F9FB] flex items-center justify-center p-6 text-center">
      <div className="bg-white p-10 rounded-[3rem] shadow-2xl max-w-md w-full border-t-[16px] border-red-500">
        <AlertTriangle className="text-red-500 mx-auto mb-6" size={64} />
        <h1 className="text-3xl font-black text-slate-800 mb-6 tracking-tighter">설정 확인 필요</h1>
        
        <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 text-left mb-8">
          <p className="font-black text-blue-900 mb-3 flex items-center gap-2 text-xl">
            <Info size={24} /> 필수 확인 사항
          </p>
          <ul className="text-blue-800 space-y-2 font-bold leading-relaxed text-sm">
            <li>1. Vercel 환경 변수 이름: <code className="bg-white px-1">VITE_FIREBASE_CONFIG</code></li>
            <li>2. 데이터 형식: 중괄호 <code className="bg-white px-1">{"{ }"}</code>만 포함 (객체만)</li>
            <li>3. 설정 후 반드시 <strong>Redeploy</strong> 진행</li>
          </ul>
        </div>

        <div className="text-left border-t border-slate-100 pt-6">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Debug Information</p>
          <div className="bg-slate-900 text-emerald-400 p-5 rounded-2xl font-mono text-[10px] break-all max-h-40 overflow-auto shadow-inner leading-relaxed">
             &gt; Config Detected: {rawSource ? "YES" : "NO"}
             <br/>&gt; Parsing Success: {firebaseConfig ? "YES" : "NO"}
             <br/>&gt; API Key Present: {firebaseConfig?.apiKey ? "YES" : "NO"}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F4F7F2] text-slate-900 font-sans pb-32 overflow-x-hidden">
      {/* 상단 프로필 및 앱 바 */}
      <header className="px-6 pt-10 pb-6 flex items-center justify-between max-w-2xl mx-auto">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center border-4 border-white shadow-md">
             <span className="text-orange-600 font-black text-2xl">성</span>
          </div>
          <div>
            <h1 className="text-2xl font-black flex items-center gap-1 text-[#4A6D00]">
              나의 일정 <span className="text-slate-300 font-bold text-xs">v1.5.2</span>
            </h1>
            <p className="text-slate-400 font-bold text-sm">어머니의 건강 관리 매니저</p>
          </div>
        </div>
        <button className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center text-slate-400 border border-slate-100 active:scale-95 transition-all">
          <Settings size={24} />
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-6 mt-4">
        {/* 메인 비주얼 카드: 오늘/예정된 핵심 일정 */}
        <section className="bg-gradient-to-br from-[#8DC63F] to-[#72A632] rounded-[3rem] p-10 shadow-[0_25px_60px_-15px_rgba(141,198,63,0.4)] text-white mb-12 relative overflow-hidden transition-all">
          <div className="absolute right-0 top-0 w-40 h-40 bg-white/10 rounded-full -translate-y-12 translate-x-12 blur-3xl" />
          <div className="flex justify-between items-center mb-8 relative z-10">
            <h2 className="text-2xl font-black opacity-90 tracking-tight">진료 및 주요 일정</h2>
            <div className="bg-white/20 px-5 py-2 rounded-full text-sm font-black backdrop-blur-md">
              모두보기
            </div>
          </div>

          <div className="space-y-8 relative z-10">
            {categorizedSchedules.length > 0 ? categorizedSchedules.slice(0, 2).map((item, idx) => (
              <div key={item.id} className={`group ${idx === 0 ? '' : 'pt-8 border-t border-white/20'}`}>
                <div className="flex justify-between items-start mb-4">
                   <div className="flex-1 pr-4">
                      <h3 className="text-[2.5rem] font-black leading-[1.1] mb-3 break-keep tracking-tighter">{item.title}</h3>
                      <div className="flex flex-wrap gap-4 text-xl font-bold opacity-90">
                        {item.location && <span className="flex items-center gap-2 bg-white/10 px-4 py-1 rounded-xl"><MapPin size={22} /> {item.location}</span>}
                        <span className="flex items-center gap-2 bg-white/10 px-4 py-1 rounded-xl"><Clock size={22} /> {item.time || '시간미정'}</span>
                      </div>
                   </div>
                   <div className="bg-white text-[#72A632] px-5 py-3 rounded-[1.5rem] text-2xl font-black shadow-lg shadow-black/5 flex flex-col items-center">
                     <span className="text-sm opacity-60 leading-none mb-1">{item.startDate.slice(5, 7)}월</span>
                     {item.startDate.slice(8, 10)}
                   </div>
                </div>
                {item.content && (
                   <div className="mt-4 bg-black/10 p-6 rounded-[2rem] border border-white/10">
                     <p className="text-xl font-bold opacity-95 leading-relaxed">{item.content}</p>
                   </div>
                )}
              </div>
            )) : (
              <div className="py-16 text-center opacity-40">
                <CalendarDays size={80} className="mx-auto mb-4" />
                <p className="text-2xl font-black italic">새로운 일정을 등록해 주세요</p>
              </div>
            )}
          </div>
        </section>

        {/* 하단 리스트 섹션 */}
        <div className="flex justify-between items-center mb-8 px-2">
           <h3 className="text-2xl font-black text-slate-800">예정된 일지</h3>
           <button 
             onClick={() => setShowAddForm(true)}
             className="bg-[#E9F3D5] text-[#5D8C00] px-8 py-3 rounded-full font-black text-xl shadow-sm active:scale-95 transition-all flex items-center gap-2"
           >
             새 일정 <Plus size={24} strokeWidth={3} />
           </button>
        </div>

        {loading ? (
          <div className="py-24 text-center">
            <RefreshCw className="animate-spin mx-auto text-[#8DC63F] opacity-50" size={56} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {categorizedSchedules.slice(2).map((item) => (
              <div key={item.id} className="bg-white rounded-[2.5rem] p-8 shadow-[0_10px_40px_rgba(0,0,0,0.03)] border border-slate-50 flex justify-between items-center group transition-all hover:shadow-xl hover:translate-y-[-2px]">
                <div className="flex-1">
                   <div className="flex items-center gap-3 mb-2">
                     <span className="text-[#8DC63F] font-black text-base uppercase tracking-tighter">{item.startDate}</span>
                   </div>
                   <h4 className="text-[1.8rem] font-black text-slate-800 leading-tight mb-2 tracking-tight">{item.title}</h4>
                   {item.location && <p className="text-slate-400 font-bold text-xl flex items-center gap-2 mt-2"><MapPin size={20} className="text-[#8DC63F]/50"/> {item.location}</p>}
                </div>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => handleDelete(item.id)}
                    className="p-4 bg-red-50 text-red-300 rounded-full hover:bg-red-500 hover:text-white transition-all shadow-sm active:scale-90"
                  >
                    <Trash2 size={28} />
                  </button>
                  <ChevronRight size={32} className="text-slate-100" />
                </div>
              </div>
            ))}
            {categorizedSchedules.length <= 2 && categorizedSchedules.length > 0 && (
              <div className="py-20 text-center text-slate-200 font-black text-2xl italic">
                예정된 일정이 더 없습니다
              </div>
            )}
          </div>
        )}
      </main>

      {/* 하단 내비게이션 바 */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-3xl border-t border-slate-100 pb-12 pt-6 px-10 z-50 flex justify-between items-center max-w-2xl mx-auto md:rounded-t-[3.5rem] shadow-[0_-15px_50px_rgba(0,0,0,0.05)]">
         {[
           { name: '홈', icon: Home, active: activeTab === '홈' },
           { name: '일정', icon: CalendarDays, active: activeTab === '일정' },
           { name: '수치', icon: BarChart3, active: activeTab === '수치' },
           { name: '약', icon: Stethoscope, active: activeTab === '약' },
           { name: 'AI', icon: BrainCircuit, active: activeTab === 'AI' },
         ].map((tab) => (
           <button 
            key={tab.name} 
            onClick={() => setActiveTab(tab.name)}
            className={`flex flex-col items-center gap-1.5 transition-all ${tab.active ? 'text-[#72A632] scale-110' : 'text-slate-300 hover:text-slate-500'}`}
           >
              <div className={`p-2.5 rounded-[1.2rem] ${tab.active ? 'bg-[#F0F7E6]' : ''}`}>
                <tab.icon size={30} strokeWidth={tab.active ? 3 : 2} />
              </div>
              <span className="text-[13px] font-black tracking-tight">{tab.name}</span>
           </button>
         ))}
      </nav>

      {/* 일정 추가 모달 */}
      {showAddForm && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[100] flex items-end md:items-center justify-center p-0 md:p-8 transition-all">
          <div className="bg-white w-full max-w-xl rounded-t-[4rem] md:rounded-[4rem] p-12 animate-in slide-in-from-bottom-20 duration-500 shadow-2xl overflow-y-auto max-h-screen">
            <div className="flex justify-between items-center mb-10">
               <h2 className="text-3xl font-black text-slate-800">새 일정 등록하기</h2>
               <button onClick={() => setShowAddForm(false)} className="p-4 bg-slate-100 rounded-full text-slate-400 active:scale-90 transition-all"><X size={32}/></button>
            </div>
            
            <form onSubmit={handleAddSchedule} className="space-y-8 pb-10">
              <div className="space-y-4">
                <label className="block text-slate-400 font-black text-sm uppercase tracking-[0.2em] ml-2">무엇을 하시나요?</label>
                <input 
                  type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} 
                  placeholder="예: 서울아산병원 정기검진" 
                  className="w-full text-[2rem] p-8 bg-slate-50 rounded-[2.5rem] border-none font-black focus:ring-4 focus:ring-[#8DC63F]/20 transition-all shadow-inner" 
                  autoFocus 
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 ml-4">장소</label>
                  <input type="text" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="어디서?" className="w-full p-6 bg-slate-50 rounded-[1.5rem] border-none font-bold text-xl shadow-inner" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 ml-4">시간</label>
                  <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="w-full p-6 bg-slate-50 rounded-[1.5rem] border-none font-bold text-xl shadow-inner" />
                </div>
              </div>

              <div className="space-y-2">
                 <label className="text-xs font-black text-slate-400 ml-4">메모</label>
                 <textarea 
                  value={newContent} onChange={(e) => setNewContent(e.target.value)} 
                  placeholder="주의사항을 적어주세요" rows={3}
                  className="w-full p-8 bg-slate-50 rounded-[2rem] border-none font-bold text-xl shadow-inner resize-none" 
                />
              </div>

              <div className="flex items-center justify-between p-6 bg-[#F7F9FB] rounded-[2rem] border border-slate-100">
                <span className="font-black text-slate-700 text-xl">여러 날 동안 진행</span>
                <button type="button" onClick={() => setIsRange(!isRange)} className={`w-18 h-10 rounded-full relative transition-all ${isRange ? 'bg-[#8DC63F]' : 'bg-slate-300'}`}>
                  <div className={`absolute top-1 bg-white w-8 h-8 rounded-full transition-transform ${isRange ? 'translate-x-9' : 'translate-x-1'} shadow-md`} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 ml-4">시작 날짜</label>
                  <input type="date" value={newStartDate} onChange={(e) => setNewStartDate(e.target.value)} className="w-full p-6 bg-slate-50 rounded-[1.5rem] border-none font-bold text-xl shadow-inner" />
                </div>
                {isRange && (
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 ml-4">종료 날짜</label>
                    <input type="date" value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)} className="w-full p-6 bg-slate-50 rounded-[1.5rem] border-none font-bold text-xl shadow-inner" />
                  </div>
                )}
              </div>
              
              <button 
                type="submit" 
                className="w-full py-8 bg-[#8DC63F] text-white rounded-[2.8rem] font-black text-[1.8rem] shadow-2xl shadow-[#8DC63F]/30 active:scale-95 transition-all mt-4"
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

// 렌더링 초기화 엔진 (v1.5.2)
const initRender = () => {
  const container = document.getElementById('root');
  if (container) {
    const root = createRoot(container);
    root.render(<App />);
  } else {
    // 만약 root 엘리먼트가 없으면 생성 시도 (비상 모드)
    const newRoot = document.createElement('div');
    newRoot.id = 'root';
    document.body.appendChild(newRoot);
    const root = createRoot(newRoot);
    root.render(<App />);
  }
};

// DOM 로드 완료 후 실행
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRender);
} else {
  initRender();
}

export default App;
