import React, { useState } from 'react';
import useAppStore from '../store/useAppStore';
import { addCharacter, deleteCharacter } from '../api/projects';
import { AppInput } from './ui/AppInput';
import { AppButton } from './ui/AppButton';
import { useConfirm } from './ui/ConfirmDialog';
import { X, Plus, Trash2 } from 'lucide-react';

export default function CharacterLibrary({ characters, setCharacters }) {
  const { addToast } = useAppStore();
  const { confirm, confirmDialog } = useConfirm();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [description, setDescription] = useState('');
  const [clothing, setClothing] = useState('');
  const [voice, setVoice] = useState('');
  const [file, setFile] = useState(null);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    const formData = new FormData();
    formData.append('name', name);
    formData.append('age', age);
    formData.append('gender', gender);
    formData.append('description', description);
    formData.append('clothingDescription', clothing);
    formData.append('voiceStyle', voice);
    if (file) {
      formData.append('referenceImage', file);
    }

    try {
      const res = await addCharacter(formData);
      setCharacters([res.data, ...characters]);
      addToast('Character added successfully', 'success');
      
      // reset fields
      setName('');
      setAge('');
      setGender('');
      setDescription('');
      setClothing('');
      setVoice('');
      setFile(null);
      setShowAdd(false);
    } catch (err) {
      addToast('Failed to add character', 'error');
    }
  };

  const handleDelete = async (id) => {
    const ok = await confirm({
      title: 'Delete character?',
      message: 'This removes the character and its reference photo from the library. This cannot be undone.',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await deleteCharacter(id);
      setCharacters(characters.filter(c => c._id !== id));
      addToast('Character removed', 'success');
    } catch (err) {
      addToast('Failed to delete character', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="section-label m-0">Characters</h4>
        <AppButton
          variant="icon"
          onClick={() => setShowAdd(!showAdd)}
          title="Add Character"
          icon={showAdd ? X : Plus}
          className="w-8 h-8"
        />
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="p-5 bg-[var(--bg-elevated)] rounded-[var(--radius-lg)] border border-[var(--border-default)] space-y-4 animation-fade-in shadow-sm">
          <AppInput
            required
            placeholder="Character Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-4">
            <AppInput
              placeholder="Age"
              value={age}
              onChange={(e) => setAge(e.target.value)}
            />
            <AppInput
              placeholder="Gender"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
            />
          </div>
          <AppInput
            type="textarea"
            placeholder="Visual appearance details..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="[&>textarea]:min-h-[80px]"
          />
          <AppInput
            placeholder="Clothing/Outfit Style"
            value={clothing}
            onChange={(e) => setClothing(e.target.value)}
          />
          <div className="space-y-2">
            <label className="form-label text-xs">Reference Photo</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files[0])}
              className="text-[var(--text-muted)] text-sm w-full block border border-[var(--border-subtle)] rounded-[var(--radius-md)] p-2 bg-[var(--bg-surface)]"
            />
          </div>
          <AppButton type="submit" className="w-full mt-2">
            Save Character
          </AppButton>
        </form>
      )}

      {characters.length === 0 ? (
        <div className="empty-state py-8">
          <p className="text-[var(--text-muted)] text-sm">No characters added.</p>
          <p className="text-[var(--text-muted)] text-xs mt-1">Add a character to maintain consistent faces across every scene.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
          {characters.map((c) => (
            <div key={c._id} className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] flex items-center gap-3 relative group transition-all hover:bg-[var(--bg-overlay)] hover:border-[var(--border-default)]">
              {c.referenceImageUrl ? (
                <img src={c.referenceImageUrl} alt={c.name} className="w-12 h-12 rounded-full object-cover border border-[var(--border-default)]" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-[var(--gradient-brand)] flex items-center justify-center font-bold text-white text-lg">
                  {c.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0 pr-6">
                <span className="font-semibold text-[var(--text-primary)] block text-sm truncate">{c.name}</span>
                <span className="text-[var(--text-xs)] text-[var(--text-muted)] block truncate">{c.description || 'No description'}</span>
              </div>
              <AppButton
                variant="icon"
                onClick={() => handleDelete(c._id)}
                icon={Trash2}
                className="absolute right-2 w-8 h-8 opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-[var(--accent-red)] hover:bg-[var(--accent-red)] hover:bg-opacity-10 transition-opacity"
              />
            </div>
          ))}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
