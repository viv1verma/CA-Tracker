import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { colors } from '../../theme/theme';
import StatutoryScreen from './StatutoryScreen';

/** Statutory Updates is a single page on the web; forms open in sheets. */
export type StatutoryStackParamList = { StatutoryHome: undefined };

const Stack = createNativeStackNavigator<StatutoryStackParamList>();

export default function StatutoryNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Stack.Screen
        name="StatutoryHome"
        component={StatutoryScreen}
        options={{ title: '📢 Statutory Updates' }}
      />
    </Stack.Navigator>
  );
}
