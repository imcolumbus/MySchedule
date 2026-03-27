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
  Clock
} from 'lucide-react';

/**
 * [버전 정보]
 * v1.0.6 (2024-05-24)
 * - 환경 변수 자동 보정 기능 강화: JS 객체 형태(따옴표 없는 키)도 JSON으로 변환하여 인식
 * - Vercel에 코드를 통째로 붙여넣어도 작동하도록 파싱 로직 개선
 */

// 1. Firebase 설정값 안전하게 추출 및 파싱
const getFirebaseConfig = () => {
  try {
    let raw = typeof __firebase_config !== 'undefined' ? __firebase_config : 
              (import.meta.env?.VITE_FIREBASE_CONFIG || '');

    if (!raw || raw === '{}') return {};

    if (typeof raw === 'string') {
      // 1. 변수 선언문 제거 (const firebaseConfig = ...)
      raw = raw.replace(/(const|let|var)\s+\w+\s*=\s*/g, '');
      // 2. 세미콜론 및 공백 제거
      raw = raw.trim().replace(/;$/, '');
      
      // 3. 중괄호 범위 추출
      if (raw.includes('{')) {
        const start = raw.indexOf('{');
        const end = raw.lastIndexOf('}') + 1;
        raw = raw.substring(start, end);
      }

      // 4. JS 객체 형태를 JSON으로 변환 (키에 따옴표가 없는 경우 강제로 추가)
      // 예: { apiKey: "..." } -> { "apiKey": "..." }
      try {
        // 먼저 그대로 파싱 시도
        return JSON.parse(raw);
      } catch (jsonErr) {
        // 실패 시 따옴표 보정 후 재시도
        const fixedRaw = raw.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
        return JSON.parse(fixedRaw);
      }
    }

    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    console.error("Firebase Config 파싱 실패:", e);
    return {};
  }
};

const firebaseConfig = getFirebaseConfig();

// 초기화
const app = firebaseConfig.apiKey ? initializeApp(firebaseConfig) : null;
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
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
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
      console.error("데이터 읽기 실패:", err);
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

  if (!firebaseConfig.apiKey) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
        <div className="bg-white rounded-[2.5rem] p-8 shadow-xl max-w-sm w-full border-t-8 border-red-500">
          <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-red-600 text-3xl font-bold">!</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-4">설정값 확인 필요</h1>
          <p className="text-slate-500 leading-relaxed mb-6">
            Vercel 환경 변수값의 형식이 올바르지 않습니다.<br/>
            <strong>대시보드에서 값을 수정한 후 다시 배포해 주세요.</strong>
          </p>
          <div className="bg-slate-100 p-4 rounded-2xl text-xs text-left font-mono text-slate-400 overflow-auto max-h-32">
            입력된 값: {typeof __firebase_config !== 'undefined' ? __firebase_config : '없음'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      <header className="bg-indigo-600 text-white p-6 pt-10 rounded-b-[2.5rem] shadow-lg sticky top-0 z-10">
        <div className="max-w-md mx-auto">
          <p className="text-indigo-100 text-lg font-medium mb-1">오늘의 일정</p>
          <h1 className="text-3xl font-bold leading-tight">{dateString}</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 mt-8">
        {loading ? (
          <div className="text-center py-20 text-slate-400 italic font-medium text-xl">정보를 가져오는 중...</div>
        ) : (
          <div className="space-y-6">
            {categorizedSchedules.length === 0 ? (
              <div className="bg-white rounded-3xl p-10 text-center border-2 border-dashed border-slate-200 text-slate-400 text-xl font-medium">새로운 일정을 추가해 보세요</div>
            ) : (
              categorizedSchedules.map((item) => (
                <div key={item.id} className="bg-white rounded-3xl p-6 shadow-sm border-l-8 border-indigo-500 transition-all active:scale-95">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-bold">
                          {item.date === new Date().toISOString().split('T')[0] ? '오늘' : item.date.slice(5).replace('-', '월 ') + '일'}
                        </span>
                        {item.time && <span className="flex items-center text-slate-500 gap-1 font-bold text-lg"><Clock size={18}/> {item.time}</span>}
                      </div>
                      <h3 className="text-2xl font-bold text-slate-800 leading-snug">{item.title}</h3>
                    </div>
                    <button onClick={() => handleDelete(item.id)} className="p-2 text-slate-200 hover:text-red-500"><Trash2 size={26}/></button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      <div className="fixed bottom-6 right-6 flex flex-col items-end gap-4 max-w-md w-full px-6 left-1/2 -translate-x-1/2 pointer-events-none">
        {showAddForm && (
          <div className="bg-white w-full rounded-3xl shadow-2xl p-6 mb-2 border border-slate-100 pointer-events-auto animate-in slide-in-from-bottom-4">
            <form onSubmit={handleAddSchedule} className="space-y-4">
              <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="어떤 일정인가요?" className="w-full text-xl p-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-indigo-500" autoFocus />
              <div className="grid grid-cols-2 gap-3">
                <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="p-4 bg-slate-50 rounded-2xl border-none text-lg" />
                <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="p-4 bg-slate-50 rounded-2xl border-none text-lg" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAddForm(false)} className="flex-1 py-4 bg-slate-100 rounded-2xl font-bold text-lg">취소</button>
                <button type="submit" className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-bold text-lg">등록하기</button>
              </div>
            </form>
          </div>
        )}
        <button onClick={() => setShowAddForm(!showAddForm)} className="pointer-events-auto w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center shadow-2xl transition-all active:scale-90 z-20">
          <Plus size={32} color="white" style={{ transform: showAddForm ? 'rotate(45deg)' : 'none', transition: 'transform 0.3s' }} />
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
