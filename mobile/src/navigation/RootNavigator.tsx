import { NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React, { useMemo } from 'react';
import { Text } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useData } from '../data/DataContext';
import { badgeText } from '../features/notifications/logic';
import { Loading } from '../components/ui';
import ForcePasswordChangeScreen from '../screens/ForcePasswordChangeScreen';
import LoginScreen from '../screens/LoginScreen';
import MenuScreen from '../screens/MenuScreen';
import ModuleHost, { hasOwnNavigator } from './ModuleHost';
import { colors } from '../theme/theme';
import { landingModule, moduleById, tabsFor, visibleModules, type ModuleId } from './modules';

export type RootStackParamList = { Login: undefined; ForcePasswordChange: undefined; Main: undefined };
export type MenuStackParamList = {
  MenuList: undefined;
  Module: { id: ModuleId; title: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const MenuStack = createNativeStackNavigator<MenuStackParamList>();
const Tabs = createBottomTabNavigator();

const navTheme: Theme = {
  dark: false,
  colors: {
    primary: colors.primary,
    background: colors.bg,
    card: colors.primary,
    text: colors.white,
    border: colors.border,
    notification: colors.red,
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' },
    medium: { fontFamily: 'System', fontWeight: '500' },
    bold: { fontFamily: 'System', fontWeight: '700' },
    heavy: { fontFamily: 'System', fontWeight: '900' },
  },
};

const headerOptions = {
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: colors.white,
  headerTitleStyle: { fontWeight: '800' as const },
};

const tabIcon = (glyph: string) => ({ color }: { color: string }) => (
  <Text style={{ fontSize: 17, color }}>{glyph}</Text>
);

/** The Menu tab: every permitted module, each opening in a pushed screen. */
function MenuNavigator() {
  return (
    <MenuStack.Navigator screenOptions={headerOptions}>
      <MenuStack.Screen name="MenuList" options={{ title: 'Menu' }}>
        {({ navigation }) => (
          <MenuScreen onOpen={(id, title) => navigation.navigate('Module', { id, title })} />
        )}
      </MenuStack.Screen>
      <MenuStack.Screen
        name="Module"
        options={({ route }) => ({
          title: route.params.title,
          // An implemented module draws its own stack header; don't stack two.
          headerShown: !hasOwnNavigator(route.params.id),
        })}
      >
        {({ route }) => <ModuleHost moduleId={route.params.id} />}
      </MenuStack.Screen>
    </MenuStack.Navigator>
  );
}

/**
 * Tabs are generated from the module registry for the signed-in identity, so the
 * app lands where the web app lands (admin → Assignments, member → My Tasks,
 * client → their portal) and never shows a module the user cannot open.
 */
function MainTabs() {
  const { user, branch } = useAuth();
  // The web keeps a bell with an unread badge in the topbar on every page. The
  // tab bar is the phone's always-visible chrome, so the count rides there.
  const { unreadNotifications } = useData();

  const tabModules = useMemo(() => {
    const ids = tabsFor(user, branch);
    const landing = landingModule(user);
    // The landing module always leads, even if the role has no other tabs.
    const ordered = [landing, ...ids.filter((id) => id !== landing)];
    return ordered
      .map((id) => moduleById(id))
      .filter((m): m is NonNullable<typeof m> => !!m)
      .filter((m) => visibleModules(user, branch).some((v) => v.id === m.id));
  }, [user, branch]);

  return (
    <Tabs.Navigator
      screenOptions={{
        ...headerOptions,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      {tabModules.map((m) => (
        <Tabs.Screen
          key={m.id}
          name={m.id}
          options={{
            title: m.title,
            tabBarIcon: tabIcon(m.icon),
            headerShown: !hasOwnNavigator(m.id),
          }}
        >
          {() => <ModuleHost moduleId={m.id} />}
        </Tabs.Screen>
      ))}
      <Tabs.Screen
        name="menu"
        component={MenuNavigator}
        options={{
          title: 'Menu', headerShown: false, tabBarIcon: tabIcon('☰'),
          tabBarBadge: badgeText(unreadNotifications),
        }}
      />
    </Tabs.Navigator>
  );
}

export default function RootNavigator() {
  const { user, restoring } = useAuth();

  // Hold the UI until the persisted session has been restored, so we never flash
  // the login screen at an already-signed-in user.
  if (restoring) return <Loading label="Restoring session…" />;

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : user.mustChangePassword ? (
          // Mounted *instead of* the app, so there is no tab bar, back gesture or
          // route into any module until the password has actually been replaced.
          <Stack.Screen name="ForcePasswordChange" component={ForcePasswordChangeScreen} />
        ) : (
          <Stack.Screen name="Main" component={MainTabs} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
