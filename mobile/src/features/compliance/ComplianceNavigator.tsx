import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { colors } from '../../theme/theme';
import ComplianceScreen from './ComplianceScreen';

/** The compliance calendar is a single read-only page on the web. */
export type ComplianceStackParamList = { ComplianceHome: undefined };

const Stack = createNativeStackNavigator<ComplianceStackParamList>();

export default function ComplianceNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Stack.Screen
        name="ComplianceHome"
        component={ComplianceScreen}
        options={{ title: '🗓️ Compliance Calendar' }}
      />
    </Stack.Navigator>
  );
}
