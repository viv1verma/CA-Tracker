import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect } from 'react';
import { colors } from '../../theme/theme';
import AssignmentDetailScreen from './AssignmentDetailScreen';
import AssignmentFormScreen from './AssignmentFormScreen';
import AssignmentsScreen from './AssignmentsScreen';

/**
 * The Assignments module's own stack. The web opens sheets over one page; a phone
 * pushes screens, so the hardware back button unwinds detail → list the way the
 * browser's back button unwound the sheet.
 */
export type AssignmentsStackParamList = {
  AssignmentsList: undefined;
  AssignmentDetail: { id: string };
  AssignmentForm: { id?: string };
};

const Stack = createNativeStackNavigator<AssignmentsStackParamList>();

const headerOptions = {
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: colors.white,
  headerTitleStyle: { fontWeight: '800' as const },
};

/**
 * A notification carries the assignment it is about; openNotif() navigates to the
 * page and then opens it. Pushing from the list keeps the list underneath, so
 * back returns to it just as closing the web's sheet does.
 */
function AutoOpen({ id, onOpen }: { id?: string; onOpen: (id: string) => void }) {
  useEffect(() => { if (id) onOpen(id); }, [id]);   // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function AssignmentsNavigator({ openAssignmentId }: { openAssignmentId?: string } = {}) {
  return (
    <Stack.Navigator screenOptions={headerOptions}>
      <Stack.Screen name="AssignmentsList" options={{ title: 'Assignments' }}>
        {({ navigation }) => (
          <>
            <AutoOpen id={openAssignmentId}
              onOpen={(id) => navigation.navigate('AssignmentDetail', { id })} />
            <AssignmentsScreen
              onOpen={(id) => navigation.navigate('AssignmentDetail', { id })}
              onNew={() => navigation.navigate('AssignmentForm', {})}
            />
          </>
        )}
      </Stack.Screen>

      <Stack.Screen name="AssignmentDetail" options={{ title: 'Assignment' }}>
        {({ navigation, route }) => (
          <AssignmentDetailScreen
            assignmentId={route.params.id}
            onEdit={(id) => navigation.navigate('AssignmentForm', { id })}
            onDeleted={() => navigation.popTo('AssignmentsList')}
            onBack={() => navigation.goBack()}
          />
        )}
      </Stack.Screen>

      <Stack.Screen
        name="AssignmentForm"
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
