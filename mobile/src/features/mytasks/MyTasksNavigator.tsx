import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect } from 'react';
import { colors } from '../../theme/theme';
import AssignmentDetailScreen from '../assignments/AssignmentDetailScreen';
import AssignmentFormScreen from '../assignments/AssignmentFormScreen';
import MyTasksScreen from './MyTasksScreen';

/**
 * My Tasks stack. Detail and form are the Assignments module's screens — the web
 * opens the same openAssignDetail() / openAssignSheet() from this page too.
 */
export type MyTasksStackParamList = {
  MyTasksList: undefined;
  MyTaskDetail: { id: string };
  MyTaskForm: { id?: string };
};

const Stack = createNativeStackNavigator<MyTasksStackParamList>();

const headerOptions = {
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: colors.white,
  headerTitleStyle: { fontWeight: '800' as const },
};

/** A notification routes here and then opens the task it is about. */
function AutoOpen({ id, onOpen }: { id?: string; onOpen: (id: string) => void }) {
  useEffect(() => { if (id) onOpen(id); }, [id]);   // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function MyTasksNavigator({ openAssignmentId }: { openAssignmentId?: string } = {}) {
  return (
    <Stack.Navigator screenOptions={headerOptions}>
      <Stack.Screen name="MyTasksList" options={{ title: 'My Tasks' }}>
        {({ navigation }) => (
          <>
            <AutoOpen id={openAssignmentId}
              onOpen={(id) => navigation.navigate('MyTaskDetail', { id })} />
            <MyTasksScreen
              onOpen={(id) => navigation.navigate('MyTaskDetail', { id })}
              onNew={() => navigation.navigate('MyTaskForm', {})}
            />
          </>
        )}
      </Stack.Screen>

      <Stack.Screen name="MyTaskDetail" options={{ title: 'Assignment' }}>
        {({ navigation, route }) => (
          <AssignmentDetailScreen
            assignmentId={route.params.id}
            onEdit={(id) => navigation.navigate('MyTaskForm', { id })}
            onDeleted={() => navigation.popTo('MyTasksList')}
            onBack={() => navigation.goBack()}
          />
        )}
      </Stack.Screen>

      <Stack.Screen
        name="MyTaskForm"
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
