import { Stack } from 'expo-router';
import { AppShell } from '../../components/shell';
import { ChatProvider } from '../../store/ChatContext';
import { colors } from '../../theme';

/** Signed-in screens stack inside the shell, so the sidebar, top bar and bottom tabs stay put. */
export default function AppLayout() {
  return (
    <ChatProvider>
      <AppShell>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
      </AppShell>
    </ChatProvider>
  );
}
