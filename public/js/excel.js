/* public/js/excel.js
   ----------------------------------------------------------
   Genera y descarga el Excel con algo de formato básico.
   Usa la librería SheetJS (xlsx.full.min.js) que ya cargas
   en index.html                                                                   */
export function descargarExcel ({ tablaDatos, dias, capCount }) {

  const ojt = dias.length - capCount;

  /* --- Construimos el array-of-arrays (AOA) --- */
  const filaGrupo = ['', '', '',
    'Capacitación', ...Array(capCount - 1).fill(''),
    ...(ojt ? ['OJT', ...Array(ojt - 1).fill('')] : [])
  ];
  const filaDia  = ['', '', '', ...dias.map((_, i) => `Día ${i + 1}`)];
  const filaHead = ['Nombre', 'DNI', 'Número', ...dias];

  const aoa = [filaGrupo, filaDia, filaHead];
  tablaDatos.forEach(p =>
    aoa.push([p.nombre, p.dni, p.numero, ...p.asistencia])
  );

  /* --- SheetJS --- */
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  /* Combinar celdas grupo */
  ws['!merges'] = [
    { s: { r: 0, c: 3 }, e: { r: 0, c: 3 + capCount - 1 } }
  ];
  if (ojt) {
    ws['!merges'].push(
      { s: { r: 0, c: 3 + capCount }, e: { r: 0, c: 3 + capCount + ojt - 1 } }
    );
  }

  /* Ajuste de anchura simple (opcional) */
  ws['!cols'] = [
    { wch: 25 },   // Nombre
    { wch: 12 },   // DNI
    { wch: 12 },   // Número
    ...dias.map(() => ({ wch: 10 }))
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Asistencia');
  XLSX.writeFile(wb, 'asistencia.xlsx');
}
