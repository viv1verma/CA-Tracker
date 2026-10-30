import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { colors } from '../../theme/theme';
import ClientComplianceScreen from './ClientComplianceScreen';

/** The client's compliance grid — a single read-only page. */
export type ClientComplianceStackParamList = { ClientComplianceHome: undefined };

const Stack = createNativeStackNavigator<ClientComplianceStackParamList>();

export default function ClientComplianceNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Stack.Screen name="ClientComplianceHome" component={ClientComplianceScreen}
        options={{ title: 'Compliance Calendar' }} />
    </Stack.Navigator>
  );
}
