import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { colors } from '../../theme/theme';
import MyTeamScreen from './MyTeamScreen';

/**
 * My Team is a single page on the web — the cards expose Update and Remind and
 * nothing navigates away — so this stack carries only the list screen.
 */
export type MyTeamStackParamList = { MyTeamList: undefined };

const Stack = createNativeStackNavigator<MyTeamStackParamList>();

export default function MyTeamNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Stack.Screen name="MyTeamList" component={MyTeamScreen} options={{ title: 'My Team' }} />
    </Stack.Navigator>
  );
}
