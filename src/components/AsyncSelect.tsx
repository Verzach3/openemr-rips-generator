import { useState, useEffect } from "react";
import { orpc } from "../lib/orpc";

export function AsyncSelect({
    tableName,
    columnName,
    value,
    onChange
}: {
    tableName: string,
    columnName: string,
    value: string,
    onChange: (val: string) => void
}) {
    const [options, setOptions] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState(value);

    // Sync external value to internal search term
    useEffect(() => {
        setSearchTerm(value);
    }, [value]);

    useEffect(() => {
        if (isOpen && tableName && columnName) {
            fetchOptions(searchTerm);
        }
    }, [isOpen]);

    // Debounced fetch
    useEffect(() => {
        const handler = setTimeout(() => {
            if (isOpen && tableName && columnName) {
                fetchOptions(searchTerm);
            }
        }, 300);
        return () => clearTimeout(handler);
    }, [searchTerm, isOpen, tableName, columnName]);

    const fetchOptions = async (term: string) => {
        setLoading(true);
        try {
            const data = await orpc.rips.getDistinctValues({
                tableName,
                columnName,
                search: term,
                limit: 20
            });
            setOptions(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative">
            <input
                className="w-full border border-gray-300 rounded p-2 text-sm"
                value={searchTerm}
                onChange={(e) => {
                    const val = e.target.value;
                    setSearchTerm(val);
                    onChange(val);
                }}
                onFocus={() => setIsOpen(true)}
                onBlur={() => setTimeout(() => setIsOpen(false), 200)}
                placeholder="Type to search or enter value..."
            />
            {isOpen && (
                <div className="absolute z-10 w-full bg-white border border-gray-300 shadow-lg max-h-40 overflow-y-auto mt-1 rounded text-sm left-0">
                    {loading && <div className="p-2 text-gray-500">Loading...</div>}
                    {!loading && options.length === 0 && <div className="p-2 text-gray-400 italic">No matches found</div>}
                    {!loading && options.map((opt) => (
                        <div
                            key={opt}
                            className="p-2 hover:bg-blue-50 cursor-pointer text-gray-800"
                            onMouseDown={() => {
                                onChange(opt);
                                setSearchTerm(opt);
                                setIsOpen(false);
                            }}
                        >
                            {opt}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
