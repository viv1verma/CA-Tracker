import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { colors } from '../../theme/theme';
import ClientBillingScreen from './ClientBillingScreen';

/** Billing & Payments is one page; the pivot drill-down opens in a sheet. */
export type ClientBillingStackParamList = { ClientBillingHome: undefined };

const Stack = createNativeStackNavigator<ClientBillingStackParamList>();

export default function ClientBillingNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Stack.Screen name="ClientBillingHome" component={ClientBillingScreen}
        options={{ title: 'Billing & Payments' }} />
    </Stack.Navigator>
  );
}
