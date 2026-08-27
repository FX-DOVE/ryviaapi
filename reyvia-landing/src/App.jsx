import React, { useState, useEffect, useRef } from 'react';
import {
  Film,
  Sparkles,
  Clapperboard,
  Play,
  Pause,
  Layers,
  Wand2,
  Camera,
  ChevronDown,
  ArrowRight,
  CheckCircle2,
  Sliders,
  Users,
  FileText,
  Volume2,
  VolumeX
} from 'lucide-react';

const HERO_VIDEO = '/videos/hero-ambient.mp4';

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState(null);
  const [activeShowcase, setActiveShowcase] = useState('all');
  const [modalVideo, setModalVideo] = useState(null);
  const [activeDemoTab, setActiveDemoTab] = useState('scene01');
  const [heroMuted, setHeroMuted] = useState(true);
  const [heroPlaying, setHeroPlaying] = useState(true);
  const [showSignup, setShowSignup] = useState(false);
  const [signupData, setSignupData] = useState({ name: '', email: '' });
  const [signupSubmitted, setSignupSubmitted] = useState(false);
  const heroVideoRef = useRef(null);

  const [promptInput, setPromptInput] = useState('Make this scene more emotional with dramatic lighting.');
  const [assistantResponse, setAssistantResponse] = useState(
    'Applying adjustments: softening the key light, adding a subtle tear highlight, and extending the final hold by 1.5 seconds.'
  );

  const DASHBOARD_URL = 'https://app.reyvia.com/login';

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (heroVideoRef.current) {
      heroVideoRef.current.play().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const elements = document.querySelectorAll('[data-reveal]');
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: '0px 0px -30px 0px' }
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  const handleStartCreating = () => {
    setShowSignup(true);
    setSignupSubmitted(false);
  };

  const handleDashboardLogin = () => {
    window.location.href = DASHBOARD_URL;
  };

  const handleSignupSubmit = (event) => {
    event.preventDefault();
    setSignupSubmitted(true);
  };

  const handleExploreStudio = () => {
    const el = document.getElementById('workflow');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const toggleHeroPlay = () => {
    if (heroVideoRef.current) {
      if (heroPlaying) heroVideoRef.current.pause();
      else heroVideoRef.current.play();
      setHeroPlaying(!heroPlaying);
    }
  };

  const toggleHeroMute = () => {
    if (heroVideoRef.current) {
      heroVideoRef.current.muted = !heroMuted;
      setHeroMuted(!heroMuted);
    }
  };

  const showcaseVideoPool = [
    '/videos/showcase-1.mp4',
    '/videos/showcase-2.mp4',
    '/videos/showcase-3.mp4',
    '/videos/showcase-4.mp4',
    '/videos/showcase-5.mp4',
    '/videos/showcase-6.mp4'
  ];

  const showcaseItems = [
    {
      id: 1,
      title: 'Neon Odyssey: Cyber 2099',
      category: 'Sci-Fi',
      videoUrl: showcaseVideoPool[0],
      poster: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=1200&auto=format&fit=crop',
      duration: '02:45',
      desc: 'A cybernetic noir thriller set in futuristic Tokyo.'
    },
    {
      id: 2,
      title: 'The Silent Peak',
      category: 'Documentary',
      videoUrl: showcaseVideoPool[1],
      poster: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=1200&auto=format&fit=crop',
      duration: '04:12',
      desc: 'Exploring the untouched glaciers of Northern Patagonia.'
    },
    {
      id: 3,
      title: 'Sintel: Dragon Realm',
      category: 'Fantasy',
      videoUrl: showcaseVideoPool[2],
      poster: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1200&auto=format&fit=crop',
      duration: '03:18',
      desc: 'An epic tale of forgotten magic and ancient dragons.'
    },
    {
      id: 4,
      title: 'Midnight Symphony',
      category: 'Music',
      videoUrl: showcaseVideoPool[3],
      poster: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=1200&auto=format&fit=crop',
      duration: '03:50',
      desc: 'A surreal visual album for modern orchestrations.'
    },
    {
      id: 5,
      title: 'Shadows in the Mist',
      category: 'Drama',
      videoUrl: showcaseVideoPool[4],
      poster: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?q=80&w=1200&auto=format&fit=crop',
      duration: '01:55',
      desc: 'An intimate character study set in 1950s London.'
    },
    {
      id: 6,
      title: 'Aura Autonomous',
      category: 'Commercial',
      videoUrl: showcaseVideoPool[5],
      poster: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=1200&auto=format&fit=crop',
      duration: '01:00',
      desc: 'Cinematic brand reveal for next-generation electric sports cars.'
    }
  ];

  const filteredShowcase = activeShowcase === 'all'
    ? showcaseItems
    : showcaseItems.filter((item) => item.category.toLowerCase() === activeShowcase.toLowerCase());

  const faqs = [
    {
      q: 'What is REYVIA Studio?',
      a: 'REYVIA Studio is a cinematic production workspace that helps teams and creators turn concepts into polished visual stories, scene plans, and final motion output.'
    },
    {
      q: 'What does the name REYVIA stand for?',
      a: 'REYVIA represents our core philosophy: Release Your Vision Into Action.'
    },
    {
      q: 'What can I create with REYVIA Studio?',
      a: 'You can create short films, music videos, documentaries, commercials, branded narratives, and visual stories with consistent characters and cinematic pacing.'
    },
    {
      q: 'Can I start from an existing screenplay or script?',
      a: 'Yes. You can import a script, scene outline, or creative brief and turn it into a structured production pipeline with clear visual direction.'
    },
    {
      q: 'How does continuity stay consistent?',
      a: 'The studio keeps character identity, environment, and visual style anchored across the entire production so each scene feels intentional and cohesive.'
    },
    {
      q: 'Can I edit and direct individual shots?',
      a: 'Absolutely. You can refine framing, camera movement, lighting, and performance direction at any stage of the process.'
    },
    {
      q: 'Is REYVIA suitable for professional creators?',
      a: 'Yes. It is designed for filmmakers, creative agencies, and visual storytellers who want premium output without compromising production speed.'
    },
    {
      q: 'How do I get started?',
      a: 'Click Start Creating to enter the studio and begin shaping your first project in minutes.'
    }
  ];

  if (showSignup) {
    return (
      <div className="min-h-screen bg-[#050608] text-[#edf3ff] font-sans relative overflow-x-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.18),transparent_30%),radial-gradient(circle_at_bottom,_rgba(168,85,247,0.12),transparent_30%)]" />
        <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl items-center justify-center px-4 py-16 sm:px-6">
          <div className="w-full max-w-xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b0d15]/90 shadow-[0_30px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl">
            <div className="border-b border-white/10 px-6 py-5 sm:px-8">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-purple-600 to-amber-500 p-[1px]">
                    <div className="flex h-full w-full items-center justify-center rounded-[11px] bg-[#06070a]">
                      <LogoMark className="h-5 w-5" />
                    </div>
                  </div>
                  <div>
                    <div className="font-display text-xl font-black tracking-tight text-white">REYVIA</div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-indigo-400">Waitlist</div>
                  </div>
                </div>
                <button
                  onClick={() => setShowSignup(false)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:text-white"
                >
                  Back
                </button>
              </div>
            </div>

            <div className="px-6 py-8 sm:px-8">
              <div className="mb-8 text-center">
                <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.32em] text-indigo-400">Early access</p>
                <h1 className="font-display text-3xl font-black text-white sm:text-5xl">Join the waitlist</h1>
                <p className="mt-3 text-sm text-slate-300 sm:text-base">
                  Get first access to the REYVIA Studio launch and new cinematic tools.
                </p>
              </div>

              {signupSubmitted ? (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center">
                  <div className="mb-2 text-3xl">✓</div>
                  <h2 className="text-xl font-bold text-white">You’re on the list.</h2>
                  <p className="mt-2 text-sm text-emerald-100">
                    Thanks, {signupData.name || 'friend'} — we’ll be in touch at {signupData.email || 'your email'}.
                  </p>
                  <button
                    onClick={() => setShowSignup(false)}
                    className="mt-5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-500 px-6 py-3 text-sm font-bold text-white shadow-xl shadow-indigo-600/30 transition-transform hover:scale-[1.02]"
                  >
                    Back to home
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSignupSubmit} className="space-y-5">
                  <div>
                    <label htmlFor="name" className="mb-2 block text-sm font-medium text-slate-200">Full name</label>
                    <input
                      id="name"
                      type="text"
                      value={signupData.name}
                      onChange={(event) => setSignupData({ ...signupData, name: event.target.value })}
                      placeholder="Your full name"
                      required
                      className="w-full rounded-2xl border border-white/10 bg-[#101421] px-4 py-3.5 text-base text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  <div>
                    <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-200">Email</label>
                    <input
                      id="email"
                      type="email"
                      value={signupData.email}
                      onChange={(event) => setSignupData({ ...signupData, email: event.target.value })}
                      placeholder="you@example.com"
                      required
                      className="w-full rounded-2xl border border-white/10 bg-[#101421] px-4 py-3.5 text-base text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-500 px-6 py-3.5 text-base font-bold text-white shadow-2xl shadow-indigo-600/40 transition-all hover:scale-[1.01] active:scale-[0.99]"
                  >
                    Join the waitlist
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050608] text-[#edf3ff] font-sans relative overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute left-[8%] top-[15%] animate-[float_18s_ease-in-out_infinite] opacity-30">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="18" stroke="#6d7cff" strokeWidth="1" strokeDasharray="4 4" />
            <path d="M20 5V35M5 20H35" stroke="#8b5cf6" strokeWidth="1" />
          </svg>
        </div>
        <div className="absolute right-[10%] top-[45%] animate-[float_22s_ease-in-out_infinite_reverse] opacity-25">
          <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
            <polygon points="30,5 55,20 55,50 30,55 5,50 5,20" stroke="#f5c76b" strokeWidth="1" />
            <circle cx="30" cy="30" r="8" fill="#6d7cff" fillOpacity="0.2" />
          </svg>
        </div>
        <div className="absolute bottom-[20%] left-[12%] animate-[float_25s_ease-in-out_infinite] opacity-20">
          <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
            <circle cx="40" cy="40" r="35" stroke="#8b5cf6" strokeWidth="1" />
            <path d="M40 5L40 25M75 40L55 40M40 75L40 55M5 40L25 40" stroke="#6d7cff" strokeWidth="1" />
          </svg>
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:5rem_5rem]" />
      </div>

      <nav className={`fixed left-0 right-0 top-0 z-50 transition-all duration-500 ${scrolled ? 'border-b border-white/10 bg-[#06070a]/90 py-3.5 shadow-2xl shadow-black/90 backdrop-blur-xl' : 'bg-transparent py-6'}`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="header-brand group flex cursor-pointer items-center gap-3" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-purple-600 to-amber-500 p-[1px] shadow-lg shadow-indigo-500/20 transition-transform duration-300 group-hover:scale-105">
              <div className="flex h-full w-full items-center justify-center rounded-[11px] bg-[#06070a]">
                <LogoMark className="h-6 w-6" />
              </div>
            </div>
            <div className="flex min-w-0 items-baseline gap-1.5">
              <span className="brand-wordmark font-display text-2xl font-black tracking-tight text-white transition-colors group-hover:text-indigo-200">REYVIA</span>
              <span className="brand-sub font-mono text-[11px] uppercase tracking-widest text-indigo-400">Studio</span>
            </div>
          </div>

          <div className="hidden items-center gap-8 text-sm font-medium text-slate-300 md:flex">
            {['features', 'workflow', 'showcase', 'faq'].map((item) => (
              <a key={item} href={`#${item}`} className="relative py-1 capitalize transition-colors hover:text-white after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-indigo-500 after:transition-all hover:after:w-full">{item}</a>
            ))}
          </div>

          <div className="hidden items-center gap-4 md:flex">
            <button onClick={handleDashboardLogin} className="px-3 py-2 text-sm font-semibold text-slate-300 transition-colors hover:text-white">Sign In</button>
            <button onClick={handleStartCreating} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-500 px-6 py-2.5 text-sm font-semibold text-white shadow-xl shadow-indigo-600/30 transition-all duration-300 hover:scale-[1.03] hover:shadow-indigo-600/50 active:scale-[0.97]">
              <span>Start Creating</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          </div>

          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-slate-300 hover:text-white md:hidden">
            <div className="flex h-4 w-5 flex-col justify-between">
              <span className={`h-0.5 w-full bg-current transition-all duration-300 ${mobileMenuOpen ? 'translate-y-1.5 rotate-45' : ''}`} />
              <span className={`h-0.5 w-full bg-current transition-opacity duration-300 ${mobileMenuOpen ? 'opacity-0' : ''}`} />
              <span className={`h-0.5 w-full bg-current transition-all duration-300 ${mobileMenuOpen ? '-translate-y-1.5 -rotate-45' : ''}`} />
            </div>
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="space-y-4 border-b border-white/10 bg-[#090a10] px-6 py-6 shadow-2xl md:hidden">
            {['features', 'workflow', 'showcase', 'faq'].map((item) => (
              <a key={item} href={`#${item}`} onClick={() => setMobileMenuOpen(false)} className="block py-2 text-base font-medium capitalize text-slate-300 hover:text-white">{item}</a>
            ))}
            <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
              <button onClick={handleDashboardLogin} className="w-full rounded-xl border border-white/10 py-3 text-sm font-medium text-slate-200">Sign In</button>
              <button onClick={handleStartCreating} className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30">Start Creating</button>
            </div>
          </div>
        )}
      </nav>

      <section className="relative z-10 overflow-hidden pb-24 pt-36 md:pb-36 md:pt-48">
        <div className="pointer-events-none absolute inset-0 z-0 block h-full w-full overflow-hidden">
          <video src={HERO_VIDEO} autoPlay loop muted playsInline preload="auto" className="h-full w-full object-cover opacity-60 blur-[0.5px]" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#050608] via-transparent to-[#050608]" />
        </div>
        <div className="pointer-events-none absolute left-1/2 top-1/4 h-[450px] w-[750px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-tr from-indigo-600/30 via-purple-600/20 to-amber-500/15 blur-[150px]" />

        <div className="relative z-10 mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h1 data-reveal className="mx-auto mb-6 max-w-5xl font-display text-5xl font-black leading-[1.04] tracking-tight text-white sm:text-7xl lg:text-8xl">
            Turn your ideas <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-white via-indigo-100 via-purple-200 to-amber-200 bg-clip-text text-transparent">into cinema.</span>
          </h1>

          <p data-reveal className="mx-auto mb-10 max-w-2xl text-lg font-normal text-slate-300 sm:text-xl">
            Craft stories, direct scenes, and generate polished cinematic video in one elegant production workspace.
          </p>

          <div data-reveal className="mb-20 flex flex-col items-center justify-center gap-5 sm:flex-row">
            <button onClick={handleStartCreating} className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-500 px-9 py-4.5 text-base font-bold text-white shadow-2xl shadow-indigo-600/40 transition-all hover:scale-[1.03] hover:shadow-indigo-600/60 active:scale-[0.98] sm:w-auto">
              <Sparkles className="h-5 w-5 text-amber-300" />
              <span>Start Creating</span>
            </button>
            <button onClick={handleExploreStudio} className="flex w-full items-center justify-center gap-2.5 rounded-2xl border border-white/15 bg-white/5 px-9 py-4.5 text-base font-bold text-slate-200 backdrop-blur-md transition-all hover:border-white/30 hover:bg-white/10 sm:w-auto">
              <Play className="h-4 w-4 fill-current text-indigo-400" />
              <span>Explore Studio</span>
            </button>
          </div>

          <div data-reveal className="mx-auto max-w-5xl rounded-3xl border border-white/15 bg-gradient-to-b from-white/20 via-white/5 to-transparent p-1 shadow-2xl shadow-black">
            <div className="overflow-hidden rounded-2xl bg-[#0b0c13]">
              <div className="flex items-center justify-between border-b border-white/10 bg-[#0d0e17] px-5 py-3.5 text-xs font-mono text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full bg-red-500/80" />
                  <span className="inline-block h-3 w-3 rounded-full bg-yellow-500/80" />
                  <span className="inline-block h-3 w-3 rounded-full bg-green-500/80" />
                  <span className="ml-2 font-bold text-slate-300">REYVIA Studio // Project_Cinematic_Ocean.rey</span>
                </div>
                <div className="flex items-center gap-4 text-[11px] text-indigo-300">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 animate-ping rounded-full bg-emerald-400" /> Live 4K Render</span>
                  <span className="rounded bg-indigo-500/20 px-2 py-0.5 font-bold text-indigo-300">24 FPS</span>
                </div>
              </div>

              <div className="studio-pipeline-grid border-b border-white/10 bg-[#090a10] p-3 md:p-6">
                {[
                  { step: '01', title: 'IDEA', desc: 'Logline & concept', icon: Wand2, active: false },
                  { step: '02', title: 'STORY', desc: 'Script breakdown', icon: FileText, active: false },
                  { step: '03', title: 'CHARACTERS', desc: 'Identity anchor', icon: Users, active: false },
                  { step: '04', title: 'SCENES', desc: 'Director board', icon: Layers, active: false },
                  { step: '05', title: 'VIDEO', desc: 'Cinematic motion', icon: Camera, active: true },
                  { step: '06', title: 'FINAL FILM', desc: 'Master export', icon: Film, active: false }
                ].map((item, idx) => (
                  <div key={idx} className={`pipeline-card ${item.active ? 'active' : ''}`}>
                    <div className="pipeline-topline">
                      <span className="pipeline-step">{item.step}</span>
                      <item.icon className="pipeline-icon" />
                    </div>
                    <div className="pipeline-title">{item.title}</div>
                    <div className="pipeline-desc">{item.desc}</div>
                  </div>
                ))}
              </div>

              <div className="group relative aspect-video w-full overflow-hidden bg-[#050609]">
                <video ref={heroVideoRef} src={HERO_VIDEO} autoPlay loop muted={heroMuted} playsInline preload="auto" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#07080c] via-transparent to-black/30" />
                <div className="absolute left-4 top-4 flex items-center gap-3">
                  <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/75 px-3.5 py-1.5 text-xs font-mono text-slate-200 backdrop-blur-md">
                    <Camera className="h-3.5 w-3.5 text-indigo-400" />
                    <span>Shot 05 // Cam A — 35mm Anamorphic T1.8</span>
                  </div>
                </div>
                <div className="absolute right-4 top-4 flex items-center gap-2">
                  <button onClick={toggleHeroPlay} className="rounded-xl border border-white/15 bg-black/75 p-2.5 text-white transition-colors hover:bg-black/90">{heroPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}</button>
                  <button onClick={toggleHeroMute} className="rounded-xl border border-white/15 bg-black/75 p-2.5 text-white transition-colors hover:bg-black/90">{heroMuted ? <VolumeX className="h-4 w-4 text-amber-400" /> : <Volume2 className="h-4 w-4 text-emerald-400" />}</button>
                </div>
                <div className="absolute bottom-4 left-4 right-4 flex flex-col items-start justify-between gap-3 md:bottom-6 md:left-6 md:right-6 md:flex-row md:items-end">
                  <div className="scene-overlay-card max-w-xl">
                    <div className="scene-meta-row">
                      <span className="scene-tag">SCENE 05</span>
                      <span className="scene-dot">•</span>
                      <span className="scene-label">CYBERPUNK OCEAN</span>
                      <span className="scene-dot">•</span>
                      <span className="scene-character">CHARACTER: KIRA</span>
                    </div>
                    <p className="scene-script">“Kira looks out into the expansive dark waters as sunlight glimmers across the waves.”</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="relative z-10 border-y border-white/5 bg-[#07080e] py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div data-reveal className="mx-auto mb-20 max-w-3xl text-center">
            <span className="text-xs font-mono uppercase tracking-widest text-indigo-400">Built for directors</span>
            <h2 className="mt-3 mb-6 font-display text-4xl font-black text-white sm:text-6xl">Everything you need to direct and produce.</h2>
            <p className="text-lg text-slate-300 sm:text-xl">A disciplined creative toolkit for moving from concept to final frame with precision and atmosphere.</p>
          </div>

          <div className="mobile-card-grid grid grid-cols-1 gap-8 md:grid-cols-3">
            {[
              { icon: Wand2, title: 'Create', subtitle: 'Idea to screenplay', desc: 'Turn concepts, outlines, or scripts into structured visual stories with emotion, pacing, and clear scene intent.' },
              { icon: Sliders, title: 'Direct', subtitle: 'Full shot control', desc: 'Shape camera movement, lighting mood, character behavior, and scene rhythm with tactile creative controls.' },
              { icon: Film, title: 'Produce', subtitle: 'Cinematic output', desc: 'Merge shots into polished sequences ready for release with cinematic grading, continuity, and export workflows.' }
            ].map((item, idx) => (
              <div
                data-reveal
                key={idx}
                style={{ transitionDelay: `${idx * 100}ms` }}
                className="group min-w-0 rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-8 shadow-2xl transition-all duration-500 hover:-translate-y-2 hover:border-indigo-500/50 hover:shadow-indigo-500/10 sm:p-10"
              >
                <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-500/10 transition-transform duration-300 group-hover:scale-110">
                  <item.icon className="h-7 w-7 text-indigo-400" />
                </div>
                <div className="mb-2 text-xs font-mono uppercase tracking-wider text-indigo-400">{item.subtitle}</div>
                <h3 className="mb-4 font-display text-3xl font-bold text-white">{item.title}</h3>
                <p className="text-base leading-relaxed text-slate-300">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="relative overflow-hidden bg-[#050608] py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div data-reveal className="mx-auto mb-16 max-w-3xl text-center">
            <span className="text-xs font-mono uppercase tracking-widest text-indigo-400">Creative workflow</span>
            <h2 className="mt-3 mb-6 font-display text-4xl font-black text-white sm:text-6xl">A studio built for cinematic thinking.</h2>
            <p className="text-lg text-slate-300 sm:text-xl">Direct each phase of production with structure, visual control, and a cinematic point of view.</p>
          </div>

          <div className="mobile-card-grid grid grid-cols-1 gap-8 lg:grid-cols-3">
            {[
              { phase: 'Phase 01', title: 'Concept', items: ['Translate an idea into story beats and visual direction.', 'Shape color, mood, framing, and emotional tone.', 'Build your narrative foundation before you render.'], icon: Wand2 },
              { phase: 'Phase 02', title: 'Shot craft', items: ['Direct framing, depth, motion, and lens behavior.', 'Preserve character continuity across every scene.', 'Iterate quickly without losing creative intent.'], icon: Camera },
              { phase: 'Phase 03', title: 'Final cut', items: ['Assemble scenes into a rhythmic cinematic sequence.', 'Polish sound, pacing, and visual grading for release.', 'Deliver a premium final product on a modern production timeline.'], icon: Film }
            ].map((card, idx) => (
              <div data-reveal key={idx} style={{ transitionDelay: `${idx * 110}ms` }} className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.02] p-6">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-500/10"><card.icon className="h-5 w-5 text-indigo-300" /></div>
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-indigo-300">{card.phase}</p>
                    <h3 className="text-xl font-bold text-white">{card.title}</h3>
                  </div>
                </div>
                <ul className="space-y-3 text-sm text-slate-300">
                  {card.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-400" /> {item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="showcase" className="border-t border-white/5 bg-[#050608] py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div data-reveal className="mx-auto mb-16 max-w-3xl text-center">
            <span className="text-xs font-mono uppercase tracking-widest text-indigo-400">Studio showcase</span>
            <h2 className="mt-3 mb-6 font-display text-4xl font-black text-white sm:text-6xl">Created with REYVIA.</h2>
            <p className="text-lg text-slate-300 sm:text-xl">A curated set of cinematic stories across story-driven genres and commercial applications.</p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              {['all', 'Sci-Fi', 'Documentary', 'Fantasy', 'Music', 'Drama', 'Commercial'].map((cat) => (
                <button key={cat} onClick={() => setActiveShowcase(cat)} className={`rounded-full px-5 py-2 text-xs font-bold transition-all ${activeShowcase === cat ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/40' : 'border border-white/10 bg-white/5 text-slate-400 hover:text-white'}`}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="mobile-card-grid grid grid-cols-1 gap-8 md:grid-cols-3">
            {filteredShowcase.map((item, idx) => (
              <div data-reveal key={item.id} onClick={() => setModalVideo(item)} style={{ transitionDelay: `${idx * 100}ms` }} className="group min-w-0 cursor-pointer overflow-hidden rounded-3xl border border-white/10 bg-[#0c0d16] shadow-2xl transition-all duration-500 hover:-translate-y-1.5 hover:border-indigo-500/60">
                <div className="relative aspect-video w-full overflow-hidden">
                  <img src={item.poster} alt={item.title} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                  <div className="absolute left-4 top-4 rounded-lg border border-white/15 bg-black/75 px-3 py-1 font-mono text-[11px] font-bold text-indigo-300 backdrop-blur-md">{item.category}</div>
                  <div className="absolute right-4 top-4 rounded-lg border border-white/15 bg-black/75 px-3 py-1 font-mono text-[11px] text-slate-200 backdrop-blur-md">{item.duration}</div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-2xl shadow-indigo-600/60"><Play className="ml-1 h-6 w-6 fill-current" /></div>
                  </div>
                </div>
                <div className="p-6">
                  <h3 className="showcase-heading mb-2 font-display text-xl font-bold text-white transition-colors group-hover:text-indigo-300">{item.title}</h3>
                  <p className="text-xs text-slate-400 sm:text-sm">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {modalVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-xl">
          <div className="relative w-full max-w-4xl overflow-hidden rounded-3xl border border-white/15 bg-[#090a12] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-white">{modalVideo.title}</h3>
                <span className="font-mono text-xs text-indigo-400">{modalVideo.category} • {modalVideo.duration}</span>
              </div>
              <button onClick={() => setModalVideo(null)} className="rounded-xl bg-white/5 p-2 text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="relative aspect-video w-full bg-black">
              <video src={modalVideo.videoUrl} controls autoPlay className="h-full w-full object-cover" />
            </div>
            <div className="flex flex-col items-start justify-between gap-4 bg-[#050608] p-6 sm:flex-row sm:items-center">
              <p className="max-w-lg text-xs text-slate-300 sm:text-sm">{modalVideo.desc}</p>
              <button onClick={() => { setModalVideo(null); handleStartCreating(); }} className="rounded-xl bg-indigo-600 px-6 py-3 text-xs font-bold text-white shadow-xl shadow-indigo-600/30 transition-colors hover:bg-indigo-500 sm:text-sm">Create similar production</button>
            </div>
          </div>
        </div>
      )}

      <section id="faq" className="border-t border-white/5 bg-[#07080e] py-28">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div data-reveal className="mb-20 text-center">
            <span className="text-xs font-mono uppercase tracking-widest text-indigo-400">Frequently asked questions</span>
            <h2 className="mt-3 mb-6 font-display text-4xl font-black text-white sm:text-6xl">Everything you need to know.</h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div data-reveal key={idx} style={{ transitionDelay: `${idx * 80}ms` }} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] transition-all duration-300">
                <button onClick={() => setActiveFaq(activeFaq === idx ? null : idx)} className="flex w-full items-center justify-between p-6 text-left font-bold text-white text-base sm:text-xl">
                  <span>{faq.q}</span>
                  <ChevronDown className={`h-5 w-5 text-indigo-400 transition-transform duration-300 ${activeFaq === idx ? 'rotate-180' : ''}`} />
                </button>
                {activeFaq === idx && <div className="border-t border-white/5 px-6 pb-6 pt-4 text-sm leading-relaxed text-slate-300 sm:text-base">{faq.a}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 overflow-hidden py-28">
        <div className="relative z-10 mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
          <div data-reveal className="relative overflow-hidden rounded-3xl border border-indigo-500/40 bg-gradient-to-b from-[#10111f] to-[#07080e] p-12 shadow-2xl shadow-indigo-600/20 sm:p-20">
            <div className="pointer-events-none absolute right-0 top-0 h-96 w-96 rounded-full bg-indigo-600/15 blur-3xl" />
            <h2 className="mb-6 font-display text-4xl font-black leading-tight text-white sm:text-7xl">Your next story starts here.</h2>
            <p className="mx-auto mb-12 max-w-2xl text-lg text-slate-300 sm:text-2xl">Release your vision into action with REYVIA Studio.</p>
            <div className="flex flex-col items-center justify-center gap-5 sm:flex-row">
              <button onClick={handleStartCreating} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-500 px-10 py-4.5 text-base font-bold text-white shadow-2xl shadow-indigo-600/40 transition-all hover:scale-[1.03] active:scale-[0.98] sm:w-auto">
                <Sparkles className="h-5 w-5 text-amber-300" />
                <span>Start creating</span>
              </button>
              <button onClick={handleExploreStudio} className="w-full rounded-2xl border border-white/15 bg-white/5 px-10 py-4.5 text-base font-bold text-slate-200 transition-all hover:bg-white/10 sm:w-auto">Explore REYVIA Studio</button>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/10 bg-[#040508] py-16 text-sm text-slate-400">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 sm:px-6 lg:flex-row lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30">
              <Clapperboard className="h-5 w-5" />
            </div>
            <span className="font-display text-xl font-black text-white">REYVIA Studio</span>
          </div>
          <div className="text-xs text-slate-500">© {new Date().getFullYear()} REYVIA Studio. Release your vision into action.</div>
        </div>
      </footer>
    </div>
  );
}

function LogoMark({ className = '' }) {
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg viewBox="0 0 64 64" className="h-full w-full" role="img" aria-label="Reyvia logo">
        <defs>
          <linearGradient id="reyviaGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="55%" stopColor="#6d7cff" />
            <stop offset="100%" stopColor="#f6c76b" />
          </linearGradient>
        </defs>
        <rect x="7" y="7" width="50" height="50" rx="16" fill="rgba(15,18,28,0.95)" stroke="url(#reyviaGradient)" strokeWidth="1.4" />
        <path d="M20 18v28M20 18h16c10 0 15 5 15 14s-5 14-15 14H20" stroke="url(#reyviaGradient)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M35 29H46" stroke="#f5d481" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M23 46L36 18" stroke="#edf4ff" strokeOpacity="0.72" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}
