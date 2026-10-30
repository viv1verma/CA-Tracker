import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { colors } from '../../theme/theme';
import AssignmentDetailScreen from '../assignments/AssignmentDetailScreen';
import AssignmentFormScreen from '../assignments/AssignmentFormScreen';
import RecurringScreen from './RecurringScreen';

/**
 * Recurring Tasks stack. Rows open the shared assignment detail, and the row's
 * ✏ edits just that period's generated task — not the template, which is edited
 * from the Setup pane.
 */
export type RecurringStackParamList = {
  RecurringHome: undefined;
  RecurringDetail: { id: string };
  RecurringTaskForm: { id: string };
};

const Stack = createNativeStackNavigator<RecurringStackParamList>();

export default function RecurringNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Stack.Screen name="RecurringHome" options={{ title: 'Recurring Tasks' }}>
        {({ navigation }) => (
          <RecurringScreen
            onOpen={(id) => navigation.navigate('RecurringDetail', { id })}
            onEdit={(id) => navigation.navigate('RecurringTaskForm', { id })}
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="RecurringDetail" options={{ title: 'Assignment' }}>
        {({ navigation, route }) => (
          <AssignmentDetailScreen
            assignmentId={route.params.id}
            onEdit={(id) => navigation.navigate('RecurringTaskForm', { id })}
            onDeleted={() => navigation.popTo('RecurringHome')}
            onBack={() => navigation.goBack()}
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="RecurringTaskForm" options={{ title: 'Edit Assignment' }}>
        {({ navigation, route }) => (
          <AssignmentFormScreen
            editId={route.params.id}
            onDone={() => navigation.goBack()}
            onCancel={() => navigation.goBack()}
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
