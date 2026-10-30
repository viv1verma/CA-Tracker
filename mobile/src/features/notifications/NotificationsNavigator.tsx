import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import ApprovalsNavigator from '../approvals/ApprovalsNavigator';
import AssignmentsNavigator from '../assignments/AssignmentsNavigator';
import ClientPortalNavigator from '../clientportal/ClientPortalNavigator';
import ItrClientNavigator from '../itrclient/ItrClientNavigator';
import MyTasksNavigator from '../mytasks/MyTasksNavigator';
import ModuleScreen from '../../screens/ModuleScreen';
import type { ModuleId } from '../../navigation/modules';
import { colors } from '../../theme/theme';
import NotificationsScreen from './NotificationsScreen';

/**
 * The bell panel plus the page a notification routes to. openNotif() closes the
 * panel and navigates, so the target module is pushed on top of this stack and
 * the back button returns to the list.
 *
 * Every target is imported directly rather than through ModuleHost: ModuleHost
 * imports this navigator, so going back through it would form a require cycle
 * and risk an uninitialised component at load.
 */
export type NotificationsStackParamList = {
  NotificationsList: undefined;
  NotifTarget: { id: ModuleId; title: string; assignmentId?: string };
};

const Stack = createNativeStackNavigator<NotificationsStackParamList>();

const headerOptions = {
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: colors.white,
  headerTitleStyle: { fontWeight: '800' as const },
};

function NotifTarget({ id, assignmentId }: { id: ModuleId; assignmentId?: string }) {
  if (id === 'assignments') return <AssignmentsNavigator openAssignmentId={assignmentId} />;
  if (id === 'myassign') return <MyTasksNavigator openAssignmentId={assignmentId} />;
  if (id === 'approvals') return <ApprovalsNavigator />;
  if (id === 'clientportal') return <ClientPortalNavigator />;
  if (id === 'itrclient') return <ItrClientNavigator />;
  return <ModuleScreen moduleId={id} />;
}

export default function NotificationsNavigator() {
  return (
    <Stack.Navigator screenOptions={headerOptions}>
      <Stack.Screen name="NotificationsList" options={{ title: '🔔 Notifications' }}>
        {({ navigation }) => (
          <NotificationsScreen
            onNavigate={(id, title, assignmentId) =>
              navigation.navigate('NotifTarget', { id, title, assignmentId })}
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="NotifTarget" options={{ headerShown: false }}>
        {({ route }) => (
          <NotifTarget id={route.params.id} assignmentId={route.params.assignmentId} />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
