import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { colors } from '../../theme/theme';
import AssignmentFormScreen from '../assignments/AssignmentFormScreen';
import MailScreen from './MailScreen';

/**
 * Mail stack. "→ Task" asks the server for a draft and then opens the shared
 * assignment form, which is what the web does with openNewAssignment().
 */
export type MailStackParamList = {
  MailHome: undefined;
  MailTaskForm: undefined;
};

const Stack = createNativeStackNavigator<MailStackParamList>();

export default function MailNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Stack.Screen name="MailHome" options={{ title: '📧 Mail' }}>
        {({ navigation }) => (
          <MailScreen onDraftTask={() => navigation.navigate('MailTaskForm')} />
        )}
      </Stack.Screen>
      <Stack.Screen name="MailTaskForm" options={{ title: 'New Assignment' }}>
        {({ navigation }) => (
          <AssignmentFormScreen
            onDone={() => navigation.goBack()}
            onCancel={() => navigation.goBack()}
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
