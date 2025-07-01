/* public/js/postulantes.js
   Maneja capas (lotes), fechas, tabla, guardado y Excel
*/
import { api }            from './api.js';
import { descargarExcel } from './excel.js';

export function initPostulantes() {
  /* ───── referencias DOM ───── */
  const dniInput       = document.getElementById('dniInput');
  const campSelect     = document.getElementById('campaniaSelect');
  const mesInput       = document.getElementById('mesInput');
  const capaSelect     = document.getElementById('capaSelect');
  const btnCargar      = document.getElementById('btnCargar');

  const tablaContainer = document.getElementById('tablaContainer');
  const accionesDiv    = document.getElementById('acciones');
  const btnGuardar     = document.getElementById('btnGuardar');
  const btnExcel       = document.getElementById('btnExcel');

  /* ───── estado ───── */
  let dias = [];
  let capCount = 5;
  let tablaDatos = [];
  let dirty = false;
  let cacheFiltro = '';

  /* ───── helpers ───── */
  const nextDate = iso => {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    do { dt.setDate(dt.getDate() + 1); } while (dt.getDay() === 0); // salta domingos
    return dt.toISOString().slice(0, 10);
  };
  const refreshOJT = () => {
    for (let i = capCount; i < dias.length; i++) {
      dias[i] = nextDate(dias[i - 1]);
    }
  };

  capaSelect.onchange = () => {/* nada; el usuario pulsará Cargar */};

  /* ───── Cargar ───── */
  btnCargar.onclick = async () => {
    const dniCap = dniInput.value.trim();
    const camp   = campSelect.value;
    const mes    = mesInput.value;
    if (!mes)    return alert('Selecciona mes');
    if (!dniCap) return alert('Ingresa DNI');

    const nuevoFiltro = `${dniCap}|${camp}|${mes}`;

    /* 1️⃣  Obtener lotes sólo si cambia el filtro */
    if (nuevoFiltro !== cacheFiltro || capaSelect.options.length === 0) {
      const lotes = await api(
        `/api/capas?dniCap=${dniCap}` +
        `&campania=${encodeURIComponent(camp)}` +
        `&mes=${mes}`
      );
      if (!lotes.length) return alert('Sin datos para ese filtro');

      const previo = capaSelect.value;           // recordar selección
      capaSelect.innerHTML = lotes
        .map(l => `<option value="${l.fechaInicio}">Capa ${l.capa} – ${l.fechaInicio}</option>`)
        .join('');
      if ([...capaSelect.options].some(o => o.value === previo)) {
        capaSelect.value = previo;               // restaurar selección
      }
      capaSelect.classList.remove('hidden');
      cacheFiltro = nuevoFiltro;
    }

    /* 2️⃣  Fecha de inicio elegida */
    const fechaIni = capaSelect.value;

    /* 3️⃣  Obtener datos de esa capa */
    const data = await api(
      `/api/postulantes?dniCap=${dniCap}` +
      `&campania=${encodeURIComponent(camp)}` +
      `&mes=${mes}` +
      `&fechaInicio=${fechaIni}`
    );
    const { postulantes, asistencias, duracion } = data;
    const capDef = duracion.cap;
    const ojtDef = duracion.ojt;
    const total  = capDef + ojtDef;

    /* 4️⃣  Generar lista de fechas   (*** cambio ***) */
    let primera = fechaIni;                       // ← **** cambio ****
    if (new Date(primera).getDay() === 0) primera = nextDate(primera);
    dias = [primera];
    while (dias.length < total) dias.push(nextDate(dias.at(-1)));
    capCount = capDef;

    /* 5️⃣  Datos base */
    tablaDatos = postulantes.map(p => ({
      ...p,
      numero: p.telefono || '',
      asistencia: dias.map(() => '')
    }));

    /* 6️⃣  Inyectar asistencias guardadas */
    const posDni   = Object.fromEntries(tablaDatos.map((p,i)=>[p.dni, i]));
    const posFecha = Object.fromEntries(dias.map((f,i)=>[f, i]));
    asistencias.forEach(a=>{
      const r = posDni[a.postulante_dni];
      const c = posFecha[a.fecha];
      if (r!=null && c!=null) tablaDatos[r].asistencia[c] = a.estado_asistencia;
    });

    renderTable();
    accionesDiv.classList.remove('hidden');
  };

  /* ───── Render tabla (igual que antes) ───── */
  function renderTable() {
    const ojtCount = dias.length - capCount;
    const fila1 = `
      <tr>
        <th colspan="3" class="border-0"></th>
        <th colspan="${capCount}" class="border bg-indigo-300 text-center">
          <span data-action="subCap" class="cursor-pointer text-red-700">−</span>
          Capacitación
          <span data-action="addCap" class="cursor-pointer text-blue-800">+</span>
        </th>
        ${ojtCount ? `
        <th colspan="${ojtCount}" class="border bg-teal-300 text-center">
          <span data-action="subOjt" class="cursor-pointer text-red-700">−</span>
          OJT
          <span data-action="addOjt" class="cursor-pointer text-teal-800">+</span>
        </th>` : ''}
      </tr>`;
    const fila2 = `
      <tr>
        <th class="border-0"></th><th class="border-0"></th><th class="border-0"></th>
        ${dias.map((_,i)=>`
          <th class="border px-2 text-center ${i<capCount?'bg-indigo-200':'bg-teal-200'}">
            Día ${i+1}
          </th>`).join('')}
      </tr>`;
    const fila3 = `
      <tr>
        <th class="border px-2">Nombre</th>
        <th class="border px-2">DNI</th>
        <th class="border px-2">Número</th>
        ${dias.map((d,i)=>`
          <th class="border px-2 text-center ${i<capCount?'bg-indigo-200':'bg-teal-200'}">
            ${d}
          </th>`).join('')}
      </tr>`;
    const cuerpo = tablaDatos.map((p,r)=>`
      <tr>
        <td class="border px-2">${p.nombre}</td>
        <td class="border px-2 text-center">${p.dni}</td>
        <td class="border px-2 text-center">${p.numero}</td>
        ${dias.map((_,c)=>`
          <td class="border px-2 ${c<capCount?'bg-indigo-50':'bg-teal-50'}">
            <select data-row="${r}" data-col="${c}"
                    class="w-full outline-none bg-transparent">
              <option value=""></option>
              <option value="A">A</option>
              <option value="T">T</option>
              <option value="F">F</option>
              <option value="J">J</option>
              <option value="D">Deserción</option>
            </select>
          </td>`).join('')}
      </tr>`).join('');

    tablaContainer.innerHTML = `
      <table class="min-w-max bg-white border-collapse text-sm">
        <thead>${fila1}${fila2}${fila3}</thead>
        <tbody>${cuerpo}</tbody>
      </table>`;

    tablaContainer.querySelector('thead').onclick = e=>{
      const a=e.target.dataset.action;
      if(a==='addCap') addCap();
      if(a==='subCap') subCap();
      if(a==='addOjt') addOjt();
      if(a==='subOjt') subOjt();
    };
    tablaContainer.querySelectorAll('select').forEach(sel=>{
      const {row,col}=sel.dataset;
      sel.value = tablaDatos[row].asistencia[col] || '';
      sel.onchange = e => {
        const val = e.target.value;
        tablaDatos[row].asistencia[col] = val;
        setDirty(true);

        const tr = sel.closest('tr');
        // Si es Deserción
        if (val === 'D') {
          // 1) Resaltar toda la fila
          tr.classList.add('bg-red-100');
          // 2) Deshabilitar todos los selects posteriores
          const allSel = Array.from(tr.querySelectorAll('select'));
          allSel.forEach((s,i) => {
            if (i > col) {
              s.value = '';          // limpiar cualquier valor
              s.disabled = true;     // deshabilitar
            }
          });
        } else {
          // Si cambias a otro estado, aseguramos que la fila no esté resaltada
          tr.classList.remove('bg-red-100');
          // Volver a habilitar los selects (por si antes se marcó Deserción)
          tr.querySelectorAll('select').forEach(s => s.disabled = false);
        }
      };

    });
  }

  /* Operaciones columnas */
  function addCap(){ dias.splice(capCount,0,nextDate(dias[capCount-1])); capCount++;
    tablaDatos.forEach(p=>p.asistencia.splice(capCount-1,0,'')); refreshOJT(); renderTable(); setDirty(true);}
  function subCap(){ if(capCount<=1)return; dias.splice(capCount-1,1); capCount--;
    tablaDatos.forEach(p=>p.asistencia.splice(capCount,1)); refreshOJT(); renderTable(); setDirty(true);}
  function addOjt(){ dias.push(nextDate(dias.at(-1))); tablaDatos.forEach(p=>p.asistencia.push(''));
    renderTable(); setDirty(true);}
  function subOjt(){ if(dias.length<=capCount)return; dias.pop(); tablaDatos.forEach(p=>p.asistencia.pop());
    renderTable(); setDirty(true);}

  /* Dirty flag */
  function setDirty(v){ dirty=v; btnGuardar.classList.toggle('hidden',!v); }

  /* Guardar */
  btnGuardar.onclick = async ()=>{
    const payload=[];
    tablaDatos.forEach(p=>{
      p.asistencia.forEach((est,i)=>{
        if(est){
          payload.push({
            postulante_dni:p.dni,
            fecha:dias[i],
            etapa:i<capCount?'Capacitacion':'OJT',
            estado_asistencia:est
          });
        }
      });
    });
    if(!payload.length) return alert('Nada por guardar');
    await api('/api/asistencia/bulk',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    alert('Guardado ✔️'); setDirty(false);
  };

  /* Excel */
  btnExcel.onclick = ()=>descargarExcel({ tablaDatos, dias, capCount });
}
