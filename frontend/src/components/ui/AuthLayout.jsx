import React from 'react';
import { Clapperboard, Sparkles, Layers, Video } from 'lucide-react';

export function AuthLayout({ children, title, subtitle }) {
  return (
    <div className="flex min-h-screen bg-[var(--bg-base)]">
      {/* LEFT PANEL - Product Vision */}
      <div className="hidden lg:flex flex-col flex-1 justify-center relative overflow-hidden bg-black p-12 xl:p-16">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--brand-primary)]/20 via-transparent to-black z-0" />
        <div className="absolute top-1/4 -left-1/4 w-[600px] h-[600px] bg-[var(--brand-primary)] rounded-full blur-[150px] opacity-20" />
        <div className="absolute bottom-1/4 -right-1/4 w-[500px] h-[500px] bg-[var(--accent-warm)] rounded-full blur-[150px] opacity-10" />

        <div className="relative z-10 w-full max-w-xl mx-auto">
          <div className="flex items-center gap-3 mb-10 opacity-90">
            <Clapperboard size={28} className="text-[var(--brand-light)]" />
            <h2 className="font-display font-bold text-xl tracking-wide text-white uppercase opacity-80">Reyvia</h2>
          </div>

          <h1 className="text-5xl font-extrabold text-white mb-6 leading-tight tracking-tight">
            Original ideas.<br />
            <span className="bg-gradient-to-r from-[var(--accent-gold)] to-[var(--brand-light)] bg-clip-text text-transparent">Cinema on demand.</span>
          </h1>

          <p className="text-[var(--text-secondary)] text-lg mb-12 max-w-[30rem] leading-relaxed">
            Write the story, lock the faces from photographs, and render a finished film in one studio.
          </p>

          <div className="space-y-8">
            <div className="flex items-start gap-5">
              <div className="p-3 rounded-xl border border-[var(--brand-primary)]/20 shadow-lg" style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.15) 0%, rgba(0,0,0,0) 100%)' }}>
                <Sparkles size={24} className="text-[var(--brand-light)]" />
              </div>
              <div className="mt-0.5">
                <h4 className="text-lg font-bold text-white mb-1">Infinite Creativity</h4>
                <p className="text-[var(--text-secondary)] text-sm leading-relaxed">6-tier AI fallback chain orchestrates the perfect models for your vision.</p>
              </div>
            </div>

            <div className="flex items-start gap-5">
              <div className="p-3 rounded-xl border border-[var(--brand-primary)]/20 shadow-lg" style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.15) 0%, rgba(0,0,0,0) 100%)' }}>
                <Layers size={24} className="text-[var(--brand-light)]" />
              </div>
              <div className="mt-0.5">
                <h4 className="text-lg font-bold text-white mb-1">Creative Lock</h4>
                <p className="text-[var(--text-secondary)] text-sm leading-relaxed">Maintain absolute consistency of characters and environments across shots.</p>
              </div>
            </div>

            <div className="flex items-start gap-5">
              <div className="p-3 rounded-xl border border-[var(--brand-primary)]/20 shadow-lg" style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.15) 0%, rgba(0,0,0,0) 100%)' }}>
                <Video size={24} className="text-[var(--brand-light)]" />
              </div>
              <div className="mt-0.5">
                <h4 className="text-lg font-bold text-white mb-1">Ready to Render</h4>
                <p className="text-[var(--text-secondary)] text-sm leading-relaxed">Export high-fidelity 4K MP4s assembled with transitions and audio.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL - Form */}
      <div className="auth-form-panel flex-1 flex flex-col justify-center items-center relative z-10 bg-[var(--bg-base)]">
        <div className="auth-card animation-page-enter">
          <div className="flex lg:hidden items-center justify-center gap-3 mb-6 sm:mb-8">
            <Clapperboard size={28} className="text-[var(--brand-light)]" />
            <h2 className="font-display font-bold text-xl sm:text-2xl">Reyvia</h2>
          </div>

          <div className="card shadow-2xl bg-[var(--bg-surface)]">
            <div className="text-center mb-6 sm:mb-8">
              <h1 className="text-2xl sm:text-3xl font-bold mb-2">{title}</h1>
              <p className="subheading text-[var(--text-secondary)]">{subtitle}</p>
            </div>

            {children}
          </div>

          <p className="auth-legal">
            By continuing you agree to our{' '}
            <a href="#terms">Terms</a>
            {' '}and{' '}
            <a href="#privacy">Privacy</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
