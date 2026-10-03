import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../services/supabaseClient';

const MONTHS = [
  { label: 'All', value: 'ALL' },
  { label: 'Jan', value: 0 },
  { label: 'Feb', value: 1 },
  { label: 'Mar', value: 2 },
  { label: 'Apr', value: 3 },
  { label: 'May', value: 4 },
  { label: 'Jun', value: 5 },
  { label: 'Jul', value: 6 },
  { label: 'Aug', value: 7 },
  { label: 'Sep', value: 8 },
  { label: 'Oct', value: 9 },
  { label: 'Nov', value: 10 },
  { label: 'Dec', value: 11 },
];

const FRIENDLY_TYPES = [
  { label: 'All Alerts', value: 'ALL', icon: 'bell', iconType: 'feather' },
  { label: 'Sound Detections', value: 'sound', icon: 'volume-2', iconType: 'feather' },
  { label: 'Device & Power', value: 'device', icon: 'cpu', iconType: 'feather' },
  { label: 'Battery', value: 'battery', icon: 'battery-charging', iconType: 'feather' },
  { label: 'Location Updates', value: 'location', icon: 'map-pin', iconType: 'feather' },
  { label: 'Settings & Sync', value: 'settings', icon: 'sliders', iconType: 'feather' },
  { label: 'Group Members', value: 'group', icon: 'users', iconType: 'feather' },
];

const parseTimestamp = (dateString) => {
  if (!dateString) return null;
  let formattedStr = typeof dateString === 'string' ? dateString.trim().replace(' ', 'T') : dateString;
  if (typeof formattedStr === 'string' && !formattedStr.endsWith('Z') && !formattedStr.includes('+')) {
    formattedStr += 'Z';
  }
  const parsedDate = new Date(formattedStr);
  return isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const formatUserFriendlyMessage = (title, message, notification_type, metadata) => {
  const safeTitle = typeof title === 'string' ? title : '';
  const safeMessage = typeof message === 'string' ? message : '';
  const safeType = typeof notification_type === 'string' ? notification_type : '';
  const safeMeta = typeof metadata === 'string' ? metadata : (metadata ? JSON.stringify(metadata) : '');

  const text = `${safeTitle} ${safeMessage} ${safeType} ${safeMeta}`.toLowerCase();

  // --- Sound Classification Cases ---
  if (safeType === 'sound_detection' || text.includes('detected') || text.includes('sound') || text.includes('siren') || text.includes('horn') || text.includes('bark') || text.includes('cry') || text.includes('knock') || text.includes('alarm')) {
    if (text.includes('siren') || text.includes('emergency')) {
      return { title: 'Emergency Siren Detected', desc: safeMessage || 'A high-priority emergency siren sound was detected nearby.' };
    }
    if (text.includes('horn') || text.includes('car horn') || text.includes('vehicle')) {
      return { title: 'Vehicle Horn Detected', desc: safeMessage || 'A vehicle or car horn sound was detected nearby.' };
    }
    if (text.includes('bark') || text.includes('dog')) {
      return { title: 'Dog Bark Detected', desc: safeMessage || 'A dog barking sound was detected.' };
    }
    if (text.includes('cry') || text.includes('baby')) {
      return { title: 'Baby Crying Detected', desc: safeMessage || 'A baby crying sound was detected.' };
    }
    if (text.includes('knock') || text.includes('doorbell') || text.includes('door')) {
      return { title: 'Door Knock / Bell Detected', desc: safeMessage || 'A door knock or doorbell sound was detected.' };
    }
    if (text.includes('alarm') || text.includes('fire') || text.includes('smoke')) {
      return { title: 'Alarm Sound Detected', desc: safeMessage || 'A safety or fire alarm was detected.' };
    }
    if (text.includes('shout') || text.includes('scream') || text.includes('yell')) {
      return { title: 'Loud Voice / Scream Detected', desc: safeMessage || 'A high-intensity voice or distress sound was detected.' };
    }
    return { title: safeTitle || 'Sound Alert Detected', desc: safeMessage || 'Sonoband detected an important environmental sound.' };
  }

  // 1. Device Registration
  if (safeMeta === 'REGISTERED' || text.includes('registered')) {
    return { title: 'New Device Registered', desc: safeMessage || 'Your Sonoband device has been successfully registered.' };
  }

  // 2. Disconnection / Connection Handling
  if (safeType === 'connection_status' || text.includes('disconnected') || text.includes('lost connection') || text.includes('timeout')) {
    return { 
      title: 'Device Disconnected', 
      desc: safeMessage || 'Sonoband lost connection to the mobile app or Wi-Fi network.' 
    };
  }

  if (text.includes('connected') || text.includes('paired')) {
    return { 
      title: 'Device Connected', 
      desc: safeMessage || 'Sonoband is successfully paired and connected.' 
    };
  }

  // 3. Power On / Off Handling
  if (
    safeType === 'device_toggle' ||
    text.includes('turned on') ||
    text.includes('turned off') ||
    text.includes('power_on') ||
    text.includes('power_off') ||
    safeMeta === 'ON' ||
    safeMeta === 'OFF'
  ) {
    const isOff = text.includes('off') || safeMeta === 'OFF';
    return {
      title: isOff ? 'Device Turned Off' : 'Device Turned On',
      desc: safeMessage || (isOff ? 'Your Sonoband listening mode was turned OFF.' : 'Your Sonoband listening mode was turned ON.'),
    };
  }

  // 4. Battery
  if (safeType === 'battery_update' || text.includes('battery')) {
    if (text.includes('full') || text.includes('100') || safeMeta === 'FULL') {
      return { title: 'Battery Full', desc: safeMessage || 'Sonoband device is fully charged.' };
    }
    return { title: 'Low Battery Warning', desc: safeMessage || 'Sonoband battery is running low. Please charge soon.' };
  }

  // 5. Location
  if (safeType === 'location_update' || text.includes('location') || text.includes('gps') || text.includes('map')) {
    return { title: safeTitle || 'Location Updated', desc: safeMessage || 'Map location was updated.' };
  }

  // 6. Settings
  if (safeType === 'settings_sync' || text.includes('settings') || text.includes('sync') || text.includes('threshold') || text.includes('vibration')) {
    return { title: safeTitle || 'Settings Synced', desc: safeMessage || 'Device configuration has been synchronized.' };
  }

  // 7. Group Members
  if (safeType === 'group_update' || text.includes('member') || text.includes('joined') || text.includes('group')) {
    return { title: safeTitle || 'New Group Member', desc: safeMessage || 'A new member has joined your Emergency Sync Group.' };
  }

  return { title: safeTitle || 'System Notification', desc: safeMessage || 'System activity logged.' };
};

const getEventIcon = (title, message, notification_type, metadata) => {
  const safeTitle = typeof title === 'string' ? title : '';
  const safeMessage = typeof message === 'string' ? message : '';
  const safeType = typeof notification_type === 'string' ? notification_type : '';
  const safeMeta = typeof metadata === 'string' ? metadata : (metadata ? JSON.stringify(metadata) : '');

  const text = `${safeTitle} ${safeMessage} ${safeType} ${safeMeta}`.toLowerCase();

  // --- Sound Detection Classifications ---
  if (safeType === 'sound_detection' || text.includes('siren') || text.includes('horn') || text.includes('bark') || text.includes('cry') || text.includes('knock') || text.includes('alarm') || text.includes('shout')) {
    if (text.includes('siren') || text.includes('emergency')) {
      return { library: 'Ionicons', icon: 'warning', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)', category: 'sound' };
    }
    if (text.includes('horn') || text.includes('car horn') || text.includes('vehicle')) {
      return { library: 'MaterialCommunityIcons', icon: 'car-horn', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)', category: 'sound' };
    }
    if (text.includes('bark') || text.includes('dog')) {
      return { library: 'MaterialCommunityIcons', icon: 'dog-side', color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)', category: 'sound' };
    }
    if (text.includes('cry') || text.includes('baby')) {
      return { library: 'MaterialCommunityIcons', icon: 'baby-bottle-outline', color: '#EC4899', bg: 'rgba(236, 72, 153, 0.15)', category: 'sound' };
    }
    if (text.includes('knock') || text.includes('doorbell') || text.includes('door')) {
      return { library: 'MaterialCommunityIcons', icon: 'doorbell', color: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.15)', category: 'sound' };
    }
    if (text.includes('alarm') || text.includes('fire')) {
      return { library: 'Ionicons', icon: 'alarm-outline', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)', category: 'sound' };
    }
    if (text.includes('shout') || text.includes('scream') || text.includes('yell')) {
      return { library: 'Ionicons', icon: 'mega-outline', color: '#F97316', bg: 'rgba(249, 115, 22, 0.15)', category: 'sound' };
    }
    return { library: 'Feather', icon: 'volume-2', color: '#38BDF8', bg: 'rgba(56, 189, 248, 0.15)', category: 'sound' };
  }

  // Registration
  if (safeMeta === 'REGISTERED' || text.includes('registered')) {
    return { library: 'Feather', icon: 'plus-circle', color: '#38BDF8', bg: 'rgba(56, 189, 248, 0.15)', category: 'device' };
  }

  // Disconnection / Connectivity
  if (safeType === 'connection_status' || text.includes('disconnected') || text.includes('lost connection') || text.includes('timeout')) {
    return { library: 'Feather', icon: 'link-2', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)', category: 'device' };
  }
  if (text.includes('connected') || text.includes('paired')) {
    return { library: 'Feather', icon: 'link', color: '#22C55E', bg: 'rgba(34, 197, 94, 0.15)', category: 'device' };
  }

  // Power On / Off
  if (
    safeType === 'device_toggle' ||
    text.includes('turned on') ||
    text.includes('turned off') ||
    text.includes('power_on') ||
    text.includes('power_off') ||
    safeMeta === 'ON' ||
    safeMeta === 'OFF'
  ) {
    const isOff = text.includes('off') || safeMeta === 'OFF';
    return {
      library: 'Feather',
      icon: 'power',
      color: isOff ? '#EF4444' : '#22C55E',
      bg: isOff ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
      category: 'device',
    };
  }

  // Battery
  if (safeType === 'battery_update' || text.includes('battery')) {
    if (text.includes('full') || text.includes('100') || safeMeta === 'FULL') {
      return { library: 'Feather', icon: 'battery-charging', color: '#22C55E', bg: 'rgba(34, 197, 94, 0.15)', category: 'battery' };
    }
    return { library: 'Feather', icon: 'battery', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)', category: 'battery' };
  }

  // Location
  if (safeType === 'location_update' || text.includes('location') || text.includes('gps') || text.includes('map')) {
    return { library: 'Feather', icon: 'map-pin', color: '#F97316', bg: 'rgba(249, 115, 22, 0.15)', category: 'location' };
  }

  // Settings
  if (safeType === 'settings_sync' || text.includes('settings') || text.includes('sync') || text.includes('threshold') || text.includes('vibration')) {
    return { library: 'Feather', icon: 'sliders', color: '#06B6D4', bg: 'rgba(6, 182, 212, 0.15)', category: 'settings' };
  }

  // Group
  if (safeType === 'group_update' || text.includes('member') || text.includes('joined') || text.includes('group')) {
    return { library: 'Feather', icon: 'user-plus', color: '#A855F7', bg: 'rgba(168, 85, 247, 0.15)', category: 'group' };
  }

  return { library: 'Feather', icon: 'bell', color: '#38BDF8', bg: 'rgba(56, 189, 248, 0.15)', category: 'device' };
};

// Helper component to render icon dynamically by vector library name
const RenderCategoryIcon = ({ library, icon, size = 20, color = '#38BDF8' }) => {
  if (library === 'Ionicons') {
    return <Ionicons name={icon} size={size} color={color} />;
  }
  if (library === 'MaterialCommunityIcons') {
    return <MaterialCommunityIcons name={icon} size={size} color={color} />;
  }
  return <Feather name={icon} size={size} color={color} />;
};

export default function NotificationScreen({ navigation, onNavigate, userId }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(userId || null);

  const today = useMemo(() => new Date(), []);
  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const [selectedDay, setSelectedDay] = useState('ALL');
  const [selectedType, setSelectedType] = useState('ALL');

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      let activeNumericUserId = userId;

      if (!activeNumericUserId) {
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user?.email) {
          const { data: customUser } = await supabase
            .from('users')
            .select('id')
            .eq('email', userData.user.email)
            .maybeSingle();

          if (customUser?.id) {
            activeNumericUserId = Number(customUser.id);
          }
        }
      }

      setCurrentUserId(activeNumericUserId);

      let notifQuery = supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false });

      if (activeNumericUserId !== undefined && activeNumericUserId !== null) {
        const parsedId = Number(activeNumericUserId);
        if (!isNaN(parsedId)) {
          notifQuery = notifQuery.eq('user_id', parsedId);
        }
      }

      const { data: notifData, error } = await notifQuery;

      if (error) {
        console.error('Supabase Notifications Error:', error.message);
      }

      const rawItems = notifData || [];

      const mappedEvents = rawItems.map((item) => ({
        id: item.id,
        rawTitle: item.title,
        rawDetails: item.message || item.metadata || '',
        notification_type: item.notification_type,
        metadata: item.metadata,
        created_at: item.created_at,
      }));

      setNotifications(mappedEvents);
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setNotifications([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchNotifications();

    const targetId = currentUserId || userId;
    if (!targetId) return;

    const channel = supabase
      .channel(`user_notifications_${targetId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${targetId}`,
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, currentUserId, fetchNotifications]);

  const daysInMonth = useMemo(() => {
    if (selectedMonth === 'ALL') return 31;
    return new Date(today.getFullYear(), selectedMonth + 1, 0).getDate();
  }, [selectedMonth, today]);

  useEffect(() => {
    if (selectedDay !== 'ALL' && selectedDay > daysInMonth) {
      setSelectedDay(daysInMonth);
    }
  }, [daysInMonth, selectedDay]);

  const isDayInFuture = (day) => {
    if (selectedMonth === 'ALL' || day === 'ALL') return false;
    const currentMonth = today.getMonth();
    const currentDate = today.getDate();

    if (selectedMonth > currentMonth) return true;
    if (selectedMonth === currentMonth && day > currentDate) return true;
    return false;
  };

  const formatLocalDateTime = (dateString) => {
    const localDate = parseTimestamp(dateString);
    if (!localDate) {
      return { dateStr: 'N/A', timeStr: '' };
    }

    return {
      dateStr: localDate.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      timeStr: localDate.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
    };
  };

  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      const itemDate = parseTimestamp(item.created_at);
      if (!itemDate) return true;

      const itemMonth = itemDate.getMonth();
      const itemDay = itemDate.getDate();

      if (selectedMonth !== 'ALL' && itemMonth !== selectedMonth) return false;
      if (selectedDay !== 'ALL' && itemDay !== selectedDay) return false;

      if (selectedType !== 'ALL') {
        const iconConfig = getEventIcon(item.rawTitle, item.rawDetails, item.notification_type, item.metadata);
        if (iconConfig.category !== selectedType) return false;
      }

      return true;
    });
  }, [notifications, selectedMonth, selectedDay, selectedType]);

  const handleBackNavigation = () => {
    if (navigation?.goBack) {
      navigation.goBack();
    } else if (onNavigate) {
      onNavigate('dashboard');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="#1E293B" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={handleBackNavigation}>
          <Ionicons name="arrow-back" size={24} color="#F8FAFC" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Notifications</Text>
          <Text style={styles.headerSub}>Activity & System Updates</Text>
        </View>
      </View>

      {/* Filter Bar */}
      <View style={styles.filterBar}>
        <Text style={styles.filterLabel}>Show Activity Type</Text>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.horizontalScroll}
          contentContainerStyle={{ alignItems: 'center', paddingRight: 16 }}
        >
          {FRIENDLY_TYPES.map((t) => {
            const isSelected = selectedType === t.value;
            return (
              <TouchableOpacity
                key={`type_${t.value}`}
                style={[styles.typeChip, isSelected && styles.chipActive]}
                onPress={() => setSelectedType(t.value)}
              >
                <Feather
                  name={t.icon}
                  size={14}
                  color={isSelected ? '#0F172A' : '#94A3B8'}
                  style={styles.chipIcon}
                />
                <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={styles.filterLabel}>Month</Text>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.horizontalScroll}
          contentContainerStyle={{ alignItems: 'center', paddingRight: 16 }}
        >
          {MONTHS.map((m) => {
            const isFutureMonth = typeof m.value === 'number' && m.value > today.getMonth();
            const isSelected = selectedMonth === m.value;
            return (
              <TouchableOpacity
                key={`month_${m.value}`}
                disabled={isFutureMonth}
                style={[
                  styles.chip,
                  isSelected && styles.chipActive,
                  isFutureMonth && styles.chipDisabled,
                ]}
                onPress={() => setSelectedMonth(m.value)}
              >
                <Text style={[styles.chipText, isSelected && styles.chipTextActive, isFutureMonth && styles.chipTextDisabled]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={styles.filterLabel}>Day</Text>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.horizontalScroll}
          contentContainerStyle={{ alignItems: 'center', paddingRight: 16 }}
        >
          <TouchableOpacity
            style={[styles.chip, selectedDay === 'ALL' && styles.chipActive]}
            onPress={() => setSelectedDay('ALL')}
          >
            <Text style={[styles.chipText, selectedDay === 'ALL' && styles.chipTextActive]}>
              All
            </Text>
          </TouchableOpacity>
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
            const isFuture = isDayInFuture(day);
            const isSelected = selectedDay === day;
            return (
              <TouchableOpacity
                key={`day_${day}`}
                disabled={isFuture}
                style={[
                  styles.chip,
                  isSelected && styles.chipActive,
                  isFuture && styles.chipDisabled,
                ]}
                onPress={() => setSelectedDay(day)}
              >
                <Text style={[styles.chipText, isSelected && styles.chipTextActive, isFuture && styles.chipTextDisabled]}>
                  {day}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Notifications List */}
      {loading ? (
        <ActivityIndicator size="large" color="#06B6D4" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filteredNotifications}
          keyExtractor={(item, index) => (item?.id != null ? String(item.id) : String(index))}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchNotifications(); }}
              tintColor="#06B6D4"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="bell-off" size={48} color="#475569" />
              <Text style={styles.emptyText}>No notifications found for this selection.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const { dateStr, timeStr } = formatLocalDateTime(item.created_at);
            const friendly = formatUserFriendlyMessage(item.rawTitle, item.rawDetails, item.notification_type, item.metadata);
            const iconConfig = getEventIcon(item.rawTitle, item.rawDetails, item.notification_type, item.metadata);

            return (
              <View style={styles.itemCard}>
                <View style={[styles.iconWrapper, { backgroundColor: iconConfig.bg }]}>
                  <RenderCategoryIcon
                    library={iconConfig.library}
                    icon={iconConfig.icon}
                    size={20}
                    color={iconConfig.color}
                  />
                </View>

                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.actionTitle}>{String(friendly.title || '')}</Text>
                  <Text style={styles.detailsText}>{String(friendly.desc || '')}</Text>
                  <Text style={styles.timeText}>{`${dateStr} • ${timeStr}`}</Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  iconButton: { padding: 8, borderRadius: 10, backgroundColor: '#334155' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#F8FAFC' },
  headerSub: { fontSize: 12, color: '#94A3B8' },
  filterBar: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  filterLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 6,
    marginBottom: 6,
  },
  horizontalScroll: {
    marginBottom: 6,
  },
  typeChip: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    marginRight: 6,
  },
  chipIcon: {
    marginRight: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#0F172A',
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  chipActive: {
    backgroundColor: '#06B6D4',
    borderColor: '#06B6D4',
  },
  chipDisabled: {
    opacity: 0.2,
  },
  chipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  chipTextDisabled: {
    color: '#475569',
  },
  itemCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#334155',
  },
  iconWrapper: {
    padding: 8,
    borderRadius: 10,
  },
  actionTitle: { fontSize: 15, fontWeight: '700', color: '#F8FAFC' },
  detailsText: { fontSize: 13, color: '#94A3B8', marginTop: 2 },
  timeText: { fontSize: 11, color: '#64748B', marginTop: 6 },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: '#64748B', fontSize: 15, marginTop: 12 },
});