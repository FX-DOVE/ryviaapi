import React, { useState } from 'react';
import useAppStore from '../store/useAppStore';
import { addEnvironment, deleteEnvironment } from '../api/projects';
import { AppInput } from './ui/AppInput';
import { AppButton } from './ui/AppButton';
import { X, Plus, Trash2 } from 'lucide-react';

export default function EnvironmentLibrary({ environments, setEnvironments }) {
  const { addToast } = useAppStore();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [timeOfDay, setTimeOfDay] = useState('daylight');
  const [weather, setWeather] = useState('clear');
  const [files, setFiles] = useState([]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', description);
    formData.append('timeOfDay', timeOfDay);
    formData.append('weather', weather);
    for (let i = 0; i < files.length; i++) {
      formData.append('referenceImages', files[i]);
    }

    try {
      const res = await addEnvironment(formData);
      setEnvironments([res.data, ...environments]);
      addToast('Environment added successfully', 'success');

      // reset fields
      setName('');
      setDescription('');
      setTimeOfDay('daylight');
      setWeather('clear');
      setFiles([]);
      setShowAdd(false);
    } catch (err) {
      addToast('Failed to add environment', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this environment?')) return;
    try {
      await deleteEnvironment(id);
      setEnvironments(environments.filter(e => e._id !== id));
      addToast('Environment removed', 'success');
    } catch (err) {
      addToast('Failed to delete environment', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="section-label m-0">Environments</h4>
        <AppButton
          variant="icon"
          onClick={() => setShowAdd(!showAdd)}
          title="Add Environment"
          icon={showAdd ? X : Plus}
          className="w-8 h-8"
        />
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="p-5 bg-[var(--bg-elevated)] rounded-[var(--radius-lg)] border border-[var(--border-default)] space-y-4 animation-fade-in shadow-sm">
          <AppInput
            required
            placeholder="Environment Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <AppInput
            placeholder="Time of Day (e.g. Sunset, Night)"
            value={timeOfDay}
            onChange={(e) => setTimeOfDay(e.target.value)}
          />
          <AppInput
            placeholder="Weather/Atmosphere (e.g. Rainy, Fog)"
            value={weather}
            onChange={(e) => setWeather(e.target.value)}
          />
          <AppInput
            type="textarea"
            placeholder="Visual details and architecture..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="[&>textarea]:min-h-[80px]"
          />
          <div className="space-y-2">
            <label className="form-label text-xs">Reference Photos (Max 5)</label>
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => setFiles(Array.from(e.target.files))}
              className="text-[var(--text-muted)] text-sm w-full block border border-[var(--border-subtle)] rounded-[var(--radius-md)] p-2 bg-[var(--bg-surface)]"
            />
            {files.length > 0 && (
              <p className="text-[var(--text-xs)] text-[var(--brand-primary)] mt-1 font-medium">{files.length} file(s) selected</p>
            )}
          </div>
          <AppButton type="submit" className="w-full mt-2">
            Save Environment
          </AppButton>
        </form>
      )}

      {environments.length === 0 ? (
        <div className="empty-state py-8">
          <p className="text-[var(--text-muted)] text-sm">No environments added.</p>
          <p className="text-[var(--text-muted)] text-xs mt-1">Add a location to reuse its aesthetic across multiple scenes.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
          {environments.map((e) => (
            <div key={e._id} className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] flex items-center gap-3 relative group transition-all hover:bg-[var(--bg-overlay)] hover:border-[var(--border-default)]">
              {e.referenceImageUrls?.length > 0 ? (
                <img src={e.referenceImageUrls[0]} alt={e.name} className="w-12 h-12 rounded-[var(--radius-sm)] object-cover border border-[var(--border-default)]" />
              ) : (
                <div className="w-12 h-12 rounded-[var(--radius-sm)] bg-[var(--gradient-brand)] flex items-center justify-center font-bold text-white text-lg">
                  {e.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0 pr-6">
                <span className="font-semibold text-[var(--text-primary)] block text-sm truncate">{e.name}</span>
                <span className="text-[var(--text-xs)] text-[var(--text-muted)] block truncate">{e.description || 'No description'}</span>
              </div>
              <AppButton
                variant="icon"
                onClick={() => handleDelete(e._id)}
                icon={Trash2}
                className="absolute right-2 w-8 h-8 opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-[var(--accent-red)] hover:bg-[var(--accent-red)] hover:bg-opacity-10 transition-opacity"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
