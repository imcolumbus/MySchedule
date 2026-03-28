/**
 * [버전 정보]
 * v1.34.0 (2026-03-28)
 * - 상단 헤더 날짜 크기 상향: 시인성을 위해 가변 폰트 크기(vw)를 더 키워 극대화 (최대 42px)
 * - 시간 표시 형식 개선: 기존 'HH:mm' 형식을 '오전/오후 h:mm' 형식으로 변환하여 가독성 증대
 * - 배지 밀림 현상 방지: 날짜 텍스트와 오늘/D-Day 배지가 한 줄에 나란히 배치되도록 flex-nowrap 및 flex-shrink 설정 적용
 * - 카드 내부 요소 간격 미세 조정: 정보가 더 집약적으로 보이도록 마진값 최적화
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  getDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { 
  getAuth, 
  signInWithCustomToken, 
  signInAnonymously,
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
  Edit2,
  ArchiveRestore,
  Trash,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Info,
  XCircle,
  Lock,
  Unlock,
  Phone,
  Home
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

// 유틸리티 함수
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

// 시간 포맷팅 함수 (오전/오후 표시)
const formatTime = (timeStr) => {
  if (!timeStr) return '';
  const [hourStr, minStr] = timeStr.split(':');
  let hour = parseInt(hourStr);
  const ampm = hour < 12 ? '오전' : '오후';
  hour = hour % 12;
  hour = hour ? hour : 12; // 0시는 12시로 표시
  return `${ampm} ${hour}:${minStr}`;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showTrash, setShowTrash] = useState(false); 
  const [showPast, setShowPast] = useState(false); 
  const [errorModal, setErrorModal] = useState(null);

  // 보안(PIN) 관련 상태
  const [isPinChecked, setIsPinChecked] = useState(false);
  const [isPinAuthenticated, setIsPinAuthenticated] = useState(false);
  const [savedPin, setSavedPin] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  // 내비게이션 뷰 상태
  const [isCalendarView, setIsCalendarView] = useState(false);
  const [isFamilyView, setIsFamilyView] = useState(false); 
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(getLocalDateString(new Date()));

  const todayStr = getLocalDateString(new Date());

  // 가족 정보 상태
  const [familyInfo, setFamilyInfo] = useState(null);
  const [fAddress, setFAddress] = useState('');
  const [fContact1Name, setFContact1Name] = useState('');
  const [fContact1Phone, setFContact1Phone] = useState('');
  const [fContact2Name, setFContact2Name] = useState('');
  const [fContact2Phone, setFContact2Phone] = useState('');
  const [fContact3Name, setFContact3Name] = useState('');
  const [fContact3Phone, setFContact3Phone] = useState('');
  const [fContact4Name, setFContact4Name] = useState('');
  const [fContact4Phone, setFContact4Phone] = useState('');
  const [fMemo, setFMemo] = useState('');

  // D-Day 계산 함수
  const getDDay = (startDate) => {
    const todayDate = new Date(todayStr);
    const targetDate = new Date(startDate);
    const diffTime = targetDate.getTime() - todayDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return '오늘';
    if (diffDays > 0) return `D-${diffDays}`;
    return `D+${Math.abs(diffDays)}`;
  };

  // 1. 익명 로그인 자동 진행
  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          if (!auth.currentUser) {
            await signInAnonymously(auth);
          }
        }
      } catch (e) { console.error("Auth Init Fail:", e); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. 가족 비밀번호 및 정보 불러오기
  useEffect(() => {
    if (!user || !db) return;
    const settingsRef = doc(db, 'artifacts', appId, 'public', 'settings');
    const unsubscribe = onSnapshot(settingsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.familyPin) {
          setSavedPin(data.familyPin);
          if (localStorage.getItem(`pin_auth_${appId}`) === 'true') setIsPinAuthenticated(true);
        } else {
          setSavedPin(null);
        }
        if (data.familyData) {
          setFamilyInfo(data.familyData);
          setFAddress(data.familyData.address || '');
          setFContact1Name(data.familyData.contact1Name || '');
          setFContact1Phone(data.familyData.contact1Phone || '');
          setFContact2Name(data.familyData.contact2Name || '');
          setFContact2Phone(data.familyData.contact2Phone || '');
          setFContact3Name(data.familyData.contact3Name || '');
          setFContact3Phone(data.familyData.contact3Phone || '');
          setFContact4Name(data.familyData.contact4Name || '');
          setFContact4Phone(data.familyData.contact4Phone || '');
          setFMemo(data.familyData.memo || '');
        }
      }
      setIsPinChecked(true);
    }, (err) => {
      if (err.code === 'permission-denied') setErrorModal("데이터베이스 권한이 잠겨있습니다.");
      setIsPinChecked(true);
    });
    return () => unsubscribe();
  }, [user, db]);

  // 3. 일정 데이터 불러오기
  useEffect(() => {
    if (!user || !db || !isPinAuthenticated) return;
    const schedulesRef = collection(db, 'artifacts', appId, 'public', 'data', 'schedules');
    const unsubscribe = onSnapshot(schedulesRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSchedules(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user, db, isPinAuthenticated]);

  // 입력 핸들러 및 기타 로직
  const handlePinSubmit = async (e) => {
    e.preventDefault();
    if (pinInput.length !== 4) return;
    if (!savedPin) {
      try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'settings'), { familyPin: pinInput }, { merge: true });
        setSavedPin(pinInput); setIsPinAuthenticated(true);
        localStorage.setItem(`pin_auth_${appId}`, 'true'); 
      } catch (err) { setPinError("설정 저장 실패"); }
    } else {
      if (pinInput === savedPin) {
        setIsPinAuthenticated(true); localStorage.setItem(`pin_auth_${appId}`, 'true');
      } else { setPinError("비밀번호가 틀렸습니다."); setPinInput(''); }
    }
  };

  const handleSaveFamilyInfo = async (e) => {
    e.preventDefault();
    if (!db) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'settings'), {
        familyData: {
          address: fAddress,
          contact1Name: fContact1Name, contact1Phone: fContact1Phone,
          contact2Name: fContact2Name, contact2Phone: fContact2Phone,
          contact3Name: fContact3Name, contact3Phone: fContact3Phone,
          contact4Name: fContact4Name, contact4Phone: fContact4Phone,
          memo: fMemo
        }
      }, { merge: true });
      alert("우리집 정보가 저장되었습니다!");
    } finally { setIsSaving(false); }
  };

  // 일정 관련 상태 관리
  const [editingId, setEditingId] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newStartDate, setNewStartDate] = useState(todayStr);
  const [newEndDate, setNewEndDate] = useState('');
  const [isRange, setIsRange] = useState(false);

  const handleAddOrEditSchedule = async (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !db || isSaving || !user) return;
    setIsSaving(true);
    try {
      const scheduleData = { title: newTitle, content: newContent, location: newLocation, time: newTime, startDate: newStartDate, endDate: isRange ? newEndDate : newStartDate, author: user.uid, isDeleted: false };
      if (editingId) {
        scheduleData.updatedAt = serverTimestamp();
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'schedules', editingId), scheduleData);
      } else {
        scheduleData.createdAt = serverTimestamp();
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'schedules'), scheduleData);
      }
      resetForm();
    } finally { setIsSaving(false); }
  };

  const handleSoftDelete = async (id) => {
    if (!db || !user) return;
    if (confirm("이 일정을 휴지통으로 이동하시겠습니까?")) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'schedules', id), { isDeleted: true });
  };
  const handleRestore = async (id) => await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'schedules', id), { isDeleted: false });
  const handlePermanentDelete = async (id) => {
    if (confirm("완전히 삭제하시겠습니까?")) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'schedules', id));
  };
  const handleEditClick = (item) => {
    setNewTitle(item.title || ''); setNewContent(item.content || ''); setNewLocation(item.location || ''); setNewTime(item.time || ''); setNewStartDate(item.startDate);
    if (item.startDate !== item.endDate) { setIsRange(true); setNewEndDate(item.endDate); } else { setIsRange(false); setNewEndDate(''); }
    setEditingId(item.id); setShowTrash(false); window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const resetForm = () => { setNewTitle(''); setNewContent(''); setNewLocation(''); setNewTime(''); setNewStartDate(todayStr); setNewEndDate(''); setIsRange(false); setEditingId(null); };

  const activeSchedules = useMemo(() => schedules.filter(s => !s.isDeleted && (s.endDate || s.startDate) >= todayStr).sort((a, b) => new Date(a.startDate) - new Date(b.startDate)), [schedules, todayStr]);
  const pastSchedules = useMemo(() => schedules.filter(s => !s.isDeleted && (s.endDate || s.startDate) < todayStr).sort((a, b) => new Date(b.startDate) - new Date(a.startDate)), [schedules, todayStr]);
  const trashedSchedules = useMemo(() => schedules.filter(s => s.isDeleted).sort((a, b) => new Date(b.startDate) - new Date(a.startDate)), [schedules]);
  const calendarFilteredSchedules = useMemo(() => schedules.filter(s => !s.isDeleted && s.startDate <= selectedDate && (s.endDate || s.startDate) >= selectedDate), [schedules, selectedDate]);

  let displaySchedules = showTrash ? trashedSchedules : activeSchedules;
  if (isCalendarView && !showTrash) displaySchedules = calendarFilteredSchedules;

  // 뷰 컴포넌트
  const renderFamilyInfoView = () => (
    <div className="space-y-3 pb-6 mt-1">
      <div className="bg-white dark:bg-slate-800 p-4 rounded-[1.8rem] shadow-sm border border-slate-100">
         <h3 className="text-[#508A12] font-black text-lg mb-2 flex items-center gap-2"><MapPin size={22}/> 우리집 주소</h3>
         <p className="text-[clamp(1.2rem,5.5vw,1.6rem)] font-black text-slate-800 break-keep leading-snug">{familyInfo?.address || '주소가 없습니다.'}</p>
      </div>
      <div className="bg-white dark:bg-slate-800 p-4 rounded-[1.8rem] shadow-sm border border-slate-100">
         <h3 className="text-[#508A12] font-black text-lg mb-2 flex items-center gap-2"><Phone size={22}/> 바로 전화걸기</h3>
         <div className="space-y-2.5">
           {[1,2,3,4].map(num => {
              const name = familyInfo?.[`contact${num}Name`];
              const phone = familyInfo?.[`contact${num}Phone`];
              if (!name && !phone) return null;
              return (
                <a key={num} href={`tel:${phone}`} className="flex items-center justify-between p-3.5 bg-[#508A12] text-white rounded-[1.2rem] active:scale-95 shadow-md">
                   <div className="flex flex-col"><span className="text-[1.3rem] font-black">{name}</span><span className="text-base text-white/90 font-bold">{phone}</span></div>
                   <div className="bg-white/20 p-2 rounded-full"><Phone size={24} fill="currentColor" /></div>
                </a>
              )
           })}
         </div>
      </div>
      <div className="bg-white dark:bg-slate-800 p-4 rounded-[1.8rem] shadow-sm border border-slate-100">
         <h3 className="text-[#508A12] font-black text-lg mb-2 flex items-center gap-2"><Info size={22}/> 기억할 정보</h3>
         <div className="bg-slate-50 p-4 rounded-[1.2rem]"><p className="text-[1.1rem] font-bold text-slate-700 whitespace-pre-wrap leading-relaxed">{familyInfo?.memo || '내용이 없습니다.'}</p></div>
      </div>
    </div>
  );

  const renderCalendar = () => {
    const year = calendarMonth.getFullYear(); const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`);

    return (
      <div className="bg-white dark:bg-slate-800 p-2.5 rounded-[1.8rem] shadow-sm mb-3 border border-slate-100">
         <div className="flex justify-between items-center mb-2"><button onClick={() => setCalendarMonth(new Date(year, month - 1, 1))} className="p-1.5 bg-slate-50 rounded-full"><ChevronLeft size={24}/></button><h2 className="text-xl font-black">{year}년 {month + 1}월</h2><button onClick={() => setCalendarMonth(new Date(year, month + 1, 1))} className="p-1.5 bg-slate-50 rounded-full"><ChevronRight size={24}/></button></div>
         <div className="grid grid-cols-7 gap-1 mb-1.5 text-center">{['일', '월', '화', '수', '목', '금', '토'].map((wd, i) => (<div key={i} className={`text-xs font-black ${i===0 ? 'text-red-500' : i===6 ? 'text-blue-500' : 'text-slate-500'}`}>{wd}</div>))}</div>
         <div className="grid grid-cols-7 gap-1">
           {days.map((dateStr, idx) => {
             if (!dateStr) return <div key={`empty-${idx}`} />;
             const dayNum = parseInt(dateStr.split('-')[2]); const hasSchedule = schedules.some(s => !s.isDeleted && s.startDate <= dateStr && (s.endDate || s.startDate) >= dateStr);
             const isSelected = selectedDate === dateStr; const isToday = todayStr === dateStr;
             return (<button key={dateStr} onClick={() => setSelectedDate(dateStr)} className={`flex flex-col items-center justify-center rounded-[0.8rem] h-[3rem] transition-all relative ${isSelected ? 'bg-[#508A12] text-white' : hasSchedule ? 'bg-[#EBF3E1]' : 'bg-slate-50'}`}><span className={`text-lg font-black ${isSelected ? 'text-white' : isToday ? 'text-[#508A12]' : 'text-slate-700'}`}>{dayNum}</span>{hasSchedule && (<div className={`w-1 h-1 rounded-full mt-0.5 ${isSelected ? 'bg-white' : 'bg-[#508A12]'}`} />)}</button>);
           })}
         </div>
      </div>
    );
  };

  const renderFamilyInfoForm = () => (
    <form onSubmit={handleSaveFamilyInfo} className="space-y-4">
      <div className="space-y-2"><label className="block text-slate-400 font-black text-sm ml-1">우리집 주소</label><input type="text" value={fAddress} onChange={(e) => setFAddress(e.target.value)} placeholder="주소 입력" className="w-full p-4 bg-slate-50 rounded-[1rem] border-none font-bold text-base shadow-inner" /></div>
      <div className="space-y-2"><label className="block text-slate-400 font-black text-sm ml-1">가족 연락처 (4명)</label>
        {[1,2,3,4].map(num => {
          const nameValue = num === 1 ? fContact1Name : num === 2 ? fContact2Name : num === 3 ? fContact3Name : fContact4Name;
          const phoneValue = num === 1 ? fContact1Phone : num === 2 ? fContact2Phone : num === 3 ? fContact3Phone : fContact4Phone;
          return (<div key={num} className="flex gap-2"><input type="text" value={nameValue} onChange={(e) => { if(num===1) setFContact1Name(e.target.value); if(num===2) setFContact2Name(e.target.value); if(num===3) setFContact3Name(e.target.value); if(num===4) setFContact4Name(e.target.value); }} placeholder="이름" className="w-1/3 p-3 bg-slate-50 rounded-[0.8rem] border-none font-bold" /><input type="tel" value={phoneValue} onChange={(e) => { if(num===1) setFContact1Phone(e.target.value); if(num===2) setFContact2Phone(e.target.value); if(num===3) setFContact3Phone(e.target.value); if(num===4) setFContact4Phone(e.target.value); }} placeholder="전화번호" className="flex-1 p-3 bg-slate-50 rounded-[0.8rem] border-none font-bold" /></div>)
        })}
      </div>
      <div className="space-y-2"><label className="block text-slate-400 font-black text-sm ml-1">기억할 정보</label><textarea value={fMemo} onChange={(e) => setFMemo(e.target.value)} placeholder="메모 입력" rows={4} className="w-full p-4 bg-slate-50 rounded-[1rem] border-none font-bold text-base shadow-inner resize-none" /></div>
      <button type="submit" disabled={isSaving} className="w-full py-4 bg-[#508A12] text-white rounded-[1.2rem] font-black text-lg shadow-md active:scale-95 disabled:opacity-50">{isSaving ? '저장 중...' : '반영하기'}</button>
    </form>
  );

  const renderScheduleForm = (onCancel) => (
    <form onSubmit={handleAddOrEditSchedule} className="space-y-4">
      <div className="space-y-1"><label className="block text-slate-400 font-black text-xs ml-1">일정 제목</label><input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="예: 병원 방문" maxLength={50} className="w-full text-lg p-4 bg-slate-50 rounded-[1rem] border-none font-black shadow-inner" autoFocus required /></div>
      <div className="grid grid-cols-2 gap-2"><div className="space-y-1"><label className="text-xs font-black text-slate-400 ml-1">장소</label><input type="text" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="장소" className="w-full p-3 bg-slate-50 rounded-[0.8rem] border-none font-bold" /></div><div className="space-y-1"><label className="text-xs font-black text-slate-400 ml-1">시간</label><input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="w-full p-3 bg-slate-50 rounded-[0.8rem] border-none font-bold" /></div></div>
      <div className="space-y-1"><label className="text-xs font-black text-slate-400 ml-1">메모</label><textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} placeholder="상세 내용" rows={3} className="w-full p-4 bg-slate-50 rounded-[1rem] border-none font-bold shadow-inner resize-none" /></div>
      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-[1rem]"><span className="font-black text-sm text-slate-700">여러 날 일정</span><button type="button" onClick={() => setIsRange(!isRange)} className={`w-12 h-6 rounded-full relative transition-all ${isRange ? 'bg-[#508A12]' : 'bg-slate-300'}`}><div className={`absolute top-0.5 bg-white w-5 h-5 rounded-full transition-transform ${isRange ? 'translate-x-6.5' : 'translate-x-0.5'}`} /></button></div>
      <div className="grid grid-cols-1 gap-2"><input type="date" value={newStartDate} onChange={(e) => setNewStartDate(e.target.value)} className="w-full p-3 bg-slate-50 rounded-[0.8rem] border-none font-bold" />{isRange && (<input type="date" value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)} className="w-full p-3 bg-slate-50 rounded-[0.8rem] border-none font-bold" />)}</div>
      <div className="flex gap-2 pt-1">{onCancel && (<button type="button" onClick={() => { resetForm(); onCancel(); }} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-[1rem] font-black">취소</button>)}<button type="submit" disabled={isSaving} className="flex-[2] py-4 bg-[#508A12] text-white rounded-[1rem] font-black text-lg shadow-md active:scale-95 disabled:opacity-50">{isSaving ? '저장 중...' : (editingId ? '수정완료' : '등록하기')}</button></div>
    </form>
  );

  return (
    <div className="min-h-screen bg-[#F4F7F2] dark:bg-slate-900 text-slate-900 font-sans pb-10 overflow-x-hidden">
      <header className="bg-white shadow-sm sticky top-0 z-40 py-2.5 px-3">
        <div className="max-w-6xl mx-auto flex justify-between items-center gap-2">
          {/* 상단 날짜 폰트 사이즈 상향 (최대 42px) */}
          <div className="flex-1 overflow-hidden pr-0.5">
            <p className="text-slate-900 font-black text-[clamp(22px,7.2vw,42px)] tracking-tighter leading-none whitespace-nowrap overflow-hidden text-ellipsis">
              {isFamilyView ? '우리집 정보' : isCalendarView ? `${calendarMonth.getFullYear()}년 ${calendarMonth.getMonth() + 1}월` : fullDateDisplay}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {!isFamilyView && (<button onClick={() => { setIsFamilyView(true); setIsCalendarView(false); }} className="px-2.5 py-1.5 bg-[#EBF3E1] text-[#508A12] rounded-full font-black text-sm border border-[#508A12]/20 whitespace-nowrap">집</button>)}
            <button onClick={() => { if (isFamilyView) { setIsFamilyView(false); } else { setIsCalendarView(!isCalendarView); setSelectedDate(todayStr); setCalendarMonth(new Date()); } }} className="px-2.5 py-1.5 bg-[#508A12] text-white rounded-full font-black text-sm shadow-md whitespace-nowrap">{isFamilyView ? '홈' : isCalendarView ? '홈' : '달력'}</button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-3 pt-3 flex flex-col lg:flex-row gap-4">
        <aside className="hidden lg:block w-[380px] flex-shrink-0">
          <div className="bg-white rounded-[2rem] p-6 shadow-sm sticky top-[80px] border border-slate-100">
            <h2 className="text-xl font-black text-slate-800 mb-4 flex items-center gap-2">{isFamilyView ? <Home size={24} /> : editingId ? <Edit2 size={24} /> : <Plus size={24} />} {isFamilyView ? '우리집 정보 저장' : editingId ? '일정 수정' : '새 일정 등록'}</h2>
            {isFamilyView ? renderFamilyInfoForm() : renderScheduleForm(editingId ? resetForm : null)}
          </div>
        </aside>

        <main className="flex-1 w-full">
          {isFamilyView ? renderFamilyInfoView() : (
            <>
              {isCalendarView && !showTrash && renderCalendar()}
              {isCalendarView && !showTrash && (
                <div className="mb-2 mt-1 px-1"><h3 className="text-lg font-black text-[#508A12] border-l-4 border-[#508A12] pl-2.5">{parseInt(selectedDate.split('-')[1])}월 {parseInt(selectedDate.split('-')[2])}일의 일정</h3></div>
              )}

              <div className="grid grid-cols-1 gap-3">
                {displaySchedules.map((item) => (
                  <div key={item.id} className="bg-white rounded-[1.5rem] p-4 shadow-sm flex flex-col group gap-2 border border-slate-100">
                    <div className="flex-1 w-full">
                       {/* 배지 밀림 현상 방지를 위한 레이아웃 고정 */}
                       <div className="mb-1.5 flex flex-nowrap items-center justify-between gap-2 overflow-hidden">
                         <span className="inline-block text-white font-black text-[clamp(0.9rem,3.2vw,1.1rem)] px-3 py-1 rounded-xl shadow-sm bg-[#508A12] whitespace-nowrap truncate">
                           {formatDateWithDay(item.startDate)} {item.startDate !== item.endDate && ` ~ ${formatDateWithDay(item.endDate)}`}
                         </span>
                         {!showTrash && (
                           <span className={`flex-shrink-0 font-black text-sm px-2.5 py-1 rounded-xl whitespace-nowrap ${getDDay(item.startDate) === '오늘' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
                             {getDDay(item.startDate)}
                           </span>
                         )}
                       </div>
                       <h4 className="text-[clamp(1.4rem,5.5vw,1.8rem)] font-black leading-snug mb-1 tracking-tight break-keep text-slate-800">
                         {item.title}
                       </h4>
                       <div className="flex flex-wrap gap-3 mt-1 mb-1">
                         {item.time && <p className="text-slate-700 font-black text-lg flex items-center gap-1.5"><Clock size={18} /> {formatTime(item.time)}</p>}
                         {item.location && <p className="text-slate-700 font-black text-lg flex items-center gap-1.5"><MapPin size={18} /> {item.location}</p>}
                       </div>
                       {item.content && (
                         <div className="mt-2 p-3 rounded-xl border bg-[#F4F7F2]/50 border-[#EBF3E1]">
                           <p className="text-slate-700 font-bold text-lg leading-snug line-clamp-2">{item.content}</p>
                         </div>
                       )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

const initRender = () => {
  const container = document.getElementById('root');
  const root = createRoot(container || document.body.appendChild(Object.assign(document.createElement('div'), {id: 'root'})));
  root.render(<App />);
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initRender); else initRender();
