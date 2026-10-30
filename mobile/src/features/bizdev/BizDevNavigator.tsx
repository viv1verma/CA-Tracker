import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { colors } from '../../theme/theme';
import BizDevScreen from './BizDevScreen';

/** Business Development is one page with four tabs; details open in sheets. */
export type BizDevStackParamList = { BizDevHome: undefined };

const Stack = createNativeStackNavigator<BizDevStackParamList>();

export default function BizDevNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Stack.Screen name="BizDevHome" component={BizDevScreen}
        options={{ title: '📈 Business Development' }} />
    </Stack.Navigator>
  );
}
