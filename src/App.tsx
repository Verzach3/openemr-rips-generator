import { useState } from "react";
import { Link, Route, Switch } from "wouter";
import { orpc } from "./lib/orpc";
import { SyncPage } from "./SyncPage";
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

const ApiPage = () => {
  const [greetName, setGreetName] = useState("");
  const [greetResult, setGreetResult] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<string | null>(null);
  const [loading, setLoading] = useState<"greet" | "ping" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGreet = async () => {
    if (!greetName.trim()) return;
    setLoading("greet");
    setError(null);
    try {
      const result = await orpc.hello.greet({ name: greetName.trim() });
      setGreetResult(JSON.stringify(result, null, 2));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(null);
    }
  };

  const handlePing = async () => {
    setLoading("ping");
    setError(null);
    try {
      const result = await orpc.hello.ping();
      setPingResult(JSON.stringify(result, null, 2));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900 border-b border-gray-300 pb-2">API Explorer</h1>
      <p className="text-gray-700 text-sm">
        Test the oRPC procedures exposed by the server. Calls are fully type-safe end-to-end.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-800 text-sm p-3">
          <strong>Error:&nbsp;</strong>{error}
        </div>
      )}

      {/* Greet Procedure */}
      <div className="enterprise-panel">
        <h2 className="text-lg font-bold text-gray-900 mb-2 border-b border-gray-200 pb-2">
          hello.greet
        </h2>
        <p className="text-gray-700 text-sm mb-3">
          Sends a name and receives a greeting message.
        </p>
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            value={greetName}
            onChange={(e) => setGreetName(e.target.value)}
            placeholder="Enter a name…"
            className="border border-gray-300 px-3 py-1.5 text-sm flex-1 focus:outline-none focus:border-slate-500"
            onKeyDown={(e) => e.key === "Enter" && handleGreet()}
          />
          <button
            className="btn-primary"
            onClick={handleGreet}
            disabled={loading === "greet" || !greetName.trim()}
          >
            {loading === "greet" ? "Calling…" : "Call Greet"}
          </button>
        </div>
        {greetResult && (
          <pre className="bg-gray-50 border border-gray-200 text-sm p-3 font-mono text-gray-800 overflow-x-auto">
            {greetResult}
          </pre>
        )}
      </div>

      {/* Ping Procedure */}
      <div className="enterprise-panel">
        <h2 className="text-lg font-bold text-gray-900 mb-2 border-b border-gray-200 pb-2">
          hello.ping
        </h2>
        <p className="text-gray-700 text-sm mb-3">
          Pings the server and returns a timestamp.
        </p>
        <button
          className="btn-primary mb-3"
          onClick={handlePing}
          disabled={loading === "ping"}
        >
          {loading === "ping" ? "Calling…" : "Call Ping"}
        </button>
        {pingResult && (
          <pre className="bg-gray-50 border border-gray-200 text-sm p-3 font-mono text-gray-800 overflow-x-auto">
            {pingResult}
          </pre>
        )}
      </div>
    </div>
  );
};

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
                <Link href="/sync" className={(active) => active ? "active-nav-link" : "nav-link"}>
                  Sync
                </Link>
                <Link href="/api" className={(active) => active ? "active-nav-link" : "nav-link"}>
                  API
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
          <Route path="/sync" component={SyncPage} />
          <Route path="/api" component={ApiPage} />
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
