import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ErrorState, Loading } from '../../components/ui';
import { colors, font, spacing } from '../../theme/theme';
import EmployeeProfileSheet from '../team/EmployeeProfileSheet';
import type { Employee } from '../team/logic';
import MyProfileEditSheet from './MyProfileEditSheet';

/**
 * My Profile — `navTo('myprofile')` → `showEmpProfile(me.id)`.
 *
 * showEmpProfile() fetches the full user list and picks the record out of it, so
 * that is what happens here too; the id is always the signed-in member's own and
 * there is no employee picker anywhere in this module.
 *
 * The panel is the shared employee panel the web opens from both places. Its own
 * rules already match the web: Edit shows for a member viewing themselves, and
 * Delete is hidden on your own record. The edit form, however, is this module's
 * self-service one, not the Team module's admin form.
 */
export default function MyProfileScreen({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [me, setMe] = useState<Employee | null>(null);
  const [state, setState] = useState<'loading' | 'idle' | 'error'>('loading');
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setState('loading');
    try {
      // showEmpProfile(): GET /users, then find(u => u.id === uid).
      const all = await api.get<Employee[]>(endpoints.users);
      const mine = (all || []).find((u) => u.id === user.id) || null;
      if (!mine) { setState('error'); return; }
      setMe(mine);
      setState('idle');
    } catch (e) {
      setState('error');
      void (e as ApiError);
    }
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  if (state === 'loading') return <Loading label="Loading your profile…" />;
  if (state === 'error' || !me) {
    return (
      <View style={styles.page}>
        <ErrorState message="Could not load profile" onRetry={() => void load()} />
      </View>
    );
  }

  return (
    <View style={styles.page}>
      {/* The panel opens over this screen the way the web slides empPanel in. */}
      <View style={styles.behind}>
        <Text style={styles.behindText}>{me.name}</Text>
        <Text style={styles.behindSub}>
          {(me.designation || '')}{me.branch ? ` · ${me.branch}` : ''}
        </Text>
      </View>

      <EmployeeProfileSheet
        member={me}
        visible={!editing}
        onClose={onClose}
        onEdit={() => setEditing(true)}
        onDeleted={() => { /* delete is never offered on your own record */ }}
      />

      <MyProfileEditSheet
        member={me}
        visible={editing}
        onClose={() => setEditing(false)}
        onSaved={(u) => { setMe(u); void load(); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  behind: { padding: spacing.xl, alignItems: 'center', justifyContent: 'center', flex: 1 },
  behindText: { ...font.h2, color: colors.text },
  behindSub: { ...font.small, fontWeight: '500', color: colors.muted, marginTop: 4 },
});
