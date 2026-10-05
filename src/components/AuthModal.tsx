import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, Mail, User, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import { LazyLiftLogo } from './LazyLiftLogo';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] max-w-md w-full p-8 space-y-6 shadow-xl">
        {/* Header Branding */}
        <div className="text-center space-y-3">
          <div className="flex justify-center mb-2">
            <LazyLiftLogo size="md" />
          </div>
          <div className="inline-block px-3 py-1 rounded-full bg-[#EDE7F6] dark:bg-[#251E30] border border-[#D8CCE8] dark:border-[#3E3846] text-[#6D28D9] dark:text-[#8B5CF6] text-[9px] uppercase tracking-[0.25em] font-bold">
            Academic Workspace &bull; Authentication
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl italic text-[#17151A] dark:text-[#F5F3F7] leading-tight">
            {mode === 'login' ? 'Welcome Back' : 'Create Student Account'}
          </h2>
          <p className="text-xs text-[#7B7484] dark:text-[#A9A3AE] font-sans">
            {mode === 'login' 
              ? 'Sign in to access your adaptive study schedule and analytics.'
              : 'Join LazyLift to parse syllabi, generate study schedules, and track progress.'}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-xl border border-[#EDE7F3] dark:border-[#302B35] p-1 bg-[#FAF8FC] dark:bg-[#1D1A21]">
          <button
            type="button"
            onClick={() => { setMode('login'); clearError(); setLocalError(null); }}
            className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
              mode === 'login'
                ? 'bg-[#6D28D9] dark:bg-[#8B5CF6] text-white shadow-2xs'
                : 'text-[#7B7484] dark:text-[#A9A3AE] hover:text-[#17151A] dark:hover:text-[#F5F3F7]'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); clearError(); setLocalError(null); }}
            className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
              mode === 'register'
                ? 'bg-[#6D28D9] dark:bg-[#8B5CF6] text-white shadow-2xs'
                : 'text-[#7B7484] dark:text-[#A9A3AE] hover:text-[#17151A] dark:hover:text-[#F5F3F7]'
            }`}
          >
            Create Account
          </button>
        </div>

        {(error || localError) && (
          <div className="p-3.5 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-xl text-red-800 dark:text-red-300 text-xs font-mono flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
            <span>{localError || error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484] dark:text-[#A9A3AE] mb-1.5">
                Display Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#7B7484] dark:text-[#A9A3AE] absolute left-3.5 top-3" />
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Alex Vance"
                  className="w-full pl-10 pr-3.5 py-2.5 text-xs bg-[#FAF8FC] dark:bg-[#1D1A21] rounded-xl border border-[#EDE7F3] dark:border-[#302B35] text-[#17151A] dark:text-[#F5F3F7] placeholder-[#7B7484] dark:placeholder-[#A9A3AE] focus:outline-none focus:border-[#6D28D9] dark:focus:border-[#8B5CF6] font-sans transition-all"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484] dark:text-[#A9A3AE] mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#7B7484] dark:text-[#A9A3AE] absolute left-3.5 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@university.edu"
                className="w-full pl-10 pr-3.5 py-2.5 text-xs bg-[#FAF8FC] dark:bg-[#1D1A21] rounded-xl border border-[#EDE7F3] dark:border-[#302B35] text-[#17151A] dark:text-[#F5F3F7] placeholder-[#7B7484] dark:placeholder-[#A9A3AE] focus:outline-none focus:border-[#6D28D9] dark:focus:border-[#8B5CF6] font-sans transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484] dark:text-[#A9A3AE] mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#7B7484] dark:text-[#A9A3AE] absolute left-3.5 top-3" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-3.5 py-2.5 text-xs bg-[#FAF8FC] dark:bg-[#1D1A21] rounded-xl border border-[#EDE7F3] dark:border-[#302B35] text-[#17151A] dark:text-[#F5F3F7] placeholder-[#7B7484] dark:placeholder-[#A9A3AE] focus:outline-none focus:border-[#6D28D9] dark:focus:border-[#8B5CF6] font-sans transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-[#6D28D9] hover:bg-[#5B21B6] dark:bg-[#8B5CF6] dark:hover:bg-[#7C3AED] text-white py-3 px-4 text-xs font-semibold uppercase tracking-[0.16em] transition-all shadow-xs hover:shadow active:scale-98 flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-[#CEB8FF]" />
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

        <div className="border-t border-[#EDE7F3] dark:border-[#302B35] pt-4">
          <button
            type="button"
            onClick={handleDemoSignIn}
            disabled={isSubmitting}
            className="w-full rounded-lg border border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] hover:bg-[#EDE7F6] dark:hover:bg-[#251E30] text-[#6D28D9] dark:text-[#8B5CF6] py-2.5 px-3 text-xs font-semibold uppercase tracking-[0.16em] transition-all flex items-center justify-center space-x-2 shadow-2xs"
          >
            <span>Sign In as Demo Student</span>
          </button>
        </div>
      </div>
    </div>
  );
};
