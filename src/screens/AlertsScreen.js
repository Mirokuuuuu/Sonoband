import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, ActivityIndicator, ScrollView } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { supabase } from '../services/supabaseClient';

export default function AlertsScreen({ onNavigate, userId }) {
  const [dbAlerts, setDbAlerts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [locationFilter, setLocationFilter] = useState('ALL'); // 'ALL', 'INDOOR', 'OUTDOOR'
  const [directionFilter, setDirectionFilter] = useState('ALL'); // 'ALL', 'LEFT', 'RIGHT'

  // 🕒 Calculate Current Real-Time Calendar Boundaries matching Asia/Manila 
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
      month: matrix.month - 1, 
      day: matrix.day
    };
  };

  const manilaToday = getManilaCalendarMatrix();
  const currentYear = manilaToday.year;
  const currentMonth = manilaToday.month; 
  const currentDay = manilaToday.day;

  // 🎚️ Smart Calendar Selection States
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

  // ⏰ Helper function to format strings explicitly using Philippine Time locale rules
  const formatToPhilippineTime = (dateObj) => {
    if (!dateObj || !(dateObj instanceof Date)) return "—";
    
    const dateOptions = { timeZone: 'Asia/Manila', year: 'numeric', month: 'numeric', day: 'numeric' };
    const timeOptions = { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true };
    
    const localDate = dateObj.toLocaleDateString('en-US', dateOptions);
    const localTime = dateObj.toLocaleTimeString('en-US', timeOptions);
    
    return `${localDate} | ${localTime}`;
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
    const fetchAlertsLog = async () => {
      if (!userId) return;
      setIsLoading(true);

      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .eq('user_id', userId)
        .order('detected_at', { ascending: false });

      if (!error && data) {
        const structuralAlerts = data.map(item => ({
          ...item,
          parsedDate: adjustTimestamp(item.detected_at)
        }));
        setDbAlerts(structuralAlerts);
      }
      setIsLoading(false);
    };

    fetchAlertsLog();

    const alertsChannel = supabase
      .channel(`user-alerts-live-global`)
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'alerts' }, 
        (payload) => {
          if (payload.new.user_id == userId) {
            const structuralNewItem = {
              ...payload.new,
              parsedDate: adjustTimestamp(payload.new.detected_at)
            };
            setDbAlerts((prevAlerts) => [structuralNewItem, ...prevAlerts]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(alertsChannel);
    };
  }, [userId]);

  const handleResetFilters = () => {
    setSelectedYear(null);
    setSelectedMonth(null);
    setSelectedDay(null);
    setLocationFilter('ALL');   
    setDirectionFilter('ALL');  
  };

  // 🎚️ Filtering Engine
  const filteredAlerts = dbAlerts.filter(item => {
    if (locationFilter !== 'ALL') {
      if (!item.location || item.location.toUpperCase() !== locationFilter) return false;
    }
    if (directionFilter !== 'ALL' && item.metadata?.toUpperCase() !== directionFilter) return false;

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

  // 📝 CLEANED TITLE FORMATTING
  const formatSoundTitle = (type) => {
    if (!type) return "Sound Alert Detected"; 
    // Tinanggal na yung "+ ' Sound'" sa dulo, at ang "Acoustic"
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' '); 
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sound Capture Log</Text>
      <Text style={styles.dateSubtitle}>
        {selectedYear === null && locationFilter === 'ALL' && directionFilter === 'ALL'
          ? "📅 Automatically showing: TODAY'S sound clips" 
          : "🔍 Custom log filters applied"}
      </Text>

      {/* 🎛️ Filter Panel Grid Framework */}
      <View style={styles.filterFrame}>
        <Text style={styles.filterMetaLabel}>Filter Environment Location:</Text>
        <View style={{ flexDirection: 'row', marginTop: 4, marginBottom: 8 }}>
          {['ALL', 'INDOOR', 'OUTDOOR'].map(loc => (
            <TouchableOpacity
              key={loc}
              style={[styles.miniChip, locationFilter === loc && styles.activeCyanChip]}
              onPress={() => setLocationFilter(loc)}
            >
              <Text style={[styles.miniChipText, locationFilter === loc && styles.activeTextDarkMode]}>{loc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.filterMetaLabel}>Filter Sound Direction:</Text>
        <View style={{ flexDirection: 'row', marginTop: 4, marginBottom: 8 }}>
          {['ALL', 'LEFT', 'RIGHT'].map(dir => (
            <TouchableOpacity
              key={dir}
              style={[
                styles.miniChip, 
                directionFilter === dir && dir === 'LEFT' && styles.activeRedChip,   
                directionFilter === dir && dir === 'RIGHT' && styles.activeBlueChip, 
                directionFilter === dir && dir === 'ALL' && styles.activeCyanChip
              ]}
              onPress={() => setDirectionFilter(dir)}
            >
              <Text style={[styles.miniChipText, directionFilter === dir && styles.activeTextDarkMode]}>{dir}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.filterScrollerLabel}>Select Year:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rowScroller}>
          {yearsOptions.map(yr => {
            const isFuture = yr > currentYear;
            const isSel = selectedYear === yr;
            return (
              <TouchableOpacity
                key={yr}
                disabled={isFuture}
                style={[styles.smallTimeChip, isSel && styles.activeTimeChip, isFuture && styles.disabledTimeChip]}
                onPress={() => { setSelectedYear(yr); setSelectedMonth(null); setSelectedDay(null); }}
              >
                <Text style={[styles.timeTextInternal, isSel && styles.whiteTextColor, isFuture && styles.strikeText]}>{yr}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {selectedYear !== null && (
          <>
            <Text style={styles.filterScrollerLabel}>Select Month:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rowScroller}>
              {monthsOptions.map(m => {
                const isFuture = selectedYear === currentYear && m.value > currentMonth;
                const isSel = selectedMonth === m.value;
                return (
                  <TouchableOpacity
                    key={m.value}
                    disabled={isFuture}
                    style={[styles.smallTimeChip, isSel && styles.activeTimeChip, isFuture && styles.disabledTimeChip]}
                    onPress={() => { setSelectedMonth(m.value); setSelectedDay(null); }}
                  >
                    <Text style={[styles.timeTextInternal, isSel && styles.whiteTextColor, isFuture && styles.strikeText]}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        {selectedYear !== null && selectedMonth !== null && (
          <>
            <Text style={styles.filterScrollerLabel}>Select Day:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rowScroller}>
              {daysOptions.map(d => {
                const isFuture = selectedYear === currentYear && selectedMonth === currentMonth && d > currentDay;
                const isSel = selectedDay === d;
                return (
                  <TouchableOpacity
                    key={d}
                    disabled={isFuture}
                    style={[styles.dayTimeChip, isSel && styles.activeTimeChip, isFuture && styles.disabledTimeChip]}
                    onPress={() => setSelectedDay(d)}
                  >
                    <Text style={[styles.timeTextInternal, isSel && styles.whiteTextColor, isFuture && styles.strikeText]}>{d}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        {(selectedYear !== null || locationFilter !== 'ALL' || directionFilter !== 'ALL') && (
          <TouchableOpacity style={styles.resetFilterButton} onPress={handleResetFilters}>
            <MaterialCommunityIcons name="refresh" size={14} color="#0f172a" />
            <Text style={styles.resetFilterButtonText}>Clear Filters / View Default Log</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* DATA STREAM LISTING RENDER WINDOW */}
      {isLoading ? (
        <ActivityIndicator size="large" color="#06b6d4" style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={filteredAlerts}
          keyExtractor={(item, index) => (item.id ? item.id.toString() : index.toString())}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <Text style={styles.emptyFilterText}>No sounds registered under these criteria rules.</Text>
          }
          renderItem={({ item }) => {
            const dbValue = item.decibel_level;
            let loudnessLabel = "Sound Event Triggered";

            if (dbValue !== null && dbValue !== undefined) {
              if (dbValue >= 130) {
                loudnessLabel = "Extremely Loud Noise";
              } else if (dbValue >= 100) {
                loudnessLabel = "Very Loud Noise";
              } else if (dbValue >= 70) {
                loudnessLabel = "Loud Noise";
              } else if (dbValue > 0) {
                loudnessLabel = "Moderate Noise";
              }
            }

            const directOrigin = item.metadata?.toLowerCase();
            const isLeft = directOrigin === 'left';
            const isRight = directOrigin === 'right';

            return (
              <View style={styles.alertCard}>
                <View style={styles.iconWrapper}>
                  <MaterialCommunityIcons 
                    name="waveform" 
                    size={26} 
                    color="#06b6d4" 
                  />
                  {(isLeft || isRight) && (
                    <View style={[styles.directionBadge, isLeft ? styles.badgeLeft : styles.badgeRight]}>
                      <Text style={styles.directionBadgeText}>{isLeft ? 'L' : 'R'}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.textContainer}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.alertTitle}>
                      {formatSoundTitle(item.sound_type)}
                    </Text>
                    {(isLeft || isRight) && (
                      <Text style={[styles.sideText, isLeft ? styles.sideTextLeft : styles.sideTextRight]}>
                        {isLeft ? 'Left Side' : 'Right Side'}
                      </Text>
                    )}
                  </View>

                  <Text style={styles.alertDescription}>
                    Detected{" "}
                    {dbValue ? (
                      <>
                        <Text style={{ color: '#06b6d4', fontWeight: 'bold' }}>{loudnessLabel}</Text> ({dbValue} dB)
                      </>
                    ) : (
                      <Text style={{ color: '#06b6d4', fontWeight: 'bold' }}>{loudnessLabel}</Text>
                    )}
                    .
                  </Text>

                  <Text style={styles.timestamp}>
                    {formatToPhilippineTime(item.parsedDate)}
                  </Text>
                </View>
              </View>
            );
          }}
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
  filterFrame: { backgroundColor: '#1e293b', padding: 14, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#334155' },
  filterMetaLabel: { color: '#94a3b8', fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', marginTop: 4 },
  filterScrollerLabel: { color: '#64748b', fontSize: 10, fontWeight: 'bold', marginTop: 8, marginBottom: 4, textTransform: 'uppercase' },
  rowScroller: { flexDirection: 'row' },
  miniChip: { backgroundColor: '#334155', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 6, marginRight: 6 },
  smallTimeChip: { backgroundColor: '#273549', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 5, marginRight: 5, minWidth: 46, alignItems: 'center' },
  dayTimeChip: { backgroundColor: '#273549', paddingVertical: 5, width: 32, borderRadius: 5, marginRight: 5, alignItems: 'center' },
  activeCyanChip: { backgroundColor: '#06b6d4' },
  activeBlueChip: { backgroundColor: '#3b82f6' }, 
  activeRedChip: { backgroundColor: '#ef4444' },  
  activeTimeChip: { backgroundColor: '#3b82f6' },
  disabledTimeChip: { backgroundColor: '#0f172a', opacity: 0.25 },
  miniChipText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  timeTextInternal: { color: '#cbd5e1', fontSize: 11, fontWeight: '600' },
  activeTextDarkMode: { color: '#0f172a', fontWeight: 'bold' },
  whiteTextColor: { color: '#ffffff' },
  strikeText: { color: '#475569', textDecorationLine: 'line-through' },
  resetFilterButton: { flexDirection: 'row', backgroundColor: '#06b6d4', padding: 8, borderRadius: 6, marginTop: 12, justifyContent: 'center', alignItems: 'center' },
  resetFilterButtonText: { color: '#0f172a', fontSize: 11, fontWeight: 'bold', marginLeft: 4 },
  emptyFilterText: { color: '#64748b', textAlign: 'center', marginTop: 30, fontSize: 13, fontStyle: 'italic' },
  alertCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#334155', marginBottom: 10 },
  iconWrapper: { position: 'relative', paddingRight: 4 },
  directionBadge: { position: 'absolute', bottom: -6, right: -4, width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  badgeLeft: { backgroundColor: '#ef4444' },  
  badgeRight: { backgroundColor: '#3b82f6' }, 
  directionBadgeText: { color: '#ffffff', fontSize: 9, fontWeight: 'bold' },
  sideText: { fontSize: 11, fontWeight: 'bold', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, textTransform: 'uppercase' },
  sideTextLeft: { color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)' },  
  sideTextRight: { color: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)' }, 
  textContainer: { marginLeft: 14, flex: 1 },
  alertTitle: { color: '#f8fafc', fontSize: 15, fontWeight: 'bold' },
  alertDescription: { color: '#94a3b8', fontSize: 13, marginTop: 4, lineHeight: 18 },
  locationHighlight: { color: '#e2e8f0', fontWeight: '600', textTransform: 'lowercase' },
  timestamp: { color: '#64748b', fontSize: 11, marginTop: 6, fontWeight: '600' },
  backBtn: { padding: 16, alignItems: 'center' },
  backBtnText: { color: '#94a3b8', fontSize: 15, fontWeight: '600' }
});