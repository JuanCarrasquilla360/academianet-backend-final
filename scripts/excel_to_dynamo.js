// Script para migrar datos de Excel a DynamoDB (ESTRICTAMENTE SOLO MEDELLÍN)
const AWS = require("aws-sdk");
const XLSX = require("xlsx");
const { v4: uuidv4 } = require("uuid");

// Configuración de AWS - sin hardcodear credenciales
AWS.config.update({
  region: "us-east-1",
  // Las credenciales se tomarán del archivo ~/.aws/credentials o variables de entorno
});

// Clientes para DynamoDB
const dynamodb = new AWS.DynamoDB.DocumentClient();
const dynamodbAdmin = new AWS.DynamoDB();

// Mapeo de nombres de columnas según el formato del Excel
const COLUMNAS = {
  INSTITUCION: ["NOMBRE_INSTITUCION"],
  PROGRAMA: ["NOMBRE_DEL_PROGRAMA"],
  NIVEL: ["NIVEL_DE_FORMACION", "NIVEL_ACADEMICO"],
  MODALIDAD: ["MODALIDAD"],
  DURACION: ["NUMERO_PERIODOS_DE_DURACION"],
  CREDITOS: ["NUMERO_CREDITOS"],
  MUNICIPIO: ["MUNICIPIO_OFERTA_PROGRAMA"],
};

// Función para verificar si una tabla existe y crearla si no
async function verificarYCrearTabla(nombreTabla, keySchema) {
  try {
    // Verificar si la tabla existe
    await dynamodbAdmin.describeTable({ TableName: nombreTabla }).promise();
    console.log(`Tabla ${nombreTabla} ya existe.`);
    return true;
  } catch (error) {
    if (error.code === "ResourceNotFoundException") {
      console.log(`Creando tabla ${nombreTabla}...`);

      try {
        await dynamodbAdmin
          .createTable({
            TableName: nombreTabla,
            KeySchema: keySchema,
            AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
            BillingMode: "PAY_PER_REQUEST",
          })
          .promise();

        console.log(`Tabla ${nombreTabla} creada con éxito.`);

        // Esperar a que la tabla esté activa
        let tableStatus = "";
        while (tableStatus !== "ACTIVE") {
          const data = await dynamodbAdmin
            .describeTable({ TableName: nombreTabla })
            .promise();
          tableStatus = data.Table.TableStatus;
          if (tableStatus !== "ACTIVE") {
            console.log(
              `Esperando a que la tabla ${nombreTabla} esté activa...`
            );
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }
        }

        return true;
      } catch (createError) {
        console.error(`Error al crear la tabla ${nombreTabla}:`, createError);
        return false;
      }
    } else {
      console.error(`Error al verificar la tabla ${nombreTabla}:`, error);
      return false;
    }
  }
}

// Función para inicializar todas las tablas necesarias
async function inicializarTablas() {
  // Definición de tablas necesarias
  const tablas = [
    {
      nombre: "Instituciones",
      keySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    },
    {
      nombre: "ProgramasAcademicos",
      keySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    },
    {
      nombre: "PeriodosInscripcion",
      keySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    },
  ];

  let todasCreadas = true;

  for (const tabla of tablas) {
    const resultado = await verificarYCrearTabla(tabla.nombre, tabla.keySchema);
    if (!resultado) {
      todasCreadas = false;
    }
  }

  return todasCreadas;
}

// Función principal para procesar el archivo Excel
async function procesarExcel(rutaArchivo) {
  try {
    console.log("=== INICIANDO PROCESAMIENTO DE DATOS (SOLO MEDELLÍN) ===");

    // Primero verificamos que las tablas existan
    const tablasListas = await inicializarTablas();
    if (!tablasListas) {
      console.error(
        "No se pudieron crear todas las tablas necesarias. Abortando la migración."
      );
      return;
    }

    // Cargar el archivo Excel
    const workbook = XLSX.readFile(rutaArchivo, { cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);

    console.log(`Se encontraron ${data.length} registros totales en el Excel.`);

    const columnaMunicipio = "MUNICIPIO_OFERTA_PROGRAMA";
    const columnaInstitucion = "NOMBRE_INSTITUCION";
    const columnaPrograma = "NOMBRE_DEL_PROGRAMA";

    console.log(
      `Filtrando estrictamente por municipio: "${columnaMunicipio}" = "Medellín"`
    );

    // Filtrado ESTRICTO: Solo registros donde MUNICIPIO_OFERTA_PROGRAMA es EXACTAMENTE "Medellín"
    const registrosMedellin = data.filter((row) => {
      return row[columnaMunicipio] === "Medellín";
    });

    console.log(
      `Se encontraron ${registrosMedellin.length} registros con municipio exactamente igual a "Medellín"`
    );

    if (registrosMedellin.length === 0) {
      console.error(
        "No se encontraron registros de Medellín. Verificando municipios presentes:"
      );

      // Mostrar los municipios únicos presentes
      const municipiosUnicos = new Set();
      data.slice(0, 100).forEach((row) => {
        if (row[columnaMunicipio]) {
          municipiosUnicos.add(row[columnaMunicipio]);
        }
      });

      console.error("Municipios encontrados:");
      Array.from(municipiosUnicos)
        .sort()
        .forEach((m) => {
          console.error(`  - "${m}"`);
        });

      console.error(
        "La migración se ha detenido porque no se encontraron registros de Medellín."
      );
      return;
    }

    console.log("=== PROCESANDO SOLO REGISTROS DE MEDELLÍN ===");

    // Mostrar ejemplos de registros que se procesarán
    console.log("Ejemplos de registros que se van a procesar:");
    registrosMedellin.slice(0, 3).forEach((row, i) => {
      console.log(
        `${i + 1}. ${row[columnaInstitucion]} - ${
          row[columnaPrograma]
        } (Municipio: "${row[columnaMunicipio]}")`
      );
    });

    // Mapeo de instituciones únicas (solo de Medellín)
    const instituciones = {};
    registrosMedellin.forEach((row) => {
      const nombreInstitucion = row[columnaInstitucion];

      if (nombreInstitucion && !instituciones[nombreInstitucion]) {
        instituciones[nombreInstitucion] = {
          id: `inst_${uuidv4().substring(0, 8)}`,
          nombre: nombreInstitucion,
          ciudad: "Medellín",
          tipoInstitucion: determinarTipoInstitucion(nombreInstitucion),
          codigoInstitucion: row["CODIGO_INSTITUCION"] || null,
        };
      }
    });

    console.log(
      `Se encontraron ${
        Object.keys(instituciones).length
      } instituciones únicas de Medellín.`
    );

    // Listar las instituciones para verificación
    console.log("Instituciones de Medellín que se van a guardar:");
    Object.keys(instituciones)
      .sort()
      .forEach((nombre, i) => {
        console.log(`${i + 1}. ${nombre}`);
      });

    // Guardar instituciones en DynamoDB
    await guardarInstituciones(Object.values(instituciones));

    // Mapear programas
    const programas = [];
    const periodos = [];

    registrosMedellin.forEach((row) => {
      const nombreInstitucion = row[columnaInstitucion];
      const nombrePrograma = row[columnaPrograma];

      // Skip si falta información esencial
      if (
        !nombreInstitucion ||
        !nombrePrograma ||
        !instituciones[nombreInstitucion]
      ) {
        return;
      }

      // Obtener nivel académico
      const nivel =
        row["NIVEL_DE_FORMACION"] ||
        row["NIVEL_ACADEMICO"] ||
        determinarNivel(nombrePrograma);

      // Obtener modalidad
      const modalidad = row["MODALIDAD"] || "Presencial";

      // Crear ID para el programa
      const programaId = `prog_${uuidv4().substring(0, 8)}`;

      // Agregar programa
      programas.push({
        id: programaId,
        nombre: nombrePrograma,
        institucionId: instituciones[nombreInstitucion].id,
        nivel: nivel,
        modalidad: modalidad,
        duracion: row["NUMERO_PERIODOS_DE_DURACION"] || null,
        creditos: row["NUMERO_CREDITOS"] || null,
        codigo: row["CODIGO_SNIES_DEL_PROGRAMA"] || null,
        estado: row["ESTADO_PROGRAMA"] || "Activo",
        municipio: "Medellín", // Explícitamente establecido
      });

      // Crear un periodo de inscripción
      periodos.push({
        id: `per_${uuidv4().substring(0, 8)}`,
        programaId: programaId,
        institucionId: instituciones[nombreInstitucion].id,
        ano: new Date().getFullYear(),
        periodo: 1,
        estado: "próximamente",
        periodicidad: row["PERIODICIDAD"] || null,
        departamento: row["DEPARTAMENTO_OFERTA_PROGRAMA"] || "Antioquia",
        municipio: "Medellín", // Explícitamente establecido
      });
    });

    console.log(
      `Se procesaron ${programas.length} programas y ${periodos.length} periodos de Medellín`
    );

    // Guardar programas y periodos en DynamoDB
    if (programas.length > 0) {
      await guardarProgramas(programas);
    } else {
      console.warn("No se encontraron programas de Medellín para guardar");
    }

    if (periodos.length > 0) {
      await guardarPeriodos(periodos);
    } else {
      console.warn("No se encontraron periodos de Medellín para guardar");
    }

    console.log(
      "=== MIGRACIÓN DE DATOS DE MEDELLÍN COMPLETADA EXITOSAMENTE ==="
    );
  } catch (error) {
    console.error("Error durante la migración:", error);
  }
}

// Función para guardar instituciones en DynamoDB
async function guardarInstituciones(instituciones) {
  console.log(
    `Guardando ${instituciones.length} instituciones de Medellín en DynamoDB...`
  );

  if (instituciones.length === 0) {
    console.warn("No hay instituciones de Medellín para guardar");
    return;
  }

  // Usar procesamiento por lotes
  const batchSize = 25; // DynamoDB permite hasta 25 items por operación de batch
  for (let i = 0; i < instituciones.length; i += batchSize) {
    const batch = instituciones.slice(i, i + batchSize);

    const batchParams = {
      RequestItems: {
        Instituciones: batch.map((institucion) => ({
          PutRequest: {
            Item: institucion,
          },
        })),
      },
    };

    try {
      await dynamodb.batchWrite(batchParams).promise();
      console.log(
        `Lote de instituciones guardado: ${i + 1} a ${Math.min(
          i + batchSize,
          instituciones.length
        )}`
      );
    } catch (error) {
      console.error(`Error al guardar lote de instituciones:`, error);

      // Intentar guardar individualmente si falla el batch
      for (const institucion of batch) {
        try {
          await dynamodb
            .put({
              TableName: "Instituciones",
              Item: institucion,
            })
            .promise();
        } catch (putError) {
          console.error(
            `Error al guardar institución ${institucion.nombre}:`,
            putError
          );
        }
      }
    }
  }

  console.log("Instituciones de Medellín guardadas correctamente.");
}

// Función para guardar programas en DynamoDB
async function guardarProgramas(programas) {
  console.log(
    `Guardando ${programas.length} programas de Medellín en DynamoDB...`
  );

  if (programas.length === 0) {
    console.warn("No hay programas de Medellín para guardar");
    return;
  }

  // Usar procesamiento por lotes para mayor eficiencia
  const batchSize = 25; // DynamoDB permite hasta 25 items por operación de batch
  for (let i = 0; i < programas.length; i += batchSize) {
    const batch = programas.slice(i, i + batchSize);

    const batchParams = {
      RequestItems: {
        ProgramasAcademicos: batch.map((programa) => ({
          PutRequest: {
            Item: programa,
          },
        })),
      },
    };

    try {
      await dynamodb.batchWrite(batchParams).promise();
      console.log(
        `Lote de programas guardado: ${i + 1} a ${Math.min(
          i + batchSize,
          programas.length
        )}`
      );
    } catch (error) {
      console.error(`Error al guardar lote de programas:`, error);

      // Intentar guardar individualmente si falla el batch
      for (const programa of batch) {
        try {
          await dynamodb
            .put({
              TableName: "ProgramasAcademicos",
              Item: programa,
            })
            .promise();
        } catch (putError) {
          console.error(
            `Error al guardar programa ${programa.nombre}:`,
            putError
          );
        }
      }
    }
  }

  console.log("Programas de Medellín guardados correctamente.");
}

// Función para guardar periodos en DynamoDB
async function guardarPeriodos(periodos) {
  console.log(
    `Guardando ${periodos.length} periodos de Medellín en DynamoDB...`
  );

  if (periodos.length === 0) {
    console.warn("No hay periodos de Medellín para guardar");
    return;
  }

  // Usar procesamiento por lotes
  const batchSize = 25;
  for (let i = 0; i < periodos.length; i += batchSize) {
    const batch = periodos.slice(i, i + batchSize);

    const batchParams = {
      RequestItems: {
        PeriodosInscripcion: batch.map((periodo) => ({
          PutRequest: {
            Item: periodo,
          },
        })),
      },
    };

    try {
      await dynamodb.batchWrite(batchParams).promise();
      console.log(
        `Lote de periodos guardado: ${i + 1} a ${Math.min(
          i + batchSize,
          periodos.length
        )}`
      );
    } catch (error) {
      console.error(`Error al guardar lote de periodos:`, error);

      // Intentar guardar individualmente si falla el batch
      for (const periodo of batch) {
        try {
          await dynamodb
            .put({
              TableName: "PeriodosInscripcion",
              Item: periodo,
            })
            .promise();
        } catch (putError) {
          console.error(
            `Error al guardar periodo para programa ${periodo.programaId}:`,
            putError
          );
        }
      }
    }
  }

  console.log("Periodos de Medellín guardados correctamente.");
}

// Funciones de utilidad
function determinarTipoInstitucion(nombre) {
  if (!nombre) return "otro";

  const nombreLower = nombre.toLowerCase();
  if (nombreLower.includes("universidad")) return "universidad";
  if (nombreLower.includes("instituto")) return "instituto";
  if (
    nombreLower.includes("corporación") ||
    nombreLower.includes("corporacion")
  )
    return "corporación";
  return "otro";
}

function determinarNivel(nombrePrograma) {
  if (!nombrePrograma) return "pregrado";

  const nombreLower = nombrePrograma.toLowerCase();
  if (nombreLower.includes("doctorado")) return "doctorado";
  if (
    nombreLower.includes("maestría") ||
    nombreLower.includes("maestria") ||
    nombreLower.includes("master")
  )
    return "maestría";
  if (
    nombreLower.includes("especialización") ||
    nombreLower.includes("especializacion")
  )
    return "especialización";
  return "pregrado"; // Valor por defecto
}

// Función principal que coordina todo el proceso
async function main() {
  try {
    console.log(
      "Iniciando proceso de migración ESTRICTA de datos de Medellín a DynamoDB"
    );
    await procesarExcel("./Programas.xlsx");
  } catch (error) {
    console.error("Error en el proceso principal:", error);
  }
}

// Ejecutar el script
main();

module.exports = {
  procesarExcel,
};
