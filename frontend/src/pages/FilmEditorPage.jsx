import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Save, Download, RotateCcw, Undo2, Redo2, Loader2,
} from 'lucide-react';
import {
  getEditor, saveEditor, bootstrapEditor, exportEditor, uploadEditorAudio,
} from '../api/editor';
import useAppStore from '../store/useAppStore';
import MediaPanel from '../components/editor/MediaPanel';
import PreviewPlayer from '../components/editor/PreviewPlayer';
import InspectorPanel from '../components/editor/InspectorPanel';
import Timeline from '../components/editor/Timeline';
import {
  uid, recomputeDuration, videoClips, rippleDelete, splitClipAt, duplicateClip,
} from '../components/editor/editorUtils';

const MAX_HISTORY = 40;

export default function FilmEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const addToast = useAppStore((s) => s.addToast);

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [timeline, setTimeline] = useState(null);
  const [presets, setPresets] = useState(null);
  const [exportInfo, setExportInfo] = useState(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState(null);
  const [leftTab, setLeftTab] = useState('media');
  const [pxPerSec, setPxPerSec] = useState(48);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const historyRef = useRef([]);
  const futureRef = useRef([]);
  const saveTimer = useRef(null);
  const skipHistory = useRef(false);

  // Mobile detect
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const pushHistory = useCallback((prev) => {
    if (skipHistory.current) return;
    historyRef.current = [...historyRef.current.slice(-(MAX_HISTORY - 1)), prev];
    futureRef.current = [];
  }, []);

  const commitTimeline = useCallback((updater, { record = true } = {}) => {
    setTimeline((prev) => {
      if (!prev) return prev;
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (!next) return prev;
      const withDur = { ...next, duration: recomputeDuration(next.clips || []) };
      if (record) pushHistory(prev);
      return withDur;
    });
  }, [pushHistory]);

  // Autosave
  useEffect(() => {
    if (!timeline || loading) return undefined;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        setSaving(true);
        await saveEditor(id, timeline);
      } catch (err) {
        console.warn('[Editor] autosave failed', err.message);
      } finally {
        setSaving(false);
      }
    }, 900);
    return () => clearTimeout(saveTimer.current);
  }, [timeline, id, loading]);

  // Load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const { data } = await getEditor(id);
        if (cancelled) return;
        setTitle(data.title || 'Film Editor');
        setTimeline(data.timeline);
        setPresets(data.presets);
        setExportInfo(data.export);
        historyRef.current = [];
        futureRef.current = [];
      } catch (err) {
        addToast(err.response?.data?.error || 'Failed to load editor', 'error');
        navigate(`/app/jobs/${id}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, addToast, navigate]);

  // Poll export status
  useEffect(() => {
    if (!exporting && exportInfo?.status !== 'queued' && exportInfo?.status !== 'rendering') {
      return undefined;
    }
    const t = setInterval(async () => {
      try {
        const { data } = await getEditor(id);
        setExportInfo(data.export);
        if (data.export?.status === 'done') {
          setExporting(false);
          addToast('Export ready', 'success');
        } else if (data.export?.status === 'failed') {
          setExporting(false);
          addToast(data.export?.error || 'Export failed', 'error');
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(t);
  }, [exporting, exportInfo?.status, id, addToast]);

  const selectedClip = useMemo(
    () => (timeline?.clips || []).find((c) => c.id === selectedClipId) || null,
    [timeline, selectedClipId],
  );

  const undo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    skipHistory.current = true;
    setTimeline((cur) => {
      futureRef.current.push(cur);
      return prev;
    });
    skipHistory.current = false;
  }, []);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    skipHistory.current = true;
    setTimeline((cur) => {
      historyRef.current.push(cur);
      return next;
    });
    skipHistory.current = false;
  }, []);

  // Keyboard
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === 'b' || e.key === 'B' || (e.ctrlKey && e.key === 'b')) {
        e.preventDefault();
        handleSplit();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedClipId) handleDelete(selectedClipId);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClipId, timeline, undo, redo]);

  const updateClip = (updated) => {
    commitTimeline((tl) => ({
      ...tl,
      clips: tl.clips.map((c) => (c.id === updated.id ? updated : c)),
    }));
  };

  const handleMoveClip = (clipId, newStart) => {
    commitTimeline((tl) => ({
      ...tl,
      clips: tl.clips.map((c) => {
        if (c.id === clipId) return { ...c, start: Math.max(0, newStart) };
        if (c.linkedClipId === clipId) return { ...c, start: Math.max(0, newStart) };
        return c;
      }),
    }), { record: !dragRecording() });
  };

  // Avoid flooding history during drag — record once per gesture via flag
  const dragActive = useRef(false);
  function dragRecording() {
    if (!dragActive.current) {
      dragActive.current = true;
      setTimeout(() => { dragActive.current = false; }, 400);
      return false; // record this first move
    }
    return true; // skip subsequent
  }

  const handleTrimClip = (clipId, patch) => {
    commitTimeline((tl) => ({
      ...tl,
      clips: tl.clips.map((c) => {
        if (c.id === clipId) return { ...c, ...patch };
        if (c.linkedClipId === clipId) {
          return {
            ...c,
            start: patch.start != null ? patch.start : c.start,
            duration: patch.duration != null ? patch.duration : c.duration,
          };
        }
        return c;
      }),
    }), { record: !dragRecording() });
  };

  const handleSplit = () => {
    const vAt = videoClips(timeline?.clips || []).find(
      (c) => playhead > c.start + 0.05 && playhead < c.start + c.duration - 0.05,
    );
    const targetId = selectedClipId || vAt?.id;
    if (!targetId) return;
    commitTimeline((tl) => ({
      ...tl,
      clips: splitClipAt(tl.clips, targetId, playhead),
    }));
  };

  const handleDelete = (clipId) => {
    if (!clipId) return;
    commitTimeline((tl) => ({
      ...tl,
      clips: tl.clips.filter((c) => c.id !== clipId && c.linkedClipId !== clipId),
      transitions: (tl.transitions || []).filter(
        (t) => t.fromClipId !== clipId && t.toClipId !== clipId,
      ),
    }));
    setSelectedClipId(null);
  };

  const handleRippleDelete = (clipId) => {
    if (!clipId) return;
    commitTimeline((tl) => ({
      ...tl,
      clips: rippleDelete(tl.clips, clipId),
      transitions: (tl.transitions || []).filter(
        (t) => t.fromClipId !== clipId && t.toClipId !== clipId,
      ),
    }));
    setSelectedClipId(null);
  };

  const handleDuplicate = (clipId) => {
    if (!clipId) return;
    commitTimeline((tl) => ({
      ...tl,
      clips: duplicateClip(tl.clips, clipId),
    }));
  };

  const handleAddText = () => {
    const clip = {
      id: uid('t'),
      trackId: 'T1',
      type: 'text',
      label: 'Title',
      text: 'Your title here',
      start: playhead,
      duration: 3,
      fontSize: 56,
      fontColor: '#ffffff',
      align: 'center',
      opacity: 1,
      animIn: 'fade',
      animOut: 'fade',
      position: { x: 0, y: 0 },
    };
    commitTimeline((tl) => ({ ...tl, clips: [...tl.clips, clip] }));
    setSelectedClipId(clip.id);
    setLeftTab('text');
  };

  const handleApplyFilter = (filterId) => {
    if (!selectedClipId) return;
    commitTimeline((tl) => ({
      ...tl,
      clips: tl.clips.map((c) => (c.id === selectedClipId ? { ...c, filterId } : c)),
    }));
  };

  const handleApplyAnim = (animId) => {
    if (!selectedClipId) return;
    commitTimeline((tl) => ({
      ...tl,
      clips: tl.clips.map((c) => (
        c.id === selectedClipId ? { ...c, animIn: animId, animOut: animId } : c
      )),
    }));
  };

  const handleSetTransition = (type) => {
    if (!selectedClipId || !timeline) return;
    const vids = videoClips(timeline.clips);
    const idx = vids.findIndex((c) => c.id === selectedClipId);
    if (idx < 0 || idx >= vids.length - 1) {
      addToast('Select a clip that has a next clip', 'info');
      return;
    }
    const from = vids[idx];
    const to = vids[idx + 1];
    commitTimeline((tl) => {
      const rest = (tl.transitions || []).filter(
        (t) => !(t.fromClipId === from.id && t.toClipId === to.id),
      );
      if (type === 'cut') return { ...tl, transitions: rest };
      return {
        ...tl,
        transitions: [...rest, { id: uid('tr'), fromClipId: from.id, toClipId: to.id, type, duration: 0.5 }],
      };
    });
    addToast(`Transition: ${type}`, 'success');
  };

  const handleDucking = (db) => {
    commitTimeline((tl) => ({ ...tl, duckingDb: db }));
  };

  const handleAddKeyframe = (clipId, time) => {
    commitTimeline((tl) => ({
      ...tl,
      clips: tl.clips.map((c) => {
        if (c.id !== clipId) return c;
        const kf = {
          time: Math.max(0, time - c.start),
          prop: 'opacity',
          value: c.opacity ?? 1,
        };
        return { ...c, keyframes: [...(c.keyframes || []), kf] };
      }),
    }));
    addToast('Keyframe added', 'success');
  };

  const handleUploadAudio = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { data } = await uploadEditorAudio(id, file);
      skipHistory.current = true;
      setTimeline(data.timeline);
      skipHistory.current = false;
      addToast('Audio added to A2', 'success');
      setLeftTab('audio');
    } catch (err) {
      addToast(err.response?.data?.error || 'Upload failed', 'error');
    }
    e.target.value = '';
  };

  const handleBootstrap = async () => {
    try {
      const { data } = await bootstrapEditor(id);
      historyRef.current = [];
      futureRef.current = [];
      setTimeline(data.timeline);
      addToast('Timeline rebuilt from scenes', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Bootstrap failed', 'error');
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await saveEditor(id, timeline);
      addToast('Saved', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      await saveEditor(id, timeline);
      await exportEditor(id, timeline);
      setExportInfo({ status: 'queued', progress: 0 });
      addToast('Export started…', 'info');
    } catch (err) {
      setExporting(false);
      addToast(err.response?.data?.error || 'Export failed', 'error');
    }
  };

  if (loading || !timeline) {
    return (
      <div className="film-editor-root flex items-center justify-center">
        <Loader2 className="animate-spin text-[var(--brand-primary)]" size={32} />
      </div>
    );
  }

  return (
    <div className="film-editor-root">
      {/* Top bar */}
      <header className="editor-topbar flex items-center gap-2 px-3 py-2 border-b border-[var(--border-default)] bg-[var(--bg-raised)]">
        <button
          type="button"
          className="btn-icon"
          onClick={() => navigate(`/app/jobs/${id}`)}
          title="Back to job"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{title}</div>
          <div className="caption text-[var(--text-muted)]">
            Studio Editor {saving ? '· Saving…' : '· Autosave on'}
            {exportInfo?.status === 'rendering' && ` · Export ${exportInfo.progress || 0}%`}
            {exportInfo?.status === 'done' && ' · Export ready'}
          </div>
        </div>
        <button type="button" className="btn-icon" onClick={undo} title="Undo (Ctrl+Z)"><Undo2 size={16} /></button>
        <button type="button" className="btn-icon" onClick={redo} title="Redo"><Redo2 size={16} /></button>
        <button type="button" className="btn-icon hidden sm:inline-flex" onClick={handleBootstrap} title="Rebuild from scenes">
          <RotateCcw size={16} />
        </button>
        <button type="button" className="btn btn-secondary h-8 px-3 text-xs" onClick={handleSave} disabled={saving}>
          <Save size={14} className="mr-1" /> Save
        </button>
        <button
          type="button"
          className="btn btn-primary h-8 px-3 text-xs"
          onClick={handleExport}
          disabled={exporting || exportInfo?.status === 'rendering'}
        >
          {(exporting || exportInfo?.status === 'rendering')
            ? <Loader2 size={14} className="mr-1 animate-spin" />
            : <Download size={14} className="mr-1" />}
          Export
        </button>
        {exportInfo?.status === 'done' && (
          <a
            href={`/api/jobs/${id}/editor/stream?token=${encodeURIComponent(localStorage.getItem('accessToken') || '')}`}
            className="btn btn-secondary h-8 px-3 text-xs"
            download={`${title || 'edit'}.mp4`}
          >
            Download
          </a>
        )}
      </header>

      {/* Workspace */}
      {isMobile ? (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="h-[42%] min-h-[180px] flex flex-col">
            <PreviewPlayer
              timeline={timeline}
              playhead={playhead}
              setPlayhead={setPlayhead}
              playing={playing}
              setPlaying={setPlaying}
              jobId={id}
              aspectRatio={timeline.aspectRatio}
            />
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <Timeline
              timeline={timeline}
              playhead={playhead}
              setPlayhead={setPlayhead}
              selectedClipId={selectedClipId}
              setSelectedClipId={setSelectedClipId}
              pxPerSec={pxPerSec}
              setPxPerSec={setPxPerSec}
              onMoveClip={handleMoveClip}
              onTrimClip={handleTrimClip}
              onSplit={handleSplit}
              onDelete={handleDelete}
              onRippleDelete={handleRippleDelete}
              onDuplicate={handleDuplicate}
              simplified
            />
          </div>
          <div className="h-[28%] min-h-[120px] border-t border-[var(--border-subtle)] overflow-hidden flex">
            <div className="flex-1 overflow-hidden">
              <MediaPanel
                tab={leftTab}
                setTab={setLeftTab}
                timeline={timeline}
                onAddText={handleAddText}
                onApplyFilter={handleApplyFilter}
                onSetTransition={handleSetTransition}
                onApplyAnim={handleApplyAnim}
                onUploadAudio={handleUploadAudio}
                duckingDb={timeline.duckingDb ?? -12}
                onDuckingChange={handleDucking}
                selectedClipId={selectedClipId}
              />
            </div>
            <div className="w-[45%] border-l border-[var(--border-subtle)] overflow-hidden">
              <InspectorPanel
                clip={selectedClip}
                onChange={updateClip}
                onAddKeyframe={handleAddKeyframe}
                playhead={playhead}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 flex min-h-0">
            <div className="w-[240px] xl:w-[280px] shrink-0 border-r border-[var(--border-subtle)] overflow-hidden">
              <MediaPanel
                tab={leftTab}
                setTab={setLeftTab}
                timeline={timeline}
                onAddText={handleAddText}
                onApplyFilter={handleApplyFilter}
                onSetTransition={handleSetTransition}
                onApplyAnim={handleApplyAnim}
                onUploadAudio={handleUploadAudio}
                duckingDb={timeline.duckingDb ?? -12}
                onDuckingChange={handleDucking}
                selectedClipId={selectedClipId}
              />
            </div>
            <div className="flex-1 min-w-0 flex flex-col">
              <PreviewPlayer
                timeline={timeline}
                playhead={playhead}
                setPlayhead={setPlayhead}
                playing={playing}
                setPlaying={setPlaying}
                jobId={id}
                aspectRatio={timeline.aspectRatio}
              />
            </div>
            <div className="w-[260px] xl:w-[300px] shrink-0 border-l border-[var(--border-subtle)] overflow-hidden">
              <InspectorPanel
                clip={selectedClip}
                onChange={updateClip}
                onAddKeyframe={handleAddKeyframe}
                playhead={playhead}
              />
            </div>
          </div>
          <div className="h-[220px] shrink-0">
            <Timeline
              timeline={timeline}
              playhead={playhead}
              setPlayhead={setPlayhead}
              selectedClipId={selectedClipId}
              setSelectedClipId={setSelectedClipId}
              pxPerSec={pxPerSec}
              setPxPerSec={setPxPerSec}
              onMoveClip={handleMoveClip}
              onTrimClip={handleTrimClip}
              onSplit={handleSplit}
              onDelete={handleDelete}
              onRippleDelete={handleRippleDelete}
              onDuplicate={handleDuplicate}
            />
          </div>
        </div>
      )}
      {/* presets available for future inspector chips */}
      <span className="hidden">{presets?.filters?.length || 0}</span>
    </div>
  );
}
