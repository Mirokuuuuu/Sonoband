import * as Network from 'expo-network';

export const checkNetworkStatus = async () => {
  try {
    const state = await Network.getNetworkStateAsync();
    return {
      isConnected: state.isConnected,
      isWifi: state.type === Network.NetworkStateType.WIFI,
      type: state.type,
    };
  } catch (error) {
    console.error("Error reading device network:", error);
    return { isConnected: false, isWifi: false, type: 'UNKNOWN' };
  }
};