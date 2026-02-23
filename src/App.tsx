import { Link, Route, Switch } from "wouter";
import "./index.css";

const Home = () => (
  <div className="space-y-4">
    <h1 className="text-2xl font-bold text-gray-900 border-b border-gray-300 pb-2">Dashboard</h1>
    <p className="text-gray-700 text-sm">
      Manage your electronic medical records and generate reports efficiently.
    </p>
    <div className="enterprise-panel mt-6">
      <h2 className="text-lg font-bold text-gray-900 mb-2 border-b border-gray-200 pb-2">Quick Actions</h2>
      <p className="text-gray-700 text-sm mb-4">Select an action to get started with the OpenEMR RIPS Generator.</p>
      <button className="btn-primary">Generate Report</button>
    </div>
  </div>
);

const About = () => (
  <div className="space-y-4">
    <h1 className="text-2xl font-bold text-gray-900 border-b border-gray-300 pb-2">About</h1>
    <div className="enterprise-panel">
      <p className="text-gray-700 text-sm">
        This is a strict, professional client application tailored for enterprise medical record management.
      </p>
    </div>
  </div>
);

export function App() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-100 font-sans">
      <header className="bg-slate-800 border-b-4 border-slate-600 top-0 sticky z-10 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-12">
            <div className="flex items-center gap-8 h-full">
              <span className="text-lg font-bold text-white tracking-tight uppercase">RIPS Generator</span>
              <nav className="hidden md:flex h-full items-center">
                <Link href="/" className={(active) => active ? "active-nav-link" : "nav-link"}>
                  Dashboard
                </Link>
                <Link href="/about" className={(active) => active ? "active-nav-link" : "nav-link"}>
                  About
                </Link>
              </nav>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/about" component={About} />
          <Route>
            <div className="enterprise-panel text-center py-8 mt-4">
              <h2 className="text-xl font-bold text-gray-900 border-b border-gray-200 inline-block pb-2">404 - Page Not Found</h2>
              <p className="text-gray-700 text-sm mt-4 mb-4">The exact page you are looking for does not exist in this module.</p>
              <Link href="/" className="btn-primary inline-block">
                Return to Dashboard
              </Link>
            </div>
          </Route>
        </Switch>
      </main>
    </div>
  );
}

export default App;
