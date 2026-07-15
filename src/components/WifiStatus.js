import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function WifiStatus({ networkInfo }) {
  const getStatusColor = () => {
    if (!networkInfo.isConnected) return '#ef4444'; // Red for offline
    return networkInfo.isWifi ? '#22c55e' : '#eab308'; // Green for Wi-Fi, Yellow for Mobile Data
  };

  const getStatusText = () => {
    if (!networkInfo.isConnected) return 'Device Offline';
    return networkInfo.isWifi ? 'Connected to Wi-Fi' : `Connected via ${networkInfo.type}`;
  };

  return (
    <View style={[styles.card, { borderLeftColor: getStatusColor() }]}>
      <Text style={styles.label}>Network Connectivity Status</Text>
      <Text style={[styles.statusText, { color: getStatusColor() }]}>
        {getStatusText()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e1e1e',
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 5,
    marginVertical: 10,
    width: '100%',
  },
  label: {
    color: '#a3a3a3',
    fontSize: 12,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  statusText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
});