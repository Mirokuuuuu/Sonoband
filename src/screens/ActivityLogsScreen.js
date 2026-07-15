import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, ActivityIndicator, ScrollView } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { supabase } from '../services/supabaseClient';

export default function ActivityLogsScreen({ onNavigate, userId }) {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

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

  // 🎚️ Filter Selection States (null means looking at "Today")
  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null); 
  const [selectedDay, setSelectedDay] = useState(null);

  // 🛠️ Shift timestamp by -4 hours to correct double-timezone serialization bugs
  const adjustTimestamp = (rawTime) => {
    if (!rawTime) return new Date();
    const parsed = new Date(rawTime);
    // Subtract exactly 4 hours from the raw clock values
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
    const fetchSystemLogs = async () => {
      const cleanUserId = Number(userId);
      setIsLoading(true);

      const auditScan = await supabase
        .from('audit_logs')
        .select('*')
        .eq('user_id', cleanUserId);

      const activityScan = await supabase
        .from('activity_logs')
        .select('*')
        .eq('user_id', cleanUserId);

      let blendedLogs = [];

      if (auditScan.data && auditScan.data.length > 0) {
        blendedLogs = auditScan.data.map(item => {
          const isLoginAction = item.action === 'login';
          // Fix: Intercept and adjust timestamps manually by 4 hours
          const logDate = adjustTimestamp(item.created_at);
          const formattedPHT = formatToPhilippineTime(logDate);
          
          return {
            ...item,
            isLogin: isLoginAction,
            displayTitle: isLoginAction ? "Login Completed" : "Logout Completed",
            displayDetails: `You logged ${isLoginAction ? 'in' : 'out'} successfully on ${formattedPHT}.`,
            displayTime: item.created_at,
            parsedDate: logDate
          };
        });
      } else if (activityScan.data && activityScan.data.length > 0) {
        blendedLogs = activityScan.data.map(item => {
          const isLoginAction = item.event_type === 'user_login';
          // Fix: Intercept and adjust timestamps manually by 4 hours
          const logDate = adjustTimestamp(item.timestamp);
          const formattedPHT = formatToPhilippineTime(logDate);
          
          return {
            ...item,
            isLogin: isLoginAction,
            displayTitle: isLoginAction ? "Login Completed" : "Logout Completed",
            displayDetails: `You logged ${isLoginAction ? 'in' : 'out'} successfully on ${formattedPHT}.`,
            displayTime: item.timestamp,
            parsedDate: logDate
          };
        });
      }

      // Sort logs by final parsed and adjusted timestamps
      blendedLogs.sort((a, b) => b.parsedDate - a.parsedDate);
      setLogs(blendedLogs);
      setIsLoading(false);
    };

    if (userId) fetchSystemLogs();
  }, [userId]);

  const handleResetFilters = () => {
    setSelectedYear(null);
    setSelectedMonth(null);
    setSelectedDay(null);
  };

  const filteredLogs = logs.filter(item => {
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

  const getDaysInMonth = (year, month) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const startYear = currentYear - 5; 
  const endYear = currentYear + 3;   
  const yearsOptions = [];
  for (let y = startYear; y <= endYear; y++) {
    yearsOptions.push(y);
  }

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

  const renderLogItem = ({ item }) => (
    <View style={styles.logCard}>
      <MaterialCommunityIcons 
        name={item.isLogin ? "shield-check" : "shield-alert"} 
        size={26} 
        color={item.isLogin ? "#22c55e" : "#ef4444"} 
      />
      <View style={styles.textBlock}>
        <Text style={styles.eventText}>{item.displayTitle}</Text>
        <Text style={styles.detailText}>{item.displayDetails}</Text>
        <Text style={styles.timeText}>
          {formatToPhilippineTime(item.parsedDate)}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Account Activity Logs</Text>
      <Text style={styles.dateSubtitle}>
        {selectedYear === null ? "📅 Currently showing: TODAY'S logs" : "🔍 Custom historical filters applied"}
      </Text>

      <View style={styles.filterContainer}>
        <Text style={styles.filterLabel}>Select Year:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rowScroller}>
          {yearsOptions.map(yr => {
            const isFutureYear = yr > currentYear;
            const isSelected = selectedYear === yr;
            return (
              <TouchableOpacity
                key={yr}
                disabled={isFutureYear}
                style={[styles.chip, isSelected && styles.activeChip, isFutureYear && styles.disabledChip]}
                onPress={() => {
                  setSelectedYear(yr);
                  setSelectedMonth(null); 
                  setSelectedDay(null);
                }}
              >
                <Text style={[styles.chipText, isSelected && styles.activeChipText, isFutureYear && styles.disabledText]}>{yr}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {selectedYear !== null && (
          <>
            <Text style={styles.filterLabel}>Select Month:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rowScroller}>
              {monthsOptions.map(m => {
                const isFutureMonth = selectedYear === currentYear && m.value > currentMonth;
                const isSelected = selectedMonth === m.value;
                return (
                  <TouchableOpacity
                    key={m.value}
                    disabled={isFutureMonth}
                    style={[styles.chip, isSelected && styles.activeChip, isFutureMonth && styles.disabledChip]}
                    onPress={() => {
                      setSelectedMonth(m.value);
                      setSelectedDay(null); 
                    }}
                  >
                    <Text style={[styles.chipText, isSelected && styles.activeChipText, isFutureMonth && styles.disabledText]}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        {selectedYear !== null && selectedMonth !== null && (
          <>
            <Text style={styles.filterLabel}>Select Day:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rowScroller}>
              {daysOptions.map(d => {
                const isFutureDay = selectedYear === currentYear && selectedMonth === currentMonth && d > currentDay;
                const isSelected = selectedDay === d;
                return (
                  <TouchableOpacity
                    key={d}
                    disabled={isFutureDay}
                    style={[styles.dayChip, isSelected && styles.activeChip, isFutureDay && styles.disabledChip]}
                    onPress={() => setSelectedDay(d)}
                  >
                    <Text style={[styles.chipText, isSelected && styles.activeChipText, isFutureDay && styles.disabledText]}>{d}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        {selectedYear !== null && (
          <TouchableOpacity style={styles.resetButton} onPress={handleResetFilters}>
            <MaterialCommunityIcons name="refresh" size={16} color="#0f172a" />
            <Text style={styles.resetButtonText}>Clear Filters / Go Back to Today</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color="#06b6d4" style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={filteredLogs}
          keyExtractor={(item, index) => (item.id ? item.id.toString() : index.toString())}
          renderItem={renderLogItem}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No matching activity records found for this time period.</Text>
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
  filterContainer: { backgroundColor: '#1e293b', padding: 12, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#334155' },
  filterLabel: { color: '#94a3b8', fontSize: 11, fontWeight: 'bold', marginVertical: 4, textTransform: 'uppercase' },
  rowScroller: { flexDirection: 'row', marginBottom: 8 },
  chip: { backgroundColor: '#334155', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, marginRight: 6, minWidth: 50, alignItems: 'center' },
  dayChip: { backgroundColor: '#334155', paddingVertical: 6, width: 36, borderRadius: 6, marginRight: 6, alignItems: 'center' },
  activeChip: { backgroundColor: '#3b82f6' },
  disabledChip: { backgroundColor: '#0f172a', opacity: 0.3 },
  chipText: { color: '#e2e8f0', fontSize: 11, fontWeight: 'bold' },
  activeChipText: { color: '#ffffff' },
  disabledText: { color: '#475569', textDecorationLine: 'line-through' },
  resetButton: { flexDirection: 'row', backgroundColor: '#06b6d4', padding: 10, borderRadius: 8, marginTop: 8, justifyContent: 'center', alignItems: 'center' },
  resetButtonText: { color: '#0f172a', fontSize: 12, fontWeight: 'bold', marginLeft: 6 },
  logCard: { backgroundColor: '#1e293b', padding: 16, borderRadius: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  textBlock: { marginLeft: 14, flex: 1 },
  eventText: { color: '#f8fafc', fontSize: 15, fontWeight: '600' },
  detailText: { color: '#94a3b8', fontSize: 13, marginTop: 4, lineHeight: 18 },
  timeText: { color: '#64748b', fontSize: 11, marginTop: 6, fontWeight: 'bold' },
  emptyText: { color: '#475569', textAlign: 'center', marginTop: 40, fontSize: 13 },
  backBtn: { padding: 16, alignItems: 'center' },
  backBtnText: { color: '#94a3b8', fontSize: 15, fontWeight: '600' }
});