import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { colors } from '../../theme/theme';
import TeamScreen from './TeamScreen';

/** Team Members is a single page; the profile and form open in sheets. */
export type TeamStackParamList = { TeamHome: undefined };

const Stack = createNativeStackNavigator<TeamStackParamList>();

export default function TeamNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Stack.Screen name="TeamHome" component={TeamScreen} options={{ title: 'Team Members' }} />
    </Stack.Navigator>
  );
}
