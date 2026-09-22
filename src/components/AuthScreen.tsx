import React, { useState } from 'react';
import { ArrowRight, Loader2, LockKeyhole, Sparkles } from 'lucide-react';
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
    <main className="min-h-screen bg-[#FAF8FC] text-[#1C1B1F] px-6 py-10 flex items-center justify-center selection:bg-[#EDE7F6] selection:text-[#461599]">
      <section className="w-full max-w-5xl grid lg:grid-cols-[1.1fr_0.9fr] rounded-3xl border border-[#EDE7F3] bg-white shadow-xl overflow-hidden">
        {/* Left Side: Brand Story & Values */}
        <div className="p-8 sm:p-12 border-b lg:border-b-0 lg:border-r border-[#EDE7F3] bg-gradient-to-br from-[#FAF8FC] to-[#F3EEF8] flex flex-col justify-between min-h-[380px]">
          <div>
            <LazyLiftLogo size="lg" showWordmark showTagline showBadge />

            <div className="inline-flex items-center gap-2 px-3 py-1 mt-10 rounded-full bg-white border border-[#D8CCE8] text-[10px] uppercase tracking-[0.2em] font-bold text-[#461599]">
              <Sparkles className="w-3.5 h-3.5 text-[#5E35B1]" />
              <span>Personal academic workspace</span>
            </div>

            <h1 className="font-serif text-4xl sm:text-5xl italic leading-[1.05] mt-6 text-[#1C1B1F]">
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
        <div className="p-8 sm:p-12 bg-white flex flex-col justify-center">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-bold text-[#7B7484]">
            <LockKeyhole className="w-3.5 h-3.5 text-[#5E35B1]" />
            <span>Secure account access</span>
          </div>

          <h2 className="font-serif text-3xl sm:text-4xl italic mt-3 text-[#1C1B1F]">
            {registering ? 'Create your account' : 'Welcome back'}
          </h2>
          
          <p className="text-xs text-[#7B7484] mt-2">
            {registering ? 'Register to save your academic work across sessions.' : 'Log in to continue your saved study plan.'}
          </p>

          {initialMessage && (
            <div className="mt-5 rounded-xl border border-[#EDE7F3] bg-[#FAF8FC] p-3 text-xs text-[#55524E]">
              {initialMessage}
            </div>
          )}

          {error && (
            <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 font-medium">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            {registering && (
              <label className="block text-[10px] uppercase tracking-[0.16em] font-bold text-[#7B7484]">
                Name
                <input 
                  value={name} 
                  onChange={(event) => setName(event.target.value)} 
                  autoComplete="name" 
                  className="mt-1.5 w-full rounded-xl border border-[#EDE7F3] bg-[#FAF8FC] px-3.5 py-2.5 text-sm normal-case tracking-normal font-normal text-[#1C1B1F] focus:outline-none focus:border-[#5E35B1]" 
                  placeholder="Your name" 
                />
              </label>
            )}

            <label className="block text-[10px] uppercase tracking-[0.16em] font-bold text-[#7B7484]">
              Email
              <input 
                value={email} 
                onChange={(event) => setEmail(event.target.value)} 
                type="email" 
                autoComplete="email" 
                className="mt-1.5 w-full rounded-xl border border-[#EDE7F3] bg-[#FAF8FC] px-3.5 py-2.5 text-sm normal-case tracking-normal font-normal text-[#1C1B1F] focus:outline-none focus:border-[#5E35B1]" 
                placeholder="you@example.com" 
              />
            </label>

            <label className="block text-[10px] uppercase tracking-[0.16em] font-bold text-[#7B7484]">
              Password
              <input 
                value={password} 
                onChange={(event) => setPassword(event.target.value)} 
                type="password" 
                autoComplete={registering ? 'new-password' : 'current-password'} 
                className="mt-1.5 w-full rounded-xl border border-[#EDE7F3] bg-[#FAF8FC] px-3.5 py-2.5 text-sm normal-case tracking-normal font-normal text-[#1C1B1F] focus:outline-none focus:border-[#5E35B1]" 
                placeholder="At least 6 characters" 
              />
            </label>

            {registering && (
              <label className="block text-[10px] uppercase tracking-[0.16em] font-bold text-[#7B7484]">
                Confirm password
                <input 
                  value={confirmPassword} 
                  onChange={(event) => setConfirmPassword(event.target.value)} 
                  type="password" 
                  autoComplete="new-password" 
                  className="mt-1.5 w-full rounded-xl border border-[#EDE7F3] bg-[#FAF8FC] px-3.5 py-2.5 text-sm normal-case tracking-normal font-normal text-[#1C1B1F] focus:outline-none focus:border-[#5E35B1]" 
                  placeholder="Repeat password" 
                />
              </label>
            )}

            <button 
              type="submit" 
              disabled={isSubmitting} 
              className="w-full mt-3 bg-[#5E35B1] hover:bg-[#461599] text-white rounded-xl py-3 text-[10px] font-bold uppercase tracking-[0.2em] transition-all shadow-xs hover:shadow disabled:opacity-50 flex items-center justify-center gap-2 active:scale-98"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#CEB8FF]" />
                  <span>Working...</span>
                </>
              ) : (
                <>
                  <span>{registering ? 'Create account' : 'Log in'}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#CEB8FF]" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-[#EDE7F3] text-xs text-[#55524E]">
            {registering ? 'Already have an account?' : 'New to LazyLift?'}{' '}
            <button 
              type="button" 
              onClick={() => switchMode(registering ? 'login' : 'register')} 
              className="font-bold text-[#5E35B1] hover:underline"
            >
              {registering ? 'Log in' : 'Create an account'}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
};

