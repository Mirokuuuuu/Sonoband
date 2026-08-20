import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Platform, StatusBar } from 'react-native';

export default function Header({ title, showBack = true, navigation }) {
  return (
    <View style={styles.headerContainer}>
      {showBack ? (
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.placeholder} />
      )}
      <Text style={styles.titleText} numberOfLines={1}>{title}</Text>
      <View style={styles.placeholder} />
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1E293B', // Slate Dark Accent
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    // Inaayos ang safe padding sa taas para sa Notch/Statusbar
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 12,
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#334155',
    borderRadius: 8,
  },
  backText: {
    color: '#38BDF8', // Cyan Highlight
    fontSize: 15,
    fontWeight: 'bold',
  },
  titleText: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    flex: 1,
  },
  placeholder: {
    width: 60,
  },
});