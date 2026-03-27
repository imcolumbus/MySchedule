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
  ChevronRight,
  LayoutDashboard
} from 'lucide-react';

/**
 * [버전 정보]
 * v1.3.0 (2024-05-24)
 * - 전문가급 UI/UX 리뉴얼: 세련된 카드 디자인 및 파스텔 컬러 테마 도입
 * - 필드 확장: 상세 내용(Content) 및 장소(Location) 입력 기능 추가
 * - PC 레이아웃 최적화: 넓은 화면에서 '입력+목록'이 동시에 보이는 2단 구성 적용
 * - 타이틀 수정: '어머니의 하루' -> '나의 일정' 변경
 * - 가독성 강화: 모바일에서 더 큼직하고 선명한 폰트 및 아이콘 배치
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

// 일정 카드 색상 프리셋
const COLORS = [
  { bg: 'bg-blue-50', border: 'border-blue-500', text: 'text-blue-700', icon: 'bg-blue-500' },
  { bg: 'bg-rose-50', border: 'border-rose-500', text: 'text-rose-700', icon: 'bg-rose-500' },
  { bg: 'bg-emerald-50', border: 'border-emerald-500', text: 'text-emerald-700', icon: 'bg-emerald-500' },
  { bg: 'bg-amber-50', border: 'border-amber-500', text: 'text-amber-700', icon: 'bg-amber-500' },
  { bg: 'bg-purple-50', border: 'border-purple-500', text: 'text-purple-700', icon: 'bg-purple-500' },
];

function App() {
  const [user, setUser] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  
  // 입력 폼 상태
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newStartDate, setNewStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [newEndDate, setNewEndDate] = useState('');
  const [isRange, setIsRange] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];

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
        content: newContent,
        location: newLocation,
        time: newTime, 
        startDate: newStartDate, 
        endDate: isRange ? newEndDate : newStartDate,
        createdAt: serverTimestamp(), 
        author: user.uid
      });
      // 초기화
      setNewTitle(''); setNewContent(''); setNewLocation(''); setNewTime(''); setIsRange(false);
      setShowAddForm(false);
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id) => {
    if (!db) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'schedules', id));
  };

  const categorizedSchedules = useMemo(() => {
    return schedules.filter(s => (s.endDate || s.startDate) >= todayStr);
  }, [schedules, todayStr]);

  if (!app || !firebaseConfig?.apiKey) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
        <div className="bg-white rounded-[3rem] p-10 shadow-2xl max-w-md w-full border-t-[16px] border-red-500">
          <AlertTriangle className="text-red-500 mx-auto mb-6" size={60} />
          <h1 className="text-3xl font-black text-slate-800 mb-6">설정 확인</h1>
          <p className="text-slate-600 mb-6 leading-relaxed">Vercel 환경 변수값이 정확하지 않습니다.</p>
        </div>
      </div>
    );
  }

  // 일정 입력 폼 컴포넌트 (PC/모바일 공용)
  const ScheduleForm = () => (
    <form onSubmit={handleAddSchedule} className="space-y-6">
      <div>
        <label className="block text-slate-400 font-black mb-2 ml-2 text-sm uppercase tracking-widest">일정 제목</label>
        <input 
          type="text" 
          value={newTitle} 
          onChange={(e) => setNewTitle(e.target.value)} 
          placeholder="예: 병원 검사 결과 확인" 
          className="w-full text-xl p-5 bg-slate-50 rounded-[1.5rem] border-2 border-transparent focus:border-indigo-500 focus:bg-white transition-all outline-none font-bold" 
          autoFocus 
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-slate-400 font-black mb-2 ml-2 text-sm uppercase">장소</label>
          <div className="relative">
            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
            <input 
              type="text" 
              value={newLocation} 
              onChange={(e) => setNewLocation(e.target.value)} 
              placeholder="장소 입력" 
              className="w-full pl-12 pr-4 py-4 bg-slate-50 rounded-[1.2rem] border-none font-bold" 
            />
          </div>
        </div>
        <div>
          <label className="block text-slate-400 font-black mb-2 ml-2 text-sm uppercase">시간</label>
          <div className="relative">
            <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
            <input 
              type="time" 
              value={newTime} 
              onChange={(e) => setNewTime(e.target.value)} 
              className="w-full pl-12 pr-4 py-4 bg-slate-50 rounded-[1.2rem] border-none font-bold" 
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-slate-400 font-black mb-2 ml-2 text-sm uppercase">상세 내용</label>
        <textarea 
          value={newContent} 
          onChange={(e) => setNewContent(e.target.value)} 
          placeholder="어머니께 전할 상세 내용을 적어주세요" 
          rows={3}
          className="w-full p-5 bg-slate-50 rounded-[1.5rem] border-none font-bold resize-none" 
        />
      </div>

      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-[1.5rem]">
        <span className="text-lg font-black text-slate-700">여러 날 동안 진행</span>
        <button 
          type="button"
          onClick={() => setIsRange(!isRange)}
          className={`w-14 h-8 rounded-full transition-colors relative ${isRange ? 'bg-indigo-600' : 'bg-slate-300'}`}
        >
          <div className={`absolute top-1 bg-white w-6 h-6 rounded-full transition-transform ${isRange ? 'translate-x-7' : 'translate-x-1'}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input type="date" value={newStartDate} onChange={(e) => setNewStartDate(e.target.value)} className="w-full p-4 bg-slate-50 rounded-[1.2rem] border-none font-bold" />
        {isRange && <input type="date" value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)} className="w-full p-4 bg-slate-50 rounded-[1.2rem] border-none font-bold" />}
      </div>
      
      <button 
        type="submit" 
        className="w-full py-6 bg-indigo-600 text-white rounded-[1.8rem] font-black text-xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
      >
        일정 등록하기
      </button>
    </form>
  );

  return (
    <div className="min-h-screen bg-[#F0F2F5] text-slate-900 font-sans">
      {/* 고정 헤더 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-2xl shadow-lg shadow-indigo-100">
              <LayoutDashboard className="text-white" size={24} />
            </div>
            <h1 className="text-2xl font-black tracking-tighter">나의 일정</h1>
          </div>
          <div className="hidden md:block text-slate-400 font-bold">{dateDisplay}</div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-6 lg:p-10">
        <div className="flex flex-col lg:flex-row gap-10">
          
          {/* PC 전용: 왼쪽 고정 입력창 */}
          <aside className="hidden lg:block w-1/3 sticky top-32 h-fit">
            <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100">
              <h2 className="text-2xl font-black mb-6 text-slate-800 flex items-center gap-2">
                <Plus className="text-indigo-600" /> 새로운 일정
              </h2>
              <ScheduleForm />
            </div>
          </aside>

          {/* 목록 영역 */}
          <main className="flex-1 space-y-8">
            <div className="md:hidden mb-6">
               <p className="text-indigo-600 font-black mb-1">오늘의 날짜 🌸</p>
               <h2 className="text-3xl font-black">{dateDisplay}</h2>
            </div>

            {loading ? (
              <div className="text-center py-20">
                <RefreshCw className="mx-auto text-indigo-300 animate-spin mb-4" size={48} />
                <p className="text-slate-400 font-black text-xl">데이터를 동기화 중...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {categorizedSchedules.length === 0 ? (
                  <div className="bg-white rounded-[3rem] p-20 text-center shadow-sm border-2 border-dashed border-slate-200">
                    <Calendar className="mx-auto text-slate-200 mb-6" size={64} />
                    <p className="text-slate-400 text-xl font-bold">등록된 일정이 없습니다</p>
                  </div>
                ) : (
                  categorizedSchedules.map((item, idx) => {
                    const theme = COLORS[idx % COLORS.length];
                    const isToday = item.startDate <= todayStr && (item.endDate || item.startDate) >= todayStr;
                    
                    return (
                      <div 
                        key={item.id} 
                        className={`group relative bg-white rounded-[2.8rem] p-8 shadow-sm border-2 transition-all hover:shadow-xl hover:translate-y-[-4px] overflow-hidden ${
                          isToday ? 'border-indigo-500' : 'border-transparent'
                        }`}
                      >
                        {/* 컬러 사이드 바 */}
                        <div className={`absolute left-0 top-0 bottom-0 w-3 ${theme.icon}`} />

                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                          <div className="flex-1 space-y-4">
                            <div className="flex items-center gap-3">
                              <span className={`px-4 py-1.5 rounded-full text-sm font-black shadow-sm ${
                                isToday ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                              }`}>
                                {isToday ? '진행중' : '예정'}
                              </span>
                              <span className="text-slate-400 font-bold text-lg">
                                {item.startDate === item.endDate 
                                  ? `${item.startDate.slice(5).replace('-', '월 ')}일`
                                  : `${item.startDate.slice(5).replace('-', '월 ')}일 ~ ${item.endDate.slice(5).replace('-', '월 ')}일`}
                              </span>
                            </div>

                            <h3 className="text-[2rem] font-black text-slate-800 leading-tight">
                              {item.title}
                            </h3>

                            <div className="flex flex-wrap gap-4 pt-2">
                              {item.time && (
                                <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-xl text-slate-600 font-black text-lg">
                                  <Clock size={20} className="text-indigo-400" /> {item.time}
                                </div>
                              )}
                              {item.location && (
                                <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-xl text-slate-600 font-black text-lg">
                                  <MapPin size={20} className="text-rose-400" /> {item.location}
                                </div>
                              )}
                            </div>

                            {item.content && (
                              <div className="flex gap-3 bg-slate-50/50 p-5 rounded-[1.5rem] border border-slate-100">
                                <FileText size={22} className="text-slate-300 mt-1 flex-shrink-0" />
                                <p className="text-xl font-bold text-slate-500 leading-relaxed whitespace-pre-wrap">
                                  {item.content}
                                </p>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center md:flex-col gap-3 self-end md:self-center">
                            <button 
                              onClick={() => handleDelete(item.id)} 
                              className="p-4 bg-red-50 text-red-400 rounded-full hover:bg-red-500 hover:text-white transition-all shadow-sm"
                            >
                              <Trash2 size={24}/>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* 모바일 전용: 플로팅 추가 버튼 (PC에서는 사이드바가 있으므로 숨김 가능하나 편의상 유지) */}
      <div className="lg:hidden fixed bottom-8 right-8 z-40">
        {showAddForm && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 pointer-events-auto" onClick={() => setShowAddForm(false)}>
            <div 
              className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[3.5rem] p-8 shadow-2xl animate-in slide-in-from-bottom-20 duration-500"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black text-slate-800 italic">새 일정 등록</h2>
                <button onClick={() => setShowAddForm(false)} className="p-2 bg-slate-100 rounded-full"><X/></button>
              </div>
              <ScheduleForm />
            </div>
          </div>
        )}
        <button 
          onClick={() => setShowAddForm(true)} 
          className={`w-20 h-20 rounded-full bg-indigo-600 flex items-center justify-center shadow-[0_15px_40px_rgba(79,70,229,0.5)] active:scale-90 transition-all ${showAddForm ? 'hidden' : 'flex'}`}
        >
          <Plus size={40} color="white" />
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
