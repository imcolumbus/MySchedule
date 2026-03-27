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
  Info
} from 'lucide-react';

/**
 * [버전 정보]
 * v1.1.2 (2024-05-24)
 * - 빌드 호환성 수정: import.meta 경고 해결을 위한 안전한 환경 변수 접근 로직 적용
 * - 파싱 로직 강화: Vercel Value에 포함된 불필요한 JS 코드(const...) 자동 제거 및 JSON 강제 변환
 * - UI 개선: 설정 오류 시 사용자 대응 가이드 시각화
 */

// 1. Firebase 설정값 안전하게 추출 및 파싱
const getFirebaseConfig = () => {
  const parseConfig = (raw) => {
    if (!raw) return null;
    let cleaned = String(raw).trim();
    if (!cleaned || cleaned === '{}') return null;

    try {
      // 주석 및 JS 선언부 제거 (가장 강력한 필터링)
      cleaned = cleaned.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
      cleaned = cleaned.replace(/(const|let|var)\s+\w+\s*=\s*/g, '');
      cleaned = cleaned.trim().replace(/;$/, '');
      
      // 중괄호 { } 구간만 추출
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }

      try {
        return JSON.parse(cleaned);
      } catch (e) {
        // 따옴표가 없는 키값 등을 보정하여 JSON으로 변환 시도
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

  // 환경 변수 탐색 (Vite의 정적 교체와 호환되도록 구성)
  let source = null;
  
  // A. 전역 객체 확인
  if (typeof __firebase_config !== 'undefined') source = __firebase_config;
  
  // B. process.env 확인 (Vercel Node 환경)
  if (!source && typeof process !== 'undefined' && process.env) {
    source = process.env.VITE_FIREBASE_CONFIG || process.env.__firebase_config;
  }

  // C. Vite 환경 변수 확인 (빌드 시 실제 값으로 치환됨)
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
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);

  const today = new Date();
  const dateString = today.toLocaleDateString('ko-KR', {
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
      setSchedules(data.sort((a, b) => new Date(`${a.date} ${a.time || '00:00'}`) - new Date(`${b.date} ${b.time || '00:00'}`)));
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
        title: newTitle, time: newTime, date: newDate, createdAt: serverTimestamp(), author: user.uid
      });
      setNewTitle(''); setShowAddForm(false);
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id) => {
    if (!db) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'schedules', id));
  };

  const categorizedSchedules = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return schedules.filter(s => s.date >= todayStr);
  }, [schedules]);

  // 설정 오류 시 안내 화면
  if (!app || !firebaseConfig?.apiKey) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-[3rem] p-10 shadow-2xl max-w-md w-full border-t-[16px] border-red-500 text-center">
          <div className="bg-red-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8">
            <AlertTriangle className="text-red-500" size={48} />
          </div>
          <h1 className="text-3xl font-black text-slate-800 mb-6">최종 확인 필요</h1>
          
          <div className="text-left space-y-6 mb-10">
            <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100">
              <p className="font-black text-blue-900 mb-3 flex items-center gap-2 text-xl italic">
                <Info size={24} /> 필수 작업!
              </p>
              <p className="text-blue-800 text-base leading-relaxed">
                Vercel 대시보드의 <strong>Value</strong> 칸에 있는 내용을 <strong>중괄호 <code className="bg-white px-1">{'{ }'}</code>만 남기고 모두 지워주세요.</strong>
                <br/><span className="text-sm opacity-70">(앞의 const... 부분은 삭제해야 안전합니다)</span>
              </p>
            </div>

            <div className="bg-indigo-50 p-6 rounded-3xl border border-indigo-100">
              <p className="font-black text-indigo-900 mb-2 flex items-center gap-2 text-xl">
                <span className="bg-indigo-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-black">1</span>
                Redeploy 필수
              </p>
              <p className="text-indigo-700 text-base leading-relaxed">
                설정을 바꾼 뒤에는 반드시 Vercel의 <strong>Deployments</strong> 탭에서 <strong>Redeploy</strong> 버튼을 눌러야 앱에 적용됩니다.
              </p>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100">
            <p className="text-slate-400 text-xs font-bold mb-3 uppercase tracking-widest italic">Current Debug Info</p>
            <div className="bg-slate-900 text-emerald-400 p-5 rounded-2xl font-mono text-[11px] text-left shadow-inner overflow-hidden">
               &gt; VITE_CONFIG: {firebaseConfig ? "FOUND" : "NOT_DETECTED"}
               <br/>&gt; API_KEY: {firebaseConfig?.apiKey ? "OK" : "MISSING"}
               <br/>&gt; Status: Waiting for Redeploy...
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 font-sans">
      <header className="bg-indigo-600 text-white p-8 pt-12 rounded-b-[3rem] shadow-xl sticky top-0 z-10">
        <div className="max-w-md mx-auto text-center">
          <p className="text-indigo-100 text-xl font-medium mb-2">어머니의 행복한 하루</p>
          <h1 className="text-3xl font-black leading-tight tracking-tight drop-shadow-sm">{dateString}</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-6 mt-10">
        {loading ? (
          <div className="text-center py-32">
            <RefreshCw className="mx-auto text-indigo-400 animate-spin mb-6" size={56} />
            <p className="text-slate-400 font-black text-2xl">일정을 가져오는 중...</p>
          </div>
        ) : (
          <div className="space-y-8">
            {categorizedSchedules.length === 0 ? (
              <div className="bg-white rounded-[3rem] p-16 text-center border-4 border-dotted border-slate-200 shadow-sm opacity-80">
                <Calendar className="mx-auto text-slate-100 mb-6" size={72} />
                <p className="text-slate-400 text-2xl font-black leading-relaxed">아직 등록된 일정이<br/>없습니다</p>
              </div>
            ) : (
              categorizedSchedules.map((item) => (
                <div key={item.id} className="bg-white rounded-[2.5rem] p-8 shadow-[0_4px_20px_rgba(0,0,0,0.05)] border-l-[14px] border-indigo-500 transition-all active:scale-[0.98]">
                  <div className="flex justify-between items-start gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="px-4 py-1.5 bg-indigo-100 text-indigo-700 rounded-full text-base font-black shadow-sm">
                          {item.date === new Date().toISOString().split('T')[0] ? '오늘' : item.date.slice(5).replace('-', '월 ') + '일'}
                        </span>
                        {item.time && <span className="flex items-center text-slate-500 gap-1.5 font-black text-xl"><Clock size={22} className="text-indigo-400"/> {item.time}</span>}
                      </div>
                      <h3 className="text-3xl font-black text-slate-800 leading-tight">{item.title}</h3>
                    </div>
                    <button onClick={() => handleDelete(item.id)} className="p-3 text-slate-200 hover:text-red-500 transition-all"><Trash2 size={36}/></button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      <div className="fixed bottom-8 right-8 flex flex-col items-end gap-6 max-w-md w-full px-8 left-1/2 -translate-x-1/2 pointer-events-none">
        {showAddForm && (
          <div className="bg-white w-full rounded-[3rem] shadow-[0_25px_70px_-15px_rgba(0,0,0,0.3)] p-8 mb-4 border border-slate-100 pointer-events-auto animate-in slide-in-from-bottom-10 duration-500 ease-out z-30">
            <h2 className="text-2xl font-black mb-6 text-slate-800 text-center">새 일정 적기</h2>
            <form onSubmit={handleAddSchedule} className="space-y-6">
              <div>
                <label className="block text-slate-400 font-bold mb-2 ml-2">어떤 일정인가요?</label>
                <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="예: 병원 가는 날" className="w-full text-2xl p-5 bg-slate-50 rounded-[1.5rem] border-none focus:ring-4 focus:ring-indigo-100 shadow-inner font-bold" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 font-bold mb-2 ml-2">날짜</label>
                  <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-full p-5 bg-slate-50 rounded-[1.5rem] border-none text-xl font-bold shadow-inner" />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-2 ml-2">시간</label>
                  <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="w-full p-5 bg-slate-50 rounded-[1.5rem] border-none text-xl font-bold shadow-inner" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddForm(false)} className="flex-1 py-5 bg-slate-100 rounded-[1.5rem] font-black text-xl text-slate-500 active:scale-95 transition-transform">취소</button>
                <button type="submit" className="flex-[2] py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-xl shadow-lg shadow-indigo-200 active:scale-95 transition-transform">일정 저장</button>
              </div>
            </form>
          </div>
        )}
        <button onClick={() => setShowAddForm(!showAddForm)} className="pointer-events-auto w-20 h-20 rounded-full bg-indigo-600 flex items-center justify-center shadow-[0_12px_40px_rgba(79,70,229,0.5)] transition-all active:scale-90 z-40 hover:bg-indigo-700">
          <Plus size={48} color="white" style={{ transform: showAddForm ? 'rotate(45deg)' : 'none', transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }} />
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
