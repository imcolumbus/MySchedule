/**
 * [버전 정보]
 * v1.8.0 (2024-05-24)
 * - 오류 수정: 한국 시간대(KST)와 UTC 시차로 인한 날짜/텍스트 입력 어긋남 현상 완벽 해결
 * - 모바일 전용 모드: 모바일 환경에서는 수정/삭제/등록 기능 차단 (순수 뷰어 모드)
 * - 상단 헤더 개편: 사용자 아이콘 제거 및 오늘 연도, 월, 일, 요일 폰트 사이즈 대폭 확대
 * - 레이아웃 간소화: 불필요한 '오늘 및 주요 일정' 분리 섹션 제거 및 단일 목록으로 통합
 * - 일정 가독성 강화: 일자와 요일 순으로 크게 보이도록 초록색 태그 형태 배치
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
  Plus, 
  Trash2, 
  Clock,
  AlertTriangle,
  RefreshCw,
  MapPin,
  Settings,
  CalendarDays,
  Info,
  Edit2
} from 'lucide-react';

// 강제 스타일 주입 로직 (Vercel 호환성)
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
      try { return JSON.parse(cleaned); } catch (e) {
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

// 날짜 유틸리티: UTC 오차를 막기 위한 로컬 타임 문자열 생성기
const getLocalDateString = (dateObj) => {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// "3월 27일 금요일" 포맷으로 변환하는 유틸리티
const formatDateWithDay = (dateStr) => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  const dateObj = new Date(year, month - 1, day);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${parseInt(month)}월 ${parseInt(day)}일 ${days[dateObj.getDay()]}요일`;
};

function App() {
  const [user, setUser] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // 로컬 기준 오늘 날짜 문자열
  const todayStr = getLocalDateString(new Date());

  // 입력 폼 상태
  const [editingId, setEditingId] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newStartDate, setNewStartDate] = useState(todayStr);
  const [newEndDate, setNewEndDate] = useState('');
  const [isRange, setIsRange] = useState(false);

  // 상단 헤더 전체 날짜
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

  const resetForm = () => {
    setNewTitle(''); setNewContent(''); setNewLocation(''); setNewTime(''); 
    setNewStartDate(todayStr); setNewEndDate(''); 
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
        scheduleData.updatedAt = serverTimestamp();
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'schedules', editingId), scheduleData);
      } else {
        scheduleData.createdAt = serverTimestamp();
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'schedules'), scheduleData);
      }
      resetForm();
    } catch (e) { 
      console.error("Save Fail:", e); 
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!db) return;
    if (confirm("이 일정을 삭제하시겠습니까?")) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'schedules', id));
        if (editingId === id) resetForm();
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
      setIsRange(true); setNewEndDate(item.endDate);
    } else {
      setIsRange(false); setNewEndDate('');
    }
    setEditingId(item.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const categorizedSchedules = useMemo(() => {
    return schedules.filter(s => (s.endDate || s.startDate) >= todayStr);
  }, [schedules, todayStr]);

  // 공통 입력 폼 컴포넌트 (PC 우측 표시용)
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

  // 설정 오류 화면
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
    <div className="min-h-screen bg-[#F4F7F2] text-slate-900 font-sans pb-20 overflow-x-hidden">
      {/* 상단 프로필 및 앱 바 (초대형 날짜 표시) */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="px-6 py-6 flex flex-col justify-center max-w-6xl mx-auto gap-2">
          <h1 className="text-2xl font-black flex items-center gap-2 text-[#4A6D00] tracking-tighter mb-1">
            <div className="w-10 h-10 bg-[#F0F7E6] rounded-full flex items-center justify-center border border-[#8DC63F]/20 shadow-sm mr-1">
               <CalendarDays className="text-[#8DC63F]" size={20} />
            </div>
            나의 일정 <span className="text-slate-400 font-bold text-xs bg-slate-50 border px-2 py-0.5 rounded-md ml-1">v1.8.0</span>
          </h1>
          {/* 어르신들이 보기 편하게 대폭 키운 날짜 표시 */}
          <p className="text-slate-900 font-black text-[2.2rem] md:text-5xl tracking-tight leading-snug">
            {fullDateDisplay}
          </p>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 md:px-6 pt-8 flex flex-col lg:flex-row gap-10">
        
        {/* PC 전용: 좌측 고정 일정 입력 및 수정 (모바일에서는 완전히 숨김) */}
        <aside className="hidden lg:block w-[400px] flex-shrink-0">
          <div className="bg-white rounded-[3rem] p-8 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.05)] sticky top-[200px] border border-slate-50">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                 {editingId ? <Edit2 className="text-amber-500" size={28} strokeWidth={3} /> : <Plus className="text-[#8DC63F]" size={28} strokeWidth={3} />} 
                 {editingId ? '일정 수정' : '새 일정 등록'}
              </h2>
              {editingId && (
                <button onClick={resetForm} className="text-sm font-bold text-slate-400 hover:text-slate-600">등록으로 돌아가기</button>
              )}
            </div>
            <ScheduleForm onCancel={editingId ? resetForm : null} />
          </div>
        </aside>

        {/* 우측/모바일 메인: 일정 목록 영역 */}
        <main className="flex-1 w-full">
          {loading ? (
            <div className="py-24 text-center">
              <RefreshCw className="animate-spin mx-auto text-[#8DC63F] opacity-50" size={56} />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {categorizedSchedules.map((item) => (
                <div key={item.id} className="bg-white rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-8 shadow-[0_5px_20px_rgba(0,0,0,0.03)] border border-slate-100 flex flex-col lg:flex-row justify-between items-start lg:items-center group transition-all hover:shadow-lg gap-4">
                  <div className="flex-1 w-full">
                     {/* 초록색 알약 형태의 날짜/요일 명확한 표시 */}
                     <div className="mb-4">
                       <span className="inline-block text-white bg-[#8DC63F] font-black text-lg md:text-xl tracking-tight px-4 py-2 rounded-[1rem] shadow-sm">
                         {formatDateWithDay(item.startDate)}
                         {item.startDate !== item.endDate && ` ~ ${formatDateWithDay(item.endDate)}`}
                       </span>
                     </div>

                     <h4 className="text-2xl md:text-3xl font-black text-slate-800 leading-tight mb-3 tracking-tight break-keep">{item.title}</h4>
                     
                     <div className="flex flex-wrap gap-3">
                       {item.time && <p className="text-slate-500 font-bold text-[1.1rem] md:text-xl flex items-center gap-1.5"><Clock size={22} className="text-[#8DC63F]"/> {item.time}</p>}
                       {item.location && <p className="text-slate-500 font-bold text-[1.1rem] md:text-xl flex items-center gap-1.5"><MapPin size={22} className="text-[#8DC63F]"/> {item.location}</p>}
                     </div>

                     {item.content && (
                       <div className="mt-5 bg-[#F4F7F2]/50 p-5 rounded-2xl border border-slate-50">
                         <p className="text-slate-600 font-bold text-lg md:text-xl whitespace-pre-wrap leading-relaxed">{item.content}</p>
                       </div>
                     )}
                  </div>

                  {/* PC에서만 보이는 수정/삭제 버튼 (모바일에서는 뷰어 모드이므로 숨김 처리) */}
                  <div className="hidden lg:flex flex-col gap-3 self-start">
                    <button 
                      onClick={() => handleEditClick(item)}
                      className="p-4 bg-amber-50 text-amber-500 rounded-2xl hover:bg-amber-500 hover:text-white transition-all shadow-sm active:scale-90 flex flex-col items-center justify-center gap-1"
                      title="수정"
                    >
                      <Edit2 size={24} />
                      <span className="text-xs font-black">수정</span>
                    </button>
                    <button 
                      onClick={() => handleDelete(item.id)}
                      className="p-4 bg-red-50 text-red-400 rounded-2xl hover:bg-red-500 hover:text-white transition-all shadow-sm active:scale-90 flex flex-col items-center justify-center gap-1"
                      title="삭제"
                    >
                      <Trash2 size={24} />
                      <span className="text-xs font-black">삭제</span>
                    </button>
                  </div>
                </div>
              ))}
              {categorizedSchedules.length === 0 && (
                <div className="py-20 text-center">
                  <CalendarDays size={80} className="mx-auto mb-6 text-slate-200" />
                  <p className="text-slate-300 font-black text-2xl">등록된 일정이 없습니다</p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
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
