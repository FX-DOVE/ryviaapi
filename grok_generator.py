# PIP INSTALL INSTRUCTIONS:
# pip install requests

import os
import sys
import time
import datetime
import shutil
import requests
import logging
from requests.exceptions import ConnectTimeout, ReadTimeout, HTTPError

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger("GrokGenerator")

# Configuration
GROK_API_KEY = os.environ.get("GROK_API_KEY", "")
GROK_API_URL = os.environ.get("GROK_API_URL", "https://api.grok.com/v1/video/generations")
# Simulation mode is automatically active if no key is set or key starts with "mock"
USE_SIMULATION = not GROK_API_KEY or GROK_API_KEY.lower().startswith("mock")

# Global simulation state to track attempts and polling counts
_sim_attempts = {}
_sim_polls = {}

class MockResponse:
    """Mock requests.Response object for offline testing and verification."""
    def __init__(self, status_code, json_data=None, content=b"mock_video_bytes_mp4_format"):
        self.status_code = status_code
        self._json_data = json_data
        self.content = content
        self.headers = {"Content-Type": "application/json" if json_data else "video/mp4"}

    def json(self):
        if self._json_data is None:
            raise ValueError("No JSON content")
        return self._json_data

    def raise_for_status(self):
        if 400 <= self.status_code < 600:
            raise HTTPError(f"HTTP {self.status_code} Error (Simulated)", response=self)


def _simulate_post_generate(scene_id, json_body, timeout):
    """Simulates the POST /video/generations endpoint based on scene_id."""
    attempt = _sim_attempts.get(scene_id, 1)
    
    if scene_id == "scene_timeout_connect":
        if attempt <= 1:
            time.sleep(0.5)
            raise ConnectTimeout(f"Connection to {GROK_API_URL} timed out (Simulation).")
        
    elif scene_id == "scene_timeout_read":
        if attempt <= 1:
            time.sleep(0.5)
            raise ReadTimeout(f"Read from {GROK_API_URL} timed out (Simulation).")
        
    elif scene_id == "scene_429":
        if attempt <= 2:
            return MockResponse(429, json_data={"error": "Too Many Requests (Simulation)", "retry_after": 10})
        
    elif scene_id == "scene_fail":
        return MockResponse(500, json_data={"error": "Internal Server Error (Simulation)"})

    # Default/Success paths
    if scene_id in ("scene_timeout_read", "scene_timeout_connect") or scene_id.startswith("scene_pending"):
        return MockResponse(200, json_data={"id": scene_id, "status": "pending"})
        
    return MockResponse(200, json_data={
        "id": scene_id,
        "status": "success",
        "video_url": f"https://mock-grok-storage.com/{scene_id}.mp4"
    })


def _simulate_get_status(polled_id):
    """Simulates the GET /video/generations/{id} endpoint."""
    polls = _sim_polls.get(polled_id, 0) + 1
    _sim_polls[polled_id] = polls
    
    if polled_id == "scene_fail":
        return MockResponse(200, json_data={"id": polled_id, "status": "failed", "error": "Model failed to render video (Simulation)"})
        
    if polled_id == "scene_timeout_read":
        if polls < 3:
            return MockResponse(200, json_data={"id": polled_id, "status": "pending"})
        else:
            return MockResponse(200, json_data={
                "id": polled_id,
                "status": "success",
                "video_url": f"https://mock-grok-storage.com/{polled_id}.mp4"
            })
            
    return MockResponse(200, json_data={
        "id": polled_id,
        "status": "success",
        "video_url": f"https://mock-grok-storage.com/{polled_id}.mp4"
    })


def _execute_http_request(method, url, scene_id=None, **kwargs):
    """Runs a real HTTP request using requests, or routes to mock simulation handlers."""
    if not USE_SIMULATION:
        if method.upper() == "POST":
            return requests.post(url, **kwargs)
        else:
            return requests.get(url, **kwargs)

    # Intercept mock asset downloads
    if method.upper() == "GET" and ("mock-grok-storage.com" in url or "mock-video-url" in url):
        return MockResponse(200, content=b"mock_video_bytes_mp4_format")

    # Intercept status polling
    if method.upper() == "GET" and GROK_API_URL in url:
        parts = url.split("/")
        polled_id = parts[-1]
        return _simulate_get_status(polled_id)

    # Intercept generation POST
    if method.upper() == "POST":
        json_body = kwargs.get("json", {})
        target_scene_id = scene_id or json_body.get("scene_id", "default_scene")
        return _simulate_post_generate(target_scene_id, json_body, kwargs.get("timeout"))

    return MockResponse(404, json_data={"error": "Not Found"})


def log_result(scene_id, status, reason, output_path):
    """
    Appends one line to a file called generation_log.txt.
    Format: [TIMESTAMP] scene_id=X status=SUCCESS/FAILED/RETRY reason=... path=...
    """
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_line = f"[{timestamp}] scene_id={scene_id} status={status} reason={reason} path={output_path}\n"
    try:
        with open("generation_log.txt", "a") as f:
            f.write(log_line)
    except Exception as e:
        logger.error(f"Failed to write to log file: {str(e)}")


def build_request_payload(scene):
    """
    Builds a request body formatted for the Grok API from scene dictionary details.
    """
    emotion = scene.get("emotion", "")
    location = scene.get("location", "")
    visual_tags = scene.get("visual_tags", [])
    
    tags_str = ", ".join(visual_tags)
    prompt_parts = []
    
    if location:
        prompt_parts.append(f"Cinematic shot of {location}")
    if emotion:
        prompt_parts.append(f"{emotion} atmosphere")
    if tags_str:
        prompt_parts.append(tags_str)
        
    prompt = ", ".join(prompt_parts)
    if not prompt:
        prompt = f"Cinematic shot of scene {scene.get('scene_id')}"

    return {
        "prompt": prompt,
        "duration": 10,
        "aspect_ratio": "16:9",
        "quality": "high"
    }


def check_status(scene_id):
    """
    Polls the Grok API for status of a pending generation.
    Polls every 15 seconds, up to 20 times (5 minutes total).
    Returns path of temporary saved clip when done, or None.
    """
    headers = {
        "Authorization": f"Bearer {GROK_API_KEY}"
    }
    url = f"{GROK_API_URL}/{scene_id}"
    max_polls = 20
    poll_interval = 15

    for i in range(max_polls):
        logger.info(f"[{scene_id}] Polling status (Attempt {i + 1}/{max_polls})...")
        try:
            response = _execute_http_request("GET", url, scene_id=scene_id, headers=headers, timeout=(10, 30))
            
            if response.status_code == 200:
                data = response.json()
                status = data.get("status")
                logger.info(f"[{scene_id}] Poll status received: {status}")
                
                if status in ("success", "completed"):
                    video_url = data.get("video_url")
                    import tempfile
                    temp_dir = tempfile.gettempdir()
                    download_path = os.path.join(temp_dir, f"grok_{scene_id}.mp4")
                    
                    if video_url:
                        logger.info(f"[{scene_id}] Downloading completed video from {video_url}...")
                        video_resp = _execute_http_request("GET", video_url, scene_id=scene_id, timeout=(10, 60))
                        video_resp.raise_for_status()
                        video_bytes = video_resp.content
                    else:
                        video_bytes = response.content
                        
                    with open(download_path, "wb") as f:
                        f.write(video_bytes)
                        
                    log_result(scene_id, "SUCCESS", "Polled status completed successfully", download_path)
                    return download_path
                    
                elif status == "failed":
                    reason = data.get("error", "API reported execution failure")
                    logger.error(f"[{scene_id}] Generation failed on server: {reason}")
                    log_result(scene_id, "FAILED", f"Server failed: {reason}", "")
                    return None
                    
            elif response.status_code == 429:
                logger.warning(f"[{scene_id}] Rate limited during status poll. Waiting for next interval...")
                
            else:
                response.raise_for_status()
                
        except Exception as e:
            logger.warning(f"[{scene_id}] Exception during status poll: {str(e)}")
            
        time.sleep(poll_interval)

    logger.error(f"[{scene_id}] Polling timed out after {max_polls * poll_interval} seconds.")
    log_result(scene_id, "FAILED", "Polling timed out", "")
    return None


def generate_clip(scene, output_path):
    """
    Sends a single request to generate a video clip from scene details.
    Retries once on ConnectTimeout after 30s.
    Polls check_status() on ReadTimeout after 60s.
    Retries up to 5 times on 429 Rate Limits with exponential backoff.
    """
    scene_id = scene.get("scene_id")
    payload = build_request_payload(scene)
    headers = {
        "Authorization": f"Bearer {GROK_API_KEY}",
        "Content-Type": "application/json"
    }
    
    attempt = 0
    max_429_attempts = 5
    connect_timeout_retries = 0
    
    while attempt < max_429_attempts:
        try:
            if USE_SIMULATION:
                _sim_attempts[scene_id] = _sim_attempts.get(scene_id, 0) + 1

            logger.info(f"[{scene_id}] Sending generation request (Attempt {attempt + 1})...")
            response = _execute_http_request(
                "POST", 
                GROK_API_URL, 
                scene_id=scene_id, 
                json=payload, 
                headers=headers, 
                timeout=(10, 120)
            )
            
            if response.status_code == 200:
                if "application/json" in response.headers.get("Content-Type", ""):
                    data = response.json()
                    status = data.get("status")
                    if status in ("success", "completed"):
                        video_url = data.get("video_url")
                        if video_url:
                            logger.info(f"[{scene_id}] Completed immediately. Downloading video...")
                            video_resp = _execute_http_request("GET", video_url, scene_id=scene_id, timeout=(10, 60))
                            video_resp.raise_for_status()
                            video_bytes = video_resp.content
                        else:
                            video_bytes = response.content
                    else:
                        logger.info(f"[{scene_id}] Generation is pending. Polling status...")
                        polled_path = check_status(scene_id)
                        if polled_path and os.path.exists(polled_path):
                            os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
                            shutil.copy(polled_path, output_path)
                            try:
                                os.remove(polled_path)
                            except OSError:
                                pass
                            return output_path
                        else:
                            log_result(scene_id, "FAILED", "Polling failed to return valid clip", "")
                            return None
                else:
                    video_bytes = response.content

                # Write success video
                os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
                with open(output_path, "wb") as f:
                    f.write(video_bytes)
                log_result(scene_id, "SUCCESS", "Clip generated and saved successfully", output_path)
                return output_path
                
            elif response.status_code == 429:
                wait_time = min((2 ** attempt) * 10, 120)
                logger.warning(f"[{scene_id}] Rate limited (429). Retrying in {wait_time}s...")
                log_result(scene_id, "RETRY", f"Rate limited (429). Waiting {wait_time}s", "")
                time.sleep(wait_time)
                attempt += 1
                continue
            else:
                response.raise_for_status()
                
        except ConnectTimeout as e:
            if connect_timeout_retries < 1:
                connect_timeout_retries += 1
                logger.warning(f"[{scene_id}] ConnectTimeout occurred. Waiting 30s before retrying once...")
                log_result(scene_id, "RETRY", "ConnectTimeout. Waiting 30s before retry", "")
                time.sleep(30)
                continue
            else:
                logger.error(f"[{scene_id}] ConnectTimeout occurred twice. Permanent failure.")
                log_result(scene_id, "FAILED", "ConnectTimeout permanent failure", "")
                return None
                
        except ReadTimeout as e:
            logger.warning(f"[{scene_id}] ReadTimeout occurred. Waiting 60s, then calling check_status()...")
            log_result(scene_id, "RETRY", "ReadTimeout. Waiting 60s then polling status", "")
            time.sleep(60)
            polled_path = check_status(scene_id)
            if polled_path and os.path.exists(polled_path):
                os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
                shutil.copy(polled_path, output_path)
                try:
                    os.remove(polled_path)
                except OSError:
                    pass
                return output_path
            else:
                logger.error(f"[{scene_id}] Polling after ReadTimeout failed to return clip.")
                return None
                
        except HTTPError as e:
            logger.error(f"[{scene_id}] HTTP error occurred: {str(e)}")
            log_result(scene_id, "FAILED", f"HTTP Error: {str(e)}", "")
            return None
            
        except Exception as e:
            logger.error(f"[{scene_id}] Uncaught exception occurred: {str(e)}")
            log_result(scene_id, "FAILED", f"Unexpected error: {str(e)}", "")
            return None

    logger.error(f"[{scene_id}] Permanent rate limit failure after {max_429_attempts} attempts.")
    log_result(scene_id, "FAILED", f"Rate limited permanently after {max_429_attempts} attempts", "")
    return None


def run_pipeline(scenes, output_dir):
    """
    Processes scenes one at a time.
    Reuses existing clips on disk.
    Applies delays between successful (20s) and failed (30s) clip generations.
    Retries failed scenes once after a 120s delay, with a 25s delay between retry clips.
    """
    completed_paths = []
    failed_scenes = []
    total_scenes = len(scenes)
    
    reuse_count = 0
    generate_count = 0
    failed_count = 0
    
    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)

    # ─── FIRST PASS ──────────────────────────────────────────────────────────
    for idx, scene in enumerate(scenes):
        scene_id = scene.get("scene_id")
        output_path = os.path.join(output_dir, f"scene_{scene_id}.mp4")
        
        # Check for asset reuse
        if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            reuse_count += 1
            completed_paths.append(output_path)
            logger.info(f"[{scene_id}] Clip already exists. Reusing.")
            print(f"Scene {idx + 1} of {total_scenes} complete. Reused: {reuse_count}. Generated: {generate_count}. Failed: {failed_count}.")
            continue
            
        # Try generation
        res_path = generate_clip(scene, output_path)
        
        if res_path:
            generate_count += 1
            completed_paths.append(res_path)
            print(f"Scene {idx + 1} of {total_scenes} complete. Reused: {reuse_count}. Generated: {generate_count}. Failed: {failed_count}.")
            # Sleep 20 seconds before next if there are more scenes to process
            if idx < total_scenes - 1:
                logger.info("Waiting 20 seconds before next successful clip generation...")
                time.sleep(20)
        else:
            failed_scenes.append(scene)
            failed_count += 1
            print(f"Scene {idx + 1} of {total_scenes} complete. Reused: {reuse_count}. Generated: {generate_count}. Failed: {failed_count}.")
            # Sleep 30 seconds before next if there are more scenes to process
            if idx < total_scenes - 1:
                logger.info("Waiting 30 seconds before next clip generation after failure...")
                time.sleep(30)

    # ─── RETRY PASS ──────────────────────────────────────────────────────────
    if failed_scenes:
        logger.info(f"First pass complete. Waiting 120 seconds before retrying {len(failed_scenes)} failed scenes...")
        time.sleep(120)
        
        retry_queue = list(failed_scenes)
        failed_scenes.clear()  # Reset for tracking permanent failures in this pass
        
        for idx, scene in enumerate(retry_queue):
            scene_id = scene.get("scene_id")
            output_path = os.path.join(output_dir, f"scene_{scene_id}.mp4")
            
            logger.info(f"[{scene_id}] Retrying generation...")
            res_path = generate_clip(scene, output_path)
            
            if res_path:
                generate_count += 1
                failed_count -= 1
                completed_paths.append(res_path)
                logger.info(f"[{scene_id}] Retry succeeded!")
            else:
                failed_scenes.append(scene)
                logger.error(f"[{scene_id}] Retry failed permanently.")
                
            # Progress print updates for retry pass
            print(f"Scene {total_scenes} of {total_scenes} complete. Reused: {reuse_count}. Generated: {generate_count}. Failed: {failed_count}.")
            
            # Sleep 25 seconds between retry clips if there are more in the retry queue
            if idx < len(retry_queue) - 1:
                logger.info("Waiting 25 seconds between retry clips...")
                time.sleep(25)

    efficiency = (reuse_count / total_scenes * 100.0) if total_scenes > 0 else 0.0

    return {
        "completed": completed_paths,
        "failed": failed_scenes,
        "total_scenes": total_scenes,
        "reuse_count": reuse_count,
        "generate_count": generate_count,
        "efficiency_percent": round(efficiency, 2)
    }

# =====================================================================
# SAMPLE USAGE
# =====================================================================
#
# import os
# from grok_generator import run_pipeline
#
# # Configure the environment (optional)
# # os.environ["GROK_API_KEY"] = "your_actual_api_key"
# # os.environ["GROK_API_URL"] = "https://api.grok.com/v1/video/generations"
#
# # Sample scenes to process
# sample_scenes = [
#     {
#         "scene_id": "scene_001",
#         "text": "The boy runs down the dusty Lagos road.",
#         "emotion": "suspenseful",
#         "location": "Lagos street",
#         "visual_tags": ["boy running", "dust", "sunset", "cinematic"],
#         "duration": 10
#     },
#     {
#         "scene_id": "scene_429",  # Will trigger rate limiting (429) simulation
#         "text": "A sudden rain begins to fall.",
#         "emotion": "melancholy",
#         "location": "abandoned market",
#         "visual_tags": ["rain", "dark clouds", "puddles"],
#         "duration": 10
#     },
#     {
#         "scene_id": "scene_timeout_read",  # Will trigger a ReadTimeout and status check simulation
#         "text": "The storm clears revealing a bright rainbow.",
#         "emotion": "hopeful",
#         "location": "city rooftops",
#         "visual_tags": ["rainbow", "sunshine", "hope"],
#         "duration": 10
#     },
#     {
#         "scene_id": "scene_fail",  # Will trigger permanent failure simulation
#         "text": "A dark shadow disappears into the alley.",
#         "emotion": "creepy",
#         "location": "narrow alleyway",
#         "visual_tags": ["shadow", "fog", "alley"],
#         "duration": 10
#     }
# ]
#
# # Run the pipeline
# result = run_pipeline(sample_scenes, output_dir="./output_clips")
# print("Pipeline Result:", result)
