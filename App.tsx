import { AppProvider, useApp } from './state/AppContext';
import { AppShell } from './components/layout/AppShell';
import { Toasts } from './components/Toasts';
import { Landing } from './screens/Landing';
import { Login } from './screens/Login';
import { Signup } from './screens/Signup';
import { Home } from './screens/Home';
import { Discover } from './screens/Discover';
import { PersonProfile } from './screens/PersonProfile';
import { Connections } from './screens/Connections';
import { Chats } from './screens/Chats';
import { Chat } from './screens/Chat';
import { Profile } from './screens/Profile';
import { ProfileEdit } from './screens/ProfileEdit';
import { Premium } from './screens/Premium';
import { Settings } from './screens/Settings';
import { Notifications } from './screens/Notifications';
import { Admin } from './screens/Admin';

function Router() {
  const { route } = useApp();
  switch (route.name) {
    case 'landing': return <Landing />;
    case 'login': return <Login />;
    case 'signup': return <Signup />;
    case 'home': return <Home />;
    case 'discover': return <Discover />;
    case 'person': return <PersonProfile id={route.id} />;
    case 'connections': return <Connections />;
    case 'chats': return <Chats />;
    case 'chat': return <Chat id={route.id} />;
    case 'profile': return <Profile />;
    case 'profileEdit': return <ProfileEdit />;
    case 'premium': return <Premium />;
    case 'settings': return <Settings />;
    case 'notifications': return <Notifications />;
    case 'admin': return <Admin />;
    default: return <Landing />;
  }
}

function Chrome() {
  return (
    <>
      <AppShell><Router /></AppShell>
      <Toasts />
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Chrome />
    </AppProvider>
  );
}
