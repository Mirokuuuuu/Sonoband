import socket
import json
import uuid
import sys
from datetime import datetime, timezone
from supabase import create_client, Client

# --- 1. Supabase Setup ---
SUPABASE_URL = "https://qdmwobrwokpczqwezjzs.supabase.co"  
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkbXdvYnJ3b2twY3pxd2V6anpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNjg1MDgsImV4cCI6MjA5Nzg0NDUwOH0.dDn4oJE78IcgDHX5U2FbhxHaHFWFbwqP0AbjT5AajY8"        
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

UDP_IP = "0.0.0.0"
UDP_PORT = 8888

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.bind((UDP_IP, UDP_PORT))
sock.settimeout(1.0)

print("===================================================")
print(f"[SERVER] Passive UDP Server running on port {UDP_PORT}")
print("[SERVER] Listening for ESP32 boot announcements...")
print("===================================================\n")

def is_valid_uuid(val):
    try:
        uuid.UUID(str(val))
        return True
    except ValueError:
        return False

def get_device_settings(mac_address):
    try:
        response = supabase.from_('user_devices') \
            .select('*') \
            .eq('mac_address', mac_address) \
            .maybe_single() \
            .execute()
        return response.data
    except Exception as e:
        print(f"Error fetching settings: {e}")
        return None

def process_packet(data_str, addr):
    try:
        payload = json.loads(data_str)
        
        # Log Pong/Handshake responses from ESP32
        if payload.get("type") == "pong":
            print(f"\n[HANDSHAKE SUCCESS] ESP32 found at {addr[0]} (MAC: {payload.get('mac_address')})")
        else:
            print(f"\n[UDP RECV] From {addr[0]} -> {payload}")
        
        raw_user_id = payload.get("user_id", "")
        mac_address = payload.get("mac_address", "UNKNOWN")
        incoming_ip = payload.get("ip_address", addr[0])

        if mac_address != "UNKNOWN":
            current_time = datetime.now(timezone.utc).isoformat()
            
            # Preserve existing user_id from Supabase so background pings don't overwrite it with NULL
            existing_device = get_device_settings(mac_address)
            existing_user_id = existing_device.get('user_id') if existing_device else None

            # --- STEP 1: Update/Insert into user_devices ---
            update_data = {
                'mac_address': mac_address,
                'ip_address': incoming_ip,
                'last_seen': current_time
            }
            
            if is_valid_uuid(raw_user_id):
                update_data['user_id'] = raw_user_id
            elif existing_user_id:
                update_data['user_id'] = existing_user_id

            supabase.from_('user_devices').upsert(
                update_data, 
                on_conflict='mac_address'
            ).execute()

            # --- STEP 2: Insert historical record into device_connections ---
            conn_log = {
                'mac_address': mac_address,
                'ip_address': incoming_ip,
                'status': 'ONLINE',
                'connected_at': current_time
            }
            if update_data.get('user_id'):
                conn_log['user_id'] = update_data['user_id']

            try:
                supabase.from_('device_connections').insert(conn_log).execute()
            except Exception as conn_err:
                pass

        # --- STEP 3: Handle Sound Alerts ---
        if "amplitude" in payload and "direction" in payload:
            direction = payload["direction"]
            amplitude = payload.get("amplitude", 0)
            
            settings = get_device_settings(mac_address)
            is_on = settings.get('is_on', True) if settings else True
            
            if not is_on:
                print(f"Ignored alert from MAC {mac_address}: Power OFF in settings.")
                return

            alert_payload = {
                'sound_type': payload.get("sound_type", "Loud Sound"),
                'decibel_level': float(amplitude),
                'location': 'indoor',
                'status': 'unread',
                'metadata': json.dumps({"direction": direction, "mac_address": mac_address})
            }

            if is_valid_uuid(raw_user_id):
                alert_payload['user_id'] = raw_user_id
            elif settings and settings.get('user_id'):
                alert_payload['user_id'] = settings.get('user_id')

            supabase.from_('alerts').insert(alert_payload).execute()
            print("[SUPABASE] Alert saved.")

    except json.JSONDecodeError:
        pass
    except Exception as e:
        print(f"Error: {e}")

try:
    while True:
        try:
            data, addr = sock.recvfrom(1024)
            process_packet(data.decode('utf-8'), addr)
        except socket.timeout:
            continue
except KeyboardInterrupt:
    print("\n[SERVER] Stopping server...")
    sock.close()
    sys.exit(0)