import { Platform } from 'react-native';
import { Redirect } from 'expo-router';
import { useStore } from '../store/AppContext';
import { hrefFor } from '../nav/router';
import { homeRouteFor } from '../components/shell';

/** The app's entry: each role's home screen, or for signed-out visitors the landing page (web) or sign-in (phones). */
export default function Index() {
  const { me } = useStore();
  return <Redirect href={hrefFor(me ? homeRouteFor(me.role) : Platform.OS === 'web' ? 'welcome' : 'signIn')} />;
}
