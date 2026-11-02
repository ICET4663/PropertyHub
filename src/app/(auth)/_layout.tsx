import { Stack } from 'expo-router';
import { AuthFlowProvider } from '../../screens/auth';
import { colors } from '../../theme';

export default function AuthLayout() {
  return (
    <AuthFlowProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.card } }} />
    </AuthFlowProvider>
  );
}
