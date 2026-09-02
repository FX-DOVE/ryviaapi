import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { XCircle, 
  Film,
  Sparkles,
  Clapperboard,
  Play,
  Layers,
  Wand2,
  Video,
  Music,
  Tv,
  Mic,
  Camera,
  ChevronDown,
  ArrowRight,
  CheckCircle2,
  Sliders,
  Users,
  Eye,
  FileText,
  Star,
  Bot
} from 'lucide-react';

export default function LandingPage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState(null);
  const [activeShowcase, setActiveShowcase] = useState('all');
  const [modalVideo, setModalVideo] = useState(null);
  const [activeDemoTab, setActiveDemoTab] = useState('scene01');
  const [promptInput, setPromptInput] = useState('Make this scene more emotional.');
  const [assistantResponse, setAssistantResponse] = useState(
    'I will increase the emotional tension, adjust the character expressions, refine the dialogue, and create a more intimate camera direction.'
  );

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 30);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleStartCreating = () => {
    navigate('/login');
  };

  const handleExploreStudio = () => {
    const el = document.getElementById('demo-workspace');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const showcaseItems = [
    {
      id: 1,
      title: 'Neon Odyssey: 2099',
      category: 'Sci-Fi',
      image: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=1200&auto=format&fit=crop',
      duration: '02:45',
      desc: 'A cybernetic noir thriller set in futuristic Tokyo.'
    },
    {
      id: 2,
      title: 'The Silent Peak',
      category: 'Documentary',
      image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=1200&auto=format&fit=crop',
      duration: '04:12',
      desc: 'Exploring the untouched glaciers of Northern Patagonia.'
    },
    {
      id: 3,
      title: 'Echoes of Eternity',
      category: 'Fantasy',
      image: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1200&auto=format&fit=crop',
      duration: '03:18',
      desc: 'An epic tale of forgotten magic and ancient kingdoms.'
    },
    {
      id: 4,
      title: 'Midnight Symphony',
      category: 'Music',
      image: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=1200&auto=format&fit=crop',
      duration: '03:50',
      desc: 'A surreal visual album for modern orchestrations.'
    },
    {
      id: 5,
      title: 'Shadows in the Mist',
      category: 'Drama',
      image: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?q=80&w=1200&auto=format&fit=crop',
      duration: '01:55',
      desc: 'An intimate character study set in 1950s London.'
    },
    {
      id: 6,
      title: 'Aura Autonomous',
      category: 'Commercial',
      image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=1200&auto=format&fit=crop',
      duration: '01:00',
      desc: 'Cinematic brand reveal for next-generation electric sports cars.'
    }
  ];

  const filteredShowcase = activeShowcase === 'all'
    ? showcaseItems
    : showcaseItems.filter(item => item.category.toLowerCase() === activeShowcase.toLowerCase());

  const faqs = [
    {
      q: 'What is ORYVIA Studio?',
      a: 'ORYVIA Studio is an AI-powered creative filmmaking workspace that helps creators, directors, and storytellers transform original concepts and scripts into complete cinematic video productions.'
    },
    {
      q: 'What can I create with ORYVIA Studio?',
      a: 'You can create short films, feature film concepts, documentaries, music videos, YouTube video series, commercials, visual stories, and talking character videos with full scene and style consistency.'
    },
    {
      q: 'Can I start from an existing screenplay or script?',
      a: 'Yes. You can paste a full script, scene notes, or even a brief story idea. ORYVIA Studio automatically parses scenes, dialogue, character descriptions, and visual directions into structured production components.'
    },
    {
      q: 'How does character consistency work?',
      a: 'ORYVIA Studio utilizes an advanced multi-angle character anchor system. Once you define a character’s face, hair, clothing, and aesthetic traits, ORYVIA maintains their identity across multiple scenes and camera angles.'
    },
    {
      q: 'Can I edit and direct individual shots?',
      a: 'Absolutely. You remain in full creative control. You can manually adjust camera angles, focal lengths, lighting, character actions, dialogue timing, and scene beats at any point in the creative process.'
    },
    {
      q: 'Is ORYVIA suitable for professional YouTube creators & filmmakers?',
      a: 'Yes. ORYVIA Studio is built specifically for creators who need high visual fidelity, structured project management, and rapid scene assembly without sacrificing creative direction.'
    },
    {
      q: 'Do I need prior filmmaking experience?',
      a: 'No prior technical filmmaking or 3D rendering background is required. The intelligent assistant guides you through story breakdown, shot setup, visual generation, and final output.'
    },
    {
      q: 'How do I get started?',
      a: 'Click "Start Creating" to access the studio workspace. You can start building your first project in minutes.'
    }
  ];

  return (
    <div className="min-h-screen bg-[#07080c] text-[#e4e4f4] font-sans selection:bg-indigo-500/30 selection:text-white">
      {/* ─── 7. NAVIGATION ─────────────────────────────────────────── */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-[#0a0b10]/90 backdrop-blur-md border-b border-white/10 py-3 shadow-2xl'
            : 'bg-transparent py-5'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-600 to-amber-500 p-[1px] flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <div className="w-full h-full bg-[#0a0b10] rounded-[11px] flex items-center justify-center">
                <Clapperboard className="w-5 h-5 text-indigo-400" />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-xl font-extrabold tracking-tight text-white">ORYVIA</span>
              <span className="text-xs font-mono tracking-widest text-indigo-400 uppercase font-semibold">Studio</span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#workflow" className="hover:text-white transition-colors">Workflow</a>
            <a href="#modes" className="hover:text-white transition-colors">Creative Modes</a>
            <a href="#showcase" className="hover:text-white transition-colors">Showcase</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          </div>

          <div className="hidden md:flex items-center gap-4">
            <button
              onClick={() => navigate('/login')}
              className="text-sm font-semibold text-slate-300 hover:text-white transition-colors px-3 py-2"
            >
              Sign In
            </button>
            <button
              onClick={handleStartCreating}
              className="group relative inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <span>Start Creating</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden min-w-11 min-h-11 flex items-center justify-center rounded-lg text-slate-300 hover:text-white bg-white/5 border border-white/10"
            aria-label="Toggle Navigation"
          >
            <div className="w-5 h-4 flex flex-col justify-between">
              <span className={`w-full h-0.5 bg-current transition-all ${mobileMenuOpen ? 'rotate-45 translate-y-1.5' : ''}`} />
              <span className={`w-full h-0.5 bg-current transition-opacity ${mobileMenuOpen ? 'opacity-0' : ''}`} />
              <span className={`w-full h-0.5 bg-current transition-all ${mobileMenuOpen ? '-rotate-45 -translate-y-1.5' : ''}`} />
            </div>
          </button>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#0d0e15] border-b border-white/10 px-6 py-6 space-y-4 animate-in slide-in-from-top-4">
            <a href="#features" onClick={() => setMobileMenuOpen(false)} className="flex items-center min-h-11 text-slate-300 hover:text-white">Features</a>
            <a href="#workflow" onClick={() => setMobileMenuOpen(false)} className="flex items-center min-h-11 text-slate-300 hover:text-white">Workflow</a>
            <a href="#modes" onClick={() => setMobileMenuOpen(false)} className="flex items-center min-h-11 text-slate-300 hover:text-white">Creative Modes</a>
            <a href="#showcase" onClick={() => setMobileMenuOpen(false)} className="flex items-center min-h-11 text-slate-300 hover:text-white">Showcase</a>
            <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="flex items-center min-h-11 text-slate-300 hover:text-white">FAQ</a>
            <div className="pt-4 border-t border-white/10 flex flex-col gap-3">
              <button
                onClick={() => navigate('/login')}
                className="w-full py-2.5 rounded-xl border border-white/10 text-slate-200 font-medium text-sm"
              >
                Sign In
              </button>
              <button
                onClick={handleStartCreating}
                className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm shadow-lg shadow-indigo-600/30"
              >
                Start Creating
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* ─── 5. HERO SECTION ────────────────────────────────────────── */}
      <section className="relative pt-32 pb-20 md:pt-44 md:pb-32 overflow-hidden">
        {/* Cinematic Backdrop Glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-indigo-600/20 via-purple-600/15 to-amber-500/10 blur-[130px] rounded-full pointer-events-none" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.08)_0%,transparent_70%)] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 mb-8 backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
            <span className="text-xs font-semibold tracking-wide uppercase text-indigo-300">
              Original Ideas. Release Your Vision Into Action.
            </span>
          </div>

          <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.08] max-w-5xl mx-auto mb-6">
            Turn Your Ideas <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-white via-indigo-200 to-purple-300 bg-clip-text text-transparent">
              Into Cinema.
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto mb-10 leading-relaxed font-normal">
            ORYVIA Studio gives creators an intelligent workspace to develop stories, build characters, generate cinematic scenes, and bring complete video projects to life.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <button
              onClick={handleStartCreating}
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-500 text-white font-semibold text-base shadow-xl shadow-indigo-600/30 hover:shadow-indigo-600/50 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className="w-5 h-5 text-amber-300" />
              <span>Start Creating</span>
            </button>
            <button
              onClick={handleExploreStudio}
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 font-semibold text-base backdrop-blur-sm transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4 fill-current text-indigo-400" />
              <span>Explore Studio</span>
            </button>
          </div>

          {/* ─── 6. HERO VISUAL ─────────────────────────────────────── */}
          <div className="relative max-w-5xl mx-auto rounded-2xl p-1 bg-gradient-to-b from-white/15 via-white/5 to-transparent border border-white/10 shadow-2xl shadow-black/80">
            <div className="bg-[#0b0c13] rounded-xl overflow-hidden relative">
              {/* Header Bar */}
              <div className="px-4 py-3 bg-[#0d0e17] border-b border-white/10 flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block" />
                  <span className="w-3 h-3 rounded-full bg-yellow-500/80 inline-block" />
                  <span className="w-3 h-3 rounded-full bg-green-500/80 inline-block" />
                  <span className="font-mono text-slate-400 ml-2">ORYVIA Studio // Project_Neon_Odyssey.ory</span>
                </div>
                <div className="flex items-center gap-3 font-mono text-[11px] text-indigo-300">
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> 4K Cinema Render</span>
                  <span className="bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded">24 FPS</span>
                </div>
              </div>

              {/* Multi-step Pipeline Visual */}
              <div className="p-6 md:p-8 grid grid-cols-2 md:grid-cols-6 gap-3 border-b border-white/5 bg-gradient-to-b from-[#0e101a] to-[#08090e]">
                {[
                  { step: '01', title: 'IDEA', desc: 'Logline & Concept', icon: Wand2, active: false },
                  { step: '02', title: 'STORY', desc: 'Script Breakdown', icon: FileText, active: false },
                  { step: '03', title: 'CHARACTERS', desc: 'Identity Anchor', icon: Users, active: false },
                  { step: '04', title: 'SCENES', desc: 'Director Board', icon: Layers, active: false },
                  { step: '05', title: 'VIDEO', desc: 'Cinematic Motion', icon: Camera, active: true },
                  { step: '06', title: 'FINAL FILM', desc: 'Master Export', icon: Film, active: false }
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      item.active
                        ? 'bg-indigo-600/20 border-indigo-500/50 text-white shadow-lg shadow-indigo-500/10'
                        : 'bg-white/[0.02] border-white/5 text-slate-400 hover:border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono text-[10px] text-indigo-400 font-bold">{item.step}</span>
                      <item.icon className={`w-3.5 h-3.5 ${item.active ? 'text-amber-400' : 'text-slate-500'}`} />
                    </div>
                    <div className="font-display text-xs font-bold tracking-wide text-slate-200">{item.title}</div>
                    <div className="text-[10px] text-slate-400 truncate">{item.desc}</div>
                  </div>
                ))}
              </div>

              {/* Main Preview Screen */}
              <div className="relative aspect-video w-full bg-[#050609] overflow-hidden group">
                <img
                  src="https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=1600&auto=format&fit=crop"
                  alt="Cinematic Preview"
                  className="w-full h-full object-cover object-center opacity-85 group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#07080c] via-transparent to-black/30" />

                {/* On-screen Filmmaking Overlay */}
                <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-lg text-xs font-mono">
                  <Camera className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-slate-200">Shot 04 // Cam A — 35mm Anamorphic T1.8</span>
                </div>

                <div className="absolute bottom-6 left-6 right-6 flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
                  <div className="bg-black/75 backdrop-blur-md border border-white/10 p-4 rounded-xl max-w-xl text-left">
                    <div className="flex items-center gap-2 text-indigo-400 text-xs font-mono mb-1 font-semibold">
                      <span>SCENE 04</span>
                      <span>•</span>
                      <span>CYBERPUNK ALLEY</span>
                      <span>•</span>
                      <span className="text-amber-400">CHARACTER: KIRA</span>
                    </div>
                    <p className="text-sm text-slate-200 font-medium leading-snug">
                      "Kira turns slowly as reflections of rain and neon flicker across her dark visor."
                    </p>
                  </div>

                  <div className="flex items-center gap-2 bg-indigo-600/90 hover:bg-indigo-500 backdrop-blur-md text-white text-xs font-semibold px-4 py-2.5 rounded-lg cursor-pointer transition-colors shadow-lg shadow-indigo-600/30">
                    <Play className="w-4 h-4 fill-current" />
                    <span>Play Scene Preview</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 8. VALUE PROPOSITION ────────────────────────────────────── */}
      <section id="features" className="py-24 bg-[#0a0b12] border-t border-b border-white/5 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-mono uppercase tracking-widest text-indigo-400 font-bold">Built For Storytellers</span>
            <h2 className="font-display text-3xl sm:text-5xl font-bold text-white mt-2 mb-4">
              Everything You Need to Direct & Produce
            </h2>
            <p className="text-slate-400 text-base sm:text-lg">
              Structured workspace tools designed specifically to bridge the gap between creative intent and final visual storytelling.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: Wand2,
                title: 'Create',
                subtitle: 'Idea to Screenplay',
                desc: 'Turn concepts, outlines, or complete scripts into structured visual stories broken down by acts, scenes, and beats.'
              },
              {
                icon: Sliders,
                title: 'Direct',
                subtitle: 'Full Shot Control',
                desc: 'Control characters, scenes, camera motion, dialogue, atmospheric lighting, and overarching visual styles.'
              },
              {
                icon: Film,
                title: 'Produce',
                subtitle: 'Complete Cinema',
                desc: 'Bring scenes together into cohesive, high-definition video productions ready for audience premiere.'
              }
            ].map((prop, idx) => (
              <div
                key={idx}
                className="group relative p-8 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-indigo-500/40 transition-all duration-300 hover:-translate-y-1 shadow-xl hover:shadow-indigo-500/10"
              >
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <prop.icon className="w-6 h-6 text-indigo-400" />
                </div>
                <div className="text-xs font-mono uppercase text-indigo-400 font-semibold mb-1">{prop.subtitle}</div>
                <h3 className="font-display text-2xl font-bold text-white mb-3">{prop.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{prop.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 9. ONE WORKSPACE SECTION ────────────────────────────────── */}
      <section className="py-24 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="font-display text-3xl sm:text-5xl font-bold text-white mb-4">
              One Studio. Every Part of the Story.
            </h2>
            <p className="text-slate-400 text-base sm:text-lg">
              Manage your entire filmmaking pipeline seamlessly inside a unified creative studio workspace.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4 mb-12">
            {[
              { label: 'Story', icon: FileText },
              { label: 'Script', icon: Sparkles },
              { label: 'Characters', icon: Users },
              { label: 'Scenes', icon: Layers },
              { label: 'Visuals', icon: Eye },
              { label: 'Voice', icon: Mic },
              { label: 'Video', icon: Video },
              { label: 'Editing', icon: Sliders }
            ].map((item, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-white/[0.02] border border-white/10 flex flex-col items-center justify-center text-center gap-2 hover:border-indigo-500/30 transition-colors">
                <item.icon className="w-5 h-5 text-indigo-400" />
                <span className="text-xs font-semibold text-slate-200">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 10. AI STORY DEVELOPMENT ────────────────────────────────── */}
      <section id="workflow" className="py-24 bg-[#090a10] border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-xs font-mono uppercase tracking-widest text-indigo-400 font-bold">Story Engine</span>
              <h2 className="font-display text-3xl sm:text-5xl font-bold text-white mt-2 mb-6">
                Start With an Idea.
              </h2>
              <p className="text-slate-300 text-base sm:text-lg leading-relaxed mb-8">
                Give ORYVIA Studio a concept, story outline, or full script and shape it into a structured production pipeline. Automatically structure screenplays, dialogue, scene beats, pacing, and visual prompts.
              </p>

              <div className="space-y-4">
                {[
                  'Screenplay & dialogue structure analysis',
                  'Automatic scene beat breakdown & pacing',
                  'Character list extraction & visual prompt suggestion',
                  'Narration & voice timing alignment'
                ].map((feat, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    <span className="text-slate-200 text-sm font-medium">{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-[#0e0f18] border border-white/10 shadow-2xl space-y-4">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400 pb-3 border-b border-white/10">
                <span>CONCEPT // INPUT</span>
                <span className="text-indigo-400">PARSE COMPLETE</span>
              </div>

              <div className="p-4 rounded-xl bg-black/40 border border-white/5 text-xs text-slate-300 font-mono">
                "In a neon-lit cyberpunk metropolis, an archivist named Kira discovers a encrypted memory chip containing humanity's lost history."
              </div>

              <div className="flex justify-center my-2">
                <ChevronDown className="w-5 h-5 text-indigo-400 animate-bounce" />
              </div>

              <div className="space-y-2">
                <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs flex justify-between items-center text-slate-200">
                  <span className="font-bold">Scene 01: The Archives</span>
                  <span className="font-mono text-indigo-400">EXT. NIGHT • RAIN</span>
                </div>
                <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs flex justify-between items-center text-slate-200">
                  <span className="font-bold">Scene 02: Discovery</span>
                  <span className="font-mono text-indigo-400">INT. LAB • DIM LIGHT</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 11. CHARACTER SYSTEM & 12. CONTINUITY ───────────────────── */}
      <section className="py-24 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-mono uppercase tracking-widest text-indigo-400 font-bold">Identity Engine</span>
            <h2 className="font-display text-3xl sm:text-5xl font-bold text-white mt-2 mb-4">
              Characters That Belong to Your Story.
            </h2>
            <p className="text-slate-400 text-base sm:text-lg">
              Designed to help creators maintain character identity and scene continuity across every shot in their production.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Character Card Anchor */}
            <div className="lg:col-span-1 p-6 rounded-2xl bg-gradient-to-b from-indigo-900/30 to-[#0e0f18] border border-indigo-500/30 shadow-xl">
              <div className="text-xs font-mono text-indigo-400 font-bold mb-3 uppercase">Character Anchor</div>
              <img
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=600&auto=format&fit=crop"
                alt="Character Reference"
                className="w-full aspect-square object-cover rounded-xl mb-4 border border-white/10"
              />
              <h3 className="font-display text-xl font-bold text-white">Kira Vance</h3>
              <p className="text-xs text-slate-400 mb-4">Cybernetic Memory Archivist</p>
              <div className="space-y-2 text-xs text-slate-300 font-mono">
                <div className="flex justify-between border-b border-white/5 py-1"><span>Visor:</span><span className="text-indigo-300">Dark Carbon</span></div>
                <div className="flex justify-between border-b border-white/5 py-1"><span>Jacket:</span><span className="text-indigo-300">Weathered Leather</span></div>
                <div className="flex justify-between py-1"><span>Aesthetic:</span><span className="text-indigo-300">Neo-Noir</span></div>
              </div>
            </div>

            {/* Scenes Consistency */}
            <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-6">
              {[
                {
                  shot: 'Scene 01 // Wide Shot',
                  title: 'Alleyway Approach',
                  image: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=600&auto=format&fit=crop'
                },
                {
                  shot: 'Scene 02 // Medium Close-up',
                  title: 'Retrieval Action',
                  image: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=600&auto=format&fit=crop'
                },
                {
                  shot: 'Scene 03 // Over the Shoulder',
                  title: 'Terminal Interface',
                  image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=600&auto=format&fit=crop'
                }
              ].map((sc, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-white/20 transition-all">
                  <img src={sc.image} alt={sc.title} className="w-full aspect-video object-cover rounded-lg mb-3" />
                  <div className="text-[11px] font-mono text-indigo-400 font-semibold mb-1">{sc.shot}</div>
                  <h4 className="text-sm font-bold text-white">{sc.title}</h4>
                  <p className="text-xs text-slate-400 mt-1">Identity traits synced across camera angles.</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── 13. CINEMATIC SCENE BUILDER ─────────────────────────────── */}
      <section className="py-24 bg-[#090a10] border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-mono uppercase tracking-widest text-indigo-400 font-bold">Director Interface</span>
            <h2 className="font-display text-3xl sm:text-5xl font-bold text-white mt-2 mb-4">
              Direct Every Shot.
            </h2>
            <p className="text-slate-400 text-base sm:text-lg">
              Take full control over camera angles, character movements, lighting, dialogue, and environmental moods.
            </p>
          </div>

          <div className="max-w-4xl mx-auto p-6 md:p-8 rounded-2xl bg-[#0c0d15] border border-white/10 shadow-2xl">
            <div className="flex items-center justify-between pb-6 border-b border-white/10 mb-6">
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 rounded bg-indigo-500/20 text-indigo-400 font-mono text-xs font-bold">SCENE 04</span>
                <h3 className="font-display text-lg font-bold text-white">Rainy Apartment Push-In</h3>
              </div>
              <span className="text-xs font-mono text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" /> READY FOR GENERATION
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                  <div className="text-xs font-mono text-indigo-400 mb-1 font-semibold">CHARACTER</div>
                  <div className="text-white font-medium">Marcus</div>
                </div>
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                  <div className="text-xs font-mono text-indigo-400 mb-1 font-semibold">ACTION</div>
                  <div className="text-slate-300">Marcus walks toward the window and looks outside into the dark rainy alley.</div>
                </div>
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                  <div className="text-xs font-mono text-indigo-400 mb-1 font-semibold">DIALOGUE</div>
                  <div className="text-amber-300 font-serif italic">"We need to leave now."</div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                  <div className="text-xs font-mono text-indigo-400 mb-1 font-semibold">CAMERA DIRECTION</div>
                  <div className="text-slate-300">Slow cinematic push-in on 50mm lens. Low angle.</div>
                </div>
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                  <div className="text-xs font-mono text-indigo-400 mb-1 font-semibold">ENVIRONMENT</div>
                  <div className="text-slate-300">Dim neon-lit interior apartment at midnight. Rain dripping on window glass.</div>
                </div>
                <div className="p-4 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-between text-indigo-300 font-semibold cursor-pointer hover:bg-indigo-600/30 transition-colors">
                  <span>Generate Motion Clip</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 22. PRODUCT DEMO SECTION ────────────────────────────────── */}
      <section id="demo-workspace" className="py-24 relative overflow-hidden bg-[#07080d]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-mono uppercase tracking-widest text-indigo-400 font-bold">Interactive Studio</span>
            <h2 className="font-display text-3xl sm:text-5xl font-bold text-white mt-2 mb-4">
              Explore the ORYVIA Workspace
            </h2>
            <p className="text-slate-400 text-base sm:text-lg">
              A comprehensive studio designed for directors, editors, and visual artists.
            </p>
          </div>

          {/* Interactive Workspace Mockup */}
          <div className="rounded-2xl border border-white/10 bg-[#0c0d14] overflow-hidden shadow-2xl grid grid-cols-1 lg:grid-cols-12 min-h-[500px]">
            {/* LEFT PANEL: Project Structure */}
            <div className="lg:col-span-3 p-4 border-r border-white/10 bg-[#090a0f] space-y-4">
              <div className="text-xs font-mono text-slate-400 font-bold uppercase pb-2 border-b border-white/10">Project Structure</div>
              <div className="space-y-1 text-xs font-mono">
                <div className="p-2 rounded bg-indigo-500/10 text-indigo-300 font-bold flex items-center gap-2">
                  <Film className="w-3.5 h-3.5" /> Episode 01: The Horizon
                </div>
                <div className="pl-4 space-y-1 text-slate-400">
                  <div className="p-1.5 rounded hover:bg-white/5 cursor-pointer flex items-center justify-between">
                    <span>Act 01: Arrival</span>
                  </div>
                  <div className="pl-3 space-y-1">
                    <button
                      onClick={() => setActiveDemoTab('scene01')}
                      className={`w-full text-left p-1.5 rounded transition-colors flex items-center justify-between ${
                        activeDemoTab === 'scene01' ? 'bg-indigo-600/30 text-white font-bold' : 'hover:bg-white/5 text-slate-400'
                      }`}
                    >
                      <span>Scene 01: Alley</span>
                      <span className="text-[10px] text-emerald-400">Done</span>
                    </button>
                    <button
                      onClick={() => setActiveDemoTab('scene02')}
                      className={`w-full text-left p-1.5 rounded transition-colors flex items-center justify-between ${
                        activeDemoTab === 'scene02' ? 'bg-indigo-600/30 text-white font-bold' : 'hover:bg-white/5 text-slate-400'
                      }`}
                    >
                      <span>Scene 02: Lab</span>
                      <span className="text-[10px] text-indigo-400">Active</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* CENTER PANEL: Video Preview */}
            <div className="lg:col-span-6 p-6 bg-[#050609] flex flex-col justify-between">
              <div className="relative aspect-video w-full rounded-xl overflow-hidden border border-white/10 group">
                <img
                  src={
                    activeDemoTab === 'scene01'
                      ? 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=1200&auto=format&fit=crop'
                      : 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1200&auto=format&fit=crop'
                  }
                  alt="Studio Preview"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-indigo-600/80 hover:bg-indigo-500 text-white flex items-center justify-center cursor-pointer shadow-lg shadow-indigo-600/40 transition-all hover:scale-110">
                    <Play className="w-6 h-6 fill-current ml-0.5" />
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between text-xs font-mono text-slate-400">
                <div className="flex items-center gap-4">
                  <span>00:01:24:12</span>
                  <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="w-2/3 h-full bg-indigo-500 rounded-full" />
                  </div>
                  <span>00:03:45:00</span>
                </div>
                <span>24 FPS • 4K</span>
              </div>
            </div>

            {/* RIGHT PANEL: Scene Control */}
            <div className="lg:col-span-3 p-4 border-l border-white/10 bg-[#090a0f] space-y-4">
              <div className="text-xs font-mono text-slate-400 font-bold uppercase pb-2 border-b border-white/10">Shot Direction</div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1 font-mono">ACTIVE CHARACTER</label>
                  <input type="text" readOnly value="Kira Vance" className="w-full px-3 py-1.5 rounded bg-white/5 border border-white/10 text-white font-medium" />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1 font-mono">CAMERA ANGLE</label>
                  <input type="text" readOnly value="Low Angle Push-in 35mm" className="w-full px-3 py-1.5 rounded bg-white/5 border border-white/10 text-slate-200" />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1 font-mono">ATMOSPHERE</label>
                  <input type="text" readOnly value="Cyberpunk Neon Fog" className="w-full px-3 py-1.5 rounded bg-white/5 border border-white/10 text-slate-200" />
                </div>
                <button
                  onClick={handleStartCreating}
                  className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs mt-4 transition-colors"
                >
                  Edit In Workspace
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 23. AI ASSISTANT ───────────────────────────────────────── */}
      <section className="py-24 bg-[#090a10] border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-xs font-mono uppercase tracking-widest text-indigo-400 font-bold">Creative Partner</span>
              <h2 className="font-display text-3xl sm:text-5xl font-bold text-white mt-2 mb-6">
                Your Creative Partner.
              </h2>
              <p className="text-slate-300 text-base sm:text-lg leading-relaxed mb-6">
                Collaborate with ORYVIA Studio to refine dialogue, adjust camera angles, enhance character performances, or solve scene continuity challenges.
              </p>

              <div className="space-y-3">
                {[
                  'Rewrite dialogue for specific emotional tone',
                  'Suggest dramatic camera moves & lighting schemes',
                  'Fix scene-to-scene plot and visual continuity',
                  'Generate alternative scene endings & beats'
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 text-slate-300 text-sm">
                    <Bot className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-[#0d0e16] border border-white/10 shadow-2xl space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-white/10 text-xs font-mono text-indigo-400 font-bold">
                <Bot className="w-4 h-4" /> ORYVIA Assistant Dialogue
              </div>

              {/* User Prompt */}
              <div className="flex items-start gap-3 justify-end">
                <div className="bg-indigo-600 text-white p-3 rounded-xl rounded-tr-none text-xs max-w-md">
                  "{promptInput}"
                </div>
              </div>

              {/* Assistant Response */}
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 flex-shrink-0">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div className="bg-white/5 border border-white/10 text-slate-200 p-3 rounded-xl rounded-tl-none text-xs max-w-md">
                  {assistantResponse}
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <input
                  type="text"
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg bg-black/50 border border-white/10 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={() => {
                    setAssistantResponse('Applying adjustments: Softening key light, adding subtle tear highlight, and lengthening shot hold duration by 1.5 seconds.');
                  }}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition-colors"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 24. CREATIVE MODES & 20. USE CASES ─────────────────────── */}
      <section id="modes" className="py-24 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-mono uppercase tracking-widest text-indigo-400 font-bold">Versatile Workflows</span>
            <h2 className="font-display text-3xl sm:text-5xl font-bold text-white mt-2 mb-4">
              Built for Different Kinds of Stories.
            </h2>
            <p className="text-slate-400 text-base sm:text-lg">
              Tailored creative modes and direct workflows for filmmakers, creators, agencies, and storytellers.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { title: 'Movies & Cinema', desc: 'Narrative films and trailers', icon: Film },
              { title: 'Documentaries', desc: 'Narration & archival style', icon: FileText },
              { title: 'Music Videos', desc: 'Rhythmic visual sequences', icon: Music },
              { title: 'YouTube Series', desc: 'Episodic story content', icon: Tv },
              { title: 'Commercials', desc: 'Brand & product showcases', icon: Star },
              { title: 'Storytelling', desc: 'Graphic novel & audio drama', icon: Wand2 },
              { title: 'Talking Characters', desc: 'Lip-synced performances', icon: Mic },
              { title: 'Creative Experiments', desc: 'Surreal visual art', icon: Sparkles }
            ].map((mode, idx) => (
              <div key={idx} className="p-5 rounded-xl bg-white/[0.02] border border-white/10 hover:border-indigo-500/40 transition-all hover:-translate-y-1">
                <mode.icon className="w-6 h-6 text-indigo-400 mb-3" />
                <h3 className="font-bold text-white text-base mb-1">{mode.title}</h3>
                <p className="text-xs text-slate-400">{mode.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 21. SHOWCASE ────────────────────────────────────────────── */}
      <section id="showcase" className="py-24 bg-[#0a0b12] border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="text-xs font-mono uppercase tracking-widest text-indigo-400 font-bold">Studio Showcase</span>
            <h2 className="font-display text-3xl sm:text-5xl font-bold text-white mt-2 mb-4">
              Created With ORYVIA Studio
            </h2>
            <p className="text-slate-400 text-base sm:text-lg">
              Explore productions across genres created entirely within the workspace.
            </p>

            {/* Filter Chips */}
            <div className="flex flex-wrap justify-center gap-2 mt-8">
              {['all', 'Sci-Fi', 'Documentary', 'Fantasy', 'Music', 'Drama', 'Commercial'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveShowcase(cat)}
                  className={`min-h-11 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    activeShowcase === cat
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                      : 'bg-white/5 text-slate-400 hover:text-white border border-white/10'
                  }`}
                >
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {filteredShowcase.map((item) => (
              <div
                key={item.id}
                onClick={() => setModalVideo(item)}
                className="group relative rounded-2xl overflow-hidden bg-[#0e0f18] border border-white/10 hover:border-indigo-500/50 transition-all cursor-pointer shadow-xl"
              >
                <div className="aspect-video w-full overflow-hidden relative">
                  <img
                    src={item.image}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute top-3 left-3 px-2.5 py-1 rounded bg-black/60 backdrop-blur-md text-[10px] font-mono text-indigo-300 font-semibold border border-white/10">
                    {item.category}
                  </div>
                  <div className="absolute top-3 right-3 px-2.5 py-1 rounded bg-black/60 backdrop-blur-md text-[10px] font-mono text-slate-300 border border-white/10">
                    {item.duration}
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg">
                      <Play className="w-5 h-5 fill-current ml-0.5" />
                    </div>
                  </div>
                </div>

                <div className="p-5">
                  <h3 className="font-display text-lg font-bold text-white mb-1 group-hover:text-indigo-300 transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-400 line-clamp-2">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Showcase Modal */}
      {modalVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-4xl rounded-2xl bg-[#0c0d14] border border-white/10 overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center px-6 py-4 border-b border-white/10">
              <div>
                <h3 className="text-base font-bold text-white">{modalVideo.title}</h3>
                <span className="text-xs font-mono text-indigo-400">{modalVideo.category} • {modalVideo.duration}</span>
              </div>
              <button
                onClick={() => setModalVideo(null)}
                className="min-w-11 min-h-11 flex items-center justify-center text-slate-400 hover:text-white p-2 rounded-lg bg-white/5"
              >
                ✕
              </button>
            </div>
            <div className="aspect-video w-full bg-black relative">
              <img src={modalVideo.image} alt={modalVideo.title} className="w-full h-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <div className="text-center p-6">
                  <Play className="w-16 h-16 text-indigo-400 mx-auto mb-3 animate-pulse" />
                  <p className="text-sm font-medium text-slate-200">Interactive Preview Player</p>
                </div>
              </div>
            </div>
            <div className="p-6 flex justify-between items-center bg-[#090a0f]">
              <p className="text-xs text-slate-400 max-w-lg">{modalVideo.desc}</p>
              <button
                onClick={() => {
                  setModalVideo(null);
                  handleStartCreating();
                }}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/30"
              >
                Create Similar Production
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 26. CTA SECTION ────────────────────────────────────────── */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-900/20 via-purple-900/10 to-transparent pointer-events-none" />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <div className="p-10 sm:p-16 rounded-3xl bg-gradient-to-b from-[#11121d] to-[#0a0b12] border border-indigo-500/30 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

            <h2 className="font-display text-4xl sm:text-6xl font-extrabold text-white mb-4 leading-tight">
              Your Next Story Starts Here.
            </h2>
            <p className="text-slate-300 text-lg sm:text-xl max-w-2xl mx-auto mb-10">
              Bring your original idea into the world with ORYVIA Studio.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={handleStartCreating}
                className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-500 text-white font-semibold text-base shadow-xl shadow-indigo-600/40 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <Sparkles className="w-5 h-5 text-amber-300" />
                <span>Start Creating</span>
              </button>
              <button
                onClick={handleExploreStudio}
                className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 font-semibold text-base transition-all"
              >
                Explore ORYVIA Studio
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 27. FAQ ────────────────────────────────────────────────── */}
      <section id="faq" className="py-24 bg-[#090a10] border-t border-white/5">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="text-xs font-mono uppercase tracking-widest text-indigo-400 font-bold">Frequently Asked Questions</span>
            <h2 className="font-display text-3xl sm:text-5xl font-bold text-white mt-2 mb-4">
              Everything You Need to Know
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className="rounded-xl bg-white/[0.02] border border-white/10 overflow-hidden transition-colors"
              >
                <button
                  onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
                  className="w-full p-6 text-left flex justify-between items-center font-bold text-white text-base sm:text-lg"
                >
                  <span>{faq.q}</span>
                  <ChevronDown className={`w-5 h-5 text-indigo-400 transition-transform ${activeFaq === idx ? 'rotate-180' : ''}`} />
                </button>
                {activeFaq === idx && (
                  <div className="px-6 pb-6 text-slate-300 text-sm leading-relaxed border-t border-white/5 pt-4">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 28. FOOTER ────────────────────────────────────────────── */}
      <footer className="py-16 bg-[#050609] border-t border-white/10 text-slate-400 text-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-10 mb-12">
            <div className="md:col-span-2 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold">
                  <Clapperboard className="w-4 h-4" />
                </div>
                <span className="font-display text-lg font-bold text-white">ORYVIA Studio</span>
              </div>
              <p className="text-slate-400 text-xs max-w-sm leading-relaxed">
                Original Ideas. Release Your Vision Into Action. The premier AI creative filmmaking workspace.
              </p>
            </div>

            <div>
              <h4 className="text-white font-bold text-xs uppercase tracking-wider mb-4">Product</h4>
              <ul className="space-y-2 text-xs">
                <li><a href="#demo-workspace" className="hover:text-white transition-colors">Studio</a></li>
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#workflow" className="hover:text-white transition-colors">Workflow</a></li>
                <li><a href="#showcase" className="hover:text-white transition-colors">Showcase</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-bold text-xs uppercase tracking-wider mb-4">Company</h4>
              <ul className="space-y-2 text-xs">
                <li><a href="#about" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#contact" className="hover:text-white transition-colors">Contact</a></li>
                <li><a href="#faq" className="hover:text-white transition-colors">FAQ</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-bold text-xs uppercase tracking-wider mb-4">Legal</h4>
              <ul className="space-y-2 text-xs">
                <li><a href="#privacy" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="#terms" className="hover:text-white transition-colors">Terms of Service</a></li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-slate-500">
            <div>© {new Date().getFullYear()} ORYVIA Studio. All rights reserved.</div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              <span>studio.ORYVIA.com</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
