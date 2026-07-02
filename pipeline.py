# PIP INSTALL INSTRUCTIONS:
# pip install sentence-transformers numpy torch

import os
import sys
import json
import sqlite3
import random
import subprocess
import shutil
import numpy as np
from sentence_transformers import SentenceTransformer

# Initialize Sentence Transformer model globally
print("[Initialization] Loading sentence-transformer model: 'all-MiniLM-L6-v2'...")
model = SentenceTransformer("all-MiniLM-L6-v2")
print("[Initialization] Model loaded successfully.")

DB_PATH = "clip_registry.db"

# ==========================================
# MODULE 1: Scene Merger
# ==========================================

def scene_merger(transcript_segments):
    """
    MODULE 1: Merges adjacent transcript segments into scenes.
    A new scene starts ONLY when:
      - Location changes (using location keywords)
      - Emotion shifts (using emotion keywords)
      - Character changes (using proper noun extraction)
      - Time jump is detected (using time jump keywords)
    Target output: 25 to 40 scenes max for an 11-minute video.
    """
    if not transcript_segments:
        return []

    # Heuristic keywords
    emotion_keywords = ["abandonment", "poverty", "survival", "growth", "grief", "rise", "confrontation", "regret", "loneliness"]
    location_keywords = ["motor park", "mansion", "workshop", "market", "hospital", "home", "street", "gate"]
    time_jump_keywords = ["years later", "by 16", "one afternoon", "days later", "months later", "the next day", "after a while", "eventually", "soon after", "later that", "by the time", "after that"]

    stopwords = {
        "i", "he", "she", "they", "we", "you", "the", "a", "an", "and", "but", "or", "if", "because",
        "as", "until", "while", "of", "at", "by", "for", "with", "about", "against", "between",
        "into", "through", "during", "before", "after", "above", "below", "to", "from", "up",
        "down", "in", "out", "on", "off", "over", "under", "again", "further", "then", "once",
        "here", "there", "when", "where", "why", "how", "all", "any", "both", "each", "few",
        "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same",
        "so", "than", "too", "very", "can", "will", "just", "don", "should", "now", "this",
        "that", "these", "those", "my", "his", "her", "their", "our", "its"
    }

    def analyze_text(text):
        lower_text = text.lower()
        
        # Emotion detection
        detected_emotion = "neutral"
        for kw in emotion_keywords:
            if kw in lower_text:
                detected_emotion = kw
                break
                
        # Location detection
        detected_location = "neutral"
        for kw in location_keywords:
            if kw in lower_text:
                detected_location = kw
                break
                
        # Time jump detection
        has_time_jump = False
        for kw in time_jump_keywords:
            if kw in lower_text:
                has_time_jump = True
                break

        # Character extraction (proper nouns capitalized and not in stopwords)
        words = text.replace(",", " ").replace(".", " ").replace("?", " ").replace("!", " ").replace(";", " ").replace(":", " ").split()
        characters = []
        for w in words:
            clean_w = w.strip("'\"()[]{}")
            if clean_w and clean_w[0].isupper() and clean_w.lower() not in stopwords:
                if clean_w not in characters:
                    characters.append(clean_w)

        # Visual tags extraction
        visual_tags = []
        if detected_emotion != "neutral":
            visual_tags.append(detected_emotion)
        if detected_location != "neutral":
            visual_tags.append(detected_location)
        for w in words:
            clean_w = w.strip("'\"()[]{}.,!?").lower()
            if len(clean_w) > 4 and clean_w not in stopwords and clean_w not in visual_tags:
                visual_tags.append(clean_w)
                if len(visual_tags) >= 5:
                    break

        return detected_emotion, detected_location, has_time_jump, characters, visual_tags

    # Step 1: Pre-process segments
    processed_segments = []
    for seg in transcript_segments:
        text = seg.get("text", "")
        start = float(seg.get("start", 0.0))
        end = float(seg.get("end", 0.0))
        emotion, location, has_time_jump, characters, visual_tags = analyze_text(text)
        processed_segments.append({
            "start": start,
            "end": end,
            "duration": end - start,
            "text": text,
            "emotion": emotion,
            "location": location,
            "has_time_jump": has_time_jump,
            "characters": characters,
            "visual_tags": visual_tags
        })

    # Step 2: Merge segments into scenes
    scenes = []
    current_scene = None

    for seg in processed_segments:
        if current_scene is None:
            current_scene = {
                "start": seg["start"],
                "end": seg["end"],
                "text": seg["text"],
                "emotion": seg["emotion"],
                "location": seg["location"],
                "characters": list(seg["characters"]),
                "visual_tags": list(seg["visual_tags"])
            }
        else:
            split_triggered = False

            # Split check: Location changes
            if seg["location"] != "neutral" and current_scene["location"] != "neutral" and seg["location"] != current_scene["location"]:
                split_triggered = True
            # Split check: Emotion shifts
            elif seg["emotion"] != "neutral" and current_scene["emotion"] != "neutral" and seg["emotion"] != current_scene["emotion"]:
                split_triggered = True
            # Split check: Character transitions (changes in present character sets)
            elif seg["characters"] and current_scene["characters"] and set(seg["characters"]) != set(current_scene["characters"]):
                split_triggered = True
            # Split check: Time jumps
            elif seg["has_time_jump"]:
                split_triggered = True

            if split_triggered:
                current_scene["duration"] = current_scene["end"] - current_scene["start"]
                scenes.append(current_scene)
                current_scene = {
                    "start": seg["start"],
                    "end": seg["end"],
                    "text": seg["text"],
                    "emotion": seg["emotion"],
                    "location": seg["location"],
                    "characters": list(seg["characters"]),
                    "visual_tags": list(seg["visual_tags"])
                }
            else:
                # Merge segment
                current_scene["end"] = seg["end"]
                current_scene["text"] += " " + seg["text"]
                if current_scene["emotion"] == "neutral" and seg["emotion"] != "neutral":
                    current_scene["emotion"] = seg["emotion"]
                if current_scene["location"] == "neutral" and seg["location"] != "neutral":
                    current_scene["location"] = seg["location"]
                
                # Merge lists
                for c in seg["characters"]:
                    if c not in current_scene["characters"]:
                        current_scene["characters"].append(c)
                for t in seg["visual_tags"]:
                    if t not in current_scene["visual_tags"]:
                        current_scene["visual_tags"].append(t)

    if current_scene is not None:
        current_scene["duration"] = current_scene["end"] - current_scene["start"]
        scenes.append(current_scene)

    # Step 3: Enforce count limits (25 to 40 scenes max)
    # If the scene count exceeds 40, iteratively merge shortest adjacent scenes
    while len(scenes) > 40:
        min_idx = -1
        min_dur = float("inf")
        for i in range(len(scenes)):
            if scenes[i]["duration"] < min_dur:
                min_dur = scenes[i]["duration"]
                min_idx = i

        if min_idx == 0:
            merge_idx = 1
        elif min_idx == len(scenes) - 1:
            merge_idx = len(scenes) - 2
        else:
            if scenes[min_idx - 1]["duration"] < scenes[min_idx + 1]["duration"]:
                merge_idx = min_idx - 1
            else:
                merge_idx = min_idx + 1

        first_idx = min(min_idx, merge_idx)
        second_idx = max(min_idx, merge_idx)

        s1 = scenes[first_idx]
        s2 = scenes[second_idx]

        merged_scene = {
            "start": s1["start"],
            "end": s2["end"],
            "duration": s2["end"] - s1["start"],
            "text": s1["text"] + " " + s2["text"],
            "emotion": s1["emotion"] if s1["emotion"] != "neutral" else s2["emotion"],
            "location": s1["location"] if s1["location"] != "neutral" else s2["location"],
            "characters": list(set(s1["characters"] + s2["characters"])),
            "visual_tags": list(set(s1["visual_tags"] + s2["visual_tags"]))
        }
        scenes[first_idx] = merged_scene
        scenes.pop(second_idx)

    # Re-index scenes with proper ID
    for idx, scene in enumerate(scenes):
        scene["scene_id"] = idx + 1

    return scenes


# ==========================================
# MODULE 2: Clip Registry (SQLite Database)
# ==========================================

def init_db():
    """
    MODULE 2: Initializes SQLite Database for storing clips registry.
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS clips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clip_path TEXT NOT NULL,
      emotion TEXT,
      location TEXT,
      characters TEXT,
      visual_tags TEXT,
      duration REAL,
      embedding BLOB,
      use_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    conn.commit()
    conn.close()


def save_clip(clip_path, metadata_dict, embedding_bytes):
    """
    MODULE 2: Registers a clip metadata and embedding in the database.
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    char_json = json.dumps(metadata_dict.get("characters", []))
    tags_json = json.dumps(metadata_dict.get("visual_tags", []))
    
    cursor.execute("""
    INSERT INTO clips (clip_path, emotion, location, characters, visual_tags, duration, embedding)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        clip_path,
        metadata_dict.get("emotion", "neutral"),
        metadata_dict.get("location", "neutral"),
        char_json,
        tags_json,
        float(metadata_dict.get("duration", 0.0)),
        sqlite3.Binary(embedding_bytes)
    ))
    conn.commit()
    conn.close()


def get_all_clips():
    """
    MODULE 2: Retrieves all clip registry entries.
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, clip_path, emotion, location, characters, visual_tags, duration, embedding, use_count FROM clips")
    rows = cursor.fetchall()
    conn.close()

    clips = []
    for row in rows:
        clips.append({
            "id": row[0],
            "clip_path": row[1],
            "emotion": row[2],
            "location": row[3],
            "characters": json.loads(row[4]) if row[4] else [],
            "visual_tags": json.loads(row[5]) if row[5] else [],
            "duration": row[6],
            "embedding": row[7],
            "use_count": row[8]
        })
    return clips


def increment_use_count(clip_id):
    """
    MODULE 2: Increments usage counter of a clip in database.
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("UPDATE clips SET use_count = use_count + 1 WHERE id = ?", (clip_id,))
    conn.commit()
    conn.close()


# ==========================================
# MODULE 3: Clip Matcher
# ==========================================

def clip_matcher(scene, clip_registry):
    """
    MODULE 3: Matches a scene description against database clip embeddings.
    If best similarity score >= 0.65, returns action='reuse' + a random transformation.
    Otherwise, returns action='generate'.
    """
    if not clip_registry:
        return {
            "action": "generate",
            "clip_id": None,
            "clip_path": None,
            "similarity_score": 0.0,
            "transformation": None
        }

    # Embed scene text
    scene_text = scene.get("text", "")
    scene_emb = model.encode(scene_text)

    best_score = -1.0
    best_clip = None

    for clip in clip_registry:
        clip_emb_bytes = clip.get("embedding")
        if not clip_emb_bytes:
            continue
        
        # Load embedding from BLOB
        clip_emb = np.frombuffer(clip_emb_bytes, dtype=np.float32)

        # Cosine similarity
        dot_val = np.dot(scene_emb, clip_emb)
        norm_scene = np.linalg.norm(scene_emb)
        norm_clip = np.linalg.norm(clip_emb)

        if norm_scene > 0 and norm_clip > 0:
            sim = float(dot_val / (norm_scene * norm_clip))
        else:
            sim = 0.0

        if sim > best_score:
            best_score = sim
            best_clip = clip

    if best_score >= 0.65 and best_clip is not None:
        # Weighted transformation list
        transformations = ["zoom_in", "zoom_out", "pan_left", "pan_right", "speed_0.9x"]
        weights = [0.30, 0.20, 0.20, 0.15, 0.15]
        selected_transform = random.choices(transformations, weights=weights, k=1)[0]
        
        return {
            "action": "reuse",
            "clip_id": best_clip["id"],
            "clip_path": best_clip["clip_path"],
            "similarity_score": round(best_score, 4),
            "transformation": selected_transform
        }
    else:
        return {
            "action": "generate",
            "clip_id": None,
            "clip_path": None,
            "similarity_score": round(best_score, 4) if best_clip else 0.0,
            "transformation": None
        }


# ==========================================
# MODULE 4: Apply Transformation
# ==========================================

def apply_transformation(clip_path, transformation, output_path):
    """
    MODULE 4: Applies FFmpeg zoom, pan, or speed filter to generate a 10s clip.
    Standardizes output format to 1920x1080 resolution, 25 fps, libx264, and yuv420p.
    """
    # Create output directories if needed
    out_dir = os.path.dirname(output_path)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    # Establish filter strings matching specifications
    # All paths scale to 1920x1080 and enforce standard 25 fps
    if transformation == "zoom_in":
        # Slow zoom-in starting from zoom=1.0 to zoom=1.5
        filters = "scale=1920:1080,zoompan=z='min(zoom+0.0015,1.5)':d=250:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080,fps=25"
    elif transformation == "zoom_out":
        # Slow zoom-out starting from zoom=1.5 down to zoom=1.0
        filters = "scale=1920:1080,zoompan=z='max(1.5-0.0015*on,1.0)':d=250:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080,fps=25"
    elif transformation == "pan_left":
        # Scale to wider width and crop moving left (t goes 0 to 10)
        filters = "scale=2400:1080,crop=1920:1080:x='max(0, 480 - (480 * (t/10)))':y=0,fps=25"
    elif transformation == "pan_right":
        # Scale to wider width and crop moving right (t goes 0 to 10)
        filters = "scale=2400:1080,crop=1920:1080:x='min(480, 480 * (t/10))':y=0,fps=25"
    elif transformation == "speed_0.9x":
        # Slow speed by adjusting PTS
        filters = "scale=1920:1080,setpts=PTS/0.9,fps=25"
    else:
        filters = "scale=1920:1080,fps=25"

    cmd = [
        "ffmpeg", "-y",
        "-stream_loop", "-1",  # Loop infinitely if input clip duration < 10s
        "-i", clip_path,
        "-vf", filters,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-t", "10",
        output_path
    ]
    
    print(f"[FFmpeg] Transforming: {transformation} on {os.path.basename(clip_path)}...")
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


# ==========================================
# MODULE 5: Assemble Video
# ==========================================

def generate_fallback_clip(scene_id, text, duration, output_path):
    """
    Fallback video generator: Outputs solid black video with text if clip is missing.
    Ensures script executes fully without crashing on missing resources.
    """
    escaped_text = f"Scene {scene_id}: {text[:35]}..."
    escaped_text = escaped_text.replace("'", "\\'").replace(":", "\\:")
    
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi",
        "-i", f"color=c=black:s=1920x1080:d={duration}",
        "-vf", f"drawtext=text='{escaped_text}':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=(h-text_h)/2",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-r", "25",
        output_path
    ]
    try:
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    except Exception:
        # Fallback to plain black video if drawtext fails (e.g. font configurations)
        cmd_fallback = [
            "ffmpeg", "-y",
            "-f", "lavfi",
            "-i", f"color=c=black:s=1920x1080:d={duration}",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-r", "25",
            output_path
        ]
        subprocess.run(cmd_fallback, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)


def assemble_video(scene_plan, audio_path, output_path):
    """
    MODULE 5: Compiles final video from the scene plan.
    Loops shorter clips, writes concat demuxer format, and overlays narration audio.
    """
    temp_dir = os.path.join("clips", "temp_assemble")
    os.makedirs(temp_dir, exist_ok=True)

    temp_clips = []
    
    try:
        for idx, item in enumerate(scene_plan):
            scene_id = item["scene_id"]
            clip_path = item["clip_path"]
            duration = item["duration"]
            scene_text = item.get("text", f"Scene {scene_id}")

            temp_scene_path = os.path.abspath(os.path.join(temp_dir, f"temp_scene_{scene_id}.mp4"))
            
            # Check file existence; if missing, generate a visual fallback clip
            if not os.path.exists(clip_path):
                print(f"[Assembly] Missing clip at {clip_path}. Creating fallback clip...")
                generate_fallback_clip(scene_id, scene_text, duration, temp_scene_path)
            else:
                # Normal path: loop the source clip to cover narration duration and standardize format
                cmd = [
                    "ffmpeg", "-y",
                    "-stream_loop", "-1",
                    "-i", clip_path,
                    "-vf", "scale=1920:1080,fps=25",
                    "-c:v", "libx264",
                    "-pix_fmt", "yuv420p",
                    "-t", f"{duration:.3f}",
                    temp_scene_path
                ]
                subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

            temp_clips.append(temp_scene_path)

        # Write concat configuration clips.txt
        clips_txt_path = os.path.abspath(os.path.join(temp_dir, "clips.txt"))
        with open(clips_txt_path, "w", encoding="utf-8") as f:
            for tc in temp_clips:
                escaped_tc = tc.replace("\\", "/").replace("'", "'\\''")
                f.write(f"file '{escaped_tc}'\n")

        # Generate silent track fallback if target audio is missing
        temp_audio_path = None
        if not os.path.exists(audio_path):
            total_duration = sum(item["duration"] for item in scene_plan)
            temp_audio_path = os.path.abspath(os.path.join(temp_dir, "dummy_silence.aac"))
            print(f"[Assembly] Audio path {audio_path} not found. Generating {total_duration:.2f}s of silence...")
            cmd_audio = [
                "ffmpeg", "-y",
                "-f", "lavfi",
                "-i", "anullsrc=r=44100:cl=stereo",
                "-c:a", "aac",
                "-t", f"{total_duration:.3f}",
                temp_audio_path
            ]
            subprocess.run(cmd_audio, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
            active_audio = temp_audio_path
        else:
            active_audio = os.path.abspath(audio_path)

        # Concat video tracks and overlay full audio track
        cmd_concat = [
            "ffmpeg", "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", clips_txt_path,
            "-i", active_audio,
            "-c:v", "libx264",
            "-c:a", "aac",
            "-shortest",
            output_path
        ]
        
        print(f"[Assembly] Rendering video assembly into {output_path}...")
        subprocess.run(cmd_concat, check=True)
        print("[Assembly] Final rendering complete!")

    finally:
        # Clean up all temporary assets
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)


# ==========================================
# DEMO MODE SETUP UTILITIES
# ==========================================

def generate_demo_assets():
    """
    Demo Helper: Sets up a working environment with a sample transcript,
    audio, and database matching to test the pipeline out-of-the-box.
    """
    print("[Demo Mode] Building demo workspace...")

    # 1. Create sample_transcript.json (11 minutes / 660 seconds)
    transcript_path = "sample_transcript.json"
    segments = []
    if not os.path.exists(transcript_path):
        locations = ["motor park", "mansion", "workshop", "market", "hospital", "home", "street", "gate"]
        emotions = ["abandonment", "poverty", "survival", "growth", "grief", "rise", "confrontation", "regret", "loneliness"]
        characters = ["John", "Kemi", "Ade", "Bisi"]
        
        random.seed(42)
        total_time = 0.0
        segment_duration = 20.0
        
        for i in range(33): # 33 segments * 20s = 660s
            char = random.choice(characters)
            loc = random.choice(locations)
            emo = random.choice(emotions)
            
            prefix = ""
            if i in [5, 12, 21, 29]:
                prefix = "Years later, "
            elif i in [8, 17, 24]:
                prefix = "One afternoon, "
                
            text = f"{prefix}{char} experienced deep {emo} while sitting near the {loc}."
            
            # Incorporate semantic words to match database clip descriptions
            if i in [4, 15, 23]:
                text += " Looking around, they saw a peaceful green forest with trees and nature."
            elif i in [9, 18, 28]:
                text += " It felt like walking down a busy city street with cars and high-rise buildings."
                
            segments.append({
                "start": total_time,
                "end": total_time + segment_duration,
                "text": text
            })
            total_time += segment_duration
            
        with open(transcript_path, "w", encoding="utf-8") as f:
            json.dump(segments, f, indent=2)
        print(f"[Demo Mode] Created sample transcript at {transcript_path}")
    else:
        with open(transcript_path, "r", encoding="utf-8") as f:
            segments = json.load(f)

    # 2. Create sample_audio.wav (660 seconds of silent background track)
    audio_path = "sample_audio.wav"
    if not os.path.exists(audio_path):
        print("[Demo Mode] Generating silent sample audio track...")
        cmd_audio = [
            "ffmpeg", "-y",
            "-f", "lavfi",
            "-i", "anullsrc=r=44100:cl=stereo",
            "-c:a", "pcm_s16le",
            "-t", "660",
            audio_path
        ]
        subprocess.run(cmd_audio, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        print(f"[Demo Mode] Created sample audio at {audio_path}")

    # 3. Create mock database source videos
    os.makedirs("clips", exist_ok=True)
    mock_forest = os.path.join("clips", "mock_forest.mp4")
    mock_city = os.path.join("clips", "mock_city.mp4")

    if not os.path.exists(mock_forest):
        print(f"[Demo Mode] Generating green forest clip: {mock_forest}...")
        cmd_forest = [
            "ffmpeg", "-y",
            "-f", "lavfi",
            "-i", "color=c=forestgreen:s=1920x1080:d=10",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "25",
            mock_forest
        ]
        subprocess.run(cmd_forest, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

    if not os.path.exists(mock_city):
        print(f"[Demo Mode] Generating gray city clip: {mock_city}...")
        cmd_city = [
            "ffmpeg", "-y",
            "-f", "lavfi",
            "-i", "color=c=gray:s=1920x1080:d=10",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "25",
            mock_city
        ]
        subprocess.run(cmd_city, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

    # Seed Database Clip Registry with semantic embeddings
    init_db()
    
    # Clean the database clips to force seeding of correct matching descriptions
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM clips")
    conn.commit()
    conn.close()

    print("[Demo Mode] Seeding clip registry database with perfect matching descriptions...")
    # Find scene texts that contain the forest and city descriptions
    scenes = scene_merger(segments)
    forest_scene_text = next((s["text"] for s in scenes if "forest" in s["text"]), "A peaceful green forest with trees and nature")
    city_scene_text = next((s["text"] for s in scenes if "city" in s["text"]), "A busy city street with cars and high-rise buildings")

    # Forest Embedding
    forest_emb = model.encode(forest_scene_text)
    save_clip(mock_forest, {
        "emotion": "neutral",
        "location": "neutral",
        "characters": [],
        "visual_tags": ["forest", "trees", "nature", "green"],
        "duration": 10.0
    }, forest_emb.tobytes())

    # City Embedding
    city_emb = model.encode(city_scene_text)
    save_clip(mock_city, {
        "emotion": "neutral",
        "location": "neutral",
        "characters": [],
        "visual_tags": ["city", "street", "cars", "gray"],
        "duration": 10.0
    }, city_emb.tobytes())
    print("[Demo Mode] Clip registry database seeded successfully.")


# ==========================================
# MAIN ORCHESTRATOR
# ==========================================

def main(transcript_path, audio_path, output_path):
    """
    Main Orchestrator: Runs the video production pipeline.
    """
    # Verify input transcript exists, or generate fallback/demo files
    if not os.path.exists(transcript_path):
        print(f"[Main] Transcript file {transcript_path} not found.")
        generate_demo_assets()
        transcript_path = "sample_transcript.json"
        audio_path = "sample_audio.wav"

    # Step 1: Load and Merge Transcript
    with open(transcript_path, "r", encoding="utf-8") as f:
        transcript_segments = json.load(f)
    
    print(f"[Main] Loaded {len(transcript_segments)} transcript segments. Running scene merger...")
    scenes = scene_merger(transcript_segments)
    print(f"[Main] Grouped segments into {len(scenes)} scenes.")

    # Step 2: Initialize Database & Retrieve Registry
    init_db()
    clip_registry = get_all_clips()
    print(f"[Main] Clip registry contains {len(clip_registry)} registered clips.")

    # Step 3: Match clips and plan scene media
    scene_plan = []
    reused_count = 0
    generate_count = 0

    print("[Main] Running semantic match analysis...")
    for scene in scenes:
        scene_id = scene["scene_id"]
        match_res = clip_matcher(scene, clip_registry)

        if match_res["action"] == "reuse":
            reused_count += 1
            src_clip = match_res["clip_path"]
            trans = match_res["transformation"]
            
            # Target output path for transformed clip
            transformed_clip_path = os.path.abspath(os.path.join("clips", f"scene_{scene_id}_transformed.mp4"))
            
            # Apply FFmpeg transformation immediately
            if os.path.exists(src_clip):
                apply_transformation(src_clip, trans, transformed_clip_path)
                increment_use_count(match_res["clip_id"])
            
            scene_plan.append({
                "scene_id": scene_id,
                "clip_path": transformed_clip_path,
                "start_audio": scene["start"],
                "end_audio": scene["end"],
                "duration": scene["duration"],
                "text": scene["text"]
            })
            print(f"  * Scene {scene_id}: Semantic Match! Reusing {os.path.basename(src_clip)} (Similarity: {match_res['similarity_score']}) with transformation: '{trans}'")
        else:
            generate_count += 1
            # User will generate externally; target clip path is clips/scene_XX.mp4
            generate_clip_path = os.path.abspath(os.path.join("clips", f"scene_{scene_id}.mp4"))
            
            print(f"  * Scene {scene_id}: Low Match (Similarity: {match_res['similarity_score']}). Needs external generation: {os.path.basename(generate_clip_path)}")
            
            scene_plan.append({
                "scene_id": scene_id,
                "clip_path": generate_clip_path,
                "start_audio": scene["start"],
                "end_audio": scene["end"],
                "duration": scene["duration"],
                "text": scene["text"]
            })

    # Step 4: Assemble Final Video
    print("[Main] Assembling scenes and merging narration track...")
    assemble_video(scene_plan, audio_path, output_path)

    # Step 5: Summary Report
    total_scenes = len(scenes)
    efficiency = (reused_count / total_scenes * 100) if total_scenes > 0 else 0.0
    
    print("\n" + "="*50)
    print("AI VIDEO PIPELINE RUN SUMMARY")
    print("="*50)
    print(f"Total Scenes Processed : {total_scenes}")
    print(f"Clips Reused           : {reused_count}")
    print(f"Clips to Generate      : {generate_count}")
    print(f"Reuse Efficiency %     : {efficiency:.2f}%")
    print(f"Compiled Video Output  : {os.path.abspath(output_path)}")
    print("="*50 + "\n")


if __name__ == "__main__":
    t_path = "transcript.json"
    a_path = "audio.mp3"
    o_path = "final_output.mp4"

    if len(sys.argv) > 1:
        t_path = sys.argv[1]
    if len(sys.argv) > 2:
        a_path = sys.argv[2]
    if len(sys.argv) > 3:
        o_path = sys.argv[3]

    main(t_path, a_path, o_path)

# ==========================================
# SAMPLE RUN COMMANDS:
# ==========================================
# 1. Run in self-contained demo mode:
#    python pipeline.py
#
# 2. Run with production files:
#    python pipeline.py transcript.json narration_audio.mp3 movie.mp4
