import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
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
  { label: 'All Alerts', value: 'ALL', icon: 'bell' },
  { label: 'Account & Security', value: 'auth_event', icon: 'shield' },
  { label: 'Device & Connections', value: 'device_event', icon: 'cpu' },
];

export default function NotificationScreen({ navigation, onNavigate, userId }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Default filters set to 'ALL' to ensure historical notifications load
  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const [selectedDay, setSelectedDay] = useState('ALL');
  const [selectedType, setSelectedType] = useState('ALL');

  useEffect(() => {
    fetchNotifications();
  }, [userId]);

  const daysInMonth = useMemo(() => {
    if (selectedMonth === 'ALL') return 31;
    return new Date(today.getFullYear(), selectedMonth + 1, 0).getDate();
  }, [selectedMonth]);

  useEffect(() => {
    if (selectedDay !== 'ALL' && selectedDay > daysInMonth) {
      setSelectedDay(daysInMonth);
    }
  }, [daysInMonth]);

  const isDayInFuture = (day) => {
    if (selectedMonth === 'ALL' || day === 'ALL') return false;
    const currentMonth = today.getMonth();
    const currentDate = today.getDate();

    if (selectedMonth > currentMonth) return true;
    if (selectedMonth === currentMonth && day > currentDate) return true;
    return false;
  };

  const formatLocalDateTime = (dateString) => {
    if (!dateString || typeof dateString !== 'string') {
      return { dateStr: 'N/A', timeStr: '' };
    }
    let formattedStr = dateString.replace(' ', 'T');
    if (!formattedStr.endsWith('Z') && !formattedStr.includes('+')) {
      formattedStr += 'Z';
    }
    const localDate = new Date(formattedStr);
    return {
      dateStr: localDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
      timeStr: localDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
    };
  };

  const formatUserFriendlyMessage = (title, message, metadata) => {
    const text = `${title || ''} ${message || ''} ${metadata || ''}`.toLowerCase();

    if (text.includes('login')) {
      return { title: 'Login', desc: 'You logged into your account.' };
    }
    if (text.includes('logout')) {
      return { title: 'Logout', desc: 'You logged out of your session.' };
    }
    if (text.includes('connected') && !text.includes('disconnected')) {
      return { title: 'Device Connected', desc: message || 'Your device is connected.' };
    }
    if (text.includes('disconnected') || text.includes('timeout')) {
      return { title: 'Device Disconnected', desc: message || 'Lost connection to your device.' };
    }
    if (text.includes('battery')) {
      return { title: 'Battery Status', desc: message || 'Battery level updated.' };
    }
    if (text.includes('gps') || text.includes('location')) {
      return { title: 'Location Update', desc: message || 'Location data refreshed.' };
    }

    return { title: title || 'Notification', desc: message || 'System event recorded.' };
  };

  const getEventIcon = (title, message, type, metadata) => {
    const text = `${title || ''} ${message || ''} ${type || ''} ${metadata || ''}`.toLowerCase();

    if (text.includes('connected') && !text.includes('disconnected')) {
      return { icon: 'bluetooth', color: '#22C55E', bg: 'rgba(34, 197, 94, 0.1)' };
    }
    if (text.includes('disconnected') || text.includes('timeout')) {
      return { icon: 'slash', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.1)' };
    }
    if (text.includes('battery')) {
      return { icon: 'battery-charging', color: '#EAB308', bg: 'rgba(234, 179, 8, 0.1)' };
    }
    if (text.includes('threshold') || text.includes('vibration') || text.includes('firmware') || text.includes('synced')) {
      return { icon: 'sliders', color: '#06B6D4', bg: 'rgba(6, 182, 212, 0.1)' };
    }
    if (text.includes('gps') || text.includes('location')) {
      return { icon: 'map-pin', color: '#F97316', bg: 'rgba(249, 115, 22, 0.1)' };
    }
    if (text.includes('family') || text.includes('invite') || text.includes('group')) {
      return { icon: 'users', color: '#A855F7', bg: 'rgba(168, 85, 247, 0.1)' };
    }
    if (text.includes('logout')) {
      return { icon: 'power', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.1)' };
    }
    if (text.includes('login')) {
      return { icon: 'log-in', color: '#38BDF8', bg: 'rgba(56, 189, 248, 0.1)' };
    }

    return { icon: 'bell', color: '#38BDF8', bg: 'rgba(56, 189, 248, 0.1)' };
  };

  const fetchNotifications = async () => {
    try {
      setLoading(true);

      let activeNumericUserId = userId;

      // Resolved fallback: Convert auth session email to integer user_id from users table
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

      let notifQuery = supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false });

      let auditQuery = supabase
        .from('audit_logs')
        .select('*')
        .in('action', ['login', 'logout', 'Login', 'Logout'])
        .order('created_at', { ascending: false });

      // Apply integer filter strictly if parsed as valid number
      if (activeNumericUserId !== undefined && activeNumericUserId !== null) {
        const parsedId = Number(activeNumericUserId);
        if (!isNaN(parsedId)) {
          notifQuery = notifQuery.eq('user_id', parsedId);
          auditQuery = auditQuery.eq('user_id', parsedId);
        }
      }

      const [notifRes, auditRes] = await Promise.all([notifQuery, auditQuery]);

      if (notifRes.error) {
        console.error('Supabase Notifications Error:', notifRes.error.message);
      }
      if (auditRes.error) {
        console.error('Supabase Audit Logs Error:', auditRes.error.message);
      }

      const operationalEvents = (notifRes.data || []).map((item) => ({
        id: `notif_${item.id}`,
        rawTitle: item.title,
        rawDetails: item.message || item.metadata || '',
        type: 'device_event',
        notification_type: item.notification_type,
        metadata: item.metadata,
        created_at: item.created_at,
      }));

      const authEvents = (auditRes.data || []).map((item) => ({
        id: `audit_${item.id}`,
        rawTitle: item.action ? `${item.action.toUpperCase()}` : 'Auth',
        rawDetails: item.details || `Action: ${item.action}`,
        type: 'auth_event',
        metadata: item.action,
        created_at: item.created_at,
      }));

      const mergedFeed = [...operationalEvents, ...authEvents].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );

      setNotifications(mergedFeed);
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setNotifications([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      if (!item.created_at) return true;

      const itemDate = new Date(item.created_at);
      const itemMonth = itemDate.getMonth();
      const itemDay = itemDate.getDate();

      // Month & Day filter logic
      if (selectedMonth !== 'ALL' && itemMonth !== selectedMonth) return false;
      if (selectedDay !== 'ALL' && itemDay !== selectedDay) return false;

      // Category filter logic
      if (selectedType === 'auth_event' && item.type !== 'auth_event') {
        return false;
      }
      if (selectedType === 'device_event' && item.type !== 'device_event') {
        return false;
      }

      return true;
    });
  }, [notifications, selectedMonth, selectedDay, selectedType]);

  const handleClearAll = () => {
    Alert.alert(
      'Clear View',
      'Are you sure you want to clear these notifications from your screen?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear All', style: 'destructive', onPress: () => setNotifications([]) },
      ]
    );
  };

  const handleBackNavigation = () => {
    if (navigation?.goBack) {
      navigation.goBack();
    } else if (onNavigate) {
      onNavigate('dashboard');
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={handleBackNavigation}>
          <Ionicons name="arrow-back" size={24} color="#F8FAFC" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Notifications</Text>
          <Text style={styles.headerSub}>Activity & Activity History</Text>
        </View>
        {notifications.length > 0 && (
          <TouchableOpacity onPress={handleClearAll}>
            <Text style={styles.clearText}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Section */}
      <View style={styles.filterBar}>
        {/* Category Filters */}
        <Text style={styles.filterLabel}>Show Activity Type</Text>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.horizontalScroll}
          contentContainerStyle={{ gap: 8, paddingRight: 16 }}
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

        {/* Month Selector */}
        <Text style={styles.filterLabel}>Month</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
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

        {/* Day Selector */}
        <Text style={styles.filterLabel}>Day</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
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

      {/* List Content */}
      {loading ? (
        <ActivityIndicator size="large" color="#06B6D4" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filteredNotifications}
          keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
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
              <Text style={styles.emptyText}>No activity recorded for this date.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const { dateStr, timeStr } = formatLocalDateTime(item.created_at);
            const friendly = formatUserFriendlyMessage(item.rawTitle, item.rawDetails, item.metadata);
            const iconConfig = getEventIcon(item.rawTitle, item.rawDetails, item.type, item.metadata);

            return (
              <View style={styles.itemCard}>
                <View style={[styles.iconWrapper, { backgroundColor: iconConfig.bg }]}>
                  <Feather
                    name={iconConfig.icon}
                    size={20}
                    color={iconConfig.color}
                  />
                </View>

                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.actionTitle}>{friendly.title}</Text>
                  <Text style={styles.detailsText}>{friendly.desc}</Text>
                  <Text style={styles.timeText}>{dateStr} • {timeStr}</Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  iconButton: { padding: 8, borderRadius: 10, backgroundColor: '#334155' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#F8FAFC' },
  headerSub: { fontSize: 12, color: '#94A3B8' },
  clearText: { color: '#EF4444', fontSize: 13, fontWeight: '600' },
  
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
    flexDirection: 'row',
    marginBottom: 6,
  },
  typeChip: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justify: 'center',
    borderWidth: 1,
    borderColor: '#334155',
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