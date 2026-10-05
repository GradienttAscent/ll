import React, { useState } from 'react';
import { ArrowRight, Loader2, LockKeyhole } from 'lucide-react';
import { login, register } from '../api';
import type { UserAccount } from '../types';
import { LazyLiftLogo } from './LazyLiftLogo';

interface AuthScreenProps {
  initialMessage: string;
  onAuthenticated: (user: UserAccount) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ initialMessage, onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Password is required.');
      return;
    }
    if (mode === 'register' && password !== confirmPassword) {
      setError('Password confirmation does not match.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      const user = mode === 'login'
        ? await login(normalizedEmail, password)
        : await register(name.trim(), normalizedEmail, password);
      onAuthenticated(user);
    } catch (requestError: any) {
      setError(requestError.message || 'Unable to authenticate. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = (nextMode: 'login' | 'register') => {
    setMode(nextMode);
    setError('');
    setPassword('');
    setConfirmPassword('');
  };

  const registering = mode === 'register';
  return (
    <main className="min-h-screen bg-[#FAF8FC] dark:bg-[#111013] text-[#1C1B1F] dark:text-[#F5F3F7] px-6 py-10 flex items-center justify-center selection:bg-[#EDE7F6] selection:text-[#461599] transition-colors">
      <section className="w-full max-w-5xl grid lg:grid-cols-[1.1fr_0.9fr] rounded-3xl border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] shadow-xl overflow-hidden">
        {/* Left Side: Brand Story & Values */}
        <div className="p-8 sm:p-12 border-b lg:border-b-0 lg:border-r border-[#EDE7F3] dark:border-[#302B35] bg-gradient-to-br from-[#FAF8FC] dark:from-[#17151A] to-[#F3EEF8] dark:to-[#1D1726] flex flex-col justify-between min-h-[380px]">
          <div>
            <LazyLiftLogo size="lg" showWordmark showTagline showBadge />

            <h1 className="font-serif text-4xl sm:text-5xl italic leading-[1.05] mt-8 text-[#1C1B1F] dark:text-[#F5F3F7]">
              Study with evidence, not guesswork.
            </h1>
            
            <p className="max-w-md text-sm text-[#55524E] mt-5 leading-relaxed font-sans">
              Your documents, study calendar, sessions, and mastery insights stay seamlessly connected to your account.
            </p>
          </div>

          <div className="mt-10 pt-6 border-t border-[#EDE7F3] flex items-center justify-between text-[11px] font-medium text-[#7B7484]">
            <span>LazyLift Study Platform</span>
            <span>v2.4 Production</span>
          </div>
        </div>

        {/* Right Side: Authentication Form */}
        <div className="p-8 sm:p-12 bg-white dark:bg-[#17151A] flex flex-col justify-center">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-bold text-[#7B7484] dark:text-[#A9A3AE]">
            <LockKeyhole className="w-3.5 h-3.5 text-[#6D28D9] dark:text-[#8B5CF6]" />
            <span>Secure account access</span>
          </div>

          <h2 className="font-serif text-3xl sm:text-4xl italic mt-3 text-[#17151A] dark:text-[#F5F3F7]">
            {registering ? 'Create your account' : 'Welcome back'}
          </h2>
          
          <p className="text-xs text-[#7B7484] dark:text-[#A9A3AE] mt-2 font-sans">
            {registering ? 'Register to save your academic work across sessions.' : 'Log in to continue your saved study plan.'}
          </p>

          {initialMessage && (
            <div className="mt-5 rounded-xl border border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] p-3 text-xs text-[#55524E] dark:text-[#A9A3AE]">
              {initialMessage}
            </div>
          )}

          {error && (
            <div role="alert" className="mt-5 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 p-3 text-xs text-red-700 dark:text-red-300 font-medium">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            {registering && (
              <label className="block text-[10px] uppercase tracking-[0.16em] font-bold text-[#7B7484] dark:text-[#A9A3AE]">
                Name
                <input 
                  value={name} 
                  onChange={(event) => setName(event.target.value)} 
                  autoComplete="name" 
                  className="mt-1.5 w-full rounded-xl border border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] px-3.5 py-2.5 text-sm normal-case tracking-normal font-normal text-[#17151A] dark:text-[#F5F3F7] placeholder-[#7B7484] dark:placeholder-[#A9A3AE] focus:outline-none focus:border-[#6D28D9] dark:focus:border-[#8B5CF6]" 
                  placeholder="Your name" 
                />
              </label>
            )}

            <label className="block text-[10px] uppercase tracking-[0.16em] font-bold text-[#7B7484] dark:text-[#A9A3AE]">
              Email
              <input 
                value={email} 
                onChange={(event) => setEmail(event.target.value)} 
                type="email" 
                autoComplete="email" 
                className="mt-1.5 w-full rounded-xl border border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] px-3.5 py-2.5 text-sm normal-case tracking-normal font-normal text-[#17151A] dark:text-[#F5F3F7] placeholder-[#7B7484] dark:placeholder-[#A9A3AE] focus:outline-none focus:border-[#6D28D9] dark:focus:border-[#8B5CF6]" 
                placeholder="you@example.com" 
              />
            </label>

            <label className="block text-[10px] uppercase tracking-[0.16em] font-bold text-[#7B7484] dark:text-[#A9A3AE]">
              Password
              <input 
                value={password} 
                onChange={(event) => setPassword(event.target.value)} 
                type="password" 
                autoComplete={registering ? 'new-password' : 'current-password'} 
                className="mt-1.5 w-full rounded-xl border border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] px-3.5 py-2.5 text-sm normal-case tracking-normal font-normal text-[#17151A] dark:text-[#F5F3F7] placeholder-[#7B7484] dark:placeholder-[#A9A3AE] focus:outline-none focus:border-[#6D28D9] dark:focus:border-[#8B5CF6]" 
                placeholder="At least 6 characters" 
              />
            </label>

            {registering && (
              <label className="block text-[10px] uppercase tracking-[0.16em] font-bold text-[#7B7484] dark:text-[#A9A3AE]">
                Confirm password
                <input 
                  value={confirmPassword} 
                  onChange={(event) => setConfirmPassword(event.target.value)} 
                  type="password" 
                  autoComplete="new-password" 
                  className="mt-1.5 w-full rounded-xl border border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] px-3.5 py-2.5 text-sm normal-case tracking-normal font-normal text-[#17151A] dark:text-[#F5F3F7] placeholder-[#7B7484] dark:placeholder-[#A9A3AE] focus:outline-none focus:border-[#6D28D9] dark:focus:border-[#8B5CF6]" 
                  placeholder="Repeat password" 
                />
              </label>
            )}

            <button 
              type="submit" 
              disabled={isSubmitting} 
              className="w-full mt-3 bg-[#6D28D9] hover:bg-[#5B21B6] dark:bg-[#8B5CF6] dark:hover:bg-[#7C3AED] text-white rounded-lg py-2.5 text-xs font-semibold uppercase tracking-[0.16em] transition-all shadow-xs hover:shadow disabled:opacity-50 flex items-center justify-center gap-2 active:scale-98"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Working...</span>
                </>
              ) : (
                <>
                  <span>{registering ? 'Create account' : 'Log in'}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-white" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-[#EDE7F3] dark:border-[#302B35] text-xs text-[#55524E] dark:text-[#A9A3AE]">
            {registering ? 'Already have an account?' : 'New to LazyLift?'}{' '}
            <button 
              type="button" 
              onClick={() => switchMode(registering ? 'login' : 'register')} 
              className="font-semibold text-[#6D28D9] dark:text-[#8B5CF6] hover:underline"
            >
              {registering ? 'Log in' : 'Create an account'}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
};

