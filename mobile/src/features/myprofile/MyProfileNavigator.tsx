import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { colors } from '../../theme/theme';
import MyProfileScreen from './MyProfileScreen';

/** My Profile is a single self-service screen; the panel and edit form are sheets. */
export type MyProfileStackParamList = { MyProfileHome: undefined };

const Stack = createNativeStackNavigator<MyProfileStackParamList>();

export default function MyProfileNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Stack.Screen name="MyProfileHome" options={{ title: '👤 My Profile' }}>
        {({ navigation }) => <MyProfileScreen onClose={() => navigation.goBack()} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
