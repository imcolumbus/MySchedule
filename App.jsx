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
  AlertTriangle
} from 'lucide-react';

/**
 * [버전 정보]
 * v1.0.8 (2024-05-24)
 * - 환경 변수 접근 방식 호환성 개선: import.meta 미지원 환경 대응
 * - 디버그 화면 출력 로직 안정화
 * - Firebase 초기화 및 오류 처리 강화
 */

// 1. Firebase 설정값 안전하게 추출 및 파싱
const getFirebaseConfig = () => {
  try {
    // 다양한 환경에서의 변수 접근 시도 (Vite, Vercel, Node 등)
    let envSource = '';
    
    // 1. 전역 변수 확인
    if (typeof __firebase_config !== 'undefined') {
      envSource = __firebase_config;
    } 
    // 2. Vite 환경 변수 확인 (안전한 접근)
    else if (typeof process !== 'undefined' && process.env && process.env.VITE_FIREBASE_CONFIG) {
      envSource = process.env.VITE_FIREBASE_CONFIG;
    }
    // 3. import.meta 안전 확인
    else {
      try {
        // @ts-ignore
        if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_FIREBASE_CONFIG) {
          // @ts-ignore
          envSource = import.meta.env.VITE_FIREBASE_CONFIG;
        }
      } catch (e) {
        // import.meta를 사용할 수 없는 환경
      }
    }

    if (!envSource || envSource === '{}') return {};

    let raw = envSource;
    if (typeof raw === 'string') {
      // 주석 및 불필요한 코드 제거
      raw = raw.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
      raw = raw.replace(/(const|let|var)\s+\w+\s*=\s*/g, '');
      raw = raw.trim().replace(/;$/, '');
      
      if (raw.includes('{')) {
        const start = raw.indexOf('{');
        const end = raw.lastIndexOf('}') + 1;
        raw = raw.substring(start, end);
      }

      try {
        return JSON.parse(raw);
      } catch (e) {
        // 비표준 객체 문자열 보정
        const fixedJson = raw
          .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
          .replace(/'/g, '"')
          .replace(/,\s*([\]}])/g, '$1');
        return JSON.parse(fixedJson);
      }
    }
    return raw;
  } catch (err) {
    return {};
  }
};

const firebaseConfig = getFirebaseConfig();

// 초기화
const app = firebaseConfig && firebaseConfig.apiKey ? initializeApp(firebaseConfig) : null;
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
        console.error("인증 실패:", error);
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
      console.error("데이터 로드 에러:", err);
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
  if (!firebaseConfig || !firebaseConfig.apiKey) {
    const hasConfig = !!firebaseConfig;
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl max-w-md w-full border-t-[12px] border-red-500 text-center">
          <div className="bg-red-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="text-red-500" size={40} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-4">설정 확인 필요</h1>
          <p className="text-slate-600 leading-relaxed mb-6 text-lg">
            Firebase 설정값이 감지되지 않았습니다. <br/>
            <strong>Vercel 환경 변수를 다시 확인해 주세요.</strong>
          </p>
          
          <div className="space-y-4 text-left mb-8">
            <div className="flex gap-3 bg-slate-50 p-4 rounded-2xl">
              <span className="bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5 font-bold">1</span>
              <div>
                <p className="text-slate-700 font-bold">이름 확인</p>
                <p className="text-slate-500 text-sm">환경 변수 이름을 <code className="bg-white px-1 border rounded font-mono text-indigo-600">VITE_FIREBASE_CONFIG</code>로 설정하세요.</p>
              </div>
            </div>
            <div className="flex gap-3 bg-slate-50 p-4 rounded-2xl">
              <span className="bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5 font-bold">2</span>
              <div>
                <p className="text-slate-700 font-bold">재배포 실행</p>
                <p className="text-slate-500 text-sm">설정 변경 후 Vercel에서 <strong>Redeploy</strong> 버튼을 눌러야 반영됩니다.</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 p-4 rounded-xl text-left overflow-hidden">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">System Status</p>
            <div className="text-[11px] font-mono text-emerald-400">
              {hasConfig ? "> Config Object Found (Missing API Key)" : "> No Configuration Detected"}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      <header className="bg-indigo-600 text-white p-6 pt-10 rounded-b-[2.5rem] shadow-lg sticky top-0 z-10">
        <div className="max-w-md mx-auto">
          <p className="text-indigo-100 text-lg font-medium mb-1 text-center">어머니의 행복한 하루</p>
          <h1 className="text-3xl font-bold leading-tight text-center">{dateString}</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 mt-8">
        {loading ? (
          <div className="text-center py-24">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent mb-4"></div>
            <p className="text-slate-400 font-bold text-xl">정보를 가져오고 있습니다...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {categorizedSchedules.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border-2 border-dashed border-slate-200">
                <Calendar className="mx-auto text-slate-200 mb-4" size={48} />
                <p className="text-slate-400 text-xl font-medium">새로운 일정을 기다리고 있어요</p>
              </div>
            ) : (
              categorizedSchedules.map((item) => (
                <div key={item.id} className="bg-white rounded-3xl p-6 shadow-md border-l-8 border-indigo-500 transition-all active:scale-95">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-bold">
                          {item.date === new Date().toISOString().split('T')[0] ? '오늘' : item.date.slice(5).replace('-', '월 ') + '일'}
                        </span>
                        {item.time && <span className="flex items-center text-slate-500 gap-1 font-bold text-lg"><Clock size={18}/> {item.time}</span>}
                      </div>
                      <h3 className="text-2xl font-bold text-slate-800 leading-snug">{item.title}</h3>
                    </div>
                    <button onClick={() => handleDelete(item.id)} className="p-2 text-slate-200 hover:text-red-500 transition-colors"><Trash2 size={26}/></button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      <div className="fixed bottom-6 right-6 flex flex-col items-end gap-4 max-w-md w-full px-6 left-1/2 -translate-x-1/2 pointer-events-none">
        {showAddForm && (
          <div className="bg-white w-full rounded-3xl shadow-2xl p-6 mb-2 border border-slate-100 pointer-events-auto animate-in slide-in-from-bottom-4 duration-300">
            <h2 className="text-xl font-bold mb-4 text-slate-700">새 일정 추가</h2>
            <form onSubmit={handleAddSchedule} className="space-y-4">
              <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="어떤 일정인가요?" className="w-full text-xl p-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-indigo-500 shadow-inner" autoFocus />
              <div className="grid grid-cols-2 gap-3">
                <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="p-4 bg-slate-50 rounded-2xl border-none text-lg shadow-inner" />
                <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="p-4 bg-slate-50 rounded-2xl border-none text-lg shadow-inner" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAddForm(false)} className="flex-1 py-4 bg-slate-100 rounded-2xl font-bold text-lg text-slate-500">취소</button>
                <button type="submit" className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-bold text-lg shadow-lg">저장하기</button>
              </div>
            </form>
          </div>
        )}
        <button onClick={() => setShowAddForm(!showAddForm)} className="pointer-events-auto w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center shadow-2xl transition-all active:scale-90 z-20 hover:bg-indigo-700">
          <Plus size={32} color="white" style={{ transform: showAddForm ? 'rotate(45deg)' : 'none', transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }} />
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
