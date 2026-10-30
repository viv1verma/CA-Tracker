import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { colors } from '../../theme/theme';
import ReportsScreen from './ReportsScreen';

/** Reports is a single page; the nine reports are tabs inside it. */
export type ReportsStackParamList = { ReportsHome: undefined };

const Stack = createNativeStackNavigator<ReportsStackParamList>();

export default function ReportsNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Stack.Screen name="ReportsHome" component={ReportsScreen} options={{ title: 'Reports' }} />
    </Stack.Navigator>
  );
}
