import React from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

const SOUND_MANUAL_LIST = [
  { id: 'fire_alarm', label: 'Fire Alarm', priority: 'CRITICAL', icon: 'fire', desc: 'Continuous high-pitched emergency alarm signal.' },
  { id: 'emergency_siren', label: 'Emergency Siren', priority: 'CRITICAL', icon: 'lightbulb-on', desc: 'Ambulance, police, or fire truck siren.' },
  { id: 'fallen_object', label: 'Fallen Object', priority: 'CRITICAL', icon: 'alert-decagram', desc: 'Heavy impact or sharp crash on floor.' },
  { id: 'glass_breaking', label: 'Glass Breaking', priority: 'HIGH', icon: 'glass-fragile', desc: 'Shattering glass, windows, or dishes.' },
  { id: 'baby_crying', label: 'Baby Crying', priority: 'HIGH', icon: 'baby-carriage', desc: 'Infant crying or distress sounds.' },
  { id: 'someone_calling', label: 'Someone Calling', priority: 'HIGH', icon: 'account-voice', desc: 'Human speech directly calling out or shouting.' },
  { id: 'door_knock', label: 'Door Knock', priority: 'MEDIUM', icon: 'door', desc: 'Rhythmic knocking sound on wooden or metal doors.' },
  { id: 'doorbell', label: 'Doorbell', priority: 'MEDIUM', icon: 'bell-ring', desc: 'Standard electronic or mechanical door chime.' },
  { id: 'alarm_clock', label: 'Alarm Clock', priority: 'MEDIUM', icon: 'clock-outline', desc: 'Repetitive daily alarm or timer chime.' },
  { id: 'phone_notification', label: 'Phone Notification', priority: 'LOW', icon: 'cellphone-message', desc: 'Mobile ringtones and text message alerts.' },
  { id: 'vehicle_horn', label: 'Vehicle Horn', priority: 'LOW', icon: 'car-horn', desc: 'Honking cars or traffic safety horns.' },
  { id: 'dog_barking', label: 'Dog Barking', priority: 'LOW', icon: 'dog', desc: 'Repetitive canine vocalization.' },
  { id: 'clapping', label: 'Clapping', priority: 'LOW', icon: 'hands-pray', desc: 'Audible hand applause or double clapping.' },
  { id: 'speech', label: 'Conversational Speech', priority: 'LOW', icon: 'account-group', desc: 'General ambient human conversation.' },
];

export default function SoundManualScreen({ navigation }) {
  const getBadgeStyle = (priority) => {
    switch (priority) {
      case 'CRITICAL': return { bg: '#FF3B3015', text: '#FF3B30' };
      case 'HIGH': return { bg: '#FF950015', text: '#FF9500' };
      case 'MEDIUM': return { bg: '#007AFF15', text: '#007AFF' };
      default: return { bg: '#8E8E9315', text: '#8E8E93' };
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={26} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Detected Sounds Guide</Text>
      </View>

      <Text style={styles.subTitle}>
        List of all 14 sound classes automatically monitored by SonoBand.
      </Text>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {SOUND_MANUAL_LIST.map((item) => {
          const badge = getBadgeStyle(item.priority);
          return (
            <View key={item.id} style={styles.card}>
              <View style={[styles.iconBox, { backgroundColor: badge.bg }]}>
                <MaterialCommunityIcons name={item.icon} size={24} color={badge.text} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.titleRow}>
                  <Text style={styles.soundName}>{item.label}</Text>
                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.badgeText, { color: badge.text }]}>{item.priority}</Text>
                  </View>
                </View>
                <Text style={styles.desc}>{item.desc}</Text>
              </View>
            </View>
          );
        })}
        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7', paddingTop: 50, paddingHorizontal: 16 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backBtn: { padding: 4, marginRight: 12 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#1C1C1E' },
  subTitle: { fontSize: 14, color: '#8E8E93', marginBottom: 16 },
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    alignItems: 'center',
  },
  iconBox: { width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  soundName: { fontSize: 16, fontWeight: '600', color: '#1C1C1E' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  desc: { fontSize: 13, color: '#6C6C70', lineHeight: 17 },
});