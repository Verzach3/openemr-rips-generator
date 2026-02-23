import { useState, useEffect } from "react";
import { orpc } from "./lib/orpc";
import { AsyncSelect } from "./components/AsyncSelect";

const RIPS_SCHEMA = {
  label: "RIPS",
  type: "root",
  children: {
    transaccion: {
      label: "Transacción",
      type: "object",
      children: {
        numDocumentoIdObligado: { label: "NIT del Prestador", type: "string" },
        numFactura: { label: "Número de Factura", type: "string" },
        tipoNota: { label: "Tipo de Nota", type: "string" },
        numNota: { label: "Número de Nota", type: "string" },
        usuarios: {
          label: "Usuarios",
          type: "array",
          children: {
             tipoDocumentoIdentificacion: { label: "Tipo Documento", type: "string" },
             numDocumentoIdentificacion: { label: "Número Documento", type: "string" },
             tipoUsuario: { label: "Tipo Usuario", type: "string" },
             fechaNacimiento: { label: "Fecha Nacimiento", type: "date" },
             codSexo: { label: "Sexo", type: "string" },
             codPaisResidencia: { label: "País Residencia", type: "string" },
             codMunicipioResidencia: { label: "Municipio Residencia", type: "string" },
             incapacidad: { label: "Incapacidad", type: "string" },
             consecutivo: { label: "Consecutivo", type: "number" },
             servicios: {
               label: "Servicios",
               type: "object",
               children: {
                 consultas: {
                   label: "Consultas",
                   type: "array",
                   children: {
                     codPrestador: { label: "Código Prestador", type: "string" },
                     fechaInicioAtencion: { label: "Fecha Atención", type: "datetime" },
                     numAutorizacion: { label: "Num Autorización", type: "string" },
                     codConsulta: { label: "Código Consulta", type: "string" },
                     modalidadGrupoServicioTec: { label: "Modalidad", type: "string" },
                     grupoServicios: { label: "Grupo Servicios", type: "string" },
                     codServicio: { label: "Código Servicio", type: "string" },
                     finalidadTecnologiaSalud: { label: "Finalidad", type: "string" },
                     causaMotivoAtencion: { label: "Causa Externa", type: "string" },
                     codDiagnosticoPrincipal: { label: "Diagnóstico Principal", type: "string" },
                     codDiagnosticoRelacionado1: { label: "Diagnóstico Rel 1", type: "string" },
                     codDiagnosticoRelacionado2: { label: "Diagnóstico Rel 2", type: "string" },
                     codDiagnosticoRelacionado3: { label: "Diagnóstico Rel 3", type: "string" },
                     tipoDocumentoIdentificacion: { label: "Tipo Doc Profesional", type: "string" },
                     numDocumentoIdentificacion: { label: "Num Doc Profesional", type: "string" },
                     vrServicio: { label: "Valor Servicio", type: "number" },
                     tipoPagoModerador: { label: "Tipo Pago Moderador", type: "string" },
                     valorPagoModerador: { label: "Valor Pago Moderador", type: "number" },
                     numFEVPagoModerador: { label: "Num FEV Pago Moderador", type: "string" },
                   }
                 },
               }
             }
          }
        }
      }
    }
  }
};

const MappingNode = ({
    node,
    path,
    mapping,
    onSelect,
    selectedPath
}: {
    node: any,
    path: string,
    mapping: any,
    onSelect: (path: string, node: any) => void,
    selectedPath: string | null
}) => {
    const isSelected = selectedPath === path;
    const isMapped = !!mapping[path];
    const isArray = node.type === "array";
    const hasChildren = node.children && Object.keys(node.children).length > 0;

    return (
        <div className="ml-4 border-l border-gray-200 pl-2">
            <div
                className={`cursor-pointer text-sm py-1 px-2 rounded flex items-center gap-2 ${isSelected ? 'bg-blue-100 text-blue-900 font-medium' : 'hover:bg-gray-50'}`}
                onClick={(e) => { e.stopPropagation(); onSelect(path, node); }}
            >
                <span className={`w-2 h-2 rounded-full ${isMapped ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                <span>{node.label || path.split('.').pop()}</span>
                {isArray && <span className="text-xs bg-gray-200 text-gray-600 px-1 rounded">Array</span>}
            </div>
            {hasChildren && (
                <div>
                    {Object.entries(node.children).map(([key, child]) => (
                        <MappingNode
                            key={key}
                            node={child}
                            path={path ? `${path}.${key}` : key}
                            mapping={mapping}
                            onSelect={onSelect}
                            selectedPath={selectedPath}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export function RipsPage() {
    const [presets, setPresets] = useState<any[]>([]);
    const [selectedPresetId, setSelectedPresetId] = useState<number | null>(null);
    const [presetName, setPresetName] = useState("");

    // Mapping state (JSON object)
    const [currentMapping, setCurrentMapping] = useState<Record<string, any>>({});

    // DB Explorer state
    const [tables, setTables] = useState<string[]>([]);
    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [columns, setColumns] = useState<any[]>([]);
    const [loadingSchema, setLoadingSchema] = useState(false);

    // Mapping Editor State
    const [selectedNodePath, setSelectedNodePath] = useState<string | null>(null);
    const [selectedNodeDef, setSelectedNodeDef] = useState<any>(null);
    const [referenceTables, setReferenceTables] = useState<string[]>([]);

    // Editor Form State (derived from selection)
    const [editConfig, setEditConfig] = useState<any>({});
    const [sourceColumns, setSourceColumns] = useState<any[]>([]); // For the mapping editor dropdown
    const [localTables, setLocalTables] = useState<string[]>([]);
    const [localColumns, setLocalColumns] = useState<any[]>([]);

    // Generation State
    const [dateStart, setDateStart] = useState("");
    const [dateEnd, setDateEnd] = useState("");
    const [generating, setGenerating] = useState(false);
    const [generationResult, setGenerationResult] = useState<string | null>(null);
    const [showResultModal, setShowResultModal] = useState(false);

    useEffect(() => {
        loadPresets();
        loadTables();
        loadReferenceTables();
        loadLocalTables();
    }, []);

    // Load edit config when selection changes
    useEffect(() => {
        if (selectedNodePath && currentMapping[selectedNodePath]) {
            setEditConfig(currentMapping[selectedNodePath]);
        } else {
            setEditConfig({ type: 'static', value: '' });
        }
        setSourceColumns([]); // Reset columns when node changes initially
    }, [selectedNodePath, currentMapping]);

    // Fetch columns if the edit config has a table selected
    useEffect(() => {
        if (editConfig.type === 'field' && editConfig.table) {
            fetchSourceColumns(editConfig.table);
        } else if ((editConfig.type === 'local_field' || editConfig.type === 'static_lookup') && editConfig.table) {
            fetchLocalColumns(editConfig.table);
        }
    }, [editConfig.table, editConfig.type]);

    const loadPresets = async () => {
        try {
            const data = await orpc.rips.getPresets();
            setPresets(data);
        } catch (e) { console.error(e); }
    };

    const loadTables = async () => {
        try {
            const data = await orpc.rips.getOpenEmrTables();
            setTables(data);
        } catch (e) { console.error(e); }
    };

    const loadReferenceTables = async () => {
        try {
            const data = await orpc.explorer.getTableNames();
            setReferenceTables(data);
        } catch (e) { console.error(e); }
    };

    const loadLocalTables = async () => {
        try {
            const data = await orpc.rips.getLocalTables();
            setLocalTables(data);
        } catch (e) { console.error(e); }
    };

    const fetchSourceColumns = async (tableName: string) => {
        try {
            const cols = await orpc.rips.getOpenEmrColumns({ tableName });
            setSourceColumns(cols);
        } catch (e) { console.error(e); }
    };

    const fetchLocalColumns = async (tableName: string) => {
        try {
            const cols = await orpc.rips.getLocalColumns({ tableName });
            setLocalColumns(cols);
        } catch (e) { console.error(e); }
    };

    const handleTableSelect = async (tableName: string) => {
        setSelectedTable(tableName);
        setLoadingSchema(true);
        try {
            const cols = await orpc.rips.getOpenEmrColumns({ tableName });
            setColumns(cols);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingSchema(false);
        }
    };

    const handleLoadPreset = (preset: any) => {
        setSelectedPresetId(preset.id);
        setPresetName(preset.name);
        try {
            setCurrentMapping(JSON.parse(preset.mapping));
        } catch (e) {
            console.error("Failed to parse mapping JSON", e);
            setCurrentMapping({});
        }
    };

    const handleSavePreset = async () => {
        if (!presetName.trim()) {
            alert("Please enter a preset name");
            return;
        }
        try {
            await orpc.rips.savePreset({
                id: selectedPresetId ?? undefined,
                name: presetName,
                mapping: JSON.stringify(currentMapping),
            });
            await loadPresets();
            alert("Preset saved successfully!");
        } catch (e) {
            alert("Error saving preset: " + String(e));
        }
    };

    const handleNewPreset = () => {
        setSelectedPresetId(null);
        setPresetName("");
        setCurrentMapping({});
        setSelectedNodePath(null);
    };

    const handleDeletePreset = async (id: number) => {
        if (!confirm("Are you sure you want to delete this preset?")) return;
        try {
            await orpc.rips.deletePreset({ id });
            await loadPresets();
            if (selectedPresetId === id) {
                handleNewPreset();
            }
        } catch (e) {
            alert("Error deleting preset: " + String(e));
        }
    };

    const handleNodeSelect = (path: string, node: any) => {
        setSelectedNodePath(path);
        setSelectedNodeDef(node);
    };

    const updateMapping = () => {
        if (selectedNodePath) {
            setCurrentMapping(prev => ({
                ...prev,
                [selectedNodePath]: editConfig
            }));
        }
    };

    const handleGenerate = async () => {
        if (!selectedPresetId) {
            alert("Please select and save a preset first.");
            return;
        }
        if (!dateStart || !dateEnd) {
            alert("Please select a date range.");
            return;
        }
        setGenerating(true);
        setGenerationResult(null);
        try {
            const result = await orpc.rips.generate({
                presetId: selectedPresetId,
                dateStart,
                dateEnd
            });
            // @ts-ignore
            if (result.success) {
                 // @ts-ignore
                 setGenerationResult(JSON.stringify(result.json, null, 2));
                 setShowResultModal(true);
            } else {
                 // @ts-ignore
                 alert("Generation failed: " + result.error);
            }
        } catch (e) {
            alert("Error: " + String(e));
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div className="space-y-4 h-[calc(100vh-100px)] flex flex-col relative">
            <div className="flex justify-between items-center border-b border-gray-300 pb-2">
                <h1 className="text-2xl font-bold text-gray-900">RIPS Generator</h1>
                <div className="flex gap-2 items-center bg-gray-100 p-1 rounded">
                    <span className="text-xs font-semibold text-gray-500 ml-1">Date Range:</span>
                    <input type="date" className="border border-gray-300 p-1 text-sm rounded bg-white" value={dateStart} onChange={e => setDateStart(e.target.value)} />
                    <span className="text-gray-400">-</span>
                    <input type="date" className="border border-gray-300 p-1 text-sm rounded bg-white" value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
                    <button
                        className="btn-primary py-1 px-3 text-sm ml-2"
                        onClick={handleGenerate}
                        disabled={generating || !selectedPresetId}
                    >
                        {generating ? "Generating..." : "Generate RIPS"}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 flex-1 overflow-hidden">
                {/* Left Column: Controls & Explorer */}
                <div className="space-y-4 col-span-1 overflow-y-auto pr-1">

                    {/* Presets Panel */}
                    <div className="enterprise-panel">
                        <div className="flex justify-between items-center mb-2 border-b border-gray-200 pb-1">
                            <h2 className="text-lg font-bold">Presets</h2>
                            <button className="text-xs text-blue-600 hover:underline" onClick={handleNewPreset}>New</button>
                        </div>

                        <div className="flex gap-2 mb-3">
                            <input
                                className="border border-gray-300 px-2 py-1 text-sm flex-1 w-full"
                                placeholder="Preset Name"
                                value={presetName}
                                onChange={e => setPresetName(e.target.value)}
                            />
                            <button className="btn-primary py-1 px-3 text-xs" onClick={handleSavePreset}>Save</button>
                        </div>

                        <ul className="max-h-40 overflow-y-auto border border-gray-200 bg-white text-sm">
                            {presets.length === 0 && <li className="p-2 text-gray-400 italic">No presets saved.</li>}
                            {presets.map(p => (
                                <li
                                    key={p.id}
                                    className={`flex justify-between items-center p-2 cursor-pointer border-b border-gray-100 last:border-0 ${selectedPresetId === p.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                    onClick={() => handleLoadPreset(p)}
                                >
                                    <span className="truncate flex-1">{p.name}</span>
                                    <button
                                        className="text-gray-400 hover:text-red-600 px-1"
                                        onClick={(e) => { e.stopPropagation(); handleDeletePreset(p.id); }}
                                        title="Delete"
                                    >
                                        &times;
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* DB Explorer Panel */}
                    <div className="enterprise-panel">
                        <h2 className="text-lg font-bold mb-2 border-b border-gray-200 pb-1">DB Explorer</h2>
                        <div className="mb-2">
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Select OpenEMR Table:</label>
                            <select
                                className="w-full border border-gray-300 p-1 text-sm bg-white"
                                onChange={(e) => handleTableSelect(e.target.value)}
                                value={selectedTable || ""}
                            >
                                <option value="">-- Select Table --</option>
                                {tables.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>

                        {selectedTable && (
                            <div className="border border-gray-200 bg-white text-xs h-60 overflow-y-auto">
                                {loadingSchema ? (
                                    <div className="p-4 text-center text-gray-500">Loading columns...</div>
                                ) : (
                                    <table className="w-full">
                                        <thead className="bg-gray-50 sticky top-0">
                                            <tr>
                                                <th className="p-1 text-left border-b bg-gray-100">Field</th>
                                                <th className="p-1 text-left border-b bg-gray-100">Type</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {columns.map(c => (
                                                <tr key={c.Field} className="border-b border-gray-100 last:border-0 hover:bg-yellow-50 cursor-help" title={`Type: ${c.Type}\nNullable: ${c.Null}\nKey: ${c.Key}`}>
                                                    <td className="p-1 font-mono font-semibold text-slate-700">{c.Field}</td>
                                                    <td className="p-1 text-gray-500 truncate max-w-[100px]">{c.Type}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        )}
                        {!selectedTable && <div className="p-4 text-center text-gray-400 text-xs italic">Select a table to view schema</div>}
                    </div>

                </div>

                {/* Center Column: Tree View */}
                <div className="space-y-4 col-span-1 lg:col-span-1 overflow-y-auto border-r border-l border-gray-200 px-2 bg-white h-full">
                    <h2 className="text-lg font-bold mb-4 border-b border-gray-200 pb-2 mt-4">Structure</h2>
                    <div className="text-sm">
                        {Object.entries(RIPS_SCHEMA.children).map(([key, child]) => (
                            <MappingNode
                                key={key}
                                node={child}
                                path={key}
                                mapping={currentMapping}
                                onSelect={handleNodeSelect}
                                selectedPath={selectedNodePath}
                            />
                        ))}
                    </div>
                </div>

                {/* Right Column: Editor */}
                <div className="space-y-4 col-span-1 lg:col-span-2 overflow-y-auto p-2">
                     <div className="enterprise-panel h-full bg-slate-50">
                        <h2 className="text-lg font-bold mb-4 border-b border-gray-200 pb-2">Mapping Configuration</h2>

                        {!selectedNodePath && (
                            <div className="text-gray-500 italic p-4 text-center">
                                Select a node in the structure tree to configure its mapping.
                            </div>
                        )}

                        {selectedNodePath && selectedNodeDef && (
                            <div className="space-y-4">
                                <div className="bg-white p-3 border border-gray-200 shadow-sm rounded">
                                    <div className="mb-2">
                                        <label className="block text-xs font-bold text-gray-500 uppercase">Field</label>
                                        <div className="text-lg font-bold text-gray-800">{selectedNodeDef.label}</div>
                                        <div className="text-xs text-gray-400 font-mono">{selectedNodePath}</div>
                                    </div>

                                    <div className="mb-4">
                                        <label className="block text-sm font-semibold mb-1">Mapping Type</label>
                                        <select
                                            className="w-full border border-gray-300 rounded p-2 text-sm"
                                            value={editConfig.type || 'static'}
                                            onChange={(e) => setEditConfig({ ...editConfig, type: e.target.value })}
                                        >
                                            <option value="static">Static Value</option>
                                            <option value="static_lookup">Static Lookup (Local DB)</option>
                                            <option value="field">OpenEMR Field</option>
                                            <option value="local_field">Local DB Field</option>
                                            <option value="lookup">Reference Lookup</option>
                                            {selectedNodeDef.type === 'array' && <option value="list">List Source</option>}
                                        </select>
                                    </div>

                                    {editConfig.type === 'static' && (
                                        <div className="mb-4">
                                            <label className="block text-sm font-semibold mb-1">Value</label>
                                            <input
                                                className="w-full border border-gray-300 rounded p-2 text-sm"
                                                value={editConfig.value || ''}
                                                onChange={(e) => setEditConfig({ ...editConfig, value: e.target.value })}
                                                placeholder="Enter static value"
                                            />
                                        </div>
                                    )}

                                    {(editConfig.type === 'field' || editConfig.type === 'list' || editConfig.type === 'lookup') && (
                                        <div className="mb-4">
                                            <label className="block text-sm font-semibold mb-1">Source Table (OpenEMR)</label>
                                            <select
                                                className="w-full border border-gray-300 rounded p-2 text-sm"
                                                value={editConfig.table || ''}
                                                onChange={(e) => setEditConfig({ ...editConfig, table: e.target.value })}
                                            >
                                                <option value="">-- Select Table --</option>
                                                {tables.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        </div>
                                    )}

                                    {(editConfig.type === 'local_field' || editConfig.type === 'static_lookup') && (
                                        <div className="mb-4">
                                            <label className="block text-sm font-semibold mb-1">Source Table (Local DB)</label>
                                            <select
                                                className="w-full border border-gray-300 rounded p-2 text-sm"
                                                value={editConfig.table || ''}
                                                onChange={(e) => setEditConfig({ ...editConfig, table: e.target.value })}
                                            >
                                                <option value="">-- Select Table --</option>
                                                {localTables.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        </div>
                                    )}

                                    {editConfig.type === 'field' && editConfig.table && (
                                        <div className="mb-4">
                                            <label className="block text-sm font-semibold mb-1">Source Column</label>
                                            <select
                                                className="w-full border border-gray-300 rounded p-2 text-sm"
                                                value={editConfig.column || ''}
                                                onChange={(e) => setEditConfig({ ...editConfig, column: e.target.value })}
                                            >
                                                <option value="">-- Select Column --</option>
                                                {sourceColumns.map(c => <option key={c.Field} value={c.Field}>{c.Field} ({c.Type})</option>)}
                                            </select>
                                        </div>
                                    )}

                                    {editConfig.type === 'local_field' && editConfig.table && (
                                        <div className="mb-4">
                                            <label className="block text-sm font-semibold mb-1">Source Column</label>
                                            <select
                                                className="w-full border border-gray-300 rounded p-2 text-sm"
                                                value={editConfig.column || ''}
                                                onChange={(e) => setEditConfig({ ...editConfig, column: e.target.value })}
                                            >
                                                <option value="">-- Select Column --</option>
                                                {localColumns.map(c => <option key={c.Field} value={c.Field}>{c.Field} ({c.Type})</option>)}
                                            </select>
                                        </div>
                                    )}

                                    {editConfig.type === 'static_lookup' && editConfig.table && (
                                        <>
                                            <div className="mb-4">
                                                <label className="block text-sm font-semibold mb-1">Value Column</label>
                                                <select
                                                    className="w-full border border-gray-300 rounded p-2 text-sm"
                                                    value={editConfig.column || ''}
                                                    onChange={(e) => setEditConfig({ ...editConfig, column: e.target.value })}
                                                >
                                                    <option value="">-- Select Column --</option>
                                                    {localColumns.map(c => <option key={c.Field} value={c.Field}>{c.Field} ({c.Type})</option>)}
                                                </select>
                                            </div>
                                            {editConfig.column && (
                                                <div className="mb-4">
                                                    <label className="block text-sm font-semibold mb-1">Select Value</label>
                                                    <AsyncSelect
                                                        tableName={editConfig.table}
                                                        columnName={editConfig.column}
                                                        value={editConfig.value || ''}
                                                        onChange={(val) => setEditConfig({ ...editConfig, value: val })}
                                                    />
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {editConfig.type === 'lookup' && editConfig.table && (
                                         <div className="space-y-4 border-t border-gray-200 pt-4 mt-4">
                                            <div>
                                                <label className="block text-sm font-semibold mb-1">Source Column (Input)</label>
                                                <select
                                                    className="w-full border border-gray-300 rounded p-2 text-sm"
                                                    value={editConfig.column || ''}
                                                    onChange={(e) => setEditConfig({ ...editConfig, column: e.target.value })}
                                                >
                                                    <option value="">-- Select Source Column --</option>
                                                    {sourceColumns.map(c => <option key={c.Field} value={c.Field}>{c.Field}</option>)}
                                                </select>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-semibold mb-1">Reference Table (Lookup)</label>
                                                <select
                                                    className="w-full border border-gray-300 rounded p-2 text-sm"
                                                    value={editConfig.refTable || ''}
                                                    onChange={(e) => setEditConfig({ ...editConfig, refTable: e.target.value })}
                                                >
                                                    <option value="">-- Select Reference Table --</option>
                                                    {referenceTables.map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="block text-xs font-semibold mb-1 text-gray-600">Match On (Ref Column)</label>
                                                    <input
                                                        className="w-full border border-gray-300 rounded p-2 text-sm"
                                                        placeholder="e.g. nombre"
                                                        value={editConfig.matchColumn || 'nombre'}
                                                        onChange={(e) => setEditConfig({ ...editConfig, matchColumn: e.target.value })}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-semibold mb-1 text-gray-600">Return (Ref Column)</label>
                                                    <input
                                                        className="w-full border border-gray-300 rounded p-2 text-sm"
                                                        placeholder="e.g. codigo"
                                                        value={editConfig.returnColumn || 'codigo'}
                                                        onChange={(e) => setEditConfig({ ...editConfig, returnColumn: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                         </div>
                                    )}

                                    <div className="mt-6">
                                        <button
                                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded shadow"
                                            onClick={updateMapping}
                                        >
                                            Apply Configuration
                                        </button>
                                        {currentMapping[selectedNodePath] && (
                                            <div className="mt-2 text-center text-xs text-green-600 font-semibold">
                                                ✓ Currently mapped
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                     </div>
                </div>
            </div>

            {/* Generation Result Modal */}
            {showResultModal && (
                <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded shadow-lg w-full max-w-4xl h-[80vh] flex flex-col">
                        <div className="flex justify-between items-center p-4 border-b">
                            <h3 className="text-xl font-bold">Generated RIPS JSON</h3>
                            <button
                                className="text-gray-500 hover:text-black text-2xl"
                                onClick={() => setShowResultModal(false)}
                            >
                                &times;
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto p-4 bg-gray-50">
                            <pre className="text-xs font-mono">{generationResult}</pre>
                        </div>
                        <div className="p-4 border-t flex justify-end gap-2">
                             <button
                                className="btn-primary"
                                onClick={() => {
                                    const blob = new Blob([generationResult || ''], { type: 'application/json' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = 'rips.json';
                                    a.click();
                                }}
                            >
                                Download JSON
                            </button>
                            <button
                                className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded"
                                onClick={() => setShowResultModal(false)}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
