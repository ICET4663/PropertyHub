import { Redirect } from 'expo-router';
import { hrefFor } from '../../nav/router';

/** Self sign-up is closed: accounts are created by a Super Admin or property manager. Old links land on sign-in. */
export default function SignUpRoute() {
  return <Redirect href={hrefFor('signIn')} />;
}
