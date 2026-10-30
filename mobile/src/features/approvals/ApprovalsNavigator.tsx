import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { colors } from '../../theme/theme';
import AssignmentDetailScreen from '../assignments/AssignmentDetailScreen';
import ApprovalsScreen from './ApprovalsScreen';

/**
 * Approvals stack. A completion card opens the task it belongs to, so the
 * approver can read the remarks and history before deciding.
 */
export type ApprovalsStackParamList = {
  ApprovalsList: undefined;
  ApprovalDetail: { id: string };
};

const Stack = createNativeStackNavigator<ApprovalsStackParamList>();

export default function ApprovalsNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Stack.Screen name="ApprovalsList" options={{ title: '✅ Pending Approvals' }}>
        {({ navigation }) => (
          <ApprovalsScreen onOpen={(id) => navigation.navigate('ApprovalDetail', { id })} />
        )}
      </Stack.Screen>
      <Stack.Screen name="ApprovalDetail" options={{ title: 'Assignment' }}>
        {({ navigation, route }) => (
          <AssignmentDetailScreen
            assignmentId={route.params.id}
            onEdit={() => {}}
            onDeleted={() => navigation.popTo('ApprovalsList')}
            onBack={() => navigation.goBack()}
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
