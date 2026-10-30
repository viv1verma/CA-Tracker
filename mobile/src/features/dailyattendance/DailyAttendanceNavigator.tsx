import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { colors } from '../../theme/theme';
import DailyAttendanceScreen from './DailyAttendanceScreen';

/** Daily Attendance is a single page on the web. */
export type DailyAttendanceStackParamList = { DailyAttendanceHome: undefined };

const Stack = createNativeStackNavigator<DailyAttendanceStackParamList>();

export default function DailyAttendanceNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Stack.Screen
        name="DailyAttendanceHome"
        component={DailyAttendanceScreen}
        options={{ title: 'Attendance' }}
      />
    </Stack.Navigator>
  );
}
