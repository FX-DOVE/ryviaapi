import React from 'react';
import { Clapperboard, Sparkles, Layers, Video } from 'lucide-react';

export function AuthLayout({ children, title, subtitle }) {
  return (
    <div className="flex min-h-screen bg-[var(--bg-base)]">
      {/* LEFT PANEL - Product Vision */}
      <div className="hidden lg:flex flex-col flex-1 justify-center relative overflow-hidden bg-black" style={{ padding: '4rem' }}>
        {/* Cinematic abstract background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--brand-primary)]/20 via-transparent to-black z-0"></div>
        <div className="absolute top-1/4 -left-1/4 w-[600px] h-[600px] bg-[var(--brand-primary)] rounded-full blur-[150px] opacity-20"></div>
        <div className="absolute bottom-1/4 -right-1/4 w-[500px] h-[500px] bg-blue-600 rounded-full blur-[150px] opacity-10"></div>

        <div className="relative z-10 w-full" style={{ maxWidth: '36rem', margin: '0 auto' }}>
          <div className="flex items-center gap-3 mb-10 opacity-90">
            <Clapperboard size={28} className="text-[var(--brand-light)]" />
            <h2 className="font-display font-bold text-xl tracking-wide text-white uppercase opacity-80">AI Film Studio</h2>
          </div>

          <h1 className="text-5xl font-extrabold text-white mb-6" style={{ lineHeight: '1.15', letterSpacing: '-0.02em' }}>
            Turn ideas into <br />
            <span className="bg-gradient-to-r from-[var(--brand-light)] to-blue-400 bg-clip-text text-transparent">cinematic videos</span><br />
            powered by AI.
          </h1>

          <p className="text-[var(--text-secondary)] text-lg mb-12 max-w-[30rem]" style={{ lineHeight: '1.6' }}>
            Create stories, generate scenes, maintain characters, and render 4K movies in one seamless professional workspace.
          </p>

          <div className="space-y-10">
            <div className="flex items-start gap-5">
              <div className="p-3 rounded-xl border border-[var(--brand-primary)]/20 shadow-lg" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(0,0,0,0) 100%)' }}>
                <Sparkles size={24} className="text-[var(--brand-light)]" />
              </div>
              <div style={{ marginTop: '2px' }}>
                <h4 className="text-lg font-bold text-white mb-1">Infinite Creativity</h4>
                <p className="text-[var(--text-secondary)] text-sm" style={{ lineHeight: '1.5' }}>6-tier AI fallback chain orchestrates the perfect models for your vision.</p>
              </div>
            </div>

            <div className="flex items-start gap-5">
              <div className="p-3 rounded-xl border border-[var(--brand-primary)]/20 shadow-lg" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(0,0,0,0) 100%)' }}>
                <Layers size={24} className="text-[var(--brand-light)]" />
              </div>
              <div style={{ marginTop: '2px' }}>
                <h4 className="text-lg font-bold text-white mb-1">Creative Lock</h4>
                <p className="text-[var(--text-secondary)] text-sm" style={{ lineHeight: '1.5' }}>Maintain absolute consistency of characters and environments across shots.</p>
              </div>
            </div>

            <div className="flex items-start gap-5">
              <div className="p-3 rounded-xl border border-[var(--brand-primary)]/20 shadow-lg" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(0,0,0,0) 100%)' }}>
                <Video size={24} className="text-[var(--brand-light)]" />
              </div>
              <div style={{ marginTop: '2px' }}>
                <h4 className="text-lg font-bold text-white mb-1">Ready to Render</h4>
                <p className="text-[var(--text-secondary)] text-sm" style={{ lineHeight: '1.5' }}>Export high-fidelity 4K MP4s assembled with transitions and audio.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL - Form */}
      <div className="flex-1 flex flex-col justify-center items-center p-8 relative z-10 bg-[var(--bg-base)]">
        <div className="w-full max-w-[420px] animation-page-enter">

          {/* Mobile Logo */}
          <div className="flex lg:hidden items-center justify-center gap-3 mb-10">
            <Clapperboard size={32} className="text-[var(--brand-light)]" />
            <h2 className="font-display font-bold text-2xl">AI Film Studio</h2>
          </div>

          <div className="card p-8 shadow-2xl border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">{title}</h1>
              <p className="subheading text-[var(--text-secondary)]">{subtitle}</p>
            </div>

            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
