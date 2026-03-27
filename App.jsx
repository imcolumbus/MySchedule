/**
 * [버전 정보]
 * v1.30.0 (2026-03-28)
 * - 우리집 정보(가족 정보) 레이아웃 압축: 화면에 더 많은 정보가 들어오도록 카드 상하 패딩(p) 및 요소 간 여백(space-y, mb) 대폭 축소
 * - 주소 텍스트 크기 조정: 주소가 너무 커서 3~4줄로 낭비되지 않도록 글자 크기를 줄여 1~2줄로 깔끔하게 표시되게 수정
 * - 가족 연락처 추가: 기존 3명에서 최대 4명까지 등록할 수 있도록 상태 및 입력 폼 확장
 * - 타이틀 수정: '기억할 정보 (가족 생일 등)' ➡️ '기억할 정보' 로 단순화
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
  const [isFamilyView, setIsFamilyView] = useState(false); // [집] 메뉴 상태 추가
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(getLocalDateString(new Date()));

  const todayStr = getLocalDateString(new Date());

  // 가족 정보 상태
  const [familyInfo, setFamilyInfo] = useState(null);
  
  // 가족 정보 에디터 폼 상태 (PC용) - 4명으로 확장
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
    
    if (diffDays === 0) return 'D-Day';
    if (diffDays > 0) return `D-${diffDays}`;
    return `D+${Math.abs(diffDays)}`;
  };

  // 일정 입력 폼 상태
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
      } catch (e) { 
        console.error("Auth Init Fail:", e);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // 2. 가족 비밀번호(PIN) 및 집(가족) 정보 불러오기
  useEffect(() => {
    if (!user || !db) return;
    const checkSettings = async () => {
      try {
        const settingsRef = doc(db, 'artifacts', appId, 'public', 'settings');
        // onSnapshot으로 변경하여 실시간 업데이트 반영
        const unsubscribe = onSnapshot(settingsRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            // PIN 설정 적용
            if (data.familyPin) {
              setSavedPin(data.familyPin);
              if (localStorage.getItem(`pin_auth_${appId}`) === 'true') {
                setIsPinAuthenticated(true);
              }
            } else {
              setSavedPin(null);
            }
            
            // 가족 정보 적용 (PC에서 입력한 내용이 폰으로 실시간 반영)
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
          console.error("Settings Check Error:", err);
          if (err.code === 'permission-denied') {
            setErrorModal("데이터베이스 권한이 잠겨있습니다.\nFirebase 콘솔의 [Firestore Database] -> [규칙] 탭에서 'allow read, write: if request.auth != null;' 로 권한을 설정해주세요.");
          }
          setIsPinChecked(true);
        });
        
        return () => unsubscribe();
      } catch (err) {
        console.error(err);
      }
    };
    checkSettings();
  }, [user, db]);

  // 3. (인증 완료 시) 일정 데이터 불러오기
  useEffect(() => {
    if (!user || !db || !isPinAuthenticated) return;
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
  }, [user, db, isPinAuthenticated]);

  // PIN 설정 및 확인 핸들러
  const handlePinSubmit = async (e) => {
    e.preventDefault();
    if (pinInput.length !== 4) {
      setPinError("비밀번호는 4자리 숫자로 입력해주세요.");
      return;
    }

    if (!savedPin) {
      try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'settings'), { familyPin: pinInput }, { merge: true });
        setSavedPin(pinInput);
        setIsPinAuthenticated(true);
        localStorage.setItem(`pin_auth_${appId}`, 'true'); 
      } catch (err) {
        setPinError("설정 저장 실패: 권한을 확인해주세요.");
      }
    } else {
      if (pinInput === savedPin) {
        setIsPinAuthenticated(true);
        localStorage.setItem(`pin_auth_${appId}`, 'true');
      } else {
        setPinError("비밀번호가 틀렸습니다. 다시 시도해주세요.");
        setPinInput('');
      }
    }
  };

  // 가족 정보 저장 핸들러 (PC 전용 폼) - 4명 저장
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
      alert("우리집 정보가 저장되었습니다! 어머니 폰에 실시간으로 반영됩니다.");
    } catch(e) {
       console.error("가족 정보 저장 실패:", e);
       alert("저장에 실패했습니다. 권한을 확인해주세요.");
    } finally {
      setIsSaving(false);
    }
  };

  // 일정 저장/삭제 관련 핸들러
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
    } catch (err) { 
      console.error("Save Fail:", err); 
    } finally {
      setIsSaving(false);
    }
  };

  const handleSoftDelete = async (id) => {
    if (!db || !user) return;
    if (confirm("이 일정을 휴지통으로 이동하시겠습니까?")) {
      try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'schedules', id), { isDeleted: true });
        if (editingId === id) resetForm();
      } catch (err) { console.error("Trash Fail:", err); }
    }
  };

  const handleRestore = async (id) => {
    if (!db || !user) return;
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'schedules', id), { isDeleted: false });
    } catch (err) { console.error("Restore Fail:", err); }
  };

  const handlePermanentDelete = async (id) => {
    if (!db || !user) return;
    if (confirm("이 일정을 완전히 삭제하시겠습니까? 복구할 수 없습니다.")) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'schedules', id));
      } catch (err) { console.error("Delete Fail:", err); }
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

  const calendarFilteredSchedules = useMemo(() => {
    return schedules.filter(s => !s.isDeleted && s.startDate <= selectedDate && (s.endDate || s.startDate) >= selectedDate);
  }, [schedules, selectedDate]);

  let displaySchedules = showTrash ? trashedSchedules : activeSchedules;
  if (isCalendarView && !showTrash) displaySchedules = calendarFilteredSchedules;

  // ----------------------------------------------------
  // 모바일 전용: '집 (우리집 정보)' 화면 렌더링 - 압축된 레이아웃
  // ----------------------------------------------------
  const renderFamilyInfoView = () => (
    <div className="space-y-3 md:space-y-4 pb-6 mt-1">
      {/* 1. 집 주소 */}
      <div className="bg-white dark:bg-slate-800 p-4 md:p-6 rounded-[1.8rem] md:rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-700">
         <h3 className="text-[#508A12] font-black text-[1.3rem] md:text-xl mb-2 flex items-center gap-2">
           <MapPin size={24} strokeWidth={2.5}/> 우리집 주소
         </h3>
         {/* 글자 크기를 줄여 2줄 이내로 깔끔하게 떨어지도록 유도 */}
         <p className="text-[clamp(1.2rem,5vw,1.5rem)] md:text-2xl font-black text-slate-800 dark:text-white break-keep leading-snug">
           {familyInfo?.address || '아직 등록된 주소가 없습니다.\n(PC에서 입력해주세요)'}
         </p>
      </div>
      
      {/* 2. 원터치 가족 연락처 */}
      <div className="bg-white dark:bg-slate-800 p-4 md:p-6 rounded-[1.8rem] md:rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-700">
         <h3 className="text-[#508A12] font-black text-[1.3rem] md:text-xl mb-2 flex items-center gap-2">
           <Phone size={24} strokeWidth={2.5}/> 바로 전화걸기
         </h3>
         <div className="space-y-2.5 md:space-y-3">
           {/* 연락처 4개까지 지원 */}
           {[1,2,3,4].map(num => {
              const name = familyInfo?.[`contact${num}Name`];
              const phone = familyInfo?.[`contact${num}Phone`];
              if (!name && !phone) return null;
              
              return (
                <a key={num} href={`tel:${phone}`} className="flex items-center justify-between p-3.5 md:p-4 bg-[#508A12] hover:bg-[#3E6B0E] text-white rounded-[1.2rem] md:rounded-[1.5rem] active:scale-95 transition-all shadow-md group">
                   <div className="flex flex-col">
                     {/* 이름 크기 약간 축소 */}
                     <span className="text-[1.4rem] md:text-2xl font-black">{name}</span>
                     <span className="text-base md:text-lg text-white/90 font-bold mt-0.5">{phone}</span>
                   </div>
                   <div className="bg-white/20 p-2.5 md:p-3 rounded-full group-active:bg-white/30 transition-colors">
                     <Phone size={28} className="text-white" fill="currentColor" />
                   </div>
                </a>
              )
           })}
           {(!familyInfo?.contact1Name && !familyInfo?.contact2Name && !familyInfo?.contact3Name && !familyInfo?.contact4Name) && (
             <p className="text-slate-500 font-bold text-base md:text-lg">등록된 연락처가 없습니다.</p>
           )}
         </div>
      </div>

      {/* 3. 생일 및 가족 메모 */}
      <div className="bg-white dark:bg-slate-800 p-4 md:p-6 rounded-[1.8rem] md:rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-700">
         {/* 타이틀 축소 */}
         <h3 className="text-[#508A12] font-black text-[1.3rem] md:text-xl mb-2 flex items-center gap-2">
           <Info size={24} strokeWidth={2.5}/> 기억할 정보
         </h3>
         <div className="bg-slate-50 dark:bg-slate-700 p-4 rounded-[1.2rem] md:rounded-[1.5rem]">
           <p className="text-[1.1rem] md:text-xl font-bold text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
             {familyInfo?.memo || '등록된 내용이 없습니다.'}
           </p>
         </div>
      </div>
    </div>
  );

  // ----------------------------------------------------
  // 달력 화면 렌더링
  // ----------------------------------------------------
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

  // ----------------------------------------------------
  // PC 전용: '가족 정보 입력' 폼 (isFamilyView 상태일 때 표시) - 4명 지원
  // ----------------------------------------------------
  const renderFamilyInfoForm = () => (
    <form onSubmit={handleSaveFamilyInfo} className="space-y-4 md:space-y-6">
      <div className="bg-orange-50 dark:bg-slate-700/50 p-4 rounded-2xl mb-4 border border-orange-100 dark:border-slate-600">
        <p className="text-orange-700 dark:text-orange-300 font-bold text-sm leading-relaxed">
          여기에 입력하신 정보는 어머니 스마트폰의 <strong className="text-[#508A12]">[집]</strong> 메뉴에 실시간으로 나타납니다.
        </p>
      </div>

      <div className="space-y-2">
        <label className="block text-slate-400 font-black text-sm ml-2">우리집 주소</label>
        <input 
          type="text" value={fAddress} onChange={(e) => setFAddress(e.target.value)} 
          placeholder="예: 서울시 강남구 삼성동..." maxLength={100}
          className="w-full p-4 bg-slate-50 dark:bg-slate-700 dark:text-white rounded-[1.2rem] border-none font-bold text-lg shadow-inner focus:ring-4 focus:ring-[#508A12]/30 transition-all" 
        />
      </div>

      <div className="space-y-3">
        <label className="block text-slate-400 font-black text-sm ml-2">가족 연락처 최대 4명 (원터치 다이얼)</label>
        {[1,2,3,4].map(num => {
          const nameValue = num === 1 ? fContact1Name : num === 2 ? fContact2Name : num === 3 ? fContact3Name : fContact4Name;
          const phoneValue = num === 1 ? fContact1Phone : num === 2 ? fContact2Phone : num === 3 ? fContact3Phone : fContact4Phone;
          
          return (
          <div key={num} className="flex gap-2">
            <input 
              type="text" 
              value={nameValue} 
              onChange={(e) => {
                if(num===1) setFContact1Name(e.target.value);
                if(num===2) setFContact2Name(e.target.value);
                if(num===3) setFContact3Name(e.target.value);
                if(num===4) setFContact4Name(e.target.value);
              }} 
              placeholder="이름 (예: 큰아들)" maxLength={15}
              className="w-1/3 p-4 bg-slate-50 dark:bg-slate-700 dark:text-white rounded-[1rem] border-none font-bold shadow-inner text-base" 
            />
            <input 
              type="tel" 
              value={phoneValue} 
              onChange={(e) => {
                if(num===1) setFContact1Phone(e.target.value);
                if(num===2) setFContact2Phone(e.target.value);
                if(num===3) setFContact3Phone(e.target.value);
                if(num===4) setFContact4Phone(e.target.value);
              }} 
              placeholder="전화번호 (예: 010-1234-5678)" maxLength={20}
              className="flex-1 p-4 bg-slate-50 dark:bg-slate-700 dark:text-white rounded-[1rem] border-none font-bold shadow-inner text-base" 
            />
          </div>
        )})}
      </div>

      <div className="space-y-2">
         <label className="block text-slate-400 font-black text-sm ml-2">기억할 정보</label>
         <textarea 
          value={fMemo} onChange={(e) => setFMemo(e.target.value)} 
          placeholder="어머니께서 꼭 기억하셔야 할 내용들을 메모해 주세요." rows={5} maxLength={1000}
          className="w-full p-4 md:p-5 bg-slate-50 dark:bg-slate-700 dark:text-white rounded-[1.2rem] border-none font-bold text-lg shadow-inner resize-none focus:ring-4 focus:ring-[#508A12]/30 transition-all" 
        />
      </div>

      <button type="submit" disabled={isSaving} className="w-full py-4 md:py-5 bg-[#508A12] text-white rounded-[1.5rem] font-black text-lg shadow-lg shadow-[#508A12]/30 active:scale-95 transition-all disabled:opacity-50">
        {isSaving ? '저장 중...' : '가족 정보 반영하기'}
      </button>
    </form>
  );

  // ----------------------------------------------------
  // PC 전용: '일정 입력' 폼
  // ----------------------------------------------------
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

  // 에러 모달 공통 컴포넌트
  if (errorModal) {
    return (
      <div className="min-h-screen bg-[#F4F7F2] dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-[2.5rem] p-6 md:p-8 shadow-2xl text-center border-t-[12px] border-red-500">
          <XCircle className="text-red-500 mx-auto mb-4" size={64} />
          <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-4">데이터베이스 잠김</h2>
          <p className="text-slate-600 dark:text-slate-300 font-bold mb-6 whitespace-pre-wrap leading-relaxed text-[15px]">
            {errorModal}
          </p>
          <div className="bg-slate-50 dark:bg-slate-700 p-4 rounded-2xl text-left">
            <p className="text-sm text-slate-500 dark:text-slate-400 font-bold leading-relaxed break-keep">
              💡 <strong className="text-red-500">해결 방법 (Firebase 규칙 수정):</strong><br/>
              1. Firebase 콘솔 ➡️ [Firestore Database] 메뉴<br/>
              2. 상단의 [규칙 (Rules)] 탭 선택<br/>
              3. 아래 코드로 변경 후 '게시' 클릭<br/>
              <code className="block mt-2 bg-white dark:bg-slate-800 p-2 rounded text-red-500 font-mono text-xs">
                allow read, write: if request.auth != null;
              </code>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 데이터베이스 초기화 대기 화면
  if (!app || !isPinChecked) {
    return (
      <div className="min-h-screen bg-[#F4F7F2] dark:bg-slate-900 flex items-center justify-center">
        <RefreshCw className="animate-spin text-[#508A12] opacity-50" size={48} />
      </div>
    );
  }

  // 🔒 가족 비밀번호(PIN) 잠금 화면 렌더링
  if (!isPinAuthenticated) {
    return (
      <div className="min-h-screen bg-[#F4F7F2] dark:bg-slate-900 flex items-center justify-center p-6 text-center transition-colors duration-300">
        <div className="bg-white dark:bg-slate-800 p-8 md:p-12 rounded-[3rem] shadow-xl max-w-md w-full border-t-[16px] border-[#508A12]">
          
          {savedPin ? (
            <Lock className="text-[#508A12] mx-auto mb-6" size={64} strokeWidth={2} />
          ) : (
            <Unlock className="text-[#508A12] mx-auto mb-6" size={64} strokeWidth={2} />
          )}
          
          <h1 className="text-3xl font-black text-slate-800 dark:text-white mb-3">
            {savedPin ? '우리 가족 일정' : '초기 설정'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-bold mb-8 text-[15px] leading-relaxed break-keep">
            {savedPin 
              ? '안전한 일정 공유를 위해\n가족 비밀번호 4자리를 입력해주세요.' 
              : '외부인이 일정을 볼 수 없도록\n가족끼리 사용할 비밀번호 4자리를 설정하세요.'}
          </p>

          <form onSubmit={handlePinSubmit}>
            <input 
              type="password" 
              pattern="[0-9]*" 
              inputMode="numeric"
              maxLength={4}
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value.replace(/[^0-9]/g, '')); // 숫자만 입력 허용
                setPinError('');
              }}
              placeholder="0000"
              className="w-full text-center text-4xl tracking-[1em] p-6 bg-slate-50 dark:bg-slate-700 dark:text-white rounded-[1.5rem] border-none font-black focus:ring-4 focus:ring-[#508A12]/30 transition-all shadow-inner mb-4"
              autoFocus
            />
            {pinError && <p className="text-red-500 font-bold mb-4 text-sm">{pinError}</p>}
            
            <button 
              type="submit" 
              disabled={pinInput.length !== 4}
              className="w-full py-5 bg-[#508A12] text-white rounded-[1.5rem] font-black text-xl shadow-lg shadow-[#508A12]/30 active:scale-95 transition-all disabled:opacity-50"
            >
              {savedPin ? '비밀번호 확인' : '비밀번호 저장하고 시작하기'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 메인 화면 로딩 대기
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F7F2] dark:bg-slate-900 flex flex-col items-center justify-center">
        <RefreshCw className="animate-spin text-[#508A12] opacity-50 mb-4" size={48} />
        <p className="text-slate-500 font-bold">비밀번호 확인 완료. 일정을 불러옵니다...</p>
      </div>
    );
  }

  // 메인 앱
  return (
    <div className="min-h-screen bg-[#F4F7F2] dark:bg-slate-900 text-slate-900 dark:text-white font-sans pb-10 overflow-x-hidden transition-colors duration-300">
      <header className="bg-white dark:bg-slate-800 shadow-[0_2px_15px_rgba(0,0,0,0.03)] sticky top-0 z-40 py-3 transition-colors duration-300">
        <div className="max-w-6xl mx-auto px-3 md:px-6 flex justify-between items-center gap-1">
          {/* 상단 날짜 폰트 사이즈를 더 키울 수 있도록 넓은 범위(clamp) 허용 */}
          <div className="flex-1 overflow-hidden pr-0.5 flex items-center gap-1">
            <p className="text-slate-900 dark:text-white font-black text-[clamp(18px,6.5vw,40px)] tracking-tighter leading-none whitespace-nowrap overflow-hidden text-ellipsis">
              {isFamilyView ? '우리집 정보' : isCalendarView ? `${calendarMonth.getFullYear()}년 ${calendarMonth.getMonth() + 1}월` : fullDateDisplay}
            </p>
          </div>
          
          <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
            {!isFamilyView && (
              <button 
                onClick={() => {
                  setIsFamilyView(true);
                  setIsCalendarView(false);
                }}
                className="flex items-center justify-center min-w-[36px] px-3.5 py-1.5 md:px-5 md:py-2.5 bg-[#EBF3E1] text-[#508A12] rounded-full font-black text-[14px] md:text-lg active:scale-95 transition-all shadow-sm border border-[#508A12]/20"
              >
                집
              </button>
            )}

            {/* 글자를 "홈으로" -> "홈", "달력보기" -> "달력" 으로 축소하여 여백 확보 */}
            <button 
              onClick={() => {
                if (isFamilyView) {
                  setIsFamilyView(false);
                } else {
                  setIsCalendarView(!isCalendarView);
                  setSelectedDate(todayStr); 
                  setCalendarMonth(new Date());
                }
              }}
              className="flex items-center justify-center min-w-[36px] px-3.5 py-1.5 md:px-5 md:py-2.5 bg-[#508A12] text-white rounded-full font-black text-[14px] md:text-lg active:scale-95 transition-all shadow-md"
            >
              {isFamilyView ? '홈' : isCalendarView ? '홈' : '달력'}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-3 md:px-6 pt-3 flex flex-col lg:flex-row gap-[clamp(0.75rem,2.5vh,1.5rem)]">
        
        {/* PC 전용 사이드바 (집 뷰일때는 폼 변경) */}
        <aside className="hidden lg:block w-[380px] flex-shrink-0">
          <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-6 shadow-sm sticky top-[100px] border border-slate-100 dark:border-slate-700 transition-colors duration-300">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                 {isFamilyView ? <Home className="text-[#508A12]" size={24} strokeWidth={3} /> : editingId ? <Edit2 className="text-amber-500" size={24} strokeWidth={3} /> : <Plus className="text-[#508A12]" size={24} strokeWidth={3} />} 
                 {isFamilyView ? '우리집 정보 저장' : editingId ? '일정 수정' : '새 일정 등록'}
              </h2>
            </div>
            {isFamilyView ? renderFamilyInfoForm() : renderScheduleForm(editingId ? resetForm : null)}
          </div>
          
          {!isFamilyView && (
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
          )}
        </aside>

        {/* 메인 리스트 / 달력 / 가족정보 영역 */}
        <main className="flex-1 w-full">
          {/* 집 메뉴 뷰 */}
          {isFamilyView ? (
            renderFamilyInfoView()
          ) : (
            // 기본 일정 뷰
            <>
              {isCalendarView && !showTrash && renderCalendar()}

              {isCalendarView && !showTrash && (
                <div className="mb-2 mt-1 px-1 flex justify-between items-end">
                  <h3 className="text-[1.1rem] md:text-xl font-black text-[#508A12] dark:text-[#a5d85a] border-l-4 border-[#508A12] pl-2.5">
                    {parseInt(selectedDate.split('-')[1])}월 {parseInt(selectedDate.split('-')[2])}일의 일정
                  </h3>
                </div>
              )}

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
                           {/* 메모가 넘치면 말줄임표 처리되도록 line-clamp-2 유지 */}
                           <p className="text-slate-700 dark:text-slate-200 font-bold text-[clamp(0.95rem,3.5vw,1.1rem)] md:text-lg whitespace-pre-wrap leading-snug line-clamp-2">{item.content}</p>
                         </div>
                       )}
                    </div>

                    <div className="hidden lg:flex flex-col gap-2 self-start">
                      {!showTrash ? (
                        <>
                          <button onClick={() => handleEditClick(item)} className="p-2.5 bg-amber-50 dark:bg-amber-900/30 text-amber-500 dark:text-amber-400 rounded-xl hover:bg-amber-500 hover:text-white transition-all shadow-sm" title="수정"><Edit2 size={20} /></button>
                          <button onClick={() => handleSoftDelete(item.id)} className="p-2.5 bg-red-50 dark:bg-red-900/30 text-red-400 dark:text-red-400 rounded-xl hover:bg-red-50 hover:text-white transition-all shadow-sm" title="삭제"><Trash2 size={20} /></button>
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
                  <div className="py-10 text-center bg-white dark:bg-slate-800 rounded-[1.5rem] shadow-sm border border-slate-100 dark:border-slate-700 mx-2">
                    {showTrash ? (
                      <>
                        <Trash size={50} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <p className="text-slate-400 dark:text-slate-500 font-black text-lg">휴지통이 비어있습니다</p>
                      </>
                    ) : (
                      <>
                        <CalendarDays size={50} className="mx-auto mb-3 text-[#508A12] opacity-40" />
                        <p className="text-slate-500 dark:text-slate-400 font-black text-[clamp(1.1rem,4vw,1.4rem)] mb-2">
                          {isCalendarView ? '이 날짜에는 등록된 일정이 없습니다.' : '예정된 일정이 없습니다.'}
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {!showTrash && !isCalendarView && (
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
                                 <p className="text-slate-500 dark:text-slate-300 font-bold text-[clamp(0.85rem,3vw,1rem)] whitespace-pre-wrap leading-snug line-clamp-2">{item.content}</p>
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
            </>
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
