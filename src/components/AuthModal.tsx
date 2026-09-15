import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, Mail, User, Sparkles, AlertCircle, Loader2, ArrowRight } from 'lucide-react';

export const AuthModal: React.FC = () => {
  const { login, register, error, clearError } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();
    setIsSubmitting(true);

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, displayName);
      }
    } catch (err: any) {
      setLocalError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoSignIn = async () => {
    setLocalError(null);
    clearError();
    setIsSubmitting(true);
    try {
      await login('demo@lazylift.app', 'demo1234');
    } catch (err: any) {
      setLocalError(err.message || 'Demo sign in failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
      <div className="bg-[#FDFDFC] border border-black max-w-md w-full p-8 space-y-6 shadow-2xl">
        {/* Header Branding */}
        <div className="text-center space-y-3">
          <div className="inline-block px-3 py-1 border border-black text-black text-[9px] uppercase tracking-[0.25em] font-bold bg-[#F8F7F2]">
            Academic Sanctuary &bull; Authentication
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl italic text-black leading-tight">
            {mode === 'login' ? 'LazyLift Academic' : 'Create Sanctuary Account'}
          </h2>
          <p className="text-xs text-black/60 font-sans">
            {mode === 'login' 
              ? 'Sign in to access your adaptive study schedule and analytics.'
              : 'Join LazyLift to parse syllabi, generate study schedules, and track progress.'}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex border border-black p-1 bg-[#F8F7F2]">
          <button
            type="button"
            onClick={() => { setMode('login'); clearError(); setLocalError(null); }}
            className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-all ${
              mode === 'login'
                ? 'bg-black text-white'
                : 'text-black/60 hover:text-black'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); clearError(); setLocalError(null); }}
            className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-all ${
              mode === 'register'
                ? 'bg-black text-white'
                : 'text-black/60 hover:text-black'
            }`}
          >
            Create Account
          </button>
        </div>

        {(error || localError) && (
          <div className="p-3 bg-red-50 border border-black text-red-800 text-xs font-mono flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{localError || error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-black/60 mb-1">
                Display Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-black/40 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Alex Vance"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-black focus:outline-none focus:ring-1 focus:ring-black font-sans"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-black/60 mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-black/40 absolute left-3 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@university.edu"
                className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-black focus:outline-none focus:ring-1 focus:ring-black font-sans"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-black/60 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-black/40 absolute left-3 top-3" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-black focus:outline-none focus:ring-1 focus:ring-black font-sans"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full border border-black bg-black text-white hover:bg-white hover:text-black py-3 px-4 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <span>{mode === 'login' ? 'Sign In' : 'Register Account'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="border-t border-black pt-4">
          <button
            type="button"
            onClick={handleDemoSignIn}
            disabled={isSubmitting}
            className="w-full border border-black bg-[#F8F7F2] hover:bg-black hover:text-white text-black py-2.5 px-3 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors flex items-center justify-center space-x-2"
          >
            <Sparkles className="w-3.5 h-3.5 text-violet-700" />
            <span>Sign In as Demo Student</span>
          </button>
        </div>
      </div>
    </div>
  );
};
