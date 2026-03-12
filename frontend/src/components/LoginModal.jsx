import { useState } from 'react'
import { useAirspaceStore } from '../store/airspaceStore'
import { login } from '../api/client'
import { Shield, Plane, Radio, AlertTriangle } from 'lucide-react'

export default function LoginPage() {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const { setToken } = useAirspaceStore()

  const handleLogin = async () => {
    setError('')
    setLoading(true)
    try {
      const { data } = await login(username, password)
      setToken(data.access_token)
    } catch (e) {
      setError('Invalid credentials. Try admin / airspace2024')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-gray-950 flex flex-col items-center justify-center">

      {/* Animated background grid */}
      <div className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: 'linear-gradient(rgba(59,130,246,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.3) 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }}
      />

      {/* Decorative rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[600px] h-[600px] rounded-full border border-blue-900/30 animate-pulse" />
        <div className="absolute w-[400px] h-[400px] rounded-full border border-blue-800/20" />
        <div className="absolute w-[200px] h-[200px] rounded-full border border-blue-700/20" />
      </div>

      {/* Login card */}
      <div className="relative z-10 w-full max-w-md px-6">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-700/20 border border-blue-600/40 rounded-2xl mb-4">
            <Plane size={28} className="text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-wider">AIRSPACE MONITOR</h1>
          <p className="text-blue-400/70 text-sm mt-1 tracking-widest uppercase">
            Intelligent Monitoring System
          </p>
          <p className="text-gray-600 text-xs mt-2">
            Maharashtra · Goa · Karnataka · Telangana · Gujarat
          </p>
        </div>

        {/* Card */}
        <div className="bg-gray-900/80 backdrop-blur border border-gray-700/60 rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center gap-2 mb-6">
            <Shield size={16} className="text-blue-400" />
            <span className="text-sm font-semibold text-gray-300 tracking-wide">OPERATOR LOGIN</span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">Username</label>
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter username"
                className="w-full bg-gray-800/80 border border-gray-700 rounded-lg px-4 py-3 text-sm
                           text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500
                           focus:ring-1 focus:ring-blue-500/30 transition-all"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="Enter password"
                className="w-full bg-gray-800/80 border border-gray-700 rounded-lg px-4 py-3 text-sm
                           text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500
                           focus:ring-1 focus:ring-blue-500/30 transition-all"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-950/50 border border-red-800/50 rounded-lg px-3 py-2">
                <AlertTriangle size={13} className="text-red-400 flex-shrink-0" />
                <p className="text-red-400 text-xs">{error}</p>
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed
                         rounded-lg py-3 text-sm font-bold tracking-wider transition-all
                         shadow-lg shadow-blue-900/30 mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  AUTHENTICATING...
                </span>
              ) : 'SIGN IN'}
            </button>
          </div>

          <div className="mt-5 pt-4 border-t border-gray-800 flex items-center justify-between">
            <span className="text-xs text-gray-600">Demo credentials</span>
            <span className="text-xs text-gray-500 font-mono">admin / airspace2024</span>
          </div>
        </div>

        {/* Footer stats */}
        <div className="mt-6 grid grid-cols-3 gap-3 text-center">
          {[
            { icon: Radio, label: 'Live Feed',    value: 'Active' },
            { icon: Plane, label: 'Coverage',     value: '5 States' },
            { icon: Shield, label: 'AI Agent',    value: 'Online' },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="bg-gray-900/50 border border-gray-800 rounded-lg p-2">
              <Icon size={14} className="text-blue-400 mx-auto mb-1" />
              <div className="text-xs text-gray-400">{label}</div>
              <div className="text-xs font-semibold text-green-400">{value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}