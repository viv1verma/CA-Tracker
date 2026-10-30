import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { colors } from '../../theme/theme';
import SettingsScreen from './SettingsScreen';

/** Settings is a single page; approval limits open in a sheet. */
export type SettingsStackParamList = { SettingsHome: undefined };

const Stack = createNativeStackNavigator<SettingsStackParamList>();

export default function SettingsNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Stack.Screen name="SettingsHome" component={SettingsScreen} options={{ title: 'Settings' }} />
    </Stack.Navigator>
  );
}
