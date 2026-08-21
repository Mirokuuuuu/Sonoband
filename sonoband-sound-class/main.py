import socket
import json
import uuid
import time
from datetime import datetime, timezone
from supabase import create_client, Client

SUPABASE_URL = "https://qdmwobrwokpczqwezjzs.supabase.co"  
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkbXdvYnJ3b2twY3pxd2V6anpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNjg1MDgsImV4cCI6MjA5Nzg0NDUwOH0.dDn4oJE78IcgDHX5U2FbhxHaHFWFbwqP0AbjT5AajY8"        
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

UDP_IP = "0.0.0.0" 
UDP_PORT = 8888

def is_valid_uuid(val):
    try:
        if not val:
            return False
        uuid.UUID(str(val))
        return True
    except (ValueError, TypeError):
        return False

def get_existing_device(mac_address):
    """Fetches the existing device record from user_devices to retain settings and user_id."""
    try:
        res = supabase.from_('user_devices') \
            .select('user_id, is_on') \
            .eq('mac_address', mac_address) \
            .maybe_single() \
            .execute()
        return res.data
    except Exception as e:
        print(f"[ERROR] DB Fetch Error: {e}")
        return None

def start_continuous_listener():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((UDP_IP, UDP_PORT))
    
    print(f"[SERVER] Started. Listening constantly for ESP32 broadcasts on port {UDP_PORT}...")

    while True:
        try:
            # 1. Receive UDP broadcast from ESP32
            data, addr = sock.recvfrom(1024)
            data_str = data.decode('utf-8')
            payload = json.loads(data_str)
            
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Received from {addr[0]}: {payload}")

            mac_address = payload.get("mac_address", "UNKNOWN")
            incoming_ip = payload.get("ip_address", addr[0])
            raw_user_id = payload.get("user_id", "")

            if mac_address != "UNKNOWN":
                current_time = datetime.now(timezone.utc).isoformat()
                
                # Check if device is already registered in user_devices
                existing_device = get_existing_device(mac_address)
                existing_user_id = existing_device.get('user_id') if existing_device else None
                desired_power_state = existing_device.get('is_on', False) if existing_device else False

                # Prepare upsert payload
                update_data = {
                    'mac_address': mac_address,
                    'ip_address': incoming_ip,
                    'last_seen': current_time,
                    'device_name': payload.get('device', 'SonoBand Device')
                }
                
                # Assign valid UUID (from incoming packet or existing DB record)
                if is_valid_uuid(raw_user_id):
                    update_data['user_id'] = raw_user_id
                elif existing_user_id:
                    update_data['user_id'] = existing_user_id

                # Only attempt database update if we have a valid user_id or device already exists
                if 'user_id' in update_data or existing_device is not None:
                    supabase.from_('user_devices').upsert(
                        update_data, 
                        on_conflict='mac_address'
                    ).execute()
                else:
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] Notice: Device {mac_address} not yet paired to a user in app.")

                # Reply back to ESP32 with current power state from DB
                desired_power = "on" if desired_power_state else "off"
                cmd_payload = json.dumps({
                    "type": "ping",
                    "power": desired_power,
                    "user_id": str(existing_user_id) if existing_user_id else ""
                })
                
                sock.sendto(cmd_payload.encode('utf-8'), (incoming_ip, UDP_PORT))

        except Exception as e:
            print(f"[ERROR] Listener error: {e}")

if __name__ == "__main__":
    start_continuous_listener()