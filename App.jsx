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
  Info,
  CalendarRange,
  X
} from 'lucide-react';

/**
 * [버전 정보]
 * v1.2.0 (2024-05-24)
 * - 전문가급 UX/UI 전면 개편: 고대비 대형 폰트 및 모던 카드 디자인
 * - 기간 일정 기능 추가: 시작일 ~ 종료일 설정 가능
 * - 모바일 최적화: 터치 영역 확대 및 시니어 친화적 레이아웃
 * - 환경 변수 파싱 로직 안정성 유지
 */

// 1. Firebase 설정값 안전하게 추출 및 파싱
const getFirebaseConfig = () => {
  const parseConfig = (raw) => {
    if (!raw) return null;
    let cleaned = String(raw).trim();
    if (!cleaned || cleaned === '{}') return null;

    try {
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
  if (typeof __firebase_config !== 'undefined') source = __firebase_config;
  if (!source && typeof process !== 'undefined' && process.env) {
    source = process.env.VITE_FIREBASE_CONFIG || process.env.__firebase_config;
  }
  if (!source) {
    try {
      // @ts-ignore
      const viteEnv = import.meta.env ? import.meta.env.VITE_FIREBASE_CONFIG : null;
      if (viteEnv) source = viteEnv;
    } catch (e) {}
  }
  return parseConfig(source);
};

const firebaseConfig = getFirebaseConfig();

// 초기화
const app = (firebaseConfig && firebaseConfig.apiKey) ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'my-schedule-app';

function App() {
  const [user, setUser] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  
  // 입력 폼 상태
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newStartDate, setNewStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [newEndDate, setNewEndDate] = useState(''); // 기간 일정용
  const [isRange, setIsRange] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];

  // 오늘의 날짜 표시 (매우 크게)
  const dateDisplay = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });

  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth Fail:", error);
      }
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    const schedulesRef = collection(db, 'artifacts', appId, 'public', 'data', 'schedules');
    const unsubscribe = onSnapshot(schedulesRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // 시작일 순으로 정렬
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
        title: newTitle, 
        time: newTime, 
        startDate: newStartDate, 
        endDate: isRange ? newEndDate : newStartDate,
        createdAt: serverTimestamp(), 
        author: user.uid
      });
      // 초기화
      setNewTitle('');
      setNewTime('');
      setIsRange(false);
      setShowAddForm(false);
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id) => {
    if (!db) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'schedules', id));
  };

  // 오늘 이후의 일정만 필터링 (종료일 기준으로 오늘이 포함되거나 미래인 것)
  const categorizedSchedules = useMemo(() => {
    return schedules.filter(s => (s.endDate || s.startDate) >= todayStr);
  }, [schedules, todayStr]);

  // 설정 오류 시 안내 화면
  if (!app || !firebaseConfig?.apiKey) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
        <div className="bg-white rounded-[3rem] p-10 shadow-2xl max-w-md w-full border-t-[16px] border-red-500">
          <div className="bg-red-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8">
            <AlertTriangle className="text-red-500" size={48} />
          </div>
          <h1 className="text-3xl font-black text-slate-800 mb-6">앱 설정 확인</h1>
          <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 text-left mb-6">
            <p className="font-black text-blue-900 mb-3 flex items-center gap-2 text-xl">
              <Info size={24} /> 필수 작업
            </p>
            <p className="text-blue-800 leading-relaxed text-lg">
              Vercel 대시보드 환경 변수값에서 <strong>중괄호 {'{ }'} 부분만</strong> 남기고 다시 배포해 주세요.
            </p>
          </div>
          <div className="bg-slate-900 text-emerald-400 p-5 rounded-2xl font-mono text-xs text-left">
             &gt; VITE_CONFIG: {firebaseConfig ? "FOUND" : "NOT_DETECTED"}
             <br/>&gt; API_KEY: {firebaseConfig?.apiKey ? "OK" : "MISSING"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FD] text-slate-900 pb-28 font-sans">
      {/* 상단 헤더: 어머니를 위한 아주 큰 날짜 표시 */}
      <header className="bg-white px-8 pt-16 pb-10 rounded-b-[4rem] shadow-[0_10px_40px_rgba(0,0,0,0.04)] sticky top-0 z-20">
        <div className="max-w-md mx-auto">
          <p className="text-indigo-600 font-black text-xl mb-2 tracking-tighter">어머니의 하루 🌸</p>
          <h1 className="text-4xl font-black leading-[1.2] text-slate-900 break-keep">
            {dateDisplay}
          </h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-6 mt-10">
        {loading ? (
          <div className="text-center py-32">
            <RefreshCw className="mx-auto text-indigo-300 animate-spin mb-6" size={60} />
            <p className="text-slate-400 font-black text-2xl">정보를 가져오고 있습니다</p>
          </div>
        ) : (
          <div className="space-y-10">
            {categorizedSchedules.length === 0 ? (
              <div className="bg-white rounded-[3.5rem] p-20 text-center shadow-sm border-2 border-dashed border-slate-200">
                <Calendar className="mx-auto text-slate-100 mb-6" size={80} />
                <p className="text-slate-400 text-2xl font-black">아직 일정이<br/>없습니다</p>
              </div>
            ) : (
              categorizedSchedules.map((item) => {
                const isToday = item.startDate <= todayStr && (item.endDate || item.startDate) >= todayStr;
                const dateText = item.startDate === item.endDate 
                  ? `${item.startDate.slice(5).replace('-', '월 ')}일`
                  : `${item.startDate.slice(8)}일 ~ ${item.endDate.slice(5).replace('-', '월 ')}일`;

                return (
                  <div 
                    key={item.id} 
                    className={`bg-white rounded-[3rem] p-8 shadow-[0_15px_45px_rgba(0,0,0,0.06)] border-l-[16px] transition-all active:scale-[0.97] ${
                      isToday ? 'border-indigo-500 bg-indigo-50/30' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-3 mb-4">
                          <span className={`px-5 py-2 rounded-full text-lg font-black shadow-sm ${
                            isToday ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {isToday ? '진행중' : '예정'}
                          </span>
                          <span className="text-slate-500 font-black text-2xl">
                            {dateText}
                          </span>
                        </div>
                        
                        <h3 className="text-[2.25rem] font-black text-slate-900 leading-[1.15] mb-4 break-keep">
                          {item.title}
                        </h3>

                        {item.time && (
                          <div className="flex items-center text-indigo-600 font-black text-2xl gap-2 bg-white w-fit px-4 py-2 rounded-2xl shadow-sm border border-indigo-50">
                            <Clock size={24} strokeWidth={3} />
                            {item.time}
                          </div>
                        )}
                      </div>
                      <button 
                        onClick={() => handleDelete(item.id)} 
                        className="p-4 bg-slate-50 text-slate-300 rounded-full hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={32}/>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </main>

      {/* 일정 추가 버튼 및 입력 폼 */}
      <div className="fixed bottom-10 right-10 flex flex-col items-end gap-6 max-w-md w-full px-10 left-1/2 -translate-x-1/2 pointer-events-none">
        {showAddForm && (
          <div className="bg-white w-full rounded-[4rem] shadow-[0_30px_100px_-15px_rgba(0,0,0,0.4)] p-10 mb-6 border border-slate-100 pointer-events-auto animate-in slide-in-from-bottom-20 duration-500 ease-out z-30">
            <div className="flex justify-between items-center mb-8">
               <h2 className="text-3xl font-black text-slate-800">새 일정 적기</h2>
               <button onClick={() => setShowAddForm(false)} className="text-slate-300"><X size={36}/></button>
            </div>
            
            <form onSubmit={handleAddSchedule} className="space-y-8">
              <div>
                <label className="block text-slate-400 font-black mb-3 ml-2 text-lg">내용</label>
                <input 
                  type="text" 
                  value={newTitle} 
                  onChange={(e) => setNewTitle(e.target.value)} 
                  placeholder="예: 병원 가는 날" 
                  className="w-full text-[2rem] p-6 bg-slate-50 rounded-[2rem] border-none focus:ring-4 focus:ring-indigo-100 shadow-inner font-black" 
                  autoFocus 
                />
              </div>

              {/* 기간 설정 토글 */}
              <div className="flex items-center justify-between p-2 bg-slate-50 rounded-[2rem] px-6">
                <span className="text-xl font-black text-slate-700">여러 날 동안 진행</span>
                <button 
                  type="button"
                  onClick={() => setIsRange(!isRange)}
                  className={`w-16 h-10 rounded-full transition-colors relative ${isRange ? 'bg-indigo-600' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-1 bg-white w-8 h-8 rounded-full transition-transform ${isRange ? 'translate-x-7' : 'translate-x-1'}`} />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-6">
                <div>
                  <label className="block text-slate-400 font-black mb-3 ml-2 text-lg">{isRange ? '시작일' : '날짜'}</label>
                  <input type="date" value={newStartDate} onChange={(e) => setNewStartDate(e.target.value)} className="w-full p-6 bg-slate-50 rounded-[2rem] border-none text-2xl font-black shadow-inner" />
                </div>
                {isRange && (
                  <div>
                    <label className="block text-slate-400 font-black mb-3 ml-2 text-lg">종료일</label>
                    <input type="date" value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)} className="w-full p-6 bg-slate-50 rounded-[2rem] border-none text-2xl font-black shadow-inner" />
                  </div>
                )}
                {!isRange && (
                  <div>
                    <label className="block text-slate-400 font-black mb-3 ml-2 text-lg">시간 (선택)</label>
                    <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="w-full p-6 bg-slate-50 rounded-[2rem] border-none text-2xl font-black shadow-inner" />
                  </div>
                )}
              </div>
              
              <button 
                type="submit" 
                className="w-full py-7 bg-indigo-600 text-white rounded-[2.5rem] font-black text-[1.75rem] shadow-2xl shadow-indigo-200 active:scale-95 transition-transform"
              >
                일정 저장하기
              </button>
            </form>
          </div>
        )}
        <button 
          onClick={() => setShowAddForm(!showAddForm)} 
          className="pointer-events-auto w-24 h-24 rounded-full bg-indigo-600 flex items-center justify-center shadow-[0_15px_50px_rgba(79,70,229,0.5)] transition-all active:scale-90 z-40 hover:bg-indigo-700"
        >
          <Plus size={56} color="white" style={{ transform: showAddForm ? 'rotate(45deg)' : 'none', transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }} />
        </button>
      </div>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}

export default App;
