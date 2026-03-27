/**
 * [버전 정보]
 * v1.19.0 (2026-03-28)
 * - 달력 높이 최적화: 달력의 불필요한 상하 폭(vh 등)을 고정 픽셀(rem)로 변경하여 하단 일정이 가려지지 않도록 수정
 * - 달력 연동 UX 강화: 달력에서 날짜 선택 시 하단에 "O월 O일의 일정"이라는 제목이 표시되며 해당 일정만 명확히 필터링됨
 * - 전체화면(PWA) 지원: 홈 화면에 추가 시 주소창이 사라지고 독립된 앱처럼 실행되도록 meta 태그(apple-mobile-web-app-capable 등) 추가
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
  CalendarDays,
  Info,
  Edit2,
  ArchiveRestore,
  Trash,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  List
} from 'lucide-react';

// 강제 스타일 및 PWA(전체화면 앱) 메타 태그 주입 로직
if (typeof document !== 'undefined') {
  if (!document.getElementById('tailwind-script')) {
    const script = document.createElement('script');
    script.id = 'tailwind-script';
    script.src = 'https://cdn.tailwindcss.com';
    document.head.appendChild(script);
  }
  
  if (!document.getElementById('app-favicon')) {
    const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="#508A12"/><rect y="30" width="100" height="70" rx="20" fill="white"/><text x="50" y="82" font-size="50" font-family="sans-serif" font-weight="900" fill="#508A12" text-anchor="middle">1</text><circle cx="30" cy="20" r="6" fill="white"/><circle cx="70" cy="20" r="6" fill="white"/></svg>`;
    const iconUrl = `data:image/svg+xml;base64,${btoa(svgIcon)}`;
    
    const linkIcon = document.createElement('link');
    linkIcon.id = 'app-favicon';
    linkIcon.rel = 'icon';
    linkIcon.href = iconUrl;
    document.head.appendChild(linkIcon);

    const linkApple = document.createElement('link');
    linkApple.rel = 'apple-touch-icon';
    linkApple.href = iconUrl;
    document.head.appendChild(linkApple);
    
    // 전체화면 앱(PWA) 지원 메타 태그 (주소창 숨기기)
    const metaAppleCapable = document.createElement('meta');
    metaAppleCapable.name = 'apple-mobile-web-app-capable';
    metaAppleCapable.content = 'yes';
    document.head.appendChild(metaAppleCapable);

    const metaMobileCapable = document.createElement('meta');
    metaMobileCapable.name = 'mobile-web-app-capable';
    metaMobileCapable.content = 'yes';
    document.head.appendChild(metaMobileCapable);

    const metaAppleStatus = document.createElement('meta');
    metaAppleStatus.name = 'apple-mobile-web-app-status-bar-style';
    metaAppleStatus.content = 'default';
    document.head.appendChild(metaAppleStatus);
    
    const metaTheme = document.createElement('meta');
    metaTheme.name = 'theme-color';
    metaTheme.content = '#ffffff';
    document.head.appendChild(metaTheme);
    
    const title = document.querySelector('title');
    if(title) title.innerText = '나의 일정';
  }
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

// 날짜 유틸리티
const getLocalDateString = (dateObj) => {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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
  const [showTrash, setShowTrash] = useState(false); 
  const [showPast, setShowPast] = useState(false); 

  // 달력 모드 상태
  const [isCalendarView, setIsCalendarView] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(getLocalDateString(new Date()));

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
      setSchedules(data);
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
        author: user.uid,
        isDeleted: false 
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

  const handleSoftDelete = async (id) => {
    if (!db) return;
    if (confirm("이 일정을 휴지통으로 이동하시겠습니까?")) {
      try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'schedules', id), { isDeleted: true });
        if (editingId === id) resetForm();
      } catch (e) { console.error("Trash Fail:", e); }
    }
  };

  const handleRestore = async (id) => {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'schedules', id), { isDeleted: false });
    } catch (e) { console.error("Restore Fail:", e); }
  };

  const handlePermanentDelete = async (id) => {
    if (!db) return;
    if (confirm("이 일정을 완전히 삭제하시겠습니까? 복구할 수 없습니다.")) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'schedules', id));
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
    setShowTrash(false); 
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const activeSchedules = useMemo(() => {
    return schedules
      .filter(s => !s.isDeleted && (s.endDate || s.startDate) >= todayStr)
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  }, [schedules, todayStr]);

  const pastSchedules = useMemo(() => {
    return schedules
      .filter(s => !s.isDeleted && (s.endDate || s.startDate) < todayStr)
      .sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
  }, [schedules, todayStr]);

  const trashedSchedules = useMemo(() => {
    return schedules
      .filter(s => s.isDeleted)
      .sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
  }, [schedules]);

  // 달력 모드에서 선택된 날짜의 일정 필터링
  const calendarFilteredSchedules = useMemo(() => {
    return schedules.filter(s => !s.isDeleted && s.startDate <= selectedDate && (s.endDate || s.startDate) >= selectedDate);
  }, [schedules, selectedDate]);

  let displaySchedules = showTrash ? trashedSchedules : activeSchedules;
  if (isCalendarView && !showTrash) {
    displaySchedules = calendarFilteredSchedules;
  }

  // 달력 렌더링 로직 (상하 폭을 대폭 축소)
  const renderCalendar = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`);
    }

    return (
      <div className="bg-white dark:bg-slate-800 p-3 md:p-5 rounded-[2rem] shadow-sm mb-2 border border-slate-100 dark:border-slate-700">
         <div className="flex justify-between items-center mb-3">
           <button onClick={() => setCalendarMonth(new Date(year, month - 1, 1))} className="p-2 md:p-3 bg-slate-50 dark:bg-slate-700 rounded-full active:scale-90 transition-transform"><ChevronLeft size={28} className="dark:text-white"/></button>
           <h2 className="text-[clamp(1.2rem,5vw,2rem)] font-black text-slate-800 dark:text-white tracking-tighter">{year}년 {month + 1}월</h2>
           <button onClick={() => setCalendarMonth(new Date(year, month + 1, 1))} className="p-2 md:p-3 bg-slate-50 dark:bg-slate-700 rounded-full active:scale-90 transition-transform"><ChevronRight size={28} className="dark:text-white"/></button>
         </div>
         <div className="grid grid-cols-7 gap-1 mb-2 text-center">
           {['일', '월', '화', '수', '목', '금', '토'].map((wd, i) => (
             <div key={i} className={`text-[clamp(0.9rem,3vw,1.1rem)] md:text-xl font-black ${i===0 ? 'text-red-500' : i===6 ? 'text-blue-500' : 'text-slate-500 dark:text-slate-400'}`}>{wd}</div>
           ))}
         </div>
         <div className="grid grid-cols-7 gap-1 md:gap-2">
           {days.map((dateStr, idx) => {
             if (!dateStr) return <div key={`empty-${idx}`} />;
             const dayNum = parseInt(dateStr.split('-')[2]);
             const hasSchedule = schedules.some(s => !s.isDeleted && s.startDate <= dateStr && (s.endDate || s.startDate) >= dateStr);
             const isSelected = selectedDate === dateStr;
             const isToday = todayStr === dateStr;

             return (
               <button
                 key={dateStr}
                 onClick={() => setSelectedDate(dateStr)}
                 // 버튼 높이를 대폭 줄여서 상하 폭 최적화 (h-12 ~ h-14 수준)
                 className={`flex flex-col items-center justify-center rounded-[1rem] h-[3.2rem] md:h-[4rem] transition-all relative overflow-hidden ${
                   isSelected ? 'bg-[#508A12] text-white shadow-md scale-105' 
                   : hasSchedule ? 'bg-[#EBF3E1] dark:bg-[#395A11] hover:bg-[#D4E8BF] dark:hover:bg-[#487317]' 
                   : 'bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600'
                 }`}
               >
                 <span className={`text-[clamp(1.1rem,4vw,1.4rem)] md:text-2xl font-black relative z-10 ${isSelected ? 'text-white' : isToday ? 'text-[#508A12] dark:text-[#8DC63F]' : hasSchedule ? 'text-[#3E6B0E] dark:text-[#a5d85a]' : 'text-slate-700 dark:text-slate-200'}`}>
                   {dayNum}
                 </span>
                 {hasSchedule && (
                   <div className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full mt-0.5 relative z-10 ${isSelected ? 'bg-white' : 'bg-[#508A12] dark:bg-[#8DC63F]'}`} />
                 )}
               </button>
             );
           })}
         </div>
      </div>
    );
  };

  // 공통 입력 폼 컴포넌트
  const renderScheduleForm = (onCancel) => (
    <form onSubmit={handleAddOrEditSchedule} className="space-y-4 md:space-y-6">
      <div className="space-y-2">
        <label className="block text-slate-400 dark:text-slate-400 font-black text-sm uppercase ml-2">일정 제목</label>
        <input 
          type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} 
          placeholder="예: 병원 방문" 
          className="w-full text-xl md:text-2xl p-4 md:p-5 bg-slate-50 dark:bg-slate-700 dark:text-white rounded-[1.2rem] md:rounded-[1.5rem] border-none font-black focus:ring-4 focus:ring-[#508A12]/30 transition-all shadow-inner" 
          autoFocus 
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-xs font-black text-slate-400 ml-2">장소</label>
          <input type="text" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="어디서?" className="w-full p-4 bg-slate-50 dark:bg-slate-700 dark:text-white rounded-[1rem] border-none font-bold text-lg shadow-inner" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-black text-slate-400 ml-2">시간</label>
          <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="w-full p-4 bg-slate-50 dark:bg-slate-700 dark:text-white rounded-[1rem] border-none font-bold text-lg shadow-inner" />
        </div>
      </div>

      <div className="space-y-2">
         <label className="text-xs font-black text-slate-400 ml-2">메모</label>
         <textarea 
          value={newContent} onChange={(e) => setNewContent(e.target.value)} 
          placeholder="상세 내용을 적어주세요" rows={3}
          className="w-full p-4 md:p-5 bg-slate-50 dark:bg-slate-700 dark:text-white rounded-[1.2rem] border-none font-bold text-lg shadow-inner resize-none" 
        />
      </div>

      <div className="flex items-center justify-between p-4 bg-[#F7F9FB] dark:bg-slate-700 rounded-[1.2rem]">
        <span className="font-black text-slate-700 dark:text-slate-200 text-base md:text-lg">여러 날 일정</span>
        <button type="button" onClick={() => setIsRange(!isRange)} className={`w-14 h-8 rounded-full relative transition-all ${isRange ? 'bg-[#508A12]' : 'bg-slate-300 dark:bg-slate-500'}`}>
          <div className={`absolute top-1 bg-white w-6 h-6 rounded-full transition-transform ${isRange ? 'translate-x-7' : 'translate-x-1'} shadow-md`} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-xs font-black text-slate-400 ml-2">시작 날짜</label>
          <input type="date" value={newStartDate} onChange={(e) => setNewStartDate(e.target.value)} className="w-full p-4 bg-slate-50 dark:bg-slate-700 dark:text-white rounded-[1rem] border-none font-bold text-lg shadow-inner" />
        </div>
        {isRange && (
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 ml-2">종료 날짜</label>
            <input type="date" value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)} className="w-full p-4 bg-slate-50 dark:bg-slate-700 dark:text-white rounded-[1rem] border-none font-bold text-lg shadow-inner" />
          </div>
        )}
      </div>
      
      <div className="flex gap-2 pt-2">
        {onCancel && (
          <button 
            type="button" 
            onClick={() => { resetForm(); onCancel(); }} 
            className="flex-1 py-4 md:py-5 bg-slate-100 dark:bg-slate-600 text-slate-500 dark:text-slate-300 rounded-[1.5rem] font-black text-lg active:scale-95 transition-all"
          >
            취소
          </button>
        )}
        <button 
          type="submit" 
          disabled={isSaving}
          className="flex-[2] py-4 md:py-5 bg-[#508A12] text-white rounded-[1.5rem] font-black text-lg shadow-lg shadow-[#508A12]/30 active:scale-95 transition-all disabled:opacity-50"
        >
          {isSaving ? '저장 중...' : (editingId ? '일정 수정완료' : '새 일정 등록')}
        </button>
      </div>
    </form>
  );

  if (!app) return (
    <div className="min-h-screen bg-[#F4F7F2] dark:bg-slate-900 flex items-center justify-center p-6 text-center">
      <div className="bg-white dark:bg-slate-800 p-8 rounded-[2.5rem] shadow-xl max-w-md w-full border-t-[12px] border-red-500">
        <AlertTriangle className="text-red-500 mx-auto mb-4" size={56} />
        <h1 className="text-2xl font-black text-slate-800 dark:text-white mb-4">설정 확인 필요</h1>
        <p className="text-slate-500 dark:text-slate-300 font-bold mb-2">Vercel 환경 변수 이름: <code className="bg-slate-100 dark:bg-slate-700 px-1">VITE_FIREBASE_CONFIG</code></p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F4F7F2] dark:bg-slate-900 text-slate-900 dark:text-white font-sans pb-10 overflow-x-hidden transition-colors duration-300">
      {/* 상단 헤더 */}
      <header className="bg-white dark:bg-slate-800 shadow-[0_2px_15px_rgba(0,0,0,0.03)] sticky top-0 z-40 py-[clamp(0.75rem,2vh,1.25rem)] transition-colors duration-300">
        <div className="max-w-6xl mx-auto px-4 md:px-6 flex justify-between items-center">
          <div>
            <p className="text-slate-900 dark:text-white font-black text-[clamp(1.4rem,6vw,2.5rem)] tracking-tighter leading-none">
              {isCalendarView ? `${calendarMonth.getFullYear()}년 ${calendarMonth.getMonth() + 1}월` : fullDateDisplay}
            </p>
          </div>
          <div className="flex items-center gap-[clamp(0.5rem,2vw,1rem)]">
            <button 
              onClick={() => {
                setIsCalendarView(!isCalendarView);
                setSelectedDate(todayStr); 
              }}
              className="flex items-center justify-center min-w-[80px] px-[clamp(1rem,4vw,1.5rem)] py-[clamp(0.5rem,1.5vh,0.75rem)] bg-[#508A12] text-white rounded-full font-black text-[clamp(1rem,4vw,1.25rem)] active:scale-95 transition-all shadow-md"
            >
              {isCalendarView ? '홈' : '달력'}
            </button>
            
            {/* PC 전용 휴지통 토글 */}
            <button 
              onClick={() => { setShowTrash(!showTrash); setEditingId(null); setShowPast(false); setIsCalendarView(false); }}
              className={`hidden lg:flex px-4 py-2.5 rounded-full font-black text-sm transition-all items-center gap-2 ${
                showTrash ? 'bg-slate-800 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              {showTrash ? '목록으로' : <><Trash2 size={20}/> 휴지통</>}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 md:px-6 pt-4 flex flex-col lg:flex-row gap-[clamp(1rem,3vh,1.5rem)]">
        
        {/* PC 전용 */}
        <aside className="hidden lg:block w-[380px] flex-shrink-0">
          <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-6 shadow-sm sticky top-[120px] border border-slate-100 dark:border-slate-700 transition-colors duration-300">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                 {editingId ? <Edit2 className="text-amber-500" size={24} strokeWidth={3} /> : <Plus className="text-[#508A12]" size={24} strokeWidth={3} />} 
                 {editingId ? '일정 수정' : '새 일정 등록'}
              </h2>
            </div>
            {renderScheduleForm(editingId ? resetForm : null)}
          </div>
        </aside>

        {/* 메인 리스트 및 달력 영역 */}
        <main className="flex-1 w-full">
          {isCalendarView && !showTrash && renderCalendar()}

          {/* 달력에서 날짜를 선택했을 때 해당 날짜를 알려주는 제목 */}
          {isCalendarView && !showTrash && (
            <div className="mb-3 mt-2 px-1">
              <h3 className="text-[1.2rem] md:text-2xl font-black text-[#508A12] dark:text-[#a5d85a] border-l-4 border-[#508A12] pl-3">
                {parseInt(selectedDate.split('-')[1])}월 {parseInt(selectedDate.split('-')[2])}일의 일정
              </h3>
            </div>
          )}

          {loading ? (
            <div className="py-20 text-center">
              <RefreshCw className="animate-spin mx-auto text-[#508A12] opacity-50" size={48} />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {displaySchedules.map((item) => (
                <div key={item.id} className={`bg-white dark:bg-slate-800 rounded-[1.5rem] md:rounded-[1.8rem] p-4 md:p-5 shadow-sm flex flex-col lg:flex-row justify-between items-start lg:items-center group transition-all gap-3 border ${showTrash ? 'border-red-100 dark:border-red-900 opacity-80' : 'border-slate-100 dark:border-slate-700'}`}>
                  <div className="flex-1 w-full">
                     <div className="mb-2">
                       <span className={`inline-block text-white font-black text-[clamp(1rem,4vw,1.2rem)] md:text-xl tracking-tight px-[clamp(0.75rem,3vw,1rem)] py-[clamp(0.25rem,1.5vw,0.5rem)] rounded-xl shadow-sm ${showTrash ? 'bg-slate-400 dark:bg-slate-600' : 'bg-[#508A12]'}`}>
                         {formatDateWithDay(item.startDate)}
                         {item.startDate !== item.endDate && ` ~ ${formatDateWithDay(item.endDate)}`}
                       </span>
                     </div>

                     <h4 className={`text-[clamp(1.4rem,5.5vw,1.8rem)] md:text-[2rem] font-black leading-tight mb-1.5 tracking-tight break-keep ${showTrash ? 'text-slate-500 dark:text-slate-400 line-through' : 'text-slate-800 dark:text-slate-100'}`}>
                       {item.title}
                     </h4>
                     
                     <div className="flex flex-wrap gap-3 my-1.5">
                       {item.time && <p className="text-slate-700 dark:text-slate-300 font-black text-[clamp(1.1rem,4.5vw,1.4rem)] md:text-xl flex items-center gap-1.5"><Clock className={`w-[clamp(1.1rem,5vw,1.5rem)] h-[clamp(1.1rem,5vw,1.5rem)] ${showTrash ? 'text-slate-400' : 'text-[#508A12]'}`} strokeWidth={2.5} /> {item.time}</p>}
                       {item.location && <p className="text-slate-700 dark:text-slate-300 font-black text-[clamp(1.1rem,4.5vw,1.4rem)] md:text-xl flex items-center gap-1.5"><MapPin className={`w-[clamp(1.1rem,5vw,1.5rem)] h-[clamp(1.1rem,5vw,1.5rem)] ${showTrash ? 'text-slate-400' : 'text-[#508A12]'}`} strokeWidth={2.5} /> {item.location}</p>}
                     </div>

                     {item.content && (
                       <div className={`mt-2.5 p-3.5 md:p-4 rounded-xl border ${showTrash ? 'bg-slate-50 dark:bg-slate-700 border-slate-100 dark:border-slate-600' : 'bg-[#F4F7F2]/50 dark:bg-slate-700 border-[#EBF3E1] dark:border-slate-600'}`}>
                         <p className="text-slate-700 dark:text-slate-200 font-bold text-[clamp(1rem,4vw,1.2rem)] md:text-xl whitespace-pre-wrap leading-snug">{item.content}</p>
                       </div>
                     )}
                  </div>

                  {/* PC에서만 보이는 작업 버튼 */}
                  <div className="hidden lg:flex flex-col gap-2 self-start">
                    {!showTrash ? (
                      <>
                        <button onClick={() => handleEditClick(item)} className="p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-500 dark:text-amber-400 rounded-xl hover:bg-amber-500 hover:text-white transition-all shadow-sm" title="수정"><Edit2 size={22} /></button>
                        <button onClick={() => handleSoftDelete(item.id)} className="p-3 bg-red-50 dark:bg-red-900/30 text-red-400 dark:text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm" title="삭제"><Trash2 size={22} /></button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => handleRestore(item.id)} className="p-3 bg-emerald-50 text-emerald-500 rounded-xl hover:bg-emerald-500 hover:text-white transition-all shadow-sm" title="복구"><ArchiveRestore size={22} /></button>
                        <button onClick={() => handlePermanentDelete(item.id)} className="p-3 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-600 hover:text-white transition-all shadow-sm" title="영구 삭제"><Trash size={22} /></button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {displaySchedules.length === 0 && (
                <div className="py-12 text-center">
                  {showTrash ? (
                    <>
                      <Trash size={60} className="mx-auto mb-4 text-slate-300 dark:text-slate-600" />
                      <p className="text-slate-400 dark:text-slate-500 font-black text-xl">휴지통이 비어있습니다</p>
                    </>
                  ) : (
                    <>
                      <CalendarDays size={60} className="mx-auto mb-4 text-slate-300 dark:text-slate-600" />
                      <p className="text-slate-400 dark:text-slate-500 font-black text-[clamp(1.1rem,4vw,1.4rem)]">
                        {isCalendarView ? '선택한 날짜에 일정이 없습니다' : '예정된 일정이 없습니다'}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 지난 일정 보기 */}
          {!loading && !showTrash && !isCalendarView && (
            <div className="mt-6 mb-4 flex flex-col items-center">
              <button 
                onClick={() => setShowPast(!showPast)}
                className="px-6 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full font-black text-[clamp(0.9rem,3.5vw,1.1rem)] shadow-sm active:scale-95 transition-all flex items-center gap-2"
              >
                {showPast ? '지난 일정 숨기기' : '지난 일정 보기'}
                {showPast ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </button>

              {showPast && (
                <div className="w-full mt-4 grid grid-cols-1 gap-3">
                  {pastSchedules.length > 0 ? pastSchedules.map((item) => (
                    <div key={item.id} className="bg-slate-50 dark:bg-slate-800 rounded-[1.5rem] p-4 shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col lg:flex-row justify-between items-start lg:items-center group gap-3 opacity-80 hover:opacity-100 transition-opacity">
                      <div className="flex-1 w-full">
                         <div className="mb-2">
                           <span className="inline-block text-white bg-slate-400 dark:bg-slate-600 font-black text-[clamp(0.9rem,3.5vw,1.1rem)] md:text-lg tracking-tight px-3 py-1 rounded-xl shadow-sm">
                             {formatDateWithDay(item.startDate)}
                             {item.startDate !== item.endDate && ` ~ ${formatDateWithDay(item.endDate)}`}
                           </span>
                         </div>
                         <h4 className="text-[clamp(1.2rem,4.5vw,1.6rem)] md:text-[1.6rem] font-black text-slate-700 dark:text-slate-300 leading-tight mb-1.5 tracking-tight break-keep">{item.title}</h4>
                         <div className="flex flex-wrap gap-3 my-1">
                           {item.time && <p className="text-slate-500 dark:text-slate-400 font-bold text-[clamp(1rem,4vw,1.2rem)] flex items-center gap-1.5"><Clock className="w-[clamp(1rem,4vw,1.2rem)] h-[clamp(1rem,4vw,1.2rem)] text-slate-400 dark:text-slate-500"/> {item.time}</p>}
                           {item.location && <p className="text-slate-500 dark:text-slate-400 font-bold text-[clamp(1rem,4vw,1.2rem)] flex items-center gap-1.5"><MapPin className="w-[clamp(1rem,4vw,1.2rem)] h-[clamp(1rem,4vw,1.2rem)] text-slate-400 dark:text-slate-500"/> {item.location}</p>}
                         </div>
                         {item.content && (
                           <div className="mt-2 bg-slate-100 dark:bg-slate-700 p-3 rounded-xl">
                             <p className="text-slate-500 dark:text-slate-300 font-bold text-[clamp(0.9rem,3.5vw,1.1rem)] md:text-lg whitespace-pre-wrap leading-snug">{item.content}</p>
                           </div>
                         )}
                      </div>
                      <div className="hidden lg:flex flex-col gap-2 self-start">
                        <button onClick={() => handleSoftDelete(item.id)} className="p-3 bg-red-50 dark:bg-red-900/30 text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm"><Trash2 size={20} /></button>
                      </div>
                    </div>
                  )) : (
                     <div className="py-6 text-center text-slate-400 dark:text-slate-500 font-bold text-[clamp(1rem,4vw,1.2rem)] bg-slate-50 dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700">
                      지난 일정이 없습니다.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

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
