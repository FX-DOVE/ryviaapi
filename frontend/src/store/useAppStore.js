import { create } from 'zustand';

const useAppStore = create((set, get) => ({
  // ─── User / Stats ─────────────────────────────────────────────
  user:  null,
  stats: null,
  setUser:  (user)  => set({ user }),
  setStats: (stats) => set({ stats }),

  // ─── Jobs ──────────────────────────────────────────────────────
  jobs:       [],
  jobsTotal:  0,
  jobsPage:   1,
  setJobs:    (jobs, total) => set({ jobs, jobsTotal: total }),
  addJob:     (job)  => set((s) => ({ jobs: [job, ...s.jobs] })),
  updateJob:  (id, patch) => set((s) => {
    const updatedJobs = s.jobs.map((j) => (String(j._id) === String(id) ? { ...j, ...patch } : j));
    const updatedActiveJob = (s.activeJob && String(s.activeJob._id) === String(id)) 
      ? { ...s.activeJob, ...patch } 
      : s.activeJob;
    return { jobs: updatedJobs, activeJob: updatedActiveJob };
  }),
  removeJob:  (id)   => set((s) => ({ 
    jobs: s.jobs.filter((j) => String(j._id) !== String(id)),
    activeJob: (s.activeJob && String(s.activeJob._id) === String(id)) ? null : s.activeJob
  })),

  // ─── Active job detail ─────────────────────────────────────────
  activeJob:    null,
  activeScenes: [],
  activeLogs:   [],
  setActiveJob:    (job)    => set({ activeJob: job }),
  setActiveScenes: (scenes) => set({ activeScenes: scenes }),
  setActiveLogs:   (logs)   => set({ activeLogs: logs }),
  addLog:          (log)    => set((s) => ({ activeLogs: [...s.activeLogs, log] })),
  
  // Patch a single scene by _id when the worker emits scene_updated
  updateScene: (sceneId, patch) => set((s) => ({
    activeScenes: s.activeScenes.map((sc) =>
      String(sc._id) === String(sceneId) ? { ...sc, ...patch } : sc,
    ),
  })),

  // ─── SaaS Projects & Libraries state ───────────────────────────
  projects: [],
  activeProject: null,
  characters: [],
  environments: [],
  brandKits: [],
  creativeProfiles: [],

  setProjects: (projects) => set({ projects }),
  setActiveProject: (project) => set({ activeProject: project }),
  setCharacters: (characters) => set({ characters }),
  setEnvironments: (environments) => set({ environments }),
  setBrandKits: (brandKits) => set({ brandKits }),
  setCreativeProfiles: (creativeProfiles) => set({ creativeProfiles }),

  addProject: (proj) => set((s) => ({ projects: [proj, ...s.projects] })),
  updateProjectState: (id, patch) => set((s) => {
    const updated = s.projects.map(p => String(p._id) === String(id) ? { ...p, ...patch } : p);
    const active = s.activeProject && String(s.activeProject._id) === String(id) 
      ? { ...s.activeProject, ...patch } 
      : s.activeProject;
    return { projects: updated, activeProject: active };
  }),
  
  addCharacterState: (char) => set((s) => ({ characters: [char, ...s.characters] })),
  updateCharacterState: (charId, patch) => set((s) => ({
    characters: s.characters.map(c => String(c._id) === String(charId) ? { ...c, ...patch } : c)
  })),
  removeCharacterState: (charId) => set((s) => ({
    characters: s.characters.filter(c => String(c._id) !== String(charId))
  })),

  addEnvironmentState: (env) => set((s) => ({ environments: [env, ...s.environments] })),
  updateEnvironmentState: (envId, patch) => set((s) => ({
    environments: s.environments.map(e => String(e._id) === String(envId) ? { ...e, ...patch } : e)
  })),
  removeEnvironmentState: (envId) => set((s) => ({
    environments: s.environments.filter(e => String(e._id) !== String(envId))
  })),

  addCreativeProfileState: (prof) => set((s) => ({ creativeProfiles: [prof, ...s.creativeProfiles] })),
  addBrandKitState: (kit) => set((s) => ({ brandKits: [kit, ...s.brandKits] })),

  // ─── System health ─────────────────────────────────────────────
  health: null,
  setHealth: (health) => set({ health }),

  // ─── UI state ──────────────────────────────────────────────────
  toasts: [],
  addToast: (msg, type = 'info') => {
    const id = Date.now();
    set((s) => ({ toasts: [...s.toasts, { id, msg, type }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export default useAppStore;
