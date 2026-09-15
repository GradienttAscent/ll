import React, { useState } from 'react';
import { ArrowRight, Loader2, LockKeyhole, Sparkles } from 'lucide-react';
import { login, register } from '../api';
import type { UserAccount } from '../types';

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
  return <main className="min-h-screen bg-[#FDFDFC] text-[#1A1A1A] px-6 py-10 flex items-center justify-center selection:bg-black selection:text-white">
    <section className="w-full max-w-5xl grid lg:grid-cols-[1.1fr_0.9fr] border border-black bg-[#F8F7F2] shadow-[8px_8px_0_#1A1A1A]">
      <div className="p-8 sm:p-12 border-b lg:border-b-0 lg:border-r border-black flex flex-col justify-between min-h-[300px]">
        <div>
          <div className="w-10 h-10 bg-black text-white flex items-center justify-center font-bold text-sm tracking-tighter">LL</div>
          <div className="inline-flex items-center gap-2 border border-black px-3 py-1 mt-10 text-[9px] uppercase tracking-[0.2em] font-bold"><Sparkles className="w-3.5 h-3.5" />Personal academic workspace</div>
          <h1 className="font-serif text-5xl sm:text-6xl italic leading-[0.95] mt-5">Study with evidence, not guesswork.</h1>
          <p className="max-w-md text-sm text-black/65 mt-6 leading-relaxed">Your documents, study calendar, sessions, and feedback stay connected to your account.</p>
        </div>
        <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-black/45 mt-10">LazyLift Academic</p>
      </div>
      <div className="p-8 sm:p-12 bg-[#FDFDFC]">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-bold text-black/55"><LockKeyhole className="w-3.5 h-3.5" />Secure account access</div>
        <h2 className="font-serif text-4xl italic mt-3">{registering ? 'Create your account' : 'Welcome back'}</h2>
        <p className="text-xs text-black/60 mt-2">{registering ? 'Register to save your work across sessions.' : 'Log in to continue your saved study plan.'}</p>
        {initialMessage && <div className="mt-5 border border-black bg-[#F8F7F2] p-3 text-xs">{initialMessage}</div>}
        {error && <div role="alert" className="mt-5 border border-black bg-black text-white p-3 text-xs">{error}</div>}
        <form onSubmit={submit} className="mt-7 space-y-4">
          {registering && <label className="block text-[10px] uppercase tracking-[0.16em] font-bold text-black/60">Name
            <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className="mt-1.5 w-full border border-black bg-white px-3 py-3 text-sm normal-case tracking-normal font-normal focus:outline-none" placeholder="Your name" />
          </label>}
          <label className="block text-[10px] uppercase tracking-[0.16em] font-bold text-black/60">Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" className="mt-1.5 w-full border border-black bg-white px-3 py-3 text-sm normal-case tracking-normal font-normal focus:outline-none" placeholder="you@example.com" />
          </label>
          <label className="block text-[10px] uppercase tracking-[0.16em] font-bold text-black/60">Password
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={registering ? 'new-password' : 'current-password'} className="mt-1.5 w-full border border-black bg-white px-3 py-3 text-sm normal-case tracking-normal font-normal focus:outline-none" placeholder="At least 6 characters" />
          </label>
          {registering && <label className="block text-[10px] uppercase tracking-[0.16em] font-bold text-black/60">Confirm password
            <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" className="mt-1.5 w-full border border-black bg-white px-3 py-3 text-sm normal-case tracking-normal font-normal focus:outline-none" placeholder="Repeat password" />
          </label>}
          <button type="submit" disabled={isSubmitting} className="w-full mt-2 bg-black border border-black text-white py-3 text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-white hover:text-black transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" />Working...</> : <>{registering ? 'Create account' : 'Log in'} <ArrowRight className="w-3.5 h-3.5" /></>}
          </button>
        </form>
        <div className="mt-6 pt-5 border-t border-black/20 text-xs text-black/65">
          {registering ? 'Already have an account?' : 'New to LazyLift?'}{' '}
          <button type="button" onClick={() => switchMode(registering ? 'login' : 'register')} className="font-bold border-b border-black text-black">{registering ? 'Log in' : 'Create an account'}</button>
        </div>
      </div>
    </section>
  </main>;
};
