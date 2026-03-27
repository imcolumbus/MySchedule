/**
 * [버전 정보]
 * v1.7.0 (2024-05-24)
 * - 순수 일정 앱 UX 개편: 불필요한 하단 탭 메뉴 제거 및 모바일 플로팅 추가 버튼 적용
 * - 상단 헤더 개선: 사용자 아이콘을 '달력'으로 변경하고 오늘 날짜/요일을 명확하게 강조 표시
 * - 기능 추가: 기존 일정의 내용을 변경할 수 있는 '수정' 기능 탑재
 * - 디자인 고도화: 일정 목록에서 수정/삭제 버튼 접근성 개선 및 시니어 맞춤 가독성 최적화
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
  updateDoc,
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
  X,
  Settings,
  CalendarDays,
  Info,
  Edit2
} from 'lucide-react';

// [중요] Vercel 환경에서 CSS가 깨지는 현상을 방지하기 위한 강제 스타일 주입 로직
if (typeof document !== 'undefined' && !document.getElementById('tailwind-script')) {
  const script = document.createElement('script');
  script.id = 'tailwind-script';
  script.src = 'https://cdn.tailwindcss.com';
  document.head.appendChild(script);
}

// 1. Firebase 설정값 추출 로직
const getFirebaseConfig = () => {
  const parse = (raw) => {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    let cleaned = String(raw).trim();
    if (!cleaned || cleaned === '{}') return null;
    try {
      cleaned = cleaned.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
      cleaned = cleaned.replace(/(const|let|var)\s+\w+\s*=\s*/g, '');
      cleaned = cleaned.trim().replace(/;$/, '');
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}') + 1;
      if (start !== -1 && end !== -1) cleaned = cleaned.substring(start, end);
      try {
        return JSON.parse(cleaned);
      } catch (e) {
        const fixed = cleaned.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":').replace(/'/g, '"').replace(/,\s*([\]}])/g, '$1');
        return JSON.parse(fixed);
      }
    } catch (err) { return null; }
  };

  let source = null;
  if (typeof __firebase_config !== 'undefined') source = __firebase_config;
  if (!source) {
    try { // @ts-ignore
      source = import.meta.env.VITE_FIREBASE_CONFIG; } catch (e) {}
  }
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
  const [isSaving, setIsSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // 입력 폼 상태 (추가 및 수정 공용)
  const [editingId, setEditingId] = useState(null); // 수정 중인 일정 ID
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newStartDate, setNewStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [newEndDate, setNewEndDate] = useState('');
  const [isRange, setIsRange] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];
  
  // 상단에 표시될 전체 날짜 문자열 (예: 2026년 3월 27일 금요일)
  const fullDateDisplay = new Date().toLocaleDateString('ko-KR', { 
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' 
  });

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

  // 폼 초기화 헬퍼 함수
  const resetForm = () => {
    setNewTitle(''); setNewContent(''); setNewLocation(''); setNewTime(''); 
    setNewStartDate(new Date().toISOString().split('T')[0]); setNewEndDate(''); 
    setIsRange(false); setEditingId(null);
  };

  const handleAddOrEditSchedule = async (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !db || isSaving) return;
    setIsSaving(true);
    try {
      const scheduleData = {
        title: newTitle, content: newContent, location: newLocation, time: newTime, 
        startDate: newStartDate, endDate: isRange ? newEndDate : newStartDate,
        author: user.uid
      };

      if (editingId) {
        // 기존 일정 수정
        scheduleData.updatedAt = serverTimestamp();
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'schedules', editingId), scheduleData);
      } else {
        // 새 일정 추가
        scheduleData.createdAt = serverTimestamp();
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'schedules'), scheduleData);
      }
      
      resetForm();
      setShowAddForm(false);
    } catch (e) { 
      console.error("Save Fail:", e); 
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!db) return;
    if (confirm("이 일정을 정말 삭제하시겠습니까?")) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'schedules', id));
        if (editingId === id) { resetForm(); setShowAddForm(false); }
      } catch (e) { console.error("Delete Fail:", e); }
    }
  };

  const handleEditClick = (item) => {
    setNewTitle(item.title || '');
    setNewContent(item.content || '');
    setNewLocation(item.location || '');
    setNewTime(item.time || '');
    setNewStartDate(item.startDate);
    
    if (item.startDate !== item.endDate) {
      setIsRange(true);
      setNewEndDate(item.endDate);
    } else {
      setIsRange(false);
      setNewEndDate('');
    }
    
    setEditingId(item.id);
    setShowAddForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' }); // PC 환경을 위해 위로 스크롤
  };

  const categorizedSchedules = useMemo(() => {
    return schedules.filter(s => (s.endDate || s.startDate) >= todayStr);
  }, [schedules, todayStr]);

  // 공통 입력 폼 컴포넌트
  const ScheduleForm = ({ onCancel }) => (
    <form onSubmit={handleAddOrEditSchedule} className="space-y-6">
      <div className="space-y-3">
        <label className="block text-slate-400 font-black text-sm uppercase tracking-[0.2em] ml-2">무엇을 하시나요?</label>
        <input 
          type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} 
          placeholder="예: 서울아산병원 정기검진" 
          className="w-full text-xl md:text-2xl p-5 md:p-6 bg-slate-50 rounded-[1.5rem] md:rounded-[2rem] border-none font-black focus:ring-4 focus:ring-[#8DC63F]/20 transition-all shadow-inner" 
          autoFocus 
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-xs font-black text-slate-400 ml-2">장소</label>
          <input type="text" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="어디서?" className="w-full p-4 md:p-5 bg-slate-50 rounded-[1.2rem] border-none font-bold text-lg shadow-inner" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-black text-slate-400 ml-2">시간</label>
          <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="w-full p-4 md:p-5 bg-slate-50 rounded-[1.2rem] border-none font-bold text-lg shadow-inner" />
        </div>
      </div>

      <div className="space-y-2">
         <label className="text-xs font-black text-slate-400 ml-2">메모</label>
         <textarea 
          value={newContent} onChange={(e) => setNewContent(e.target.value)} 
          placeholder="상세 내용을 적어주세요" rows={3}
          className="w-full p-5 md:p-6 bg-slate-50 rounded-[1.5rem] border-none font-bold text-lg shadow-inner resize-none" 
        />
      </div>

      <div className="flex items-center justify-between p-5 bg-[#F7F9FB] rounded-[1.5rem] border border-slate-100">
        <span className="font-black text-slate-700 text-base md:text-lg">여러 날 일정</span>
        <button type="button" onClick={() => setIsRange(!isRange)} className={`w-14 h-8 rounded-full relative transition-all ${isRange ? 'bg-[#8DC63F]' : 'bg-slate-300'}`}>
          <div className={`absolute top-1 bg-white w-6 h-6 rounded-full transition-transform ${isRange ? 'translate-x-7' : 'translate-x-1'} shadow-md`} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-xs font-black text-slate-400 ml-2">시작 날짜</label>
          <input type="date" value={newStartDate} onChange={(e) => setNewStartDate(e.target.value)} className="w-full p-4 md:p-5 bg-slate-50 rounded-[1.2rem] border-none font-bold text-lg shadow-inner" />
        </div>
        {isRange && (
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 ml-2">종료 날짜</label>
            <input type="date" value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)} className="w-full p-4 md:p-5 bg-slate-50 rounded-[1.2rem] border-none font-bold text-lg shadow-inner" />
          </div>
        )}
      </div>
      
      <div className="flex gap-3 pt-4">
        {onCancel && (
          <button 
            type="button" 
            onClick={() => { resetForm(); onCancel(); }} 
            className="flex-1 py-5 md:py-6 bg-slate-100 text-slate-500 rounded-[2rem] font-black text-lg md:text-xl active:scale-95 transition-all hover:bg-slate-200"
          >
            취소
          </button>
        )}
        <button 
          type="submit" 
          disabled={isSaving}
          className="flex-[2] py-5 md:py-6 bg-[#8DC63F] text-white rounded-[2rem] font-black text-lg md:text-xl shadow-xl shadow-[#8DC63F]/30 active:scale-95 transition-all disabled:opacity-50 hover:bg-[#7AB12E]"
        >
          {isSaving ? '저장 중...' : (editingId ? '일정 수정완료' : '새 일정 등록')}
        </button>
      </div>
    </form>
  );

  // 오류 화면
  if (!app) return (
    <div className="min-h-screen bg-[#F7F9FB] flex items-center justify-center p-6 text-center">
      <div className="bg-white p-10 rounded-[3rem] shadow-2xl max-w-md w-full border-t-[16px] border-red-500">
        <AlertTriangle className="text-red-500 mx-auto mb-6" size={64} />
        <h1 className="text-3xl font-black text-slate-800 mb-6 tracking-tighter">설정 확인 필요</h1>
        <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 text-left mb-8">
          <p className="font-black text-blue-900 mb-3 flex items-center gap-2 text-xl"><Info size={24} /> 필수 확인 사항</p>
          <ul className="text-blue-800 space-y-2 font-bold leading-relaxed text-sm">
            <li>1. Vercel 환경 변수 이름: <code className="bg-white px-1">VITE_FIREBASE_CONFIG</code></li>
            <li>2. 데이터 형식: 중괄호 <code className="bg-white px-1">{"{ }"}</code>만 포함 (객체만)</li>
            <li>3. 설정 후 반드시 <strong>Redeploy</strong> 진행</li>
          </ul>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F4F7F2] text-slate-900 font-sans pb-32 md:pb-10 overflow-x-hidden">
      {/* 상단 프로필 및 앱 바 (달력 아이콘 + 날짜 강조) */}
      <header className="bg-white border-b border-slate-100 shadow-sm sticky top-0 z-40">
        <div className="px-6 py-5 flex flex-col md:flex-row md:items-center justify-between max-w-6xl mx-auto gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-[#F0F7E6] rounded-full flex items-center justify-center border border-[#8DC63F]/20 shadow-sm">
               <CalendarDays className="text-[#8DC63F]" size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-black flex items-center gap-2 text-[#4A6D00] tracking-tighter">
                나의 일정 <span className="text-slate-400 font-bold text-xs bg-slate-50 border px-2 py-0.5 rounded-md">v1.7.0</span>
              </h1>
              <p className="text-slate-800 font-black text-[1.1rem] mt-1 tracking-tight">{fullDateDisplay}</p>
            </div>
          </div>
          <button className="hidden md:flex w-10 h-10 bg-slate-50 rounded-xl items-center justify-center text-slate-400 hover:text-[#8DC63F] transition-all">
            <Settings size={20} />
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 md:px-6 pt-8 flex flex-col lg:flex-row gap-8">
        
        {/* PC 전용: 좌측 고정 입력창 */}
        <aside className="hidden lg:block w-[400px] flex-shrink-0">
          <div className="bg-white rounded-[3rem] p-8 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.05)] sticky top-[140px] border border-slate-50">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                 {editingId ? <Edit2 className="text-amber-500" size={28} strokeWidth={3} /> : <Plus className="text-[#8DC63F]" size={28} strokeWidth={3} />} 
                 {editingId ? '일정 수정' : '새 일정 등록'}
              </h2>
              {editingId && (
                <button onClick={resetForm} className="text-sm font-bold text-slate-400 hover:text-slate-600">취소</button>
              )}
            </div>
            <ScheduleForm onCancel={editingId ? resetForm : null} />
          </div>
        </aside>

        {/* 우측/모바일 메인: 일정 목록 영역 */}
        <main className="flex-1 w-full">
          {/* 메인 비주얼 카드: 오늘 및 주요 일정 */}
          <section className="bg-gradient-to-br from-[#8DC63F] to-[#72A632] rounded-[3rem] p-8 md:p-10 shadow-[0_20px_40px_-10px_rgba(141,198,63,0.3)] text-white mb-10 relative overflow-hidden transition-all">
            <div className="absolute right-0 top-0 w-40 h-40 bg-white/10 rounded-full -translate-y-12 translate-x-12 blur-3xl" />
            <div className="flex justify-between items-center mb-8 relative z-10">
              <h2 className="text-2xl font-black opacity-95 tracking-tight flex items-center gap-2">
                오늘 및 주요 일정
              </h2>
            </div>

            <div className="space-y-6 relative z-10">
              {categorizedSchedules.length > 0 ? categorizedSchedules.slice(0, 2).map((item, idx) => (
                <div key={item.id} className={`group ${idx === 0 ? '' : 'pt-6 border-t border-white/20'}`}>
                  <div className="flex justify-between items-start mb-3">
                     <div className="flex-1 pr-4">
                        <h3 className="text-3xl md:text-[2.5rem] font-black leading-tight mb-3 break-keep tracking-tighter">{item.title}</h3>
                        <div className="flex flex-wrap gap-3 text-lg md:text-xl font-bold opacity-95">
                          {item.location && <span className="flex items-center gap-1.5 bg-white/15 px-3 py-1 rounded-xl backdrop-blur-sm"><MapPin size={20} /> {item.location}</span>}
                          <span className="flex items-center gap-1.5 bg-white/15 px-3 py-1 rounded-xl backdrop-blur-sm"><Clock size={20} /> {item.time || '시간미정'}</span>
                        </div>
                     </div>
                     <div className="flex flex-col items-center gap-2 flex-shrink-0">
                       <div className="bg-white text-[#72A632] px-4 md:px-5 py-3 rounded-[1.5rem] text-xl md:text-2xl font-black shadow-lg flex flex-col items-center">
                         <span className="text-xs md:text-sm opacity-60 leading-none mb-1">{item.startDate.slice(5, 7)}월</span>
                         {item.startDate.slice(8, 10)}
                       </div>
                       {/* 편집/삭제 액션 그룹 */}
                       <div className="flex gap-2 mt-2">
                         <button onClick={() => handleEditClick(item)} className="p-2 bg-white/20 rounded-full hover:bg-white/40 transition-all"><Edit2 size={18} /></button>
                         <button onClick={() => handleDelete(item.id)} className="p-2 bg-red-400/80 rounded-full hover:bg-red-500 transition-all"><Trash2 size={18} /></button>
                       </div>
                     </div>
                  </div>
                  {item.content && (
                     <div className="mt-4 bg-black/10 p-5 md:p-6 rounded-[1.5rem] border border-white/10">
                       <p className="text-lg md:text-xl font-bold opacity-100 leading-relaxed whitespace-pre-wrap">{item.content}</p>
                     </div>
                  )}
                </div>
              )) : (
                <div className="py-12 md:py-16 text-center opacity-50">
                  <CalendarDays size={64} className="mx-auto mb-4" />
                  <p className="text-xl md:text-2xl font-black italic">다가오는 주요 일정이 없습니다</p>
                </div>
              )}
            </div>
          </section>

          {/* 하단 리스트 섹션: 전체 예정 일정 */}
          <div className="flex justify-between items-center mb-6 px-2">
             <h3 className="text-2xl font-black text-slate-800">예정된 전체 일정</h3>
          </div>

          {loading ? (
            <div className="py-24 text-center">
              <RefreshCw className="animate-spin mx-auto text-[#8DC63F] opacity-50" size={56} />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5">
              {categorizedSchedules.slice(2).map((item) => (
                <div key={item.id} className="bg-white rounded-[2rem] p-6 md:p-8 shadow-[0_5px_20px_rgba(0,0,0,0.02)] border border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center group transition-all hover:shadow-lg gap-4">
                  <div className="flex-1 w-full">
                     <div className="flex items-center gap-3 mb-2">
                       <span className="text-[#8DC63F] font-black text-sm md:text-base tracking-tighter bg-[#F0F7E6] px-3 py-1 rounded-lg">
                         {item.startDate.slice(5).replace('-', '월 ')}일
                         {item.startDate !== item.endDate && ` ~ ${item.endDate.slice(8)}일`}
                       </span>
                     </div>
                     <h4 className="text-2xl md:text-3xl font-black text-slate-800 leading-tight mb-2 tracking-tight">{item.title}</h4>
                     {item.location && <p className="text-slate-400 font-bold text-lg md:text-xl flex items-center gap-1 mt-2"><MapPin size={18} className="text-[#8DC63F]/60"/> {item.location}</p>}
                  </div>
                  <div className="flex items-center gap-3 self-end md:self-center">
                    <button 
                      onClick={() => handleEditClick(item)}
                      className="p-3 bg-amber-50 text-amber-500 rounded-full hover:bg-amber-500 hover:text-white transition-all shadow-sm active:scale-90"
                    >
                      <Edit2 size={24} />
                    </button>
                    <button 
                      onClick={() => handleDelete(item.id)}
                      className="p-3 bg-red-50 text-red-400 rounded-full hover:bg-red-500 hover:text-white transition-all shadow-sm active:scale-90"
                    >
                      <Trash2 size={24} />
                    </button>
                  </div>
                </div>
              ))}
              {categorizedSchedules.length <= 2 && categorizedSchedules.length > 0 && (
                <div className="py-16 text-center text-slate-300 font-black text-xl italic">
                  더 이상 예정된 일정이 없습니다
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* 모바일 하단 플로팅 추가 버튼 (불필요한 탭 네비게이션 대체) */}
      {!showAddForm && (
        <button 
          onClick={() => { resetForm(); setShowAddForm(true); }}
          className="lg:hidden fixed bottom-8 right-8 w-[4.5rem] h-[4.5rem] bg-[#8DC63F] text-white rounded-full flex items-center justify-center shadow-[0_10px_30px_rgba(141,198,63,0.5)] active:scale-90 transition-all z-40 hover:bg-[#7AB12E]"
        >
          <Plus size={36} strokeWidth={3} />
        </button>
      )}

      {/* 모바일 일정 폼 팝업 (추가/수정 공용) */}
      {showAddForm && (
        <div className="lg:hidden fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[100] flex items-end justify-center transition-all">
          <div className="bg-white w-full max-w-xl rounded-t-[3rem] p-8 pb-12 animate-in slide-in-from-bottom-20 duration-300 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-8 sticky top-0 bg-white z-10 py-2">
               <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                 {editingId ? <Edit2 className="text-amber-500" size={24} /> : <Plus className="text-[#8DC63F]" size={24} />} 
                 {editingId ? '일정 수정하기' : '새 일정 등록하기'}
               </h2>
               <button onClick={() => { resetForm(); setShowAddForm(false); }} className="p-3 bg-slate-100 rounded-full text-slate-500 active:scale-90 transition-all"><X size={24}/></button>
            </div>
            {/* 공용 입력 폼 불러오기 */}
            <ScheduleForm onCancel={() => { resetForm(); setShowAddForm(false); }} />
          </div>
        </div>
      )}
    </div>
  );
}

// 렌더링 초기화
const initRender = () => {
  const container = document.getElementById('root');
  if (container) {
    const root = createRoot(container);
    root.render(<App />);
  } else {
    const newRoot = document.createElement('div');
    newRoot.id = 'root';
    document.body.appendChild(newRoot);
    const root = createRoot(newRoot);
    root.render(<App />);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRender);
} else {
  initRender();
}

export default App;
