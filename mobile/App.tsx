import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth/AuthContext';
import { ToastProvider } from './src/components/Toast';
import { DataProvider } from './src/data/DataContext';
import { usePushRegistration } from './src/lib/usePushRegistration';
import RootNavigator from './src/navigation/RootNavigator';

/**
 * Inside AuthProvider so it can read the session: the device token is only
 * registered once someone is actually signed in.
 */
function PushRegistrar() {
  usePushRegistration();
  return null;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <DataProvider>
          <ToastProvider>
            <StatusBar style="light" />
            <PushRegistrar />
            <RootNavigator />
          </ToastProvider>
        </DataProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
