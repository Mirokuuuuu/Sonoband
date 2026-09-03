import socket
import json
import uuid
import time
from threading import Thread
from datetime import datetime, timezone
from http.server import HTTPServer, BaseHTTPRequestHandler
from supabase import create_client, Client

SUPABASE_URL = "https://qdmwobrwokpczqwezjzs.supabase.co"  
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkbXdvYnJ3b2twY3pxd2V6anpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNjg1MDgsImV4cCI6MjA5Nzg0NDUwOH0.dDn4oJE78IcgDHX5U2FbhxHaHFWFbwqP0AbjT5AajY8"        
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

UDP_IP = "0.0.0.0" 
UDP_PORT = 8888
HTTP_PORT = 5000

# Stores live shaking-hands devices in memory ONLY: { mac_address: { ... } }
ACTIVE_DISCOVERED_DEVICES = {}

def clean_stale_devices():
    """Removes devices from local memory if no ping received in 10 seconds."""
    while True:
        now = time.time()
        stale_macs = [mac for mac, info in ACTIVE_DISCOVERED_DEVICES.items() if now - info['last_ping'] > 10]
        for mac in stale_macs:
            del ACTIVE_DISCOVERED_DEVICES[mac]
            print(f"[DISCOVERY] ESP32 {mac} lost power / disconnected. Removed from search.")
        time.sleep(3)

class DiscoveryAPI(BaseHTTPRequestHandler):
    """Local HTTP endpoint for React Native app to discover live handshakes."""
    def do_GET(self):
        if self.path == '/discovered-devices':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            # Format active devices for mobile app
            devices_list = []
            for mac, data in ACTIVE_DISCOVERED_DEVICES.items():
                devices_list.append({
                    "mac_address": mac,
                    "ip_address": data['ip_address'],
                    "device_name": data['device_name'],
                    "is_active": True
                })
            
            self.wfile.write(json.dumps(devices_list).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

def start_http_server():
    server = HTTPServer(('0.0.0.0', HTTP_PORT), DiscoveryAPI)
    print(f"[HTTP] Discovery API running on port {HTTP_PORT}...")
    server.serve_forever()

def get_existing_device(mac_address):
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

    # Start background threads
    Thread(target=clean_stale_devices, daemon=True).start()
    Thread(target=start_http_server, daemon=True).start()

    while True:
        try:
            data, addr = sock.recvfrom(1024)
            data_str = data.decode('utf-8')
            payload = json.loads(data_str)
            
            mac_address = payload.get("mac_address", "UNKNOWN")
            incoming_ip = payload.get("ip_address", addr[0])

            if mac_address != "UNKNOWN":
                # 1. Update in-memory discovery state (NO SUPABASE INSERT HERE)
                ACTIVE_DISCOVERED_DEVICES[mac_address] = {
                    'ip_address': incoming_ip,
                    'device_name': payload.get('device', 'SonoBand Device'),
                    'last_ping': time.time()
                }

                # 2. Check if device has ALREADY been paired in database by the mobile app
                existing_device = get_existing_device(mac_address)
                
                if existing_device and existing_device.get('user_id'):
                    # Device is paired: update last_seen heartbeat
                    current_time = datetime.now(timezone.utc).isoformat()
                    supabase.from_('user_devices').update({
                        'ip_address': incoming_ip,
                        'last_seen': current_time
                    }).eq('mac_address', mac_address).execute()

                    desired_power_state = existing_device.get('is_on', False)
                    existing_user_id = existing_device.get('user_id')
                else:
                    desired_power_state = False
                    existing_user_id = ""

                # 3. Respond back to ESP32
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