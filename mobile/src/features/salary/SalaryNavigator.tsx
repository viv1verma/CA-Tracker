import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { colors } from '../../theme/theme';
import SalaryScreen from './SalaryScreen';

/** Salary is a single page; the slip opens in a sheet. */
export type SalaryStackParamList = { SalaryHome: undefined };

const Stack = createNativeStackNavigator<SalaryStackParamList>();

export default function SalaryNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Stack.Screen name="SalaryHome" component={SalaryScreen} options={{ title: '💰 Salary' }} />
    </Stack.Navigator>
  );
}
