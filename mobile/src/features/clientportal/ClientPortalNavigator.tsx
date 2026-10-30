import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { colors } from '../../theme/theme';
import ClientPortalScreen from './ClientPortalScreen';

/** The client portal's task list; the task detail opens in a sheet. */
export type ClientPortalStackParamList = { ClientPortalHome: undefined };

const Stack = createNativeStackNavigator<ClientPortalStackParamList>();

export default function ClientPortalNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Stack.Screen name="ClientPortalHome" component={ClientPortalScreen}
        options={{ title: 'My Tasks' }} />
    </Stack.Navigator>
  );
}
