import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { colors } from '../../theme/theme';
import AssignmentDetailScreen from '../assignments/AssignmentDetailScreen';
import AssignmentFormScreen from '../assignments/AssignmentFormScreen';
import OneTimeScreen from './OneTimeScreen';

/**
 * One-Time Tasks stack. The detail and form screens are the Assignments module's —
 * the web opens the same openAssignDetail() / openAssignSheet() from both pages,
 * so both apps share one implementation rather than growing a second copy.
 */
export type OneTimeStackParamList = {
  OneTimeList: undefined;
  OneTimeDetail: { id: string };
  OneTimeForm: { id?: string };
};

const Stack = createNativeStackNavigator<OneTimeStackParamList>();

const headerOptions = {
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: colors.white,
  headerTitleStyle: { fontWeight: '800' as const },
};

export default function OneTimeNavigator() {
  return (
    <Stack.Navigator screenOptions={headerOptions}>
      <Stack.Screen name="OneTimeList" options={{ title: 'One-Time Tasks' }}>
        {({ navigation }) => (
          <OneTimeScreen
            onOpen={(id) => navigation.navigate('OneTimeDetail', { id })}
            onEdit={(id) => navigation.navigate('OneTimeForm', { id })}
            onNew={() => navigation.navigate('OneTimeForm', {})}
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="OneTimeDetail" options={{ title: 'Assignment' }}>
        {({ navigation, route }) => (
          <AssignmentDetailScreen
            assignmentId={route.params.id}
            onEdit={(id) => navigation.navigate('OneTimeForm', { id })}
            onDeleted={() => navigation.popTo('OneTimeList')}
            onBack={() => navigation.goBack()}
          />
        )}
      </Stack.Screen>

      <Stack.Screen
        name="OneTimeForm"
        options={({ route }) => ({ title: route.params?.id ? 'Edit Assignment' : 'New Assignment' })}
      >
        {({ navigation, route }) => (
          <AssignmentFormScreen
            editId={route.params?.id}
            onDone={() => navigation.goBack()}
            onCancel={() => navigation.goBack()}
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
