import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { colors } from '../../theme/theme';
import ItrClientScreen from './ItrClientScreen';

/** The ITR party's own portal — a single page, no sheets. */
export type ItrClientStackParamList = { ItrClientHome: undefined };

const Stack = createNativeStackNavigator<ItrClientStackParamList>();

export default function ItrClientNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Stack.Screen name="ItrClientHome" component={ItrClientScreen}
        options={{ title: '🧾 My ITR Filing' }} />
    </Stack.Navigator>
  );
}
