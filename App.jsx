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
 * v1.0.4 (2024-05-24)
 * - 하얀 화면 오류 수정: createRoot 실행 코드 추가
 * - 환경 변수 파싱 에러 방지 로직 추가
 */

// 1. Firebase 설정값 안전하게 가져오기
let firebaseConfig = {};
try {
  // Vercel 환경 변수에서 가져오거나 빈 값 처리
  const configRaw = typeof process !== 'undefined' && process.env.VITE_FIREBASE_CONFIG 
    ? process.env.VITE_FIREBASE_CONFIG 
    : (typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
  
  firebaseConfig = typeof configRaw === 'string' ? JSON.parse(configRaw) : configRaw;
} catch (e) {
  console.error("Firebase 설정 형식이 올바르지 않습니다. 가이드를 확인해 주세요.");
}

// 초기화 (설정값이 있을 때만)
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

  // 인증 로직
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
        console.error("인증 오류:", error);
      }
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  // 데이터 로딩
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

  // 설정 오류 시 안내 화면
  if (!firebaseConfig.apiKey) {
    return (
      <div className="p-10 text-center">
        <h1 className="text-2xl font-bold text-red-500">설정 오류</h1>
        <p className="mt-4 text-slate-600">Vercel 환경 변수(__firebase_config)가 설정되지 않았거나 형식이 틀립니다.</p>
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
          <div className="text-center py-20 text-slate-400">불러오는 중...</div>
        ) : (
          <div className="space-y-6">
            {categorizedSchedules.length === 0 ? (
              <div className="bg-white rounded-3xl p-10 text-center border-2 border-dashed border-slate-200 text-slate-400">일정이 없습니다</div>
            ) : (
              categorizedSchedules.map((item) => (
                <div key={item.id} className="bg-white rounded-3xl p-6 shadow-sm border-l-8 border-indigo-500">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-bold">
                          {item.date === new Date().toISOString().split('T')[0] ? '오늘' : item.date}
                        </span>
                        {item.time && <span className="flex items-center text-slate-500 gap-1 font-semibold"><Clock size={16}/> {item.time}</span>}
                      </div>
                      <h3 className="text-2xl font-bold text-slate-800 leading-snug">{item.title}</h3>
                    </div>
                    <button onClick={() => handleDelete(item.id)} className="p-2 text-slate-300 hover:text-red-500"><Trash2 size={24}/></button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* 입력 버튼 및 폼 */}
      <div className="fixed bottom-6 right-6 flex flex-col items-end gap-4 max-w-md w-full px-6 left-1/2 -translate-x-1/2 pointer-events-none">
        {showAddForm && (
          <div className="bg-white w-full rounded-3xl shadow-2xl p-6 mb-2 border border-slate-100 pointer-events-auto">
            <form onSubmit={handleAddSchedule} className="space-y-4">
              <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="일정 내용" className="w-full text-xl p-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-indigo-500" />
              <div className="grid grid-cols-2 gap-3">
                <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="p-4 bg-slate-50 rounded-2xl border-none" />
                <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="p-4 bg-slate-50 rounded-2xl border-none" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAddForm(false)} className="flex-1 py-4 bg-slate-100 rounded-2xl font-bold">취소</button>
                <button type="submit" className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-bold">등록</button>
              </div>
            </form>
          </div>
        )}
        <button onClick={() => setShowAddForm(!showAddForm)} className="pointer-events-auto w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center shadow-2xl transition-transform active:scale-90">
          <Plus size={32} color="white" style={{ transform: showAddForm ? 'rotate(45deg)' : 'none' }} />
        </button>
      </div>
    </div>
  );
}

// 이 부분이 추가되어야 실제 화면에 나타납니다.
const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);

export default App;
