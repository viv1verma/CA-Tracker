import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { colors } from '../../theme/theme';
import AssignmentDetailScreen from '../assignments/AssignmentDetailScreen';
import SupervisingScreen from './SupervisingScreen';

/**
 * Supervising stack. Rows open the shared assignment detail, exactly as the web
 * row's onclick calls openAssignDetail(). There is no create/edit path here.
 */
export type SupervisingStackParamList = {
  SupervisingList: undefined;
  SupervisingDetail: { id: string };
};

const Stack = createNativeStackNavigator<SupervisingStackParamList>();

export default function SupervisingNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Stack.Screen name="SupervisingList" options={{ title: 'Supervising' }}>
        {({ navigation }) => (
          <SupervisingScreen onOpen={(id) => navigation.navigate('SupervisingDetail', { id })} />
        )}
      </Stack.Screen>
      <Stack.Screen name="SupervisingDetail" options={{ title: 'Assignment' }}>
        {({ navigation, route }) => (
          <AssignmentDetailScreen
            assignmentId={route.params.id}
            onEdit={() => {}}
            onDeleted={() => navigation.popTo('SupervisingList')}
            onBack={() => navigation.goBack()}
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
