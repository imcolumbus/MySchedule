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
  RefreshCw
} from 'lucide-react';

/**
 * [버전 정보]
 * v1.1.0 (2024-05-24)
 * - 빌드 환경 호환성 개선: import.meta.env 접근 방식 수정 (ES2015 대응)
 * - 환경 변수 감지 로직 안정화 및 디버깅 UI 수정
 */

// 1. Firebase 설정값 안전하게 추출 및 파싱
const getFirebaseConfig = () => {
  const parse = (raw) => {
    if (!raw || raw === '{}') return null;
    try {
      if (typeof raw === 'string') {
        // JS 코드 형태 제거 (const config = ...)
        let cleaned = raw.replace(/(const|let|var)\s+\w+\s*=\s*/g, '').trim().replace(/;$/, '');
        if (cleaned.includes('{')) {
          cleaned = cleaned.substring(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1);
        }
        try {
          return JSON.parse(cleaned);
        } catch (e) {
          // 따옴표 없는 키 보정
          const fixed = cleaned
            .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
            .replace(/'/g, '"')
            .replace(/,\s*([\]}])/g, '$1');
          return JSON.parse(fixed);
        }
      }
      return raw;
    } catch (err) {
      console.error("Config Parsing Error:", err);
      return null;
    }
  };

  // 모든 가능한 환경 변수 소스 확인
  let source = null;
  
  // 1. 전역 변수 (가장 높은 우선순위)
  if (typeof __firebase_config !== 'undefined') {
    source = __firebase_config;
  }
  
  // 2. process.env (Vercel/Node 환경)
  if (!source && typeof process !== 'undefined' && process.env) {
    source = process.env.VITE_FIREBASE_CONFIG || process.env.__firebase_config;
  }

  // 3. import.meta.env (Vite 환경) - 런타임 체크로 빌드 에러 방지
  if (!source) {
    try {
      // 직접 참조 대신 윈도우 객체나 글로벌 스코프를 통한 간접 참조 시도
      const meta = (window && window.importMeta) || {};
      source = (meta.env && meta.env.VITE_FIREBASE_CONFIG);
    } catch (e) {}
  }

  return parse(source);
};

const firebaseConfig = getFirebaseConfig();

// 초기화
const app = firebaseConfig?.apiKey ? initializeApp(firebaseConfig) : null;
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
    }, () => setLoading(false));
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

  // 설정 오류 화면
  if (!firebaseConfig?.apiKey) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-[3rem] p-10 shadow-2xl max-w-md w-full border-t-[16px] border-red-500 text-center">
          <div className="bg-red-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
            <AlertTriangle className="text-red-500" size={48} />
          </div>
          <h1 className="text-3xl font-black text-slate-800 mb-6">설정 확인 필요</h1>
          
          <div className="text-left space-y-6 mb-10">
            <div className="bg-indigo-50 p-5 rounded-3xl border border-indigo-100">
              <p className="font-bold text-indigo-900 mb-2 flex items-center gap-2 text-lg">
                <span className="bg-indigo-600 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-black">1</span>
                변수 이름 수정
              </p>
              <p className="text-indigo-700 text-base leading-relaxed">
                Vercel 대시보드에서 <code className="bg-white px-2 py-0.5 rounded font-mono font-bold">__firebase_config</code> 이름을 <br/>
                <strong className="text-indigo-900 underline underline-offset-4 font-black text-lg">VITE_FIREBASE_CONFIG</strong>로 변경해 주세요.
              </p>
            </div>

            <div className="bg-amber-50 p-5 rounded-3xl border border-amber-100">
              <p className="font-bold text-amber-900 mb-2 flex items-center gap-2 text-lg">
                <span className="bg-amber-600 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-black">2</span>
                재배포(Redeploy) 실행
              </p>
              <p className="text-amber-700 text-base leading-relaxed">
                이름 변경 후, Vercel의 <strong>Deployments</strong> 메뉴에서 가장 최근 항목 우측의 <strong>Redeploy</strong> 버튼을 눌러야 앱에 반영됩니다.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <p className="text-slate-400 text-sm font-medium mb-2 uppercase tracking-widest">Debug Status</p>
            <div className="bg-slate-900 text-emerald-400 p-4 rounded-2xl font-mono text-xs text-left shadow-inner">
               &gt; Value Status: {typeof __firebase_config === 'undefined' ? "NOT DETECTED" : "DETECTED"}
               <br/>&gt; Config Loaded: {firebaseConfig ? "YES" : "NO"}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      <header className="bg-indigo-600 text-white p-8 pt-12 rounded-b-[3rem] shadow-xl sticky top-0 z-10">
        <div className="max-w-md mx-auto text-center">
          <p className="text-indigo-100 text-xl font-medium mb-2">어머니의 행복한 하루</p>
          <h1 className="text-3xl font-black leading-tight tracking-tight">{dateString}</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-5 mt-10">
        {loading ? (
          <div className="text-center py-24">
            <RefreshCw className="mx-auto text-indigo-400 animate-spin mb-6" size={48} />
            <p className="text-slate-400 font-black text-2xl">정보를 가져오는 중...</p>
          </div>
        ) : (
          <div className="space-y-8">
            {categorizedSchedules.length === 0 ? (
              <div className="bg-white rounded-[2.5rem] p-16 text-center border-4 border-dotted border-slate-200 shadow-sm">
                <Calendar className="mx-auto text-slate-100 mb-6" size={64} />
                <p className="text-slate-400 text-2xl font-bold">등록된 일정이<br/>없습니다</p>
              </div>
            ) : (
              categorizedSchedules.map((item) => (
                <div key={item.id} className="bg-white rounded-[2.5rem] p-8 shadow-md border-l-[12px] border-indigo-500 transition-all active:scale-95">
                  <div className="flex justify-between items-start gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="px-4 py-1.5 bg-indigo-100 text-indigo-700 rounded-full text-base font-black">
                          {item.date === new Date().toISOString().split('T')[0] ? '오늘' : item.date.slice(5).replace('-', '월 ') + '일'}
                        </span>
                        {item.time && <span className="flex items-center text-slate-500 gap-1.5 font-black text-xl"><Clock size={22} className="text-indigo-400"/> {item.time}</span>}
                      </div>
                      <h3 className="text-3xl font-black text-slate-800 leading-tight">{item.title}</h3>
                    </div>
                    <button onClick={() => handleDelete(item.id)} className="p-3 text-slate-200 hover:text-red-500 transition-colors"><Trash2 size={32}/></button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      <div className="fixed bottom-8 right-8 flex flex-col items-end gap-6 max-w-md w-full px-8 left-1/2 -translate-x-1/2 pointer-events-none">
        {showAddForm && (
          <div className="bg-white w-full rounded-[3rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] p-8 mb-4 border border-slate-100 pointer-events-auto animate-in slide-in-from-bottom-10 duration-500 ease-out">
            <h2 className="text-2xl font-black mb-6 text-slate-800">새 일정 적기</h2>
            <form onSubmit={handleAddSchedule} className="space-y-6">
              <div>
                <label className="block text-slate-400 font-bold mb-2 ml-1">일정 내용</label>
                <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="예: 병원 가는 날" className="w-full text-2xl p-5 bg-slate-50 rounded-[1.5rem] border-none focus:ring-4 focus:ring-indigo-100 shadow-inner font-bold" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 font-bold mb-2 ml-1">날짜</label>
                  <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-full p-5 bg-slate-50 rounded-[1.5rem] border-none text-xl font-bold shadow-inner" />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-2 ml-1">시간</label>
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
        <button onClick={() => setShowAddForm(!showAddForm)} className="pointer-events-auto w-20 h-20 rounded-full bg-indigo-600 flex items-center justify-center shadow-[0_10px_30px_rgba(79,70,229,0.5)] transition-all active:scale-90 z-20 hover:bg-indigo-700">
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
