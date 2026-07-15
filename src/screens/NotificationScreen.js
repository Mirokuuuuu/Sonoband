import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, ActivityIndicator, ScrollView } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { supabase } from '../services/supabaseClient';

export default function NotificationScreen({ onNavigate, userId }) {
  const [sensorLogs, setSensorLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // 🎛️ Updated Category Filters: 'ALL', 'DEVICE', 'POWER'
  const [categoryFilter, setCategoryFilter] = useState('ALL'); 

  // 🕒 Calculate Current Real-Time Calendar Boundaries specifically matching Asia/Manila 
  const getManilaCalendarMatrix = () => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric'
    });
    
    const parts = formatter.formatToParts(now);
    const matrix = {};
    parts.forEach(({ type, value }) => {
      matrix[type] = parseInt(value, 10);
    });

    return {
      year: matrix.year,
      month: matrix.month - 1, // Convert 1-12 range to JS 0-11 range
      day: matrix.day
    };
  };

  const manilaToday = getManilaCalendarMatrix();
  const currentYear = manilaToday.year;
  const currentMonth = manilaToday.month; 
  const currentDay = manilaToday.day;

  // 🎚️ Smart Calendar Filter States
  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);

  // 🛠️ Shift timestamp by -4 hours to correct double-timezone serialization bugs
  const adjustTimestamp = (rawTime) => {
    if (!rawTime) return new Date();
    const parsed = new Date(rawTime);
    parsed.setHours(parsed.getHours() - 4);
    return parsed;
  };

  // Helper function to extract individual timezone values for custom calendar item checks
  const getManilaParts = (dateObj) => {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric'
    });
    const parts = formatter.formatToParts(dateObj);
    const matrix = {};
    parts.forEach(({ type, value }) => {
      matrix[type] = parseInt(value, 10);
    });
    return {
      year: matrix.year,
      month: matrix.month - 1,
      day: matrix.day
    };
  };

  useEffect(() => {
    const fetchHardwareNotifications = async () => {
      const cleanUserId = Number(userId);
      setLoading(true);

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', cleanUserId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const localizedLogs = data.map(item => ({
          ...item,
          parsedDate: adjustTimestamp(item.created_at)
        }));
        setSensorLogs(localizedLogs);
      }
      setLoading(false);
    };

    if (userId) fetchHardwareNotifications();

    // 📡 Live Postgres Change Channel Engine setup
    const realtimeChannel = supabase
      .channel(`hardware-notifications-live-${userId}`)
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, 
        (payload) => {
          const localizedNewItem = {
            ...payload.new,
            parsedDate: adjustTimestamp(payload.new.created_at)
          };
          setSensorLogs((prev) => [localizedNewItem, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(realtimeChannel);
    };
  }, [userId]);

  const handleResetFilters = () => {
    setSelectedYear(null);
    setSelectedMonth(null);
    setSelectedDay(null);
  };

  // 🎚️ Main Filtering Evaluation Engine
  const filteredSensorLogs = sensorLogs.filter(item => {
    
    // 1. Category Target Types Evaluation
    if (categoryFilter === 'DEVICE') {
      const isDeviceEvent = ['connection_event', 'partial_connection_event', 'error_event'].includes(item.notification_type);
      if (!isDeviceEvent) return false;
    }
    
    if (categoryFilter === 'POWER') {
      const messageText = (item.message || '').toLowerCase();
      const titleText = (item.title || '').toLowerCase();
      const isPowerEvent = messageText.includes('shifted manually') || 
                           messageText.includes('operation shifted') ||
                           titleText.includes('power') ||
                           titleText.includes('active state');
                           
      if (!isPowerEvent) return false;
    }

    // 2. Calendar Matrix Boundaries
    const itemParts = getManilaParts(item.parsedDate);
    if (selectedYear === null) {
      return itemParts.year === currentYear &&
             itemParts.month === currentMonth &&
             itemParts.day === currentDay;
    }

    if (itemParts.year !== selectedYear) return false;
    if (selectedMonth !== null && itemParts.month !== selectedMonth) return false;
    if (selectedDay !== null && itemParts.day !== selectedDay) return false;

    return true;
  });

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

  const startYear = currentYear - 5; 
  const endYear = currentYear + 3;   
  const yearsOptions = [];
  for (let y = startYear; y <= endYear; y++) yearsOptions.push(y);

  const monthsOptions = [
    { label: 'Jan', value: 0 }, { label: 'Feb', value: 1 }, { label: 'Mar', value: 2 },
    { label: 'Apr', value: 3 }, { label: 'May', value: 4 }, { label: 'Jun', value: 5 },
    { label: 'Jul', value: 6 }, { label: 'Aug', value: 7 }, { label: 'Sep', value: 8 },
    { label: 'Oct', value: 9 }, { label: 'Nov', value: 10 }, { label: 'Dec', value: 11 }
  ];

  const targetYear = selectedYear || currentYear;
  const targetMonth = selectedMonth !== null ? selectedMonth : currentMonth;
  const daysCount = getDaysInMonth(targetYear, targetMonth);
  const daysOptions = Array.from({ length: daysCount }, (_, i) => i + 1);

  const getNotificationUIProperties = (item) => {
    const messageText = (item.message || '').toLowerCase();
    
    if (messageText.includes('shifted manually') || messageText.includes('operation shifted')) {
      const isOn = messageText.includes('on');
      return {
        icon: isOn ? "power-circle-on" : "power-circle-off",
        iconColor: isOn ? "#22c55e" : "#64748b"
      };
    }

    switch(item.notification_type) {
      case 'connection_event':
        const isConnected = item.metadata === 'connected';
        return { 
          icon: "lan-connect", 
          iconColor: isConnected ? "#22c55e" : "#ef4444" 
        }; 
      case 'partial_connection_event':
        return { 
          icon: "wifi-strength-alert-outline", 
          iconColor: "#f97316" 
        };
      case 'error_event':
        return { icon: "wifi-strength-off", iconColor: "#ef4444" }; 
      default:
        return { icon: "bell-outline", iconColor: "#94a3b8" };
    }
  };

  // ⏰ Helper function to format strings explicitly using Philippine Time locale rules
  const formatToPhilippineTime = (dateObj) => {
    if (!dateObj || !(dateObj instanceof Date)) return "—";
    
    const dateOptions = { timeZone: 'Asia/Manila', year: 'numeric', month: 'numeric', day: 'numeric' };
    const timeOptions = { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true };
    
    const localDate = dateObj.toLocaleDateString('en-US', dateOptions);
    const localTime = dateObj.toLocaleTimeString('en-US', timeOptions);
    
    return `${localDate} | ${localTime}`;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Device Notifications</Text>
      <Text style={styles.dateSubtitle}>
        {selectedYear === null ? "📅 Automatically showing: TODAY'S updates" : "🔍 Viewing historic system logs"}
      </Text>

      {/* 🎚️ Categorized Filter Navigation Controls */}
      <View style={styles.filterContainer}>
        <Text style={styles.filterTitle}>Filter System Logs:</Text>
        <View style={styles.filterRow}>
          {[
            { id: 'ALL', label: 'All Logs' },
            { id: 'DEVICE', label: 'Device Connection' },
            { id: 'POWER', label: 'On / Off States' }
          ].map(cat => (
            <TouchableOpacity 
              key={cat.id} 
              style={[styles.filterChip, categoryFilter === cat.id && styles.activeChip]} 
              onPress={() => setCategoryFilter(cat.id)}
            >
              <Text style={[styles.chipText, categoryFilter === cat.id && styles.activeChipText]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* YEAR SELECTOR */}
        <Text style={styles.filterSubLabel}>Select Year:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rowScroller}>
          {yearsOptions.map(yr => {
            const isFuture = yr > currentYear;
            const isSel = selectedYear === yr;
            return (
              <TouchableOpacity
                key={yr}
                disabled={isFuture}
                style={[styles.smallChip, isSel && styles.activeTimeChip, isFuture && styles.disabledChip]}
                onPress={() => { setSelectedYear(yr); setSelectedMonth(null); setSelectedDay(null); }}
              >
                <Text style={[styles.timeChipText, isSel && styles.whiteText, isFuture && styles.lineThroughText]}>{yr}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* MONTH SELECTOR */}
        {selectedYear !== null && (
          <>
            <Text style={styles.filterSubLabel}>Select Month:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rowScroller}>
              {monthsOptions.map(m => {
                const isFuture = selectedYear === currentYear && m.value > currentMonth;
                const isSel = selectedMonth === m.value;
                return (
                  <TouchableOpacity
                    key={m.value}
                    disabled={isFuture}
                    style={[styles.smallChip, isSel && styles.activeTimeChip, isFuture && styles.disabledChip]}
                    onPress={() => { setSelectedMonth(m.value); setSelectedDay(null); }}
                  >
                    <Text style={[styles.timeChipText, isSel && styles.whiteText, isFuture && styles.lineThroughText]}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        {/* DAY SELECTOR */}
        {selectedYear !== null && selectedMonth !== null && (
          <>
            <Text style={styles.filterSubLabel}>Select Day:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rowScroller}>
              {daysOptions.map(d => {
                const isFuture = selectedYear === currentYear && selectedMonth === currentMonth && d > currentDay;
                const isSel = selectedDay === d;
                return (
                  <TouchableOpacity
                    key={d}
                    disabled={isFuture}
                    style={[styles.dayChip, isSel && styles.activeTimeChip, isFuture && styles.disabledChip]}
                    onPress={() => setSelectedDay(d)}
                  >
                    <Text style={[styles.timeChipText, isSel && styles.whiteText, isFuture && styles.lineThroughText]}>{d}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        {/* RESET CONTROL ACTIONS */}
        {selectedYear !== null && (
          <TouchableOpacity style={styles.resetButton} onPress={handleResetFilters}>
            <MaterialCommunityIcons name="refresh" size={14} color="#0f172a" />
            <Text style={styles.resetButtonText}>Clear Filters / View Today</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* NOTIFICATIONS FEED VIEW */}
      {loading ? (
        <ActivityIndicator size="large" color="#06b6d4" style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={filteredSensorLogs}
          keyExtractor={(item, index) => (item.id ? item.id.toString() : index.toString())}
          contentContainerStyle={{ paddingBottom: 20 }}
          renderItem={({ item }) => {
            const uiProps = getNotificationUIProperties(item);
            return (
              <View style={styles.notificationItem}>
                <MaterialCommunityIcons 
                  name={uiProps.icon} 
                  size={26} 
                  color={uiProps.iconColor} 
                />
                <View style={styles.textContainer}>
                  <Text style={styles.notiText}>{item.title}</Text>
                  <Text style={styles.notiSubText}>{item.message}</Text>
                  <Text style={styles.notiTime}>
                    {formatToPhilippineTime(item.parsedDate)}
                  </Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No configuration changes or status events found for this filter.</Text>
          }
        />
      )}

      <TouchableOpacity style={styles.backBtn} onPress={() => onNavigate('dashboard')}>
        <Text style={styles.backBtnText}>← Back to Dashboard</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 24, paddingTop: 50 },
  title: { color: '#f8fafc', fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  dateSubtitle: { color: '#06b6d4', fontSize: 13, textAlign: 'center', fontWeight: '600', marginBottom: 16 },
  filterContainer: { backgroundColor: '#1e293b', padding: 14, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#334155' },
  filterTitle: { color: '#94a3b8', fontSize: 11, fontWeight: 'bold', marginBottom: 8, textTransform: 'uppercase' },
  filterSubLabel: { color: '#64748b', fontSize: 10, fontWeight: 'bold', marginTop: 8, marginBottom: 4, textTransform: 'uppercase' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 },
  rowScroller: { flexDirection: 'row' },
  filterChip: { backgroundColor: '#334155', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, marginRight: 6, marginBottom: 6 },
  smallChip: { backgroundColor: '#273549', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 5, marginRight: 5, minWidth: 46, alignItems: 'center' },
  dayChip: { backgroundColor: '#273549', paddingVertical: 5, width: 32, borderRadius: 5, marginRight: 5, alignItems: 'center' },
  activeChip: { backgroundColor: '#06b6d4' },
  activeTimeChip: { backgroundColor: '#3b82f6' },
  disabledChip: { backgroundColor: '#0f172a', opacity: 0.25 },
  chipText: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  timeChipText: { color: '#cbd5e1', fontSize: 11, fontWeight: '600' },
  activeChipText: { color: '#0f172a', fontWeight: 'bold' },
  whiteText: { color: '#ffffff' },
  lineThroughText: { color: '#475569', textDecorationLine: 'line-through' },
  resetButton: { flexDirection: 'row', backgroundColor: '#06b6d4', padding: 8, borderRadius: 6, marginTop: 12, justifyContent: 'center', alignItems: 'center' },
  resetButtonText: { color: '#0f172a', fontSize: 11, fontWeight: 'bold', marginLeft: 4 },
  emptyText: { color: '#64748b', textAlign: 'center', marginTop: 30, fontSize: 13 },
  notificationItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#334155' },
  textContainer: { marginLeft: 14, flex: 1 },
  notiText: { color: '#f8fafc', fontSize: 15, fontWeight: 'bold' },
  notiSubText: { color: '#94a3b8', fontSize: 13, marginTop: 3, lineHeight: 18 },
  notiTime: { color: '#64748b', fontSize: 11, marginTop: 6, fontWeight: '600' },
  backBtn: { padding: 16, alignItems: 'center' },
  backBtnText: { color: '#94a3b8', fontSize: 15, fontWeight: '600' }
});