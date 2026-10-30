import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { colors } from '../../theme/theme';
import ItrScreen from './ItrScreen';

/** ITR Filing is a single page on the web; the party detail opens in a sheet. */
export type ItrStackParamList = { ItrHome: undefined };

const Stack = createNativeStackNavigator<ItrStackParamList>();

export default function ItrNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Stack.Screen name="ItrHome" component={ItrScreen} options={{ title: '🧾 ITR Filing' }} />
    </Stack.Navigator>
  );
}
