import React, { useState } from 'react';
import { Play, Image as ImageIcon, Camera, MoreVertical, Edit2, CheckCircle, RefreshCw, Sparkles, Trash2, Mic, Settings } from 'lucide-react';
import AppButton from './ui/AppButton';

export default function ClipCard({ clip, onUpdate, onApprove, onRegenerate, onDelete, isGenerating }) {
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState('visual'); // visual, story, audio, camera
  const [editForm, setEditForm] = useState(clip);

  const handleSave = () => {
    onUpdate(clip._id, editForm);
    setIsEditing(false);
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'approved': return 'bg-green-100 text-green-700';
      case 'generating': return 'bg-blue-100 text-blue-700 animate-pulse';
      case 'done': return 'bg-emerald-100 text-emerald-700';
      case 'failed': return 'bg-red-100 text-red-700';
      case 'stale': return 'bg-amber-100 text-amber-700';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  const renderBadge = (label, status) => (
    <div className={`px-2 py-1 flex items-center gap-1.5 rounded text-xs font-medium ${getStatusColor(status)}`}>
      {status === 'approved' && <CheckCircle size={12} />}
      {status === 'generating' && <RefreshCw size={12} className="animate-spin" />}
      {label}: {status}
    </div>
  );

  return (
    <div className={`bg-white rounded-xl border-2 transition-all duration-200 ${
      clip.status === 'approved' ? 'border-green-400 shadow-green-100/50 shadow-lg' : 'border-slate-200 hover:border-slate-300'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50 rounded-t-xl">
        <div className="flex flex-col">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-slate-900 shadow-sm bg-white px-2 py-0.5 rounded border border-slate-200">
              Clip {clip.clipNumber}
            </span>
            <span className="text-slate-400 text-sm font-medium">{clip.duration}s</span>
            <div className="flex gap-2 ml-2">
              {renderBadge('Image', clip.imageStatus)}
              {renderBadge('Video', clip.videoStatus)}
            </div>
          </div>
          {clip.characters?.length > 0 && (
            <div className="mt-1.5 text-xs text-slate-500 font-medium">
              <span className="text-slate-400">Cast:</span> {clip.characters.join(', ')}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {clip.status !== 'approved' && (
            <>
              <AppButton variant="ghost" size="sm" icon={<Edit2 size={16} />} onClick={() => setIsEditing(!isEditing)}>
                {isEditing ? 'Cancel Edit' : 'Edit Prompts'}
              </AppButton>
              <AppButton variant="primary" size="sm" icon={<CheckCircle size={16} />} onClick={() => onApprove(clip._id)}>
                Approve Clip
              </AppButton>
            </>
          )}
          {clip.status === 'approved' && (
            <AppButton variant="ghost" className="text-green-600 border border-green-200 bg-green-50" size="sm" icon={<CheckCircle size={16} />} onClick={() => onApprove(clip._id)}>
              Approved
            </AppButton>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 py-2 border-b border-slate-100 flex gap-6 text-sm font-medium">
        <button onClick={() => setActiveTab('visual')} className={`flex items-center gap-1.5 pb-2 -mb-2 border-b-2 transition-colors ${activeTab === 'visual' ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
          <ImageIcon size={16} /> Visuals
        </button>
        <button onClick={() => setActiveTab('camera')} className={`flex items-center gap-1.5 pb-2 -mb-2 border-b-2 transition-colors ${activeTab === 'camera' ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
          <Camera size={16} /> Camera
        </button>
        <button onClick={() => setActiveTab('story')} className={`flex items-center gap-1.5 pb-2 -mb-2 border-b-2 transition-colors ${activeTab === 'story' ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
          <Settings size={16} /> Story & Action
        </button>
        <button onClick={() => setActiveTab('audio')} className={`flex items-center gap-1.5 pb-2 -mb-2 border-b-2 transition-colors ${activeTab === 'audio' ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
          <Mic size={16} /> Audio
        </button>
      </div>

      {/* Content Area */}
      <div className="p-4 bg-white rounded-b-xl flex gap-6">

        {/* Left: Media Preview */}
        <div className="w-1/3 flex-shrink-0 flex flex-col gap-3">
          <div className="aspect-video bg-slate-100 rounded-lg border border-slate-200 overflow-hidden relative group">
            {clip.videoPath ? (
              <video src={clip.videoPath} className="w-full h-full object-cover" controls playsInline />
            ) : clip.imagePath ? (
              <img src={clip.imagePath} alt="Scene Anchor" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                <ImageIcon size={32} className="mb-2 opacity-50" />
                <span className="text-sm font-medium">No Media Rendered</span>
                <span className="text-xs text-slate-400 mt-1 uppercase tracking-wide">{clip.generationMethod || 'image2video'}</span>
              </div>
            )}

            {/* Media Action Overlay */}
            {(clip.imagePath || clip.videoPath) && clip.status !== 'approved' && (
              <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-sm">
                 <button onClick={() => onRegenerate(clip._id, 'image')} className="bg-white/10 hover:bg-white/20 text-white rounded p-2 text-sm flex gap-2 items-center transition-colors">
                   <RefreshCw size={14} /> Re-roll Image
                 </button>
                 {clip.imagePath && (
                   <button onClick={() => onRegenerate(clip._id, 'video')} className="bg-primary-600/90 hover:bg-primary-500 text-white rounded p-2 text-sm flex gap-2 items-center transition-colors">
                     <Play size={14} /> Animate
                   </button>
                 )}
              </div>
            )}
          </div>

          {/* AI Helper Button */}
          {!isEditing && clip.status !== 'approved' && (
             <AppButton variant="secondary" className="w-full text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200" icon={<Sparkles size={16} className="text-primary-500" />}>
               AI Edit Assistant...
             </AppButton>
          )}
        </div>

        {/* Right: Tab Content */}
        <div className="w-2/3">
          {activeTab === 'visual' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 block">Image Prompt</label>
                {isEditing ? (
                  <textarea
                    className="w-full rounded-md border-slate-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500 min-h-[80px]"
                    value={editForm.imagePrompt}
                    onChange={(e) => setEditForm({...editForm, imagePrompt: e.target.value})}
                  />
                ) : (
                  <p className="text-sm text-slate-800 bg-slate-50 p-3 rounded-md border border-slate-100 leading-relaxed font-medium">
                    {clip.imagePrompt || <span className="text-slate-400 italic">No image prompt</span>}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex justify-between">
                  <span>Video Motion Prompt</span>
                  <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-400">{clip.generationMethod}</span>
                </label>
                {isEditing ? (
                  <textarea
                    className="w-full rounded-md border-slate-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500 min-h-[80px]"
                    value={editForm.videoPrompt}
                    onChange={(e) => setEditForm({...editForm, videoPrompt: e.target.value})}
                  />
                ) : (
                  <p className="text-sm text-slate-800 bg-slate-50 p-3 rounded-md border border-slate-100 leading-relaxed font-medium">
                    {clip.videoPrompt || <span className="text-slate-400 italic">No video prompt</span>}
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'story' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 block">Action Description</label>
                <div className="text-sm text-slate-800 bg-amber-50/50 p-3 rounded-md border border-amber-100 leading-relaxed">
                  {clip.actionDescription || 'No action specified.'}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 block">Continuity Rules</label>
                <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-md border border-slate-100">
                  {clip.continuityRequirements || 'No specific continuity rules for this clip.'}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'camera' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 p-3 rounded-md border border-slate-100">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1">Shot Type</label>
                {isEditing ? (
                  <input type="text" className="w-full rounded-md border-slate-300 shadow-sm text-sm" value={editForm.cameraShot} onChange={(e) => setEditForm({...editForm, cameraShot: e.target.value})} />
                ) : <div className="text-sm font-medium text-slate-800">{clip.cameraShot || 'Medium Shot'}</div>}
              </div>
              <div className="bg-slate-50 p-3 rounded-md border border-slate-100">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1">Angle</label>
                {isEditing ? (
                  <input type="text" className="w-full rounded-md border-slate-300 shadow-sm text-sm" value={editForm.cameraAngle} onChange={(e) => setEditForm({...editForm, cameraAngle: e.target.value})} />
                ) : <div className="text-sm font-medium text-slate-800">{clip.cameraAngle || 'Eye Level'}</div>}
              </div>
              <div className="bg-slate-50 p-3 rounded-md border border-slate-100 col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1">Camera Movement</label>
                {isEditing ? (
                  <input type="text" className="w-full rounded-md border-slate-300 shadow-sm text-sm" value={editForm.cameraMovement} onChange={(e) => setEditForm({...editForm, cameraMovement: e.target.value})} />
                ) : <div className="text-sm font-medium text-slate-800">{clip.cameraMovement || 'Static'}</div>}
              </div>
            </div>
          )}

          {activeTab === 'audio' && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-md border border-slate-100">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1">Dialogue</label>
                {clip.dialogue?.length > 0 ? (
                  <div className="space-y-2 mt-2">
                    {clip.dialogue.map((d, i) => (
                      <div key={i} className="text-sm">
                        <span className="font-bold text-slate-900 block">{d.speaker}</span>
                        <span className="text-slate-700 italic">"{d.line}"</span>
                      </div>
                    ))}
                  </div>
                ) : <div className="text-sm text-slate-500 italic">No dialogue in this clip.</div>}
              </div>

              <div className="bg-slate-50 p-3 rounded-md border border-slate-100">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex justify-between items-center">
                  <span>Voice Prompt</span>
                  {clip.lipSyncRequired && <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded normal-case text-xs tracking-normal">Lip Sync Required</span>}
                </label>
                {isEditing ? (
                  <textarea
                    className="w-full mt-2 rounded-md border-slate-300 shadow-sm text-sm min-h-[60px]"
                    value={editForm.voicePrompt}
                    onChange={(e) => setEditForm({...editForm, voicePrompt: e.target.value})}
                  />
                ) : <div className="text-sm mt-2 text-slate-800">{clip.voicePrompt || 'Standard voice processing.'}</div>}
              </div>
            </div>
          )}

          {/* Edit Save Button */}
          {isEditing && (
            <div className="mt-4 flex justify-end gap-2">
              <AppButton variant="ghost" onClick={() => setIsEditing(false)}>Cancel</AppButton>
              <AppButton variant="primary" onClick={handleSave}>Save Changes</AppButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
