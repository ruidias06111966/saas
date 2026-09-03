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

function Booting() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-bg px-6 text-center">
      <div>
        <p className="font-display text-2xl font-bold tracking-tight">CONEXÃO</p>
        <p className="mt-2 text-sm text-muted">Restaurando sua sessão…</p>
        <div className="mx-auto mt-5 h-1 w-32 overflow-hidden rounded-full bg-line">
          <div className="h-full w-1/3 animate-pulseSoft rounded-full bg-brand" />
        </div>
      </div>
    </div>
  );
}

function Chrome() {
  const { booting, pendingAccount } = useApp();
  if (booting) return <Booting />;
  // Sessão válida sem perfil: o cadastro ficou pela metade porque a confirmação
  // de e-mail acontece depois. Não há para onde navegar antes de completá-lo —
  // qualquer outra tela leria um usuário que não existe.
  if (pendingAccount) {
    return (
      <>
        <Signup />
        <Toasts />
      </>
    );
  }
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
