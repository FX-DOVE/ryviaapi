import { useState } from 'react';
import { Image, CheckCircle, XCircle, Loader, Play, RotateCcw } from 'lucide-react';

const STATUS_ICON = {
  pending:    <Loader size={12} style={{ color: 'var(--text-muted)' }} />,
  generating: <Loader size={12} style={{ color: 'var(--accent-blue)', animation: 'spin 1s linear infinite' }} />,
  done:       <CheckCircle size={12} style={{ color: 'var(--accent-green)' }} />,
  failed:     <XCircle size={12} style={{ color: 'var(--accent-red)' }} />,
};

function sceneImageUrl(jobId, sceneId) {
  return `/api/jobs/${jobId}/scenes/${sceneId}/image`;
}

function sceneVideoUrl(jobId, sceneId) {
  return `/api/jobs/${jobId}/scenes/${sceneId}/video`;
}

function SceneCard({ scene, onRetryScene }) {
  const [showVideo, setShowVideo]   = useState(false);
  const [isHovered, setIsHovered]   = useState(false);

  const hasImage = Boolean(scene.imagePath);
  const hasVideo = Boolean(scene.videoPath);

  return (
    <div className="scene-item">
      <div
        className="scene-item-img"
        style={{ cursor: hasVideo ? 'pointer' : 'default' }}
        onClick={() => { if (hasVideo && !showVideo) setShowVideo(true); }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {showVideo && hasVideo ? (
          <video
            src={sceneVideoUrl(scene.jobId, scene._id)}
            autoPlay
            controls
            playsInline
            onError={() => setShowVideo(false)}
          />
        ) : (
          <>
            {hasImage ? (
              <img
                src={sceneImageUrl(scene.jobId, scene._id)}
                alt={`Scene ${scene.sceneNumber}`}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ) : (
              <Image size={28} style={{ color: 'var(--text-muted)' }} />
            )}

            {hasVideo && (
              <div
                className="scene-play-overlay"
                style={{ opacity: isHovered ? 1 : 0 }}
              >
                <div
                  className="scene-play-btn"
                  style={{ transform: isHovered ? 'scale(1)' : 'scale(0.9)' }}
                >
                  <Play size={24} style={{ color: '#fff', marginLeft: '4px' }} />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="scene-item-footer">
        <span>Scene {scene.sceneNumber}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {scene.status === 'failed' && onRetryScene && (
            <button
              className="scene-retry-btn"
              title="Retry scene media generation"
              onClick={(e) => { e.stopPropagation(); onRetryScene(scene._id); }}
            >
              <RotateCcw size={11} />
            </button>
          )}
          {STATUS_ICON[scene.status] || null}
        </span>
      </div>
    </div>
  );
}

export default function SceneGrid({ scenes = [], onRetryScene }) {
  if (!scenes.length) {
    return <p className="caption" style={{ padding: '8px 0' }}>No scenes generated yet.</p>;
  }

  return (
    <div className="scene-grid">
      {scenes.map((scene) => (
        <SceneCard key={scene._id} scene={scene} onRetryScene={onRetryScene} />
      ))}
    </div>
  );
}
