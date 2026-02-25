import { useState, useEffect } from "react";
import { orpc } from "../lib/orpc";

type Patient = {
  pid: number;
  fname: string;
  mname?: string | null;
  lname: string;
  ss: string;
  DOB?: string | null;
  sex?: string | null;
};

type Encounter = {
  id: number;
  date: string | null;
  encounter: number | null;
  pid: number | null;
  invoice_refno: string | null;
  reason: string | null;
};

type UserType = {
  codigo: string;
  nombre: string;
};

type PatientSelection = {
  patient: Patient;
  selectedEncounterIds: number[];
  encounters: Encounter[];
};

export const RipsPage = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [searching, setSearching] = useState(false);

  // Selected patients and their configuration
  const [selections, setSelections] = useState<PatientSelection[]>([]);

  // Global Filters
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Result
  const [generatedResult, setGeneratedResult] = useState<{ json: any; filename: string; consecutivo: number } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search Patients
  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    setSearching(true);
    try {
      const results = await orpc.rips.searchPatients({ term: searchTerm });
      setSearchResults(results as unknown as Patient[]);
    } catch (e) {
      console.error(e);
    } finally {
      setSearching(false);
    }
  };

  // Add Patient to Selection
  const handleAddPatient = async (patient: Patient) => {
    if (selections.some((s) => s.patient.pid === patient.pid)) return;

    const newSelection: PatientSelection = {
      patient,
      selectedEncounterIds: [],
      encounters: [],
    };

    setSelections([...selections, newSelection]);

    // Fetch encounters immediately for this patient
    fetchEncounters(patient.pid);
  };

  const removePatient = (pid: number) => {
    setSelections(selections.filter(s => s.patient.pid !== pid));
  };

  // Fetch Encounters for a patient (or all)
  const fetchEncounters = async (pid: number) => {
    try {
      const encs = await orpc.rips.getEncounters({
        patientIds: [pid],
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });

      setSelections((prev) =>
        prev.map((s) => {
          if (s.patient.pid === pid) {
            return { ...s, encounters: encs as unknown as Encounter[] };
          }
          return s;
        })
      );
    } catch (e) {
      console.error(e);
    }
  };

  // Refresh all encounters when dates change
  useEffect(() => {
    const pids = selections.map(s => s.patient.pid);
    if (pids.length > 0) {
      // In a real app we might debounce this
      pids.forEach(pid => fetchEncounters(pid));
    }
  }, [startDate, endDate]);

  const toggleEncounter = (pid: number, encounterId: number) => {
    setSelections((prev) =>
      prev.map((s) => {
        if (s.patient.pid === pid) {
          const isSelected = s.selectedEncounterIds.includes(encounterId);
          return {
            ...s,
            selectedEncounterIds: isSelected
              ? s.selectedEncounterIds.filter(id => id !== encounterId)
              : [...s.selectedEncounterIds, encounterId]
          };
        }
        return s;
      })
    );
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setGeneratedResult(null);

    // Filter out patients with no selected encounters? Or allow it?
    // RIPS usually requires data.
    const validSelections = selections.filter(s => s.selectedEncounterIds.length > 0);

    if (validSelections.length === 0) {
      setError("Please select at least one encounter for at least one patient.");
      setGenerating(false);
      return;
    }

    try {
      const input = {
        selections: validSelections.map(s => ({
          patientId: s.patient.pid,
          encounterIds: s.selectedEncounterIds,
          // userType removed, inferred by backend
        }))
      };

      const result = await orpc.rips.generate(input);
      setGeneratedResult(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setGenerating(false);
    }
  };

  const downloadJson = () => {
    if (!generatedResult) return;
    const blob = new Blob([JSON.stringify(generatedResult.json, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = generatedResult.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b border-gray-300 pb-2">
        <h1 className="text-2xl font-bold text-gray-900">RIPS Generation</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Search & Add */}
        <div className="lg:col-span-1 space-y-4">
          <div className="enterprise-panel">
            <h2 className="text-lg font-bold text-gray-900 mb-2 border-b border-gray-200 pb-2">Search Patient</h2>
            <div className="flex gap-2 mb-2">
              <input
                className="border border-gray-300 px-3 py-1.5 text-sm flex-1 focus:outline-none focus:border-slate-500"
                placeholder="Name, ID, SSN..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
              <button className="btn-primary" onClick={handleSearch} disabled={searching}>
                {searching ? "..." : "Search"}
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto border border-gray-200 bg-white">
              {searchResults.length === 0 && <div className="p-2 text-gray-500 text-xs text-center">No results</div>}
              {searchResults.map((p) => (
                <div key={p.pid} className="p-2 border-b border-gray-100 hover:bg-slate-50 flex justify-between items-center">
                  <div>
                    <div className="font-bold text-sm text-gray-800">{p.fname} {p.lname}</div>
                    <div className="text-xs text-gray-500">ID: {p.pid} | SS: {p.ss}</div>
                  </div>
                  <button
                    className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-800 px-2 py-1 rounded"
                    onClick={() => handleAddPatient(p)}
                    disabled={selections.some(s => s.patient.pid === p.pid)}
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="enterprise-panel">
            <h2 className="text-lg font-bold text-gray-900 mb-2 border-b border-gray-200 pb-2">Global Filters</h2>
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-bold text-gray-700">Start Date</label>
                <input
                  type="date"
                  className="w-full border border-gray-300 px-2 py-1 text-sm"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700">End Date</label>
                <input
                  type="date"
                  className="w-full border border-gray-300 px-2 py-1 text-sm"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Middle Column: Selected Patients & Encounters */}
        <div className="lg:col-span-2 space-y-4">
          <div className="enterprise-panel">
            <h2 className="text-lg font-bold text-gray-900 mb-2 border-b border-gray-200 pb-2">
              Selected Patients ({selections.length})
            </h2>

            {selections.length === 0 && (
              <div className="text-center py-8 text-gray-500 text-sm">
                No patients selected. Search and add patients to begin.
              </div>
            )}

            <div className="space-y-4">
              {selections.map((item) => (
                <div key={item.patient.pid} className="border border-slate-300 bg-white p-3 shadow-sm">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-bold text-slate-800">{item.patient.fname} {item.patient.lname}</h3>
                      <div className="text-xs text-slate-500">PID: {item.patient.pid}</div>
                    </div>
                    <button
                      className="text-red-600 hover:text-red-800 text-xs underline"
                      onClick={() => removePatient(item.patient.pid)}
                    >
                      Remove
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div className="flex items-end text-xs text-gray-500">
                      {item.encounters.length} encounters found
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-2">
                    <h4 className="text-xs font-bold text-gray-700 mb-2">Select Encounters:</h4>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {item.encounters.map(enc => (
                        <label key={enc.id} className="flex items-center gap-2 p-1 hover:bg-slate-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={item.selectedEncounterIds.includes(enc.id)}
                            onChange={() => toggleEncounter(item.patient.pid, enc.id)}
                          />
                          <div className="text-xs">
                            <span className="font-mono text-slate-600">{enc.date ? new Date(enc.date).toLocaleDateString() : "No Date"}</span>
                            <span className="mx-2 text-gray-400">|</span>
                            <span className="font-semibold text-slate-700">{enc.invoice_refno || "No Invoice"}</span>
                            <span className="mx-2 text-gray-400">|</span>
                            <span className="text-gray-600 truncate">{enc.reason || "No Reason"}</span>
                          </div>
                        </label>
                      ))}
                      {item.encounters.length === 0 && (
                        <div className="text-xs text-gray-400 italic">No encounters found in range.</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Area */}
          {selections.length > 0 && (
            <div className="enterprise-panel bg-slate-50">
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-700">
                  Ready to generate?
                </div>
                <button
                  className="btn-primary"
                  onClick={handleGenerate}
                  disabled={generating}
                >
                  {generating ? "Generating..." : "Generate RIPS JSON"}
                </button>
              </div>
              {error && (
                <div className="mt-2 text-xs text-red-600 font-bold">
                  Error: {error}
                </div>
              )}
            </div>
          )}

          {/* Result Area */}
          {generatedResult && (
            <div className="enterprise-panel border-l-4 border-l-green-500">
              <h2 className="text-lg font-bold text-gray-900 mb-2 border-b border-gray-200 pb-2">
                Generation Successful
              </h2>
              <div className="mb-4 text-sm text-gray-700">
                <p>File: <strong>{generatedResult.filename}</strong></p>
                <p>Consecutivo ID: <strong>{generatedResult.consecutivo}</strong></p>
              </div>
              <div className="flex gap-2">
                <button className="btn-primary bg-green-600 hover:bg-green-700" onClick={downloadJson}>
                  Download JSON
                </button>
                <button
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
                  onClick={() => setGeneratedResult(null)}
                >
                  Clear
                </button>
              </div>
              <div className="mt-4">
                <label className="text-xs font-bold text-gray-500">Preview:</label>
                <pre className="mt-1 bg-gray-900 text-green-400 p-4 rounded text-xs overflow-x-auto max-h-60">
                  {JSON.stringify(generatedResult.json, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
