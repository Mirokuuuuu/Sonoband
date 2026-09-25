import socket
import json
import time
import sys
import joblib
import numpy as np
import librosa
from scipy import stats
from threading import Thread
from datetime import datetime, timezone
from http.server import HTTPServer, BaseHTTPRequestHandler
from supabase import create_client, Client

# --- SUPABASE CONFIG ---
SUPABASE_URL = "https://qdmwobrwokpczqwezjzs.supabase.co"  
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkbXdvYnJ3b2twY3pxd2V6anpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNjg1MDgsImV4cCI6MjA5Nzg0NDUwOH0.dDn4oJE78IcgDHX5U2FbhxHaHFWFbwqP0AbjT5AajY8"       
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# --- LOAD PKL MODEL & SCALER ---
MODEL_PATH = "SonoBand_RandomForest_Model.pkl"
SCALER_PATH = "SonoBand_Scaler.pkl"

print("[ML] Loading model and scaler...")
try:
    audio_model = joblib.load(MODEL_PATH)
    audio_scaler = joblib.load(SCALER_PATH)
    print(f"[ML] Successfully loaded model and scaler! Expects {getattr(audio_model, 'n_features_in_', 'unknown')} features.")
except Exception as e:
    print(f"[ML ERROR] Could not load model or scaler: {e}")
    audio_model = None
    audio_scaler = None

UDP_IP = "0.0.0.0" 
UDP_PORT = 8888
HTTP_PORT = 5000

ACTIVE_DISCOVERED_DEVICES = {}

def extract_audio_features(raw_audio, sr=16000):
    try:
        y = np.array(raw_audio, dtype=np.float32)
        if len(y) < 512:
            return None
            
        max_val = np.max(np.abs(y))
        if max_val > 0:
            y = y / max_val

        mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        chroma = librosa.feature.chroma_stft(y=y, sr=sr)
        spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)
        spectral_bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr)
        spectral_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)
        zero_crossing_rate = librosa.feature.zero_crossing_rate(y)
        rms = librosa.feature.rms(y=y)

        feature_matrices = [mfccs, chroma, spectral_centroid, spectral_bandwidth, spectral_rolloff, zero_crossing_rate, rms]
        extracted_features = []

        for mat in feature_matrices:
            extracted_features.append(np.mean(mat, axis=1))
            extracted_features.append(np.std(mat, axis=1))
            extracted_features.append(np.min(mat, axis=1))
            extracted_features.append(np.max(mat, axis=1))

        flat_features = np.hstack([arr.ravel() for arr in extracted_features if len(arr) > 0])
        
        if len(flat_features) > 89:
            flat_features = flat_features[:89]
        elif len(flat_features) < 89:
            flat_features = np.pad(flat_features, (0, 89 - len(flat_features)), 'constant')

        return flat_features.tolist()
    except Exception as e:
        print(f"[ML FEATURE ERROR] Failed to extract audio features: {e}")
        return None

def predict_sound_class(features_list):
    if not audio_model or not audio_scaler:
        return "unknown"
    
    expected_count = getattr(audio_model, "n_features_in_", 89)
    if len(features_list) != expected_count:
        print(f"[ML WARNING] Mismatch! Received {len(features_list)} features, model expects {expected_count}.")
        return "unknown"

    try:
        features_array = np.array(features_list).reshape(1, -1)
        scaled_features = audio_scaler.transform(features_array)
        prediction = audio_model.predict(scaled_features)
        detected_sound = str(prediction[0])
        
        print(f"[ML PREDICTION] Classified Sound: {detected_sound}")
        return detected_sound
    except Exception as e:
        print(f"[ML ERROR] Prediction error: {e}")
        return "unknown"

def clean_stale_devices():
    while True:
        try:
            now = time.time()
            stale_macs = [mac for mac, info in ACTIVE_DISCOVERED_DEVICES.items() if now - info['last_ping'] > 10]
            for mac in stale_macs:
                del ACTIVE_DISCOVERED_DEVICES[mac]
                print(f"[DISCOVERY] ESP32 {mac} disconnected. Removed from active memory.")
        except Exception as e:
            print(f"[CLEANUP ERROR] {e}")
        time.sleep(3)

class DiscoveryAPI(BaseHTTPRequestHandler):
    
    def _set_headers(self, status=200):
        self.send_response(status)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers(200)

    def do_GET(self):
        if self.path in ['/discovered-devices', '/']:
            self._set_headers(200)
            devices_list = []
            for mac, data in ACTIVE_DISCOVERED_DEVICES.items():
                devices_list.append({
                    "mac_address": mac,
                    "ip_address": data['ip_address'],
                    "device_name": data['device_name'],
                    "is_active": True
                })
            self.wfile.write(json.dumps(devices_list).encode('utf-8'))
        elif self.path in ['/start', '/connect']:
            self._set_headers(200)
            self.wfile.write(json.dumps({"status": "success", "message": "Listening started"}).encode('utf-8'))
        elif self.path in ['/stop', '/disconnect']:
            self._set_headers(200)
            self.wfile.write(json.dumps({"status": "success", "message": "Listening stopped"}).encode('utf-8'))
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not Found"}).encode('utf-8'))

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else "{}"
        
        try:
            payload = json.loads(body)
        except Exception:
            payload = {}

        mac = payload.get('mac_address', '')
        user_id = payload.get('user_id', '')

        if self.path in ['/connect', '/start']:
            if mac and user_id:
                try:
                    # User explicitly clicked connect from the Dashboard
                    supabase.from_('user_devices').update({'is_on': True, 'user_id': str(user_id)}).eq('mac_address', mac).execute()
                except Exception as db_err:
                    print(f"[DB ERROR] Connect update failed: {db_err}")
            self._set_headers(200)
            self.wfile.write(json.dumps({"status": "success", "connected": True, "state": "active"}).encode('utf-8'))

        elif self.path in ['/disconnect', '/stop']:
            if mac:
                try:
                    supabase.from_('user_devices').update({'is_on': False}).eq('mac_address', mac).execute()
                except Exception as db_err:
                    print(f"[DB ERROR] Disconnect/Power-off update failed: {db_err}")
            self._set_headers(200)
            self.wfile.write(json.dumps({"status": "success", "power": "off"}).encode('utf-8'))

        elif self.path in ['/config', '/settings']:
            update_fields = {}
            if 'is_on' in payload: 
                update_fields['is_on'] = payload['is_on']
            if 'vibration_intensity' in payload: 
                update_fields['vibration_intensity'] = payload['vibration_intensity']
            if 'sound_threshold' in payload:
                update_fields['sound_threshold'] = payload['sound_threshold']
                update_fields['sensitivity'] = payload['sound_threshold']
            elif 'sensitivity' in payload:
                update_fields['sound_threshold'] = payload['sensitivity']
                update_fields['sensitivity'] = payload['sensitivity']

            if update_fields:
                try:
                    query = supabase.from_('user_devices')
                    if mac:
                        query.update(update_fields).eq('mac_address', mac).execute()
                    elif user_id:
                        query.update(update_fields).eq('user_id', str(user_id)).execute()
                except Exception as db_err:
                    print(f"[DB ERROR] Config update failed: {db_err}")

            self._set_headers(200)
            self.wfile.write(json.dumps({"status": "success", "updated_config": payload}).encode('utf-8'))

        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Endpoint not found"}).encode('utf-8'))

    def log_message(self, format, *args):
        return

def start_http_server():
    server = HTTPServer(('0.0.0.0', HTTP_PORT), DiscoveryAPI)
    print(f"[HTTP] Discovery & Control API running on port {HTTP_PORT}...")
    server.serve_forever()

def get_existing_device(mac_address):
    try:
        res = supabase.from_('user_devices') \
            .select('user_id, is_on, vibration_intensity, sound_threshold, sensitivity') \
            .eq('mac_address', mac_address) \
            .maybe_single() \
            .execute()
        
        if res is not None and hasattr(res, 'data'):
            return res.data
        return None
    except Exception as e:
        print(f"[ERROR] DB Fetch Error: {e}")
        return None

def reset_device_on_boot(mac_address, ip_address):
    """Ensures Supabase marks newly rebooted ESP32s as turned OFF (is_on = False)."""
    try:
        supabase.from_('user_devices').update({
            'is_on': False,
            'ip_address': ip_address
        }).eq('mac_address', mac_address).execute()
        print(f"[DB RESET] ESP32 {mac_address} reboot detected. Enforced is_on = False in Supabase.")
    except Exception as e:
        print(f"[DB RESET ERROR] Failed to reset device power state: {e}")

def start_continuous_listener():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((UDP_IP, UDP_PORT))
    sock.settimeout(1.0)
    
    print(f"[SERVER] Event-Driven UDP Listener active on port {UDP_PORT}...")

    Thread(target=clean_stale_devices, daemon=True).start()
    Thread(target=start_http_server, daemon=True).start()

    while True:
        try:
            try:
                data, addr = sock.recvfrom(4096)
            except socket.timeout:
                continue

            data_str = data.decode('utf-8')
            payload = json.loads(data_str)
            
            mac_address = payload.get("mac_address", "UNKNOWN")
            incoming_ip = payload.get("ip_address", addr[0])
            msg_type = payload.get("type", "")

            # Register device on discovery ping and FORCE is_on = False on restart
            if msg_type == "pong" and mac_address != "UNKNOWN":
                if mac_address not in ACTIVE_DISCOVERED_DEVICES:
                    reset_device_on_boot(mac_address, incoming_ip)

                ACTIVE_DISCOVERED_DEVICES[mac_address] = {
                    'ip_address': incoming_ip,
                    'device_name': payload.get('device', 'SonoBand Device'),
                    'last_ping': time.time()
                }
                continue

            # Process sound triggers sent when threshold is crossed
            if mac_address != "UNKNOWN":
                existing_device = get_existing_device(mac_address)
                
                # Drop request if device is turned off in Supabase database
                if existing_device and not existing_device.get('is_on', False):
                    continue

                raw_audio = payload.get("audio_samples", payload.get("raw_audio", None))
                detected_label = "unknown"

                if raw_audio and isinstance(raw_audio, list):
                    sample_rate = payload.get("sample_rate", 16000)
                    computed_features = extract_audio_features(raw_audio, sr=sample_rate)
                    if computed_features:
                        detected_label = predict_sound_class(computed_features)

                cmd_payload = json.dumps({
                    "type": "classification",
                    "detected_sound": detected_label
                })
                
                sock.sendto(cmd_payload.encode('utf-8'), (incoming_ip, UDP_PORT))

        except KeyboardInterrupt:
            print("\n[SERVER] Shutting down gracefully...")
            sock.close()
            sys.exit(0)
        except Exception as e:
            print(f"[ERROR] Listener error: {e}")

if __name__ == "__main__":
    try:
        start_continuous_listener()
    except KeyboardInterrupt:
        print("\n[SERVER] Stopped by user.")
        sys.exit(0)