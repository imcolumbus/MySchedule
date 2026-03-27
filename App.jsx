/**
 * [버전 정보]
 * v1.24.0 (2026-03-28)
 * - 모바일 헤더 레이아웃 최적화: 시스템 폰트가 매우 큰 기기에서도 상단 날짜가 말줄임표(...)로 잘리지 않고 1줄로 표시되도록 버튼 간격 압축 및 글자 크기 범위 하향 조정
 * - 모달 스크롤 추가: 가족 연동 팝업 내용이 작은 스마트폰 화면 밖으로 잘리지 않도록 내부에 스크롤(max-h-[90vh], overflow-y-auto) 추가
 * - 빈 일정 안내 문구 보강: 일정이 없을 경우 '가족 연동'을 확인하라는 안내 문구 추가
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
  setDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { 
  getAuth, 
  signInWithCustomToken, 
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut
} from 'firebase/auth';
import { 
  Plus, 
  Trash2, 
  Clock,
  AlertTriangle,
  RefreshCw,
  MapPin,
  CalendarDays,
  Edit2,
  ArchiveRestore,
  Trash,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Users,
  Copy,
  Check
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
    
    const metaAppleCapable = document.createElement('meta');
    metaAppleCapable.name = 'apple-mobile-web-app-capable';
    metaAppleCapable.content = 'yes';
    document.head.appendChild(metaAppleCapable);

    const metaMobileCapable = document.createElement('meta');
    metaMobileCapable.name = 'mobile-web-app-capable';
    metaMobileCapable.content = 'yes';
    document.head.appendChild(metaMobileCapable);

    const metaTheme = document.createElement('meta');
    metaTheme.name = 'theme-color';
    metaTheme.content = '#ffffff';
    document.head.appendChild(metaTheme);
    
    const title = document.querySelector('title');
    if(title) title.innerText = '나의 일정';
  }
}

// Firebase 설정값 추출 로직
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

const { config: firebaseConfig } = getFirebaseConfig();

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

export default function App() {
  const [user, setUser] = useState(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showTrash, setShowTrash] = useState(false); 
  const [showPast, setShowPast] = useState(false); 

  // 가족 연동 상태
  const [linkedUid, setLinkedUid] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  const activeUid = linkedUid || (user ? user.uid : null);

  // 달력 모드 상태
  const [isCalendarView, setIsCalendarView] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(getLocalDateString(new Date()));

  const todayStr = getLocalDateString(new Date());

  // D-Day 계산 함수
  const getDDay = (startDate) => {
    const todayDate = new Date(todayStr);
    const targetDate = new Date(startDate);
    const diffTime = targetDate.getTime() - todayDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'D-Day';
    if (diffDays > 0) return `D-${diffDays}`;
    return `D+${Math.abs(diffDays)}`;
  };

  // 입력 폼 상태
  const [editingId, setEditingId] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newStartDate, setNewStartDate] = useState(todayStr);
  const [newEndDate, setNewEndDate] = useState('');
  const [isRange, setIsRange] = useState(false);

  const fullDateDisplay = new Date().toLocaleDateString('ko-KR', { 
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' 
  });

  // 구글 로그인 상태 감지
  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        }
      } catch (e) { console.error("Auth Init Fail:", e); }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  // 연동된 계정 정보 불러오기
  useEffect(() => {
    if (!user || !db) return;
    const profileRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'profile');
    const unsubscribe = onSnapshot(profileRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().linkedUid) {
        setLinkedUid(docSnap.data().linkedUid);
      } else {
        setLinkedUid(null);
      }
    });
    return () => unsubscribe();
  }, [user, db]);

  // 일정 데이터 불러오기 (개인 경로 or 연동된 경로)
  useEffect(() => {
    if (!activeUid || !db) return;
    const schedulesRef = collection(db, 'artifacts', appId, 'users', activeUid, 'schedules');
    const unsubscribe = onSnapshot(schedulesRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSchedules(data);
      setLoading(false);
    }, (err) => {
      console.error("Firestore Error:", err);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [activeUid, db]);

  // 구글 로그인 처리
  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Google Login Error:", error);
      alert("로그인 중 오류가 발생했습니다. 팝업 차단을 해제하거나 환경을 확인해 주세요.");
    }
  };

  const handleLogout = async () => {
    if (confirm("로그아웃 하시겠습니까?")) {
      try {
        await signOut(auth);
        setSchedules([]);
      } catch (error) {
        console.error("Logout Error:", error);
      }
    }
  };

  const resetForm = () => {
    setNewTitle(''); setNewContent(''); setNewLocation(''); setNewTime(''); 
    setNewStartDate(todayStr); setNewEndDate(''); 
    setIsRange(false); setEditingId(null);
  };

  const handleAddOrEditSchedule = async (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !db || isSaving || !user) return;
    setIsSaving(true);
    try {
      const scheduleData = {
        title: newTitle, content: newContent, location: newLocation, time: newTime, 
        startDate: newStartDate, endDate: isRange ? newEndDate : newStartDate,
        author: activeUid,
        isDeleted: false 
      };

      if (editingId) {
        scheduleData.updatedAt = serverTimestamp();
        await updateDoc(doc(db, 'artifacts', appId, 'users', activeUid, 'schedules', editingId), scheduleData);
      } else {
        scheduleData.createdAt = serverTimestamp();
        await addDoc(collection(db, 'artifacts', appId, 'users', activeUid, 'schedules'), scheduleData);
      }
      resetForm();
    } catch (e) { 
      console.error("Save Fail:", e); 
    } finally {
      setIsSaving(false);
    }
  };

  const handleSoftDelete = async (id) => {
    if (!db || !activeUid) return;
    if (confirm("이 일정을 휴지통으로 이동하시겠습니까?")) {
      try {
        await updateDoc(doc(db, 'artifacts', appId, 'users', activeUid, 'schedules', id), { isDeleted: true });
        if (editingId === id) resetForm();
      } catch (e) { console.error("Trash Fail:", e); }
    }
  };

  const handleRestore = async (id) => {
    if (!db || !activeUid) return;
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'users', activeUid, 'schedules', id), { isDeleted: false });
    } catch (e) { console.error("Restore Fail:", e); }
  };

  const handlePermanentDelete = async (id) => {
    if (!db || !activeUid) return;
    if (confirm("이 일정을 완전히 삭제하시겠습니까? 복구할 수 없습니다.")) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', activeUid, 'schedules', id));
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

  const handleCopyCode = () => {
    const textArea = document.createElement("textarea");
    textArea.value = user.uid;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) { console.error('Copy failed', err); }
    document.body.removeChild(textArea);
  };

  const handleLinkAccount = async () => {
    if (!linkInput.trim()) return;
    const profileRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'profile');
    await setDoc(profileRef, { linkedUid: linkInput.trim() }, { merge: true });
    setLinkInput('');
    setShowSettings(false);
  };

  const handleUnlink = async () => {
    if(confirm("가족 연동을 해제하시겠습니까?")) {
      const profileRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'profile');
      await setDoc(profileRef, { linkedUid: null }, { merge: true });
      setShowSettings(false);
    }
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

  const calendarFilteredSchedules = useMemo(() => {
    return schedules.filter(s => !s.isDeleted && s.startDate <= selectedDate && (s.endDate || s.startDate) >= selectedDate);
  }, [schedules, selectedDate]);

  let displaySchedules = showTrash ? trashedSchedules : activeSchedules;
  if (isCalendarView && !showTrash) displaySchedules = calendarFilteredSchedules;

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
      <div className="bg-white dark:bg-slate-800 p-2.5 md:p-5 rounded-[1.8rem] shadow-sm mb-3 border border-slate-100 dark:border-slate-700">
         <div className="flex justify-between items-center mb-2 md:mb-4">
           <button onClick={() => setCalendarMonth(new Date(year, month - 1, 1))} className="p-1.5 md:p-3 bg-slate-50 dark:bg-slate-700 rounded-full active:scale-90 transition-transform"><ChevronLeft size={24} className="dark:text-white"/></button>
           <h2 className="text-[clamp(1.1rem,4.5vw,1.8rem)] font-black text-slate-800 dark:text-white tracking-tighter">{year}년 {month + 1}월</h2>
           <button onClick={() => setCalendarMonth(new Date(year, month + 1, 1))} className="p-1.5 md:p-3 bg-slate-50 dark:bg-slate-700 rounded-full active:scale-90 transition-transform"><ChevronRight size={24} className="dark:text-white"/></button>
         </div>
         <div className="grid grid-cols-7 gap-1 mb-1.5 text-center">
           {['일', '월', '화', '수', '목', '금', '토'].map((wd, i) => (
             <div key={i} className={`text-[clamp(0.85rem,3vw,1.1rem)] md:text-xl font-black ${i===0 ? 'text-red-500' : i===6 ? 'text-blue-500' : 'text-slate-500 dark:text-slate-400'}`}>{wd}</div>
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
                 className={`flex flex-col items-center justify-center rounded-[0.8rem] md:rounded-[1.2rem] h-[3rem] md:h-[4rem] transition-all relative overflow-hidden ${
                   isSelected ? 'bg-[#508A12] text-white shadow-md scale-105' 
                   : hasSchedule ? 'bg-[#EBF3E1] dark:bg-[#395A11] hover:bg-[#D4E8BF] dark:hover:bg-[#487317]' 
                   : 'bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600'
                 }`}
               >
                 <span className={`text-[clamp(1rem,3.5vw,1.3rem)] md:text-2xl font-black relative z-10 ${isSelected ? 'text-white' : isToday ? 'text-[#508A12] dark:text-[#8DC63F]' : hasSchedule ? 'text-[#3E6B0E] dark:text-[#a5d85a]' : 'text-slate-700 dark:text-slate-200'}`}>
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

  const renderScheduleForm = (onCancel) => (
    <form onSubmit={handleAddOrEditSchedule} className="space-y-4 md:space-y-6">
      <div className="space-y-2">
        <label className="block text-slate-400 dark:text-slate-400 font-black text-sm uppercase ml-2">일정 제목</label>
        <input 
          type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} 
          placeholder="예: 병원 방문" maxLength={50}
          className="w-full text-xl md:text-2xl p-4 md:p-5 bg-slate-50 dark:bg-slate-700 dark:text-white rounded-[1.2rem] md:rounded-[1.5rem] border-none font-black focus:ring-4 focus:ring-[#508A12]/30 transition-all shadow-inner" 
          autoFocus required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-xs font-black text-slate-400 ml-2">장소</label>
          <input type="text" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="어디서?" maxLength={30} className="w-full p-4 bg-slate-50 dark:bg-slate-700 dark:text-white rounded-[1rem] border-none font-bold text-lg shadow-inner" />
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
          placeholder="상세 내용을 적어주세요 (최대 500자)" rows={3} maxLength={500}
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
          <button type="button" onClick={() => { resetForm(); onCancel(); }} className="flex-1 py-4 md:py-5 bg-slate-100 dark:bg-slate-600 text-slate-500 dark:text-slate-300 rounded-[1.5rem] font-black text-lg active:scale-95 transition-all">취소</button>
        )}
        <button type="submit" disabled={isSaving} className="flex-[2] py-4 md:py-5 bg-[#508A12] text-white rounded-[1.5rem] font-black text-lg shadow-lg shadow-[#508A12]/30 active:scale-95 transition-all disabled:opacity-50">
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
      </div>
    </div>
  );

  // 로그인 화면
  if (!isAuthChecking && !user) {
    return (
      <div className="min-h-screen bg-[#F4F7F2] dark:bg-slate-900 flex flex-col items-center justify-center p-6 text-center transition-colors duration-300">
        <div className="bg-white dark:bg-slate-800 p-10 md:p-12 rounded-[3rem] shadow-xl max-w-md w-full border-t-[16px] border-[#508A12]">
          <CalendarDays className="text-[#508A12] mx-auto mb-6" size={72} strokeWidth={2} />
          <h1 className="text-4xl font-black text-slate-800 dark:text-white mb-3 tracking-tighter">나의 일정</h1>
          <p className="text-slate-500 dark:text-slate-400 font-bold mb-10 text-lg leading-relaxed">
            나만의 안전한 비공개 캘린더<br/><span className="text-sm opacity-80">구글 계정으로 안전하게 동기화됩니다.</span>
          </p>
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 py-5 bg-white dark:bg-slate-700 text-slate-800 dark:text-white rounded-[1.5rem] font-black text-xl shadow-md border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-8 h-8" />
            구글 계정으로 시작하기
          </button>
        </div>
      </div>
    );
  }

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-[#F4F7F2] dark:bg-slate-900 flex items-center justify-center">
        <RefreshCw className="animate-spin text-[#508A12] opacity-50" size={48} />
      </div>
    );
  }

  // 메인 앱
  return (
    <div className="min-h-screen bg-[#F4F7F2] dark:bg-slate-900 text-slate-900 dark:text-white font-sans pb-10 overflow-x-hidden transition-colors duration-300">
      {/* [수정 사항] 
        - 날짜가 "..." 으로 잘리는 현상 방지: 글자 크기 범위(clamp)의 최소값을 대폭 하향 조정 (14px)
        - 버튼 간격(gap) 및 버튼 내부 패딩(px)을 바짝 압축하여 왼쪽 글자가 차지할 공간 최대화 
      */}
      <header className="bg-white dark:bg-slate-800 shadow-[0_2px_15px_rgba(0,0,0,0.03)] sticky top-0 z-40 py-3 transition-colors duration-300">
        <div className="max-w-6xl mx-auto px-2 md:px-6 flex justify-between items-center gap-1">
          <div className="flex-1 overflow-hidden pr-0.5 flex items-center gap-1">
            <p className="text-slate-900 dark:text-white font-black text-[clamp(14px,3.8vw,36px)] tracking-tighter leading-none whitespace-nowrap overflow-hidden text-ellipsis">
              {isCalendarView ? `${calendarMonth.getFullYear()}년 ${calendarMonth.getMonth() + 1}월` : fullDateDisplay}
            </p>
            {linkedUid && <span className="hidden sm:inline-block bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400 text-[10px] md:text-sm font-bold px-1.5 py-0.5 rounded-md border border-orange-200 dark:border-orange-800 whitespace-nowrap">가족 연동됨</span>}
          </div>
          
          <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
            {/* 홈/달력 버튼 사이즈 압축 */}
            <button 
              onClick={() => {
                setIsCalendarView(!isCalendarView);
                setSelectedDate(todayStr); 
                setCalendarMonth(new Date());
              }}
              className="flex items-center justify-center min-w-[40px] px-2.5 py-1.5 md:px-5 md:py-2.5 bg-[#508A12] text-white rounded-full font-black text-[13px] md:text-lg active:scale-95 transition-all shadow-md"
            >
              {isCalendarView ? '홈' : '달력'}
            </button>
            
            {/* 가족연동 버튼 여백 압축 */}
            <button 
              onClick={() => setShowSettings(true)}
              className={`flex items-center justify-center px-2 py-1.5 md:px-3 md:py-2 rounded-full font-black transition-all ${linkedUid ? 'bg-orange-100 text-orange-600 hover:bg-orange-200' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-200'}`}
              title="가족 연동"
            >
              <Users size={14} className="md:w-4 md:h-4" />
              <span className="ml-0.5 text-[11px] md:text-xs whitespace-nowrap">{linkedUid ? '연동됨' : '가족연동'}</span>
            </button>

            {/* 로그아웃 버튼 여백 압축 */}
            <button 
              onClick={handleLogout}
              className="flex items-center justify-center p-1.5 md:px-3 md:py-2 rounded-full transition-all bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-400 hover:bg-slate-200"
              title="로그아웃"
            >
              <LogOut size={16} className="md:w-4 md:h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-3 md:px-6 pt-3 flex flex-col lg:flex-row gap-[clamp(0.75rem,2.5vh,1.5rem)]">
        
        {/* PC 전용 폼 & 휴지통 토글 */}
        <aside className="hidden lg:block w-[380px] flex-shrink-0">
          <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-6 shadow-sm sticky top-[100px] border border-slate-100 dark:border-slate-700 transition-colors duration-300">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                 {editingId ? <Edit2 className="text-amber-500" size={24} strokeWidth={3} /> : <Plus className="text-[#508A12]" size={24} strokeWidth={3} />} 
                 {editingId ? '일정 수정' : '새 일정 등록'}
              </h2>
            </div>
            {renderScheduleForm(editingId ? resetForm : null)}
          </div>
          
          <div className="mt-4 text-right">
             <button 
              onClick={() => { setShowTrash(!showTrash); setEditingId(null); setShowPast(false); setIsCalendarView(false); }}
              className={`inline-flex px-4 py-2.5 rounded-full font-black text-sm transition-all items-center gap-2 ${
                showTrash ? 'bg-slate-800 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300'
              }`}
            >
              {showTrash ? '목록으로 돌아가기' : <><Trash2 size={18}/> 삭제된 휴지통 보기</>}
            </button>
          </div>
        </aside>

        {/* 메인 리스트 및 달력 영역 */}
        <main className="flex-1 w-full">
          {isCalendarView && !showTrash && renderCalendar()}

          {isCalendarView && !showTrash && (
            <div className="mb-2 mt-1 px-1 flex justify-between items-end">
              <h3 className="text-[1.1rem] md:text-xl font-black text-[#508A12] dark:text-[#a5d85a] border-l-4 border-[#508A12] pl-2.5">
                {parseInt(selectedDate.split('-')[1])}월 {parseInt(selectedDate.split('-')[2])}일의 일정
              </h3>
            </div>
          )}

          {loading ? (
            <div className="py-20 text-center">
              <RefreshCw className="animate-spin mx-auto text-[#508A12] opacity-50" size={48} />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {displaySchedules.map((item) => (
                <div key={item.id} className={`bg-white dark:bg-slate-800 rounded-[1.2rem] md:rounded-[1.5rem] p-3.5 md:p-5 shadow-sm flex flex-col lg:flex-row justify-between items-start lg:items-center group transition-all gap-2 border ${showTrash ? 'border-red-100 dark:border-red-900 opacity-80' : 'border-slate-100 dark:border-slate-700'}`}>
                  <div className="flex-1 w-full">
                     <div className="mb-1.5 flex flex-wrap items-center gap-2">
                       <span className={`inline-block text-white font-black text-[clamp(0.9rem,3.5vw,1.1rem)] md:text-lg tracking-tight px-3 py-1 md:py-1.5 rounded-xl shadow-sm ${showTrash ? 'bg-slate-400 dark:bg-slate-600' : 'bg-[#508A12]'}`}>
                         {formatDateWithDay(item.startDate)}
                         {item.startDate !== item.endDate && ` ~ ${formatDateWithDay(item.endDate)}`}
                       </span>
                       {!showTrash && (
                         <span className={`font-black text-[clamp(0.85rem,3vw,1rem)] px-2.5 py-1 rounded-xl ${getDDay(item.startDate) === 'D-Day' ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400' : 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400'}`}>
                           {getDDay(item.startDate)}
                         </span>
                       )}
                     </div>

                     <h4 className={`text-[clamp(1.3rem,5vw,1.6rem)] md:text-[1.8rem] font-black leading-snug mb-1 tracking-tight break-keep ${showTrash ? 'text-slate-500 dark:text-slate-400 line-through' : 'text-slate-800 dark:text-slate-100'}`}>
                       {item.title}
                     </h4>
                     
                     <div className="flex flex-wrap gap-2.5 mt-1 mb-1">
                       {item.time && <p className="text-slate-700 dark:text-slate-300 font-black text-[clamp(1rem,4vw,1.2rem)] md:text-lg flex items-center gap-1.5"><Clock className={`w-[clamp(1rem,4.5vw,1.3rem)] h-[clamp(1rem,4.5vw,1.3rem)] ${showTrash ? 'text-slate-400' : 'text-[#508A12]'}`} strokeWidth={2.5} /> {item.time}</p>}
                       {item.location && <p className="text-slate-700 dark:text-slate-300 font-black text-[clamp(1rem,4vw,1.2rem)] md:text-lg flex items-center gap-1.5"><MapPin className={`w-[clamp(1rem,4.5vw,1.3rem)] h-[clamp(1rem,4.5vw,1.3rem)] ${showTrash ? 'text-slate-400' : 'text-[#508A12]'}`} strokeWidth={2.5} /> {item.location}</p>}
                     </div>

                     {item.content && (
                       <div className={`mt-2 p-3 md:p-3.5 rounded-xl border ${showTrash ? 'bg-slate-50 dark:bg-slate-700 border-slate-100 dark:border-slate-600' : 'bg-[#F4F7F2]/50 dark:bg-slate-700 border-[#EBF3E1] dark:border-slate-600'}`}>
                         <p className="text-slate-700 dark:text-slate-200 font-bold text-[clamp(0.95rem,3.5vw,1.1rem)] md:text-lg whitespace-pre-wrap leading-snug">{item.content}</p>
                       </div>
                     )}
                  </div>

                  <div className="hidden lg:flex flex-col gap-2 self-start">
                    {!showTrash ? (
                      <>
                        <button onClick={() => handleEditClick(item)} className="p-2.5 bg-amber-50 dark:bg-amber-900/30 text-amber-500 dark:text-amber-400 rounded-xl hover:bg-amber-500 hover:text-white transition-all shadow-sm" title="수정"><Edit2 size={20} /></button>
                        <button onClick={() => handleSoftDelete(item.id)} className="p-2.5 bg-red-50 dark:bg-red-900/30 text-red-400 dark:text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm" title="삭제"><Trash2 size={20} /></button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => handleRestore(item.id)} className="p-2.5 bg-emerald-50 text-emerald-500 rounded-xl hover:bg-emerald-500 hover:text-white transition-all shadow-sm" title="복구"><ArchiveRestore size={20} /></button>
                        <button onClick={() => handlePermanentDelete(item.id)} className="p-2.5 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-600 hover:text-white transition-all shadow-sm" title="영구 삭제"><Trash size={20} /></button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {displaySchedules.length === 0 && (
                <div className="py-8 text-center bg-white dark:bg-slate-800 rounded-[1.5rem] shadow-sm border border-slate-100 dark:border-slate-700 mx-2">
                  {showTrash ? (
                    <>
                      <Trash size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                      <p className="text-slate-400 dark:text-slate-500 font-black text-lg">휴지통이 비어있습니다</p>
                    </>
                  ) : (
                    <>
                      <CalendarDays size={40} className="mx-auto mb-3 text-[#508A12] opacity-40" />
                      <p className="text-slate-500 dark:text-slate-400 font-black text-[clamp(1.1rem,4vw,1.4rem)] mb-2">
                        {isCalendarView ? '이 날짜에는 등록된 일정이 없습니다.' : '예정된 일정이 없습니다.'}
                      </p>
                      {!linkedUid && !isCalendarView && (
                        <p className="text-sm font-bold text-slate-400 dark:text-slate-500 mt-2 px-4 break-keep">
                          💡 상단의 <strong className="text-[#508A12]">가족연동</strong> 버튼을 눌러 연동 코드를 입력하시면<br/>질문자님이 작성하신 일정을 바로 보실 수 있습니다.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {!loading && !showTrash && !isCalendarView && (
            <div className="mt-5 mb-4 flex flex-col items-center">
              <button 
                onClick={() => setShowPast(!showPast)}
                className="px-5 py-2 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full font-black text-[clamp(0.85rem,3.5vw,1rem)] shadow-sm active:scale-95 transition-all flex items-center gap-1.5"
              >
                {showPast ? '지난 일정 숨기기' : '지난 일정 보기'}
                {showPast ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>

              {showPast && (
                <div className="w-full mt-3 grid grid-cols-1 gap-2.5">
                  {pastSchedules.length > 0 ? pastSchedules.map((item) => (
                    <div key={item.id} className="bg-slate-50 dark:bg-slate-800 rounded-[1.2rem] p-3.5 shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col lg:flex-row justify-between items-start lg:items-center group gap-2.5 opacity-80 hover:opacity-100 transition-opacity">
                      <div className="flex-1 w-full">
                         <div className="mb-1.5 flex items-center gap-2">
                           <span className="inline-block text-white bg-slate-400 dark:bg-slate-600 font-black text-[clamp(0.85rem,3vw,1rem)] tracking-tight px-2.5 py-1 rounded-lg shadow-sm">
                             {formatDateWithDay(item.startDate)}
                             {item.startDate !== item.endDate && ` ~ ${formatDateWithDay(item.endDate)}`}
                           </span>
                           <span className="font-black text-[clamp(0.8rem,3vw,0.9rem)] px-2 py-0.5 rounded-lg bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                             {getDDay(item.startDate)}
                           </span>
                         </div>
                         <h4 className="text-[clamp(1.1rem,4vw,1.4rem)] font-black text-slate-700 dark:text-slate-300 leading-tight mb-1 tracking-tight break-keep">{item.title}</h4>
                         <div className="flex flex-wrap gap-2.5 my-1">
                           {item.time && <p className="text-slate-500 dark:text-slate-400 font-bold text-[clamp(0.9rem,3.5vw,1.1rem)] flex items-center gap-1"><Clock className="w-[clamp(0.9rem,3.5vw,1.1rem)] h-[clamp(0.9rem,3.5vw,1.1rem)] text-slate-400 dark:text-slate-500"/> {item.time}</p>}
                           {item.location && <p className="text-slate-500 dark:text-slate-400 font-bold text-[clamp(0.9rem,3.5vw,1.1rem)] flex items-center gap-1"><MapPin className="w-[clamp(0.9rem,3.5vw,1.1rem)] h-[clamp(0.9rem,3.5vw,1.1rem)] text-slate-400 dark:text-slate-500"/> {item.location}</p>}
                         </div>
                         {item.content && (
                           <div className="mt-1.5 bg-slate-100 dark:bg-slate-700 p-2.5 rounded-xl">
                             <p className="text-slate-500 dark:text-slate-300 font-bold text-[clamp(0.85rem,3vw,1rem)] whitespace-pre-wrap leading-snug">{item.content}</p>
                           </div>
                         )}
                      </div>
                      <div className="hidden lg:flex flex-col gap-1.5 self-start">
                        <button onClick={() => handleSoftDelete(item.id)} className="p-2.5 bg-red-50 dark:bg-red-900/30 text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm"><Trash2 size={18} /></button>
                      </div>
                    </div>
                  )) : (
                     <div className="py-5 text-center text-slate-400 dark:text-slate-500 font-bold text-[clamp(0.9rem,3.5vw,1.1rem)] bg-slate-50 dark:bg-slate-800 rounded-[1.2rem] border border-slate-200 dark:border-slate-700">
                      지난 일정이 없습니다.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* 가족 연동 설정 모달 */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 transition-all">
          {/* [수정] 모달 내용이 길어져 잘리는 현상 방지: max-h-[90vh] 와 overflow-y-auto 추가 */}
          <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-[2.5rem] p-5 md:p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
               <h2 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                 <Users className="text-[#508A12]" size={28} /> 가족 계정 연동
               </h2>
               <button onClick={() => setShowSettings(false)} className="p-2 bg-slate-100 dark:bg-slate-700 rounded-full text-slate-500 dark:text-slate-300 active:scale-90 transition-all">
                 <span className="font-bold px-2">닫기</span>
               </button>
            </div>

            <div className="space-y-5 md:space-y-6">
              <div className="bg-slate-50 dark:bg-slate-700/50 p-4 md:p-5 rounded-[1.5rem] border border-slate-100 dark:border-slate-600">
                <h3 className="font-black text-slate-700 dark:text-slate-200 mb-2">내 연동 코드</h3>
                <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-3 leading-relaxed break-keep">
                  이 핸드폰에서 아래 코드를 <span className="text-[#508A12]">[복사]</span>하여, 다른 폰(가족)에 붙여넣으시면 내 일정을 공유할 수 있습니다.
                </p>
                <div className="flex gap-2">
                  <input type="text" readOnly value={user?.uid || ''} className="flex-1 w-0 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono text-sm px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 outline-none" />
                  <button onClick={handleCopyCode} className="px-4 bg-[#508A12] text-white rounded-xl font-bold flex items-center gap-1.5 hover:bg-[#3E6B0E] transition-colors whitespace-nowrap">
                    {copySuccess ? <><Check size={18}/> 완료</> : <><Copy size={18}/> 복사</>}
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-700/50 p-4 md:p-5 rounded-[1.5rem] border border-slate-100 dark:border-slate-600">
                <h3 className="font-black text-slate-700 dark:text-slate-200 mb-2">가족 일정 불러오기</h3>
                
                {linkedUid ? (
                  <div>
                    <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-4 break-keep">
                      현재 가족의 일정과 완벽하게 연동되어 있습니다.<br/>(코드: <span className="font-mono text-[#508A12]">{linkedUid.slice(0,8)}...</span>)
                    </p>
                    <button onClick={handleUnlink} className="w-full py-4 bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 font-black rounded-xl hover:bg-red-200 transition-colors">
                      연동 해제하고 내 캘린더 보기
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-3 break-keep">
                      가족의 핸드폰에서 복사한 '연동 코드'를 아래 빈칸에 붙여넣으세요.
                    </p>
                    <input 
                      type="text" 
                      value={linkInput} 
                      onChange={(e) => setLinkInput(e.target.value)} 
                      placeholder="여기에 코드를 붙여넣으세요" 
                      className="w-full bg-white dark:bg-slate-800 text-slate-800 dark:text-white px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 mb-3 outline-none focus:border-[#508A12]"
                    />
                    <button onClick={handleLinkAccount} disabled={!linkInput.trim()} className="w-full py-4 bg-slate-800 text-white dark:bg-slate-600 font-black rounded-xl hover:bg-slate-700 transition-colors disabled:opacity-50">
                      일정 연동 시작하기
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
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
