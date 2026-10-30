import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { colors } from '../../theme/theme';
import FirmProfileScreen from './FirmProfileScreen';

/** Firm Profile is a single page; card import, documents and experience open in sheets. */
export type FirmProfileStackParamList = { FirmProfileHome: undefined };

const Stack = createNativeStackNavigator<FirmProfileStackParamList>();

export default function FirmProfileNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Stack.Screen name="FirmProfileHome" component={FirmProfileScreen}
        options={{ title: '🏛 Firm Profile' }} />
    </Stack.Navigator>
  );
}
