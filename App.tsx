import React, { useState, useEffect } from 'react';
import { 
  LogOut, 
  Calendar, 
  Users, 
  Settings, 
  CheckCircle2, 
  XCircle, 
  Lock, 
  Unlock, 
  Plus, 
  Trash2, 
  RefreshCw,
  Search,
  ChevronRight,
  UserPlus,
  Shield,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth } from './firebase';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';

// --- Types ---
interface DateEntry {
  id: number;
  date_string: string;
}

interface UserEntry {
  id: number;
  name: string;
  reg_no: string;
  email: string;
}

interface AttendanceEntry {
  id: number;
  name: string;
  reg_no: string;
  email: string;
  coming: string;
  applied: string;
  attendance_1: string;
  attendance_2: string;
  is_locked: number;
}

const ADMIN_EMAILS = ['ieeeitsvitvellore@gmail.com', 'liki123456m@gmail.com'];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState<DateEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<DateEntry | null>(null);
  const [entries, setEntries] = useState<AttendanceEntry[]>([]);
  const [view, setView] = useState<'attendance' | 'users' | 'dates'>('attendance');
  const [searchQuery, setSearchQuery] = useState('');
  const [loginError, setLoginError] = useState('');

  // Admin state
  const [allUsers, setAllUsers] = useState<UserEntry[]>([]);
  const [newDate, setNewDate] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', reg_no: '', email: '' });

  const isAdmin = user && ADMIN_EMAILS.includes(user.email || '');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const token = await firebaseUser.getIdToken();
        await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        setUser(firebaseUser);
        fetchDates();
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (selectedDate) {
      fetchEntries(selectedDate.id);
    }
  }, [selectedDate]);

  const fetchDates = async () => {
    try {
      const res = await fetch('/api/dates');
      const data = await res.json();
      setDates(data);
      if (data.length > 0 && !selectedDate) {
        setSelectedDate(data[0]);
      }
    } catch (err) {
      console.error('Failed to fetch dates', err);
    }
  };

  const fetchEntries = async (dateId: number) => {
    try {
      const res = await fetch(`/api/dates/${dateId}/entries`);
      const data = await res.json();
      setEntries(data);
    } catch (err) {
      console.error('Failed to fetch entries', err);
    }
  };

  const fetchAllUsers = async () => {
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      setAllUsers(data);
    } catch (err) {
      console.error('Failed to fetch users', err);
    }
  };

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setLoginError(err.message);
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  };

  const updateEntry = async (userId: number, field: string, value: string) => {
    if (!selectedDate) return;
    try {
      const res = await fetch(`/api/dates/${selectedDate.id}/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, value })
      });
      if (res.ok) {
        fetchEntries(selectedDate.id);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update');
      }
    } catch (err) {
      console.error('Update failed', err);
    }
  };

  const handleAddDate = async () => {
    if (!newDate) return;
    try {
      const res = await fetch('/api/dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_string: newDate })
      });
      if (res.ok) {
        setNewDate('');
        fetchDates();
      }
    } catch (err) {
      console.error('Failed to add date', err);
    }
  };

  const handleDeleteDate = async (id: number) => {
    if (!confirm('Are you sure you want to delete this date?')) return;
    try {
      await fetch(`/api/dates/${id}`, { method: 'DELETE' });
      fetchDates();
      if (selectedDate?.id === id) setSelectedDate(null);
    } catch (err) {
      console.error('Failed to delete date', err);
    }
  };

  const handleResetEntries = async () => {
    if (!selectedDate || !confirm('Reset all entries for this date?')) return;
    try {
      await fetch(`/api/dates/${selectedDate.id}/reset`, { method: 'POST' });
      fetchEntries(selectedDate.id);
    } catch (err) {
      console.error('Reset failed', err);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.name || !newUser.email) return;
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: [newUser] })
      });
      if (res.ok) {
        setNewUser({ name: '', reg_no: '', email: '' });
        fetchAllUsers();
      }
    } catch (err) {
      console.error('Failed to add user', err);
    }
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      if (res.ok) {
        alert('Data synced to Google Sheets successfully!');
      } else {
        alert('Sync failed. Check console for details.');
      }
    } catch (err) {
      console.error('Sync failed', err);
      alert('Sync failed.');
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredEntries = entries.filter(e => 
    e.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    e.reg_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <RefreshCw className="w-8 h-8 animate-spin text-stone-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-stone-200 p-8 text-center"
        >
          <div className="w-20 h-20 bg-stone-900 rounded-full flex items-center justify-center mx-auto mb-6">
            <Shield className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-stone-900 mb-2">IEEE ITS</h1>
          <p className="text-stone-500 mb-8">Night Slip Management Portal</p>
          
          {loginError && (
            <div className="mb-6 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
              {loginError}
            </div>
          )}

          <button
            onClick={handleLogin}
            className="w-full py-3 px-4 bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-3"
          >
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
            Sign in with Google
          </button>
          
          <p className="mt-6 text-xs text-stone-400">
            Authorized IEEE ITS members only.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-bottom border-stone-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 bg-stone-900 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-bold text-stone-900 hidden sm:block">IEEE ITS NIGHT SLIP</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {isAdmin && (
              <button 
                onClick={handleSyncNow}
                disabled={isSyncing}
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </button>
            )}
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-stone-900">{user.displayName}</p>
              <p className="text-xs text-stone-500">{user.email}</p>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-stone-100 rounded-lg text-stone-500 transition-colors"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 flex flex-col lg:flex-row gap-8">
        {/* Sidebar */}
        <aside className="lg:w-64 flex flex-col gap-6">
          <nav className="flex flex-col gap-1">
            <button
              onClick={() => setView('attendance')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                view === 'attendance' ? 'bg-stone-900 text-white shadow-lg' : 'text-stone-600 hover:bg-stone-200'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Attendance
            </button>
            {isAdmin && (
              <>
                <button
                  onClick={() => { setView('users'); fetchAllUsers(); }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    view === 'users' ? 'bg-stone-900 text-white shadow-lg' : 'text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  Manage Users
                </button>
                <button
                  onClick={() => setView('dates')}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    view === 'dates' ? 'bg-stone-900 text-white shadow-lg' : 'text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  Manage Dates
                </button>
              </>
            )}
          </nav>

          <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm">
            <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-4 px-2">Select Date</h3>
            <div className="flex flex-col gap-1 max-h-[400px] overflow-y-auto pr-1">
              {dates.map(date => (
                <button
                  key={date.id}
                  onClick={() => setSelectedDate(date)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                    selectedDate?.id === date.id 
                      ? 'bg-stone-100 text-stone-900 font-medium border-l-4 border-stone-900' 
                      : 'text-stone-500 hover:bg-stone-50'
                  }`}
                >
                  {new Date(date.date_string).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            {view === 'attendance' && (
              <motion.div
                key="attendance"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex flex-col gap-6"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-stone-900">
                      {selectedDate ? new Date(selectedDate.date_string).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Select a date'}
                    </h2>
                    <p className="text-stone-500 text-sm">Attendance & Night Slip Tracking</p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                      <input 
                        type="text"
                        placeholder="Search members..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 pr-4 py-2 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10 w-full sm:w-64"
                      />
                    </div>
                    {isAdmin && (
                      <button 
                        onClick={handleResetEntries}
                        className="p-2 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 text-stone-600 transition-all"
                        title="Reset all entries"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-stone-50 border-b border-stone-200">
                          <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Member</th>
                          <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Coming?</th>
                          <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Applied?</th>
                          <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider text-center">Att 1</th>
                          <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider text-center">Att 2</th>
                          <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {filteredEntries.map(entry => {
                          const isSelf = entry.email.toLowerCase() === user.email?.toLowerCase();
                          const canEdit = isAdmin || (isSelf && entry.is_locked === 0);

                          return (
                            <tr key={entry.id} className="hover:bg-stone-50 transition-colors">
                              <td className="px-6 py-4">
                                <div className="flex flex-col">
                                  <span className="font-medium text-stone-900">{entry.name}</span>
                                  <span className="text-xs text-stone-400 font-mono">{entry.reg_no || 'No Reg No'}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <select
                                  disabled={!canEdit}
                                  value={entry.coming}
                                  onChange={(e) => updateEntry(entry.id, 'coming', e.target.value)}
                                  className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-all appearance-none cursor-pointer ${
                                    entry.coming === 'COMING' 
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                      : 'bg-stone-100 text-stone-500 border-stone-200'
                                  } disabled:cursor-not-allowed`}
                                >
                                  <option value="NOT COMING">NOT COMING</option>
                                  <option value="COMING">COMING</option>
                                </select>
                              </td>
                              <td className="px-6 py-4">
                                <select
                                  disabled={!canEdit}
                                  value={entry.applied}
                                  onChange={(e) => updateEntry(entry.id, 'applied', e.target.value)}
                                  className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-all appearance-none cursor-pointer ${
                                    entry.applied === 'APPLIED' 
                                      ? 'bg-blue-50 text-blue-700 border-blue-200' 
                                      : 'bg-stone-100 text-stone-500 border-stone-200'
                                  } disabled:cursor-not-allowed`}
                                >
                                  <option value="NOT APPLIED">NOT APPLIED</option>
                                  <option value="APPLIED">APPLIED</option>
                                </select>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <button
                                  disabled={!isAdmin}
                                  onClick={() => updateEntry(entry.id, 'attendance_1', entry.attendance_1 === 'PRESENT' ? 'ABSENT' : 'PRESENT')}
                                  className={`p-1.5 rounded-lg transition-all ${
                                    entry.attendance_1 === 'PRESENT' ? 'text-emerald-600 bg-emerald-50' : 'text-stone-300 hover:text-stone-400'
                                  } disabled:cursor-default`}
                                >
                                  <CheckCircle2 className="w-5 h-5" />
                                </button>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <button
                                  disabled={!isAdmin}
                                  onClick={() => updateEntry(entry.id, 'attendance_2', entry.attendance_2 === 'PRESENT' ? 'ABSENT' : 'PRESENT')}
                                  className={`p-1.5 rounded-lg transition-all ${
                                    entry.attendance_2 === 'PRESENT' ? 'text-emerald-600 bg-emerald-50' : 'text-stone-300 hover:text-stone-400'
                                  } disabled:cursor-default`}
                                >
                                  <CheckCircle2 className="w-5 h-5" />
                                </button>
                              </td>
                              <td className="px-6 py-4 text-center">
                                {entry.is_locked === 1 ? (
                                  <div className="flex items-center justify-center text-stone-400" title="Submission Locked">
                                    <Lock className="w-4 h-4" />
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center text-emerald-500" title="Editable">
                                    <Unlock className="w-4 h-4" />
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {filteredEntries.length === 0 && (
                    <div className="py-20 text-center">
                      <Clock className="w-12 h-12 text-stone-200 mx-auto mb-4" />
                      <p className="text-stone-400">No members found for this date.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {view === 'users' && isAdmin && (
              <motion.div
                key="users"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex flex-col gap-8"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-stone-900">Manage Users</h2>
                    <p className="text-stone-500 text-sm">Master member database</p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        const csv = prompt('Paste CSV data (Name, RegNo, Email):');
                        if (csv) {
                          const rows = csv.split('\n').map(r => {
                            const [name, reg_no, email] = r.split(',').map(s => s.trim());
                            return { name, reg_no, email };
                          }).filter(u => u.name && u.email);
                          fetch('/api/users', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ users: rows })
                          }).then(() => fetchAllUsers());
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-stone-100 text-stone-900 rounded-xl text-sm font-medium hover:bg-stone-200 transition-all"
                    >
                      <UserPlus className="w-4 h-4" />
                      Bulk Import
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-1">
                    <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm sticky top-24">
                      <h3 className="font-bold text-stone-900 mb-4 flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        Add Member
                      </h3>
                      <form onSubmit={handleAddUser} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-bold text-stone-400 uppercase">Full Name</label>
                          <input 
                            type="text"
                            required
                            value={newUser.name}
                            onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                            placeholder="John Doe"
                            className="px-4 py-2 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-bold text-stone-400 uppercase">Registration No</label>
                          <input 
                            type="text"
                            value={newUser.reg_no}
                            onChange={(e) => setNewUser({...newUser, reg_no: e.target.value})}
                            placeholder="21BCE0000"
                            className="px-4 py-2 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-bold text-stone-400 uppercase">Email Address</label>
                          <input 
                            type="email"
                            required
                            value={newUser.email}
                            onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                            placeholder="john.doe@vit.ac.in"
                            className="px-4 py-2 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                          />
                        </div>
                        <button 
                          type="submit"
                          className="mt-2 w-full py-2 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-all"
                        >
                          Add Member
                        </button>
                      </form>
                    </div>
                  </div>

                  <div className="lg:col-span-2">
                    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-stone-50 border-b border-stone-200">
                            <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Name</th>
                            <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Reg No</th>
                            <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Email</th>
                            <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {allUsers.map(u => (
                            <tr key={u.id} className="hover:bg-stone-50 transition-colors">
                              <td className="px-6 py-4 font-medium text-stone-900">{u.name}</td>
                              <td className="px-6 py-4 text-stone-500 font-mono text-sm">{u.reg_no}</td>
                              <td className="px-6 py-4 text-stone-500 text-sm">{u.email}</td>
                              <td className="px-6 py-4 text-right">
                                <button 
                                  onClick={async () => {
                                    if (confirm('Delete user?')) {
                                      await fetch(`/api/users/${u.id}`, { method: 'DELETE' });
                                      fetchAllUsers();
                                    }
                                  }}
                                  className="p-2 text-stone-300 hover:text-red-500 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {view === 'dates' && isAdmin && (
              <motion.div
                key="dates"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex flex-col gap-6"
              >
                <div>
                  <h2 className="text-2xl font-bold text-stone-900">Manage Dates</h2>
                  <p className="text-stone-500 text-sm">Add or remove tracking dates</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
                    <h3 className="font-bold text-stone-900 mb-4 flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      Add New Date
                    </h3>
                    <div className="flex flex-col gap-4">
                      <input 
                        type="date"
                        value={newDate}
                        onChange={(e) => setNewDate(e.target.value)}
                        className="w-full px-4 py-2 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                      />
                      <button 
                        onClick={handleAddDate}
                        className="w-full py-2 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-all"
                      >
                        Create Date
                      </button>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
                    <h3 className="font-bold text-stone-900 mb-4">Existing Dates</h3>
                    <div className="flex flex-col gap-2">
                      {dates.map(d => (
                        <div key={d.id} className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-100">
                          <span className="text-sm font-medium text-stone-700">
                            {new Date(d.date_string).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                          <button 
                            onClick={() => handleDeleteDate(d.id)}
                            className="p-1.5 text-stone-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
