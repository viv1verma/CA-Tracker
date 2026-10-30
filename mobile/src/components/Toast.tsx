import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, spacing } from '../theme/theme';

/** The native stand-in for the web app's showToast(). */
type Tone = 'success' | 'error';
interface ToastState { showToast: (message: string, tone?: Tone) => void }

const ToastContext = createContext<ToastState | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; tone: Tone } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string, tone: Tone = 'success') => {
    setMsg({ text, tone });
  }, []);

  useEffect(() => {
    if (!msg) return;
    Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true })
        .start(() => setMsg(null));
    }, 3000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [msg, opacity]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {!!msg && (
        <Animated.View pointerEvents="none" style={[styles.wrap, { opacity }]}>
          <View style={[styles.toast, msg.tone === 'error' && { backgroundColor: colors.red }]}>
            <Text style={styles.text}>{msg.text}</Text>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastState {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 92, alignItems: 'center', paddingHorizontal: spacing.xl },
  toast: {
    backgroundColor: colors.text, borderRadius: radius.pill,
    paddingVertical: 11, paddingHorizontal: spacing.xl, maxWidth: '100%',
  },
  text: { color: colors.white, ...font.small, textAlign: 'center' },
});
