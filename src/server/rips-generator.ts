import { openemrDb } from "./openemr/db";
import { prisma } from "./db";
import { sql } from "kysely";
import { getOpenEmrTableColumns } from "./openemr/schema";

// Duplicate schema definition from frontend (ideally shared)
const RIPS_SCHEMA: any = {
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

export async function generateRipsJson(presetId: number, dateStart: string, dateEnd: string) {
    const preset = await prisma.ripsPreset.findUnique({ where: { id: presetId } });
    if (!preset) throw new Error("Preset not found");

    let mapping: any = {};
    try {
        mapping = JSON.parse(preset.mapping);
    } catch (e) {
        throw new Error("Invalid mapping JSON in preset");
    }

    // Start processing from root
    // Context is initially empty
    return await processNode(RIPS_SCHEMA, "", mapping, {}, { dateStart, dateEnd });
}

async function processNode(node: any, path: string, mapping: any, context: any, globalParams: any) {
    if (node.type === 'root') {
        // Root is special, it's just a container
        const result: any = {};
        for (const [key, child] of Object.entries(node.children || {})) {
             const childPath = path ? `${path}.${key}` : key;
             // @ts-ignore
             result[key] = await processNode(child, childPath, mapping, context, globalParams);
        }
        return result;
    }

    if (node.type === 'object') {
        const result: any = {};
        for (const [key, child] of Object.entries(node.children || {})) {
             const childPath = path ? `${path}.${key}` : key;
             // @ts-ignore
             result[key] = await processNode(child, childPath, mapping, context, globalParams);
        }
        return result;
    }

    if (node.type === 'array') {
        const config = mapping[path];
        if (!config || config.type !== 'list' || !config.table) {
             console.warn(`No list mapping found for array at ${path}`);
             return [];
        }

        const tableName = config.table;

        // Dynamic Query Construction
        // We need to inspect table columns to know how to filter
        let columns: any[] = [];
        try {
            columns = await getOpenEmrTableColumns(tableName);
        } catch (e) {
            console.error(`Failed to get columns for ${tableName}`, e);
        }

        const columnNames = new Set(columns.map(c => c.Field));
        const hasDate = columnNames.has('date');
        const hasPid = columnNames.has('pid');
        const hasEncounter = columnNames.has('encounter');

        let queryStr = `SELECT * FROM ${tableName} WHERE 1=1`;
        const params: any[] = [];

        // Apply Date Filter if it's likely a transaction/service table and we are at the top level or it makes sense
        // Heuristic: If table has 'date', filter by date range provided in globalParams
        if (hasDate && globalParams.dateStart && globalParams.dateEnd) {
             queryStr += ` AND date >= ? AND date <= ?`;
             params.push(globalParams.dateStart, globalParams.dateEnd);
        } else if (columnNames.has('date_service') && globalParams.dateStart && globalParams.dateEnd) {
             queryStr += ` AND date_service >= ? AND date_service <= ?`;
             params.push(globalParams.dateStart, globalParams.dateEnd);
        }

        // Apply Context Filter (Parent-Child relationship)
        // Heuristic: If context has 'pid' and this table has 'pid', join on it.
        if (context.pid && hasPid) {
            queryStr += ` AND pid = ?`;
            params.push(context.pid);
        }
        // Heuristic: If context has 'encounter' and this table has 'encounter', join on it.
        if (context.encounter && hasEncounter) {
             queryStr += ` AND encounter = ?`;
             params.push(context.encounter);
        }

        // Execute Query
        try {
            const result = await sql<any>(queryStr as any, params).execute(openemrDb);
            const rows = result.rows;

            const arrayResults = [];
            for (const row of rows) {
                const newContext = { ...context, ...row };
                // Process item children
                const itemResult: any = {};
                for (const [key, child] of Object.entries(node.children || {})) {
                    const childPath = path ? `${path}.${key}` : key;
                    // @ts-ignore
                    itemResult[key] = await processNode(child, childPath, mapping, newContext, globalParams);
                }
                arrayResults.push(itemResult);
            }
            return arrayResults;
        } catch (e) {
            console.error(`Query failed for ${tableName}`, e);
            return [];
        }
    }

    // Leaf Node Processing
    const config = mapping[path];
    if (!config) return null;

    if (config.type === 'static') return config.value;

    if (config.type === 'field') {
         // If config.table matches context table (or we just look in context vars), use it.
         // Context merges row data, so column name should be property.
         // We ignore config.table verification for now and just look for property.
         if (context[config.column] !== undefined) {
             return context[config.column];
         }
         return null;
    }

    if (config.type === 'lookup') {
        const sourceVal = context[config.column];
        if (sourceVal === undefined || sourceVal === null) return null;

        try {
            // Prisma query for lookup
            // We need to dynamically build the where clause
            // refTable is 'ReferenceRecord' but we filter by 'tableName'
            const whereClause: any = {
                tableName: config.refTable,
            };

            // Match column logic
            // The ReferenceRecord table has fields: codigo, nombre, extraI...extraX, valor
            // user config.matchColumn should be one of these.
            whereClause[config.matchColumn] = String(sourceVal);

            const ref = await prisma.referenceRecord.findFirst({
                where: whereClause
            });

            if (ref) {
                // @ts-ignore
                return ref[config.returnColumn];
            }
        } catch (e) {
            console.error(`Lookup failed for ${path}`, e);
        }
        return null;
    }

    return null;
}
