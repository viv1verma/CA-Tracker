import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { colors } from '../../theme/theme';
import ClientsScreen from './ClientsScreen';

/** Clients is a single page on the web; details open in sheets. */
export type ClientsStackParamList = { ClientsHome: undefined };

const Stack = createNativeStackNavigator<ClientsStackParamList>();

export default function ClientsNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Stack.Screen name="ClientsHome" component={ClientsScreen} options={{ title: 'Clients' }} />
    </Stack.Navigator>
  );
}
