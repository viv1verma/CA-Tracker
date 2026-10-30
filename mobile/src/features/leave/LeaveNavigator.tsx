import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { colors } from '../../theme/theme';
import LeaveScreen from './LeaveScreen';

/** My Leave is a single page on the web. */
export type LeaveStackParamList = { LeaveHome: undefined };

const Stack = createNativeStackNavigator<LeaveStackParamList>();

export default function LeaveNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Stack.Screen name="LeaveHome" component={LeaveScreen} options={{ title: '🌴 My Leave' }} />
    </Stack.Navigator>
  );
}
