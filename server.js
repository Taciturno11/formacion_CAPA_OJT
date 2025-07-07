/* ───────────────────────────────────────────────
   server.js  –  backend Express + MSSQL
   ───────────────────────────────────────────────*/
const express = require('express');
const cors    = require('cors');
const sql     = require('mssql');

/* 1️⃣  CREDENCIALES SQL  */
const dbConfig = {
  server  : '172.16.248.48',
  database: 'Partner',
  user    : 'anubis',
  password: 'Tg7#kPz9@rLt2025',
  port    : 1433,
  options : { encrypt:false, trustServerCertificate:true }
};

/* Duración por campaña ------------------------------------- */
const DURACION = {
  "Unificado"         : { cap:14, ojt:5 },
  "Renovacion"        : { cap:5 , ojt:5 },
  "Ventas Hogar INB"  : { cap:5 , ojt:5 },
  "Ventas Hogar OUT"  : { cap:5 , ojt:5 },
  "Ventas Movil INB"  : { cap:5 , ojt:5 },
  "Portabilidad POST" : { cap:5 , ojt:5 },
  "Migracion"         : { cap:3 , ojt:5 },
  "Portabilidad PPA"  : { cap:5 , ojt:5 }
};

/* 2️⃣  CONEXIÓN (pool único) */
let pool;
(async () => {
  try {
    pool = await sql.connect(dbConfig);
    console.log('✅ Conectado a SQL Server');
  } catch (err) {
    console.error('❌ Error de conexión:', err);
    process.exit(1);
  }
})();

/* 3️⃣  APP Express */
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

/* 4️⃣  <datalist> de capacitadores */
app.get('/api/capacitadores', async (_, res) => {
  try {
    const { recordset } = await pool.request().query(`
      SELECT DNI AS dni,
             CONCAT(Nombres,' ',ApellidoPaterno,' ',ApellidoMaterno) AS nombreCompleto
      FROM PRI.Empleados
      WHERE CargoID = 7 AND EstadoEmpleado = 'Activo'
    `);
    res.json(recordset);
  } catch (e) { console.error(e); res.sendStatus(500); }
});

/* 4️⃣ bis ── Capas (lotes) por campaña+mes ------------------- */
app.get('/api/capas', async (req, res) => {
  const { dniCap, campania, mes } = req.query;            // mes = YYYY-MM
  try {
    const { recordset } = await pool.request()
      .input('dniCap',  sql.VarChar(20),  dniCap)
      .input('campania',sql.VarChar(100), campania)
      .input('prefijo', sql.VarChar(7),   mes)
      .query(`
        SELECT
          ROW_NUMBER() OVER (ORDER BY MIN(FechaInicio))          AS capa,
          FORMAT(MIN(FechaInicio),'yyyy-MM-dd')                  AS fechaInicio
        FROM Postulantes_En_Formacion
        WHERE DNI_Capacitador = @dniCap
          AND Campaña         = @campania
          AND FORMAT(FechaInicio,'yyyy-MM') = @prefijo
        GROUP BY FORMAT(FechaInicio,'yyyy-MM-dd')
        ORDER BY fechaInicio
      `);
    res.json(recordset);    // [{capa:1, fechaInicio:'2025-07-03'}, ...]
  } catch (e) { console.error(e); res.sendStatus(500); }
});

/* 5️⃣  Valida DNI y devuelve campañas + nombre */
app.get('/api/capacitadores/:dni', async (req, res) => {
  const { dni } = req.params;
  try {
    const { recordset } = await pool.request()
      .input('dni', sql.VarChar(20), dni)
      .query(`
        SELECT e.DNI, e.Nombres, e.ApellidoPaterno, e.ApellidoMaterno,
               (SELECT DISTINCT Campaña
                FROM Postulantes_En_Formacion
                WHERE DNI_Capacitador = e.DNI
                FOR JSON PATH) AS campañasJson
        FROM PRI.Empleados e
        WHERE e.DNI = @dni
          AND e.CargoID = 7
          AND e.EstadoEmpleado = 'Activo'
      `);

    if (!recordset.length) return res.status(404).end();
    const row = recordset[0];
    const campañas = JSON.parse(row.campañasJson || '[]').map(o => o.Campaña);
    res.json({
      dni: row.DNI,
      nombres: row.Nombres,
      apellidoPaterno: row.ApellidoPaterno,
      apellidoMaterno: row.ApellidoMaterno,
      campañas
    });
  } catch (e) { console.error(e); res.sendStatus(500); }
});


/* 6️⃣  Postulantes + asistencias del lote seleccionado */
app.get('/api/postulantes', async (req, res) => {
  const { dniCap, campania, mes, fechaInicio } = req.query;   // mes=YYYY-MM
  try {
    /* Postulantes del lote */
    const post = await pool.request()
      .input('dniCap',   sql.VarChar(20),  dniCap)
      .input('camp',     sql.VarChar(100), campania)
      .input('prefijo',  sql.VarChar(7),   mes)
      .input('fechaIni', sql.VarChar(10),  fechaInicio)
      .query(`
        SELECT DNI AS dni,
               CONCAT(Nombres,' ',ApellidoPaterno,' ',ApellidoMaterno) AS nombre,
               Telefono AS telefono
        FROM Postulantes_En_Formacion
        WHERE DNI_Capacitador       = @dniCap
          AND Campaña               = @camp
          AND FORMAT(FechaInicio,'yyyy-MM')   = @prefijo
          AND FORMAT(FechaInicio,'yyyy-MM-dd')= @fechaIni
      `);

    /* Asistencias del lote */
    const asis = await pool.request()
      .input('dniCap',   sql.VarChar(20),  dniCap)
      .input('camp',     sql.VarChar(100), campania)
      .input('prefijo',  sql.VarChar(7),   mes)
      .input('fechaIni', sql.VarChar(10),  fechaInicio)
      .query(`
        SELECT a.postulante_dni,
               CONVERT(char(10), a.fecha, 23) AS fecha,
               a.estado_asistencia
        FROM Asistencia_Formacion a
        JOIN Postulantes_En_Formacion p ON p.DNI = a.postulante_dni
        WHERE p.DNI_Capacitador       = @dniCap
          AND p.Campaña               = @camp
          AND FORMAT(a.fecha,'yyyy-MM')       = @prefijo
          AND FORMAT(p.FechaInicio,'yyyy-MM-dd') = @fechaIni
      `);

    const dur = DURACION[campania] || { cap:5, ojt:5 };

    res.json({
      postulantes : post.recordset,
      asistencias : asis.recordset,
      duracion    : dur
    });

  } catch (e) { console.error(e); res.sendStatus(500); }
});


/* 6️⃣ bis  Deserciones ------------------------------------ */
// GET /api/deserciones?dniCap=…&campania=…&mes=YYYY-MM&capa=1
app.get('/api/deserciones', async (req, res) => {
  const { dniCap, campania, mes, capa } = req.query;
  try {
    const { recordset } = await pool.request()
      .input('dniCap',   sql.VarChar(20),  dniCap)
      .input('camp',     sql.VarChar(100), campania)
      .input('prefijo',  sql.VarChar(7),   mes)    // YYYY-MM
      .input('capa',     sql.Int,          capa)
      .query(`
        SELECT 
          d.postulante_dni,
          p.Nombres + ' ' + p.ApellidoPaterno + ' ' + p.ApellidoMaterno AS nombre,
          p.Telefono AS numero,
          FORMAT(d.fecha_desercion,'yyyy-MM-dd') AS fecha_desercion,
          d.motivo,
          d.capa_numero
        FROM Deserciones_Formacion d
        JOIN Postulantes_En_Formacion p 
          ON p.DNI = d.postulante_dni
        WHERE 
          p.DNI_Capacitador          = @dniCap
          AND p.Campaña              = @camp
          AND FORMAT(p.FechaInicio,'yyyy-MM') = @prefijo
          AND d.capa_numero          = @capa
        ORDER BY d.fecha_desercion
      `);
    res.json(recordset);
  } catch (e) {
    console.error(e);
    res.sendStatus(500);
  }
});



/* POST /api/deserciones/bulk  (body = [{dni,fecha,motivo,capa}]) */
app.post('/api/deserciones/bulk', async (req, res) => {
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (const r of req.body) {
      // 1) MERGE en Deserciones_Formacion (igual que antes)
      await tx.request()
        .input('dni',       sql.VarChar(20),   r.postulante_dni)
        .input('fechaDes',  sql.Date,          r.fecha_desercion)
        .input('mot',       sql.NVarChar(250), r.motivo       || '')
        .input('capa',      sql.Int,           r.capa_numero)
        .query(`
MERGE Deserciones_Formacion AS T
USING (SELECT @dni AS dni, @capa AS capa) AS S
  ON T.postulante_dni = S.dni AND T.capa_numero = S.capa
WHEN MATCHED THEN
  UPDATE SET fecha_desercion = @fechaDes, motivo = @mot
WHEN NOT MATCHED THEN
  INSERT (postulante_dni, capa_numero, fecha_desercion, motivo)
  VALUES (@dni, @capa, @fechaDes, @mot);
        `);

      // 2) UPDATE en Postulantes_En_Formacion para FechaCese
      await tx.request()
        .input('dni',       sql.VarChar(20), r.postulante_dni)
        .input('fechaIni',  sql.VarChar(10), r.fechaInicio)    // p.e. '2025-07-02'
        .input('fechaDes',  sql.Date,        r.fecha_desercion)
        .query(`
UPDATE Postulantes_En_Formacion
   SET FechaCese = @fechaDes
 WHERE DNI            = @dni
   AND FORMAT(FechaInicio,'yyyy-MM-dd') = @fechaIni;
        `);
    }
    await tx.commit();
    res.json({ ok: true });
  } catch (e) {
    await tx.rollback();
    console.error(e);
    res.status(500).json({ error: 'No se pudo guardar deserciones' });
  }
});


/* 7️⃣  MERGE de asistencias */
app.post('/api/asistencia/bulk', async (req, res) => {
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (const r of req.body) {
      await tx.request()
        .input('dni',    sql.VarChar(20), r.postulante_dni)
        .input('fecha',  sql.Date,        r.fecha)
        .input('etapa',  sql.VarChar(20), r.etapa)
        .input('estado', sql.Char(1),     r.estado_asistencia)
        .query(`
MERGE dbo.Asistencia_Formacion AS T
USING (SELECT @dni AS dni, @fecha AS fecha) AS S
  ON T.postulante_dni = S.dni
 AND T.fecha          = S.fecha
WHEN MATCHED THEN
  UPDATE SET etapa = @etapa,
             estado_asistencia = @estado
WHEN NOT MATCHED THEN
  INSERT (postulante_dni, fecha, etapa, estado_asistencia)
  VALUES (@dni, @fecha, @etapa, @estado);
        `);
    }
    await tx.commit();
    res.json({ ok:true, filas:req.body.length });
  } catch (e) {
    await tx.rollback();
    console.error(e);
    res.status(500).json({ error:'Error al guardar' });
  }
});





/* 8️⃣  Arranque */
const PORT = process.env.PORT || 4001;
app.listen(PORT, () => console.log(`🚀  http://localhost:${PORT}`));
