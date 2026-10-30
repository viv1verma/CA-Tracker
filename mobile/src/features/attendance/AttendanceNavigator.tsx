import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { colors } from '../../theme/theme';
import AttendanceScreen from './AttendanceScreen';

/** Attendance is a single page on the web; nothing navigates away from it. */
export type AttendanceStackParamList = { AttendanceHome: undefined };

const Stack = createNativeStackNavigator<AttendanceStackParamList>();

export default function AttendanceNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Stack.Screen name="AttendanceHome" component={AttendanceScreen} options={{ title: 'Attendance' }} />
    </Stack.Navigator>
  );
}
