import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  query, 
  timestamp, 
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
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  User
} from 'lucide-react';

/**
 * [버전 정보]
 * v1.0.0 (2024-05-24)
 * - 초기 릴리즈: 큰 글씨 UI 및 실시간 Firebase 연동
 * - 기능: 일정 등록, 삭제, 날짜별 자동 정렬
 * - UI: 실버 세대를 위한 고대비 레이아웃 및 직관적인 아이콘 적용
 */

// Firebase 설정 (환경 변수에서 불러오거나 기본값 사용)
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'my-schedule-app';

export default function App() {
  const [user, setUser] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);

  // 날짜 정보 계산
  const today = new Date();
  const dateString = today.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  // 1. Firebase 인증 (Rule 3)
  useEffect(() => {
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
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });
    return () => unsubscribe();
  }, []);

  // 2. 실시간 데이터 가져오기 (Rule 1, Rule 2)
  useEffect(() => {
    if (!user) return;

    const schedulesRef = collection(db, 'artifacts', appId, 'public', 'data', 'schedules');
    
    // 복합 쿼리 없이 전체를 가져와서 메모리에서 정렬 (Rule 2 준수)
    const unsubscribe = onSnapshot(schedulesRef, 
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // 날짜와 시간순으로 정렬
        const sortedData = data.sort((a, b) => {
          const dateA = new Date(`${a.date} ${a.time || '00:00'}`);
          const dateB = new Date(`${b.date} ${b.time || '00:00'}`);
          return dateA - dateB;
        });

        setSchedules(sortedData);
        setLoading(false);
      },
      (error) => {
        console.error("데이터 로딩 오류:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // 일정 추가 핸들러
  const handleAddSchedule = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      const schedulesRef = collection(db, 'artifacts', appId, 'public', 'data', 'schedules');
      await addDoc(schedulesRef, {
        title: newTitle,
        time: newTime,
        date: newDate,
        createdAt: serverTimestamp(),
        author: user.uid
      });
      setNewTitle('');
      setNewTime('');
      setShowAddForm(false);
    } catch (error) {
      console.error("일정 추가 중 오류:", error);
    }
  };

  // 일정 삭제 핸들러
  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'schedules', id));
    } catch (error) {
      console.error("일정 삭제 중 오류:", error);
    }
  };

  // 오늘/내일/미래 일정 구분
  const categorizedSchedules = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return schedules.filter(s => s.date >= todayStr);
  }, [schedules]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      {/* 상단 헤더: 오늘 날짜 */}
      <header className="bg-indigo-600 text-white p-6 pt-10 rounded-b-[2.5rem] shadow-lg sticky top-0 z-10">
        <div className="max-w-md mx-auto">
          <p className="text-indigo-100 text-lg font-medium mb-1">오늘의 일정</p>
          <h1 className="text-3xl font-bold leading-tight">
            {dateString}
          </h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 mt-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
            <p className="text-xl">일정을 불러오는 중입니다...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {categorizedSchedules.length === 0 ? (
              <div className="bg-white rounded-3xl p-10 text-center border-2 border-dashed border-slate-200">
                <Calendar className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                <p className="text-2xl text-slate-400 font-medium">등록된 일정이 없습니다</p>
                <p className="text-slate-400 mt-2 text-lg">새로운 일정을 추가해 보세요</p>
              </div>
            ) : (
              categorizedSchedules.map((item, index) => {
                const isToday = item.date === new Date().toISOString().split('T')[0];
                return (
                  <div 
                    key={item.id} 
                    className={`bg-white rounded-3xl p-6 shadow-sm border-l-8 transition-transform active:scale-95 ${
                      isToday ? 'border-indigo-500 shadow-indigo-100' : 'border-slate-300'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                            isToday ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {isToday ? '오늘' : item.date.slice(5).replace('-', '월 ') + '일'}
                          </span>
                          {item.time && (
                            <div className="flex items-center text-slate-500 gap-1 text-lg">
                              <Clock size={18} />
                              <span className="font-semibold">{item.time}</span>
                            </div>
                          )}
                        </div>
                        <h3 className="text-2xl font-bold text-slate-800 break-words leading-snug">
                          {item.title}
                        </h3>
                      </div>
                      
                      {/* 삭제 버튼 (주로 PC 관리용이지만 모바일에서도 가능) */}
                      <button 
                        onClick={() => handleDelete(item.id)}
                        className="p-3 text-slate-300 hover:text-red-500 transition-colors"
                        title="일정 삭제"
                      >
                        <Trash2 size={24} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </main>

      {/* 하단 플로팅 버튼 및 입력 폼 (PC에서 입력하기 좋게 구성) */}
      <div className="fixed bottom-6 right-6 flex flex-col items-end gap-4 max-w-md w-full px-6 left-1/2 -translate-x-1/2 pointer-events-none">
        {showAddForm && (
          <div className="bg-white w-full rounded-3xl shadow-2xl p-6 mb-2 border border-slate-100 pointer-events-auto animate-in slide-in-from-bottom-4">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Plus className="text-indigo-600" /> 새로운 일정 추가
            </h2>
            <form onSubmit={handleAddSchedule} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-500 mb-1">무엇을 하시나요?</label>
                <input 
                  type="text" 
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="예: 병원 가는 날, 보건소 방문"
                  className="w-full text-xl p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1">날짜</label>
                  <input 
                    type="date" 
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full p-4 bg-slate-50 border-none rounded-2xl text-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1">시간 (선택)</label>
                  <input 
                    type="time" 
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full p-4 bg-slate-50 border-none rounded-2xl text-lg"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button 
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold text-lg"
                >
                  취소
                </button>
                <button 
                  type="submit"
                  className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-indigo-200"
                >
                  등록하기
                </button>
              </div>
            </form>
          </div>
        )}

        <button 
          onClick={() => setShowAddForm(!showAddForm)}
          className={`pointer-events-auto w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all ${
            showAddForm ? 'bg-slate-800 rotate-45' : 'bg-indigo-600 hover:bg-indigo-700'
          }`}
        >
          <Plus size={32} color="white" />
        </button>
      </div>

      {/* 푸터 영역: 사용자 표시 */}
      <footer className="mt-12 text-center pb-10 text-slate-400">
        <p className="text-sm font-medium">관리자: {user?.uid.slice(0, 8)}...</p>
        <p className="text-xs mt-1">이 앱은 실시간으로 PC와 모바일이 동기화됩니다.</p>
      </footer>
    </div>
  );
}
