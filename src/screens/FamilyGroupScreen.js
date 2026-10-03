import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { supabase, logSystemActivity } from '../services/supabaseClient';

const MAP_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background-color: #0F172A; }
    .custom-pin { background: transparent; border: none; }
    .custom-popup .leaflet-popup-content-wrapper {
      background: #1E293B;
      color: #F8FAFC;
      border-radius: 10px;
      padding: 6px 10px;
      border: 1px solid #334155;
    }
    .custom-popup .leaflet-popup-tip { background: #1E293B; }
    .popup-title { font-weight: 700; font-size: 13px; color: #38BDF8; }
    .popup-location { font-size: 11px; color: #94A3B8; margin-top: 2px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: false }).setView([14.5995, 120.9842], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

    var marker = null;
    var circle = null;

    var pinSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36">' +
      '<path fill="#EF4444" stroke="#FFFFFF" stroke-width="1.5" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>' +
      '</svg>';

    var pinIcon = L.divIcon({
      className: 'custom-pin',
      html: pinSvg,
      iconSize: [36, 36],
      iconAnchor: [18, 36],
      popupAnchor: [0, -36]
    });

    function updateMapLocation(lat, lng, name, address) {
      if (!lat || !lng) return;

      if (marker) map.removeLayer(marker);
      if (circle) map.removeLayer(circle);

      circle = L.circle([lat, lng], {
        color: '#38BDF8',
        fillColor: '#38BDF8',
        fillOpacity: 0.15,
        radius: 50
      }).addTo(map);

      marker = L.marker([lat, lng], { icon: pinIcon }).addTo(map);

      var div = document.createElement('div');
      var title = document.createElement('div');
      title.className = 'popup-title';
      title.textContent = name || 'User';

      var loc = document.createElement('div');
      loc.className = 'popup-location';
      loc.textContent = address || 'Live Location';

      div.appendChild(title);
      div.appendChild(loc);

      marker.bindPopup(div, { className: 'custom-popup' }).openPopup();
      map.flyTo([lat, lng], 15, { animate: true });
    }

    function handleMessage(event) {
      try {
        var payload = JSON.parse(event.data);
        if (payload && payload.latitude && payload.longitude) {
          updateMapLocation(payload.latitude, payload.longitude, payload.userName, payload.locationName);
        }
      } catch (e) {
        console.error(e);
      }
    }

    document.addEventListener('message', handleMessage);
    window.addEventListener('message', handleMessage);
  </script>
</body>
</html>
`;

export default function FamilyGroupScreen({ route, navigation, onNavigate, userId: propUserId, userRole }) {
  const fullWebViewRef = useRef(null);
  const miniWebViewRef = useRef(null);

  const selectedGroup = route?.params?.group || {
    id: null,
    group_name: 'Group Details',
    name: 'Group Details',
    invite_code: 'N/A',
    owner_id: null,
  };

  const initialUserId = route?.params?.userId || propUserId || null;
  const groupName = selectedGroup.group_name || selectedGroup.name || 'Group Details';

  const [activeTab, setActiveTab] = useState('Overview');
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(initialUserId ? Number(initialUserId) : null);
  const [currentUserName, setCurrentUserName] = useState('You');
  const [locationName, setLocationName] = useState('Fetching address...');
  const [actionLoading, setActionLoading] = useState(false);
  const [locatingLoading, setLocatingLoading] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState(null);

  const [mapCoords, setMapCoords] = useState({ latitude: 14.5995, longitude: 120.9842 });

  useEffect(() => {
    if (route?.params?.userId || propUserId) {
      setCurrentUserId(Number(route?.params?.userId || propUserId));
    }
  }, [route?.params?.userId, propUserId]);

  useEffect(() => {
    syncAndFetchUserLocation(false);
  }, [selectedGroup.id]);

  useEffect(() => {
    fetchUserAndRoleStatus();
    if (selectedGroup.id) {
      fetchGroupDetails();
    }
  }, [selectedGroup.id, currentUserId]);

  useEffect(() => {
    sendDataToMap(mapCoords.latitude, mapCoords.longitude, currentUserName, locationName);
  }, [mapCoords, currentUserName, locationName, activeTab]);

  const sendDataToMap = (lat, lng, name, address) => {
    const payload = JSON.stringify({
      latitude: Number(lat),
      longitude: Number(lng),
      userName: name || 'User',
      locationName: address || 'Live Location',
    });

    if (fullWebViewRef.current) fullWebViewRef.current.postMessage(payload);
    if (miniWebViewRef.current) miniWebViewRef.current.postMessage(payload);
  };

  const fetchUserAndRoleStatus = async () => {
    try {
      const activeId = currentUserId || route?.params?.userId || propUserId;

      if (activeId) {
        const { data: userData } = await supabase
          .from('users')
          .select('id, name, email')
          .eq('id', Number(activeId))
          .maybeSingle();

        if (userData) {
          setCurrentUserId(userData.id);
          setCurrentUserName(userData.name || userData.email || 'You');
        }
      }

      const effectiveUserId = activeId || currentUserId;
      const ownerMatch = String(effectiveUserId) === String(selectedGroup.owner_id);
      setIsOwner(ownerMatch);
    } catch (err) {
      console.log('Error verifying user status:', err.message);
    }
  };

  const syncAndFetchUserLocation = async (isManualRefresh = false) => {
    try {
      setLocatingLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required.');
        fetchFallbackGroupLocation();
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = location.coords;
      setMapCoords({ latitude, longitude });

      let addressString = 'Location updated';
      try {
        const addressData = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (addressData && addressData.length > 0) {
          const item = addressData[0];
          const parts = [
            item.name || item.street,
            item.district || item.subregion,
            item.city,
            item.region
          ].filter(Boolean);
          addressString = parts.length > 0 ? parts.join(', ') : 'Location updated';
        }
      } catch (geoErr) {
        console.log('Geocoding error:', geoErr.message);
      }
      setLocationName(addressString);

      const nowIso = new Date().toISOString();

      sendDataToMap(latitude, longitude, currentUserName, addressString);

      if (isManualRefresh) {
        const activeId = currentUserId || route?.params?.userId || propUserId;

        if (activeId) {
          const numericUserId = Number(activeId);

          const { error: notifError } = await supabase
            .from('notifications')
            .insert([{
              user_id: numericUserId,
              notification_type: 'location_update',
              title: 'Location Updated',
              message: `Updated location to: ${addressString}`,
              metadata: JSON.stringify({ latitude, longitude }),
              is_read: false,
              created_at: nowIso,
            }]);

          if (notifError) {
            console.log('Notification Insert Error:', notifError.message);
          }
        }

        if (typeof logSystemActivity === 'function' && activeId) {
          try {
            await logSystemActivity(
              activeId,
              'location_update',
              `Updated location: ${addressString}`,
              { latitude, longitude, address: addressString }
            );
          } catch (aErr) {
            console.log('Audit log skipped:', aErr.message);
          }
        }

        Alert.alert('Location Updated', `Your location (${addressString}) has been updated.`);
      }
    } catch (err) {
      console.log('Error syncing location, falling back:', err.message);
      fetchFallbackGroupLocation();
    } finally {
      setLocatingLoading(false);
    }
  };

  const locateUserOnly = () => {
    sendDataToMap(mapCoords.latitude, mapCoords.longitude, currentUserName, locationName);
  };

  const fetchFallbackGroupLocation = async () => {
    try {
      const { data: notifData } = await supabase
        .from('notifications')
        .select('metadata, message')
        .eq('notification_type', 'location_update')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (notifData?.metadata) {
        const parsed = typeof notifData.metadata === 'string' 
          ? JSON.parse(notifData.metadata) 
          : notifData.metadata;

        if (parsed?.latitude && parsed?.longitude) {
          const lat = Number(parsed.latitude);
          const lng = Number(parsed.longitude);
          const cleanAddress = notifData.message 
            ? notifData.message.replace('Updated location to: ', '') 
            : locationName;

          setMapCoords({ latitude: lat, longitude: lng });
          setLocationName(cleanAddress);
          sendDataToMap(lat, lng, currentUserName, cleanAddress);
        }
      }
    } catch (err) {
      console.log('Location fetch fallback:', err.message);
    }
  };

  const locateMemberOnMap = async (member) => {
    const memberName = member.users?.name || member.users?.email || `User #${member.user_id}`;
    setSelectedMemberId(member.user_id);
    setLocatingLoading(true);

    try {
      // Query notification table for member's latest location update
      const { data: notifData, error } = await supabase
        .from('notifications')
        .select('metadata, message')
        .eq('user_id', member.user_id)
        .eq('notification_type', 'location_update')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let foundLocation = false;

      if (notifData?.metadata) {
        const parsed = typeof notifData.metadata === 'string'
          ? JSON.parse(notifData.metadata)
          : notifData.metadata;

        if (parsed?.latitude && parsed?.longitude) {
          foundLocation = true;
          const lat = Number(parsed.latitude);
          const lng = Number(parsed.longitude);
          const cleanAddress = notifData.message
            ? notifData.message.replace('Updated location to: ', '')
            : 'Member location';

          setMapCoords({ latitude: lat, longitude: lng });
          setCurrentUserName(memberName);
          setLocationName(cleanAddress);
          sendDataToMap(lat, lng, memberName, cleanAddress);
        }
      }

      if (!foundLocation) {
        Alert.alert(
          'Location Unavailable',
          `No recorded location updates found for ${memberName}.`
        );
      }
    } catch (err) {
      console.log('Error locating member:', err.message);
    } finally {
      setLocatingLoading(false);
    }
  };

  const fetchGroupDetails = async () => {
    setLoading(true);
    try {
      const { data: memberData, error: memberError } = await supabase
        .from('group_members')
        .select('role, user_id, id')
        .eq('group_id', selectedGroup.id);

      if (!memberError && memberData && memberData.length > 0) {
        const userIds = memberData.map(m => m.user_id).filter(Boolean);

        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('id, name, email')
          .in('id', userIds);

        if (!usersError && usersData) {
          const userMap = new Map();
          usersData.forEach(u => {
            userMap.set(Number(u.id), u);
            userMap.set(String(u.id), u);
          });

          const formattedMembers = memberData.map(m => ({
            ...m,
            users: userMap.get(m.user_id) || userMap.get(Number(m.user_id)) || null,
          }));
          setMembers(formattedMembers);
        } else {
          setMembers(memberData);
        }
      } else {
        setMembers([]);
      }
    } catch (err) {
      console.log('Error fetching group info:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = () => {
    Alert.alert(
      'Delete Group',
      `Are you sure you want to delete "${groupName}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              const { error } = await supabase.rpc('delete_group', {
                p_group_id: selectedGroup.id
              });

              if (error) {
                Alert.alert('Error', error.message);
              } else {
                const activeId = currentUserId || route?.params?.userId || propUserId;
                if (activeId && logSystemActivity) {
                  try {
                    await logSystemActivity(
                      activeId,
                      'delete_group',
                      `Deleted family group: ${groupName}`,
                      { groupId: selectedGroup.id }
                    );
                  } catch (aErr) {
                    console.log('Audit log skipped:', aErr.message);
                  }
                }
                Alert.alert('Success', 'Group deleted successfully.');
                handleBackNavigation();
              }
            } catch (err) {
              Alert.alert('Error', 'An unexpected error occurred while deleting the group.');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleLeaveGroup = () => {
    Alert.alert(
      'Leave Group',
      `Are you sure you want to leave "${groupName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            if (!selectedGroup.id) return;
            setActionLoading(true);
            try {
              const activeId = currentUserId || route?.params?.userId || propUserId;

              if (!activeId) {
                throw new Error('User ID parameter missing. Please sign in again.');
              }

              const { error: deleteError } = await supabase.rpc('leave_group', {
                p_group_id: selectedGroup.id,
                p_user_id: String(activeId)
              });

              if (deleteError) {
                throw deleteError;
              }

              if (logSystemActivity && activeId) {
                try {
                  await logSystemActivity(
                    activeId,
                    'leave_group',
                    `Left family group: ${groupName}`,
                    { groupId: selectedGroup.id }
                  );
                } catch (aErr) {
                  console.log('Audit log skipped:', aErr.message);
                }
              }

              Alert.alert('Success', 'You have left the group.');
              handleBackNavigation();
            } catch (err) {
              console.error('Error leaving group:', err.message);
              Alert.alert('Error', err.message || 'An unexpected error occurred while leaving the group.');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleBackNavigation = () => {
    if (typeof onNavigate === 'function') {
      onNavigate('groupManagement');
    } else if (navigation && typeof navigation.goBack === 'function') {
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={handleBackNavigation}>
          <Ionicons name="arrow-back" size={20} color="#F8FAFC" />
        </TouchableOpacity>

        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{groupName}</Text>
          <Text style={styles.headerSub}>
            {selectedGroup.id ? `Code: ${selectedGroup.invite_code}` : 'Family Group'}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          {selectedGroup.id && (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => Alert.alert('Invite Code', `Share this code to let others join: ${selectedGroup.invite_code}`)}
            >
              <Feather name="share-2" size={18} color="#38BDF8" />
            </TouchableOpacity>
          )}

          {isOwner && selectedGroup.id && (
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: '#451A03' }]}
              onPress={handleDeleteGroup}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <Feather name="trash-2" size={18} color="#EF4444" />
              )}
            </TouchableOpacity>
          )}

          {!isOwner && selectedGroup.id && (
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: '#451A03' }]}
              onPress={handleLeaveGroup}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <Feather name="log-out" size={18} color="#EF4444" />
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tab Selectors */}
      <View style={styles.tabContainer}>
        {['Overview', 'Live Map'].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabButton, activeTab === tab && styles.activeTabButton]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Main Views */}
      {loading ? (
        <ActivityIndicator color="#38BDF8" size="large" style={{ marginTop: 40 }} />
      ) : activeTab === 'Live Map' ? (
        <View style={styles.mapTabContainer}>
          {/* USER INFO BAR */}
          <View style={styles.userInfoCard}>
            <View style={styles.badgeIconBox}>
              <Ionicons name="location-sharp" size={20} color="#38BDF8" />
            </View>
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={styles.pinText}>{currentUserName}</Text>
              <Text style={styles.locationText} numberOfLines={1}>{locationName}</Text>
            </View>
            <View style={styles.statusDot} />
          </View>

          {/* FULL MAP VIEW */}
          <View style={styles.fullMapBox}>
            <WebView
              ref={fullWebViewRef}
              originWhitelist={['*']}
              source={{ html: MAP_HTML }}
              style={{ flex: 1 }}
              onLoadEnd={() => {
                sendDataToMap(mapCoords.latitude, mapCoords.longitude, currentUserName, locationName);
              }}
            />
            {locatingLoading && (
              <View style={styles.mapLoadingOverlay}>
                <ActivityIndicator size="small" color="#38BDF8" />
              </View>
            )}
          </View>

          {/* ACTION BUTTONS */}
          <View style={styles.controlsBar}>
            <TouchableOpacity 
              style={[styles.actionBtn, styles.secondaryBtn]} 
              onPress={locateUserOnly}
            >
              <Ionicons name="navigate-outline" size={18} color="#38BDF8" style={styles.btnIcon} />
              <Text style={styles.secondaryBtnText}>Locate User</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionBtn, styles.primaryBtn]} 
              onPress={() => syncAndFetchUserLocation(true)}
            >
              <Ionicons name="refresh-outline" size={18} color="#0F172A" style={styles.btnIcon} />
              <Text style={styles.primaryBtnText}>Update Location</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Overview Location Map Card */}
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={styles.cardTitle}>Current Location</Text>
              <TouchableOpacity onPress={() => setActiveTab('Live Map')}>
                <Text style={{ color: '#38BDF8', fontWeight: '600', fontSize: 13 }}>Expand Map</Text>
              </TouchableOpacity>
            </View>

            {/* Overview User Info */}
            <View style={styles.miniUserInfoCard}>
              <View style={styles.badgeIconBox}>
                <Ionicons name="location-sharp" size={18} color="#38BDF8" />
              </View>
              <View style={{ marginLeft: 8, flex: 1 }}>
                <Text style={styles.pinText}>{currentUserName}</Text>
                <Text style={styles.locationText} numberOfLines={1}>{locationName}</Text>
              </View>
            </View>

            {/* Overview Map Container */}
            <View style={styles.miniMapContainer}>
              <WebView
                ref={miniWebViewRef}
                originWhitelist={['*']}
                source={{ html: MAP_HTML }}
                style={{ flex: 1 }}
                scrollEnabled={false}
                onLoadEnd={() => {
                  sendDataToMap(mapCoords.latitude, mapCoords.longitude, currentUserName, locationName);
                }}
              />
            </View>

            {/* Overview Map Controls */}
            <View style={styles.overviewControlsBar}>
              <TouchableOpacity 
                style={[styles.actionBtn, styles.secondaryBtn]} 
                onPress={locateUserOnly}
              >
                <Ionicons name="navigate-outline" size={16} color="#38BDF8" style={styles.btnIcon} />
                <Text style={styles.secondaryBtnText}>Locate User</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.actionBtn, styles.primaryBtn]} 
                onPress={() => syncAndFetchUserLocation(true)}
              >
                <Ionicons name="refresh-outline" size={16} color="#0F172A" style={styles.btnIcon} />
                <Text style={styles.primaryBtnText}>Update Location</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Group Members List */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Group Members ({members.length})</Text>

            {members.length === 0 ? (
              <Text style={{ color: '#64748B', fontSize: 13 }}>No members found for this group.</Text>
            ) : (
              members.map((m, index) => {
                const fullName = m.users?.name || m.users?.email || (m.user_id ? `User #${m.user_id}` : 'Member');
                const initials = fullName.substring(0, 2).toUpperCase();
                const isSelected = selectedMemberId === m.user_id;

                return (
                  <TouchableOpacity
                    key={m.id || index}
                    style={[styles.memberCard, isSelected && styles.selectedMemberCard]}
                    onPress={() => locateMemberOnMap(m)}
                  >
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{initials}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.memberName}>{fullName}</Text>
                      <Text style={styles.memberRole}>{m.role ? m.role.toUpperCase() : 'MEMBER'}</Text>
                    </View>
                    <Ionicons name="location-outline" size={20} color="#38BDF8" />
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  iconButton: { padding: 8, borderRadius: 10, backgroundColor: '#334155' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#F8FAFC' },
  headerSub: { fontSize: 12, color: '#94A3B8' },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    padding: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  tabButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  activeTabButton: { backgroundColor: '#06B6D4' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#94A3B8' },
  activeTabText: { color: '#0F172A', fontWeight: '700' },
  scrollContent: { padding: 16, paddingBottom: 80 },
  
  mapTabContainer: { flex: 1, padding: 16, justifyContent: 'space-between' },
  fullMapBox: { flex: 1, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#334155', marginVertical: 12 },
  mapLoadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', alignItems: 'center' },

  userInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  miniUserInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 10,
  },
  badgeIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center'
  },
  pinText: { fontWeight: 'bold', fontSize: 13, color: '#F8FAFC' },
  locationText: { fontSize: 11, color: '#38BDF8', marginTop: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E' },

  controlsBar: { flexDirection: 'row', gap: 10 },
  overviewControlsBar: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: { 
    flex: 1, 
    flexDirection: 'row',
    paddingVertical: 12, 
    borderRadius: 10, 
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnIcon: { marginRight: 6 },
  primaryBtn: { backgroundColor: '#38BDF8' },
  primaryBtnText: { color: '#0F172A', fontWeight: 'bold', fontSize: 12 },
  secondaryBtn: { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155' },
  secondaryBtnText: { color: '#38BDF8', fontWeight: 'bold', fontSize: 12 },

  card: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#F8FAFC', marginBottom: 12 },
  miniMapContainer: { height: 180, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#334155' },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  selectedMemberCard: {
    borderColor: '#38BDF8',
    backgroundColor: '#1E293B',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#06B6D4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#0F172A', fontWeight: '700', fontSize: 14 },
  memberName: { color: '#F8FAFC', fontWeight: '600', fontSize: 14 },
  memberRole: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
});